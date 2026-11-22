(() => {
    const list = document.getElementById('racm-registration-admin-list');
    const message = document.getElementById('racm-registration-admin-message');
    const refresh = document.getElementById('racm-registration-refresh');
    const exportButton = document.getElementById('racm-registration-export');
    if (!list || !message || !refresh || !exportButton) return;

    let registrations = [];
    let activeFilter = 'all';

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, character => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[character]));
    }

    function showMessage(text, success = false) {
        message.textContent = text;
        message.className = `mb-4 rounded-lg p-3 text-sm ${success ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`;
        message.classList.remove('hidden');
    }

    async function requestApi(action, extra = {}) {
        const { data, error } = await supabaseClient.auth.getSession();
        if (error || !data.session?.access_token) throw new Error('管理員登入已失效。');
        const response = await fetch(`${supabaseUrl}/functions/v1/art-registration-api`, {
            method: 'POST',
            headers: {
                apikey: supabaseKey,
                Authorization: `Bearer ${data.session.access_token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ action, ...extra })
        });
        if (!response.ok) {
            const result = await response.json().catch(() => ({}));
            throw new Error(result.error || 'RACM 報名操作失敗。');
        }
        return response;
    }

    function renderRegistration(registration) {
        const status = registration.review_status || 'pending';
        const statusLabel = status === 'included' ? '已納入' : status === 'excluded' ? '不納入' : '待處理';
        const statusClass = status === 'included'
            ? 'bg-green-100 text-green-800'
            : status === 'excluded'
                ? 'bg-red-100 text-red-800'
                : 'bg-slate-100 text-slate-700';
        return `<article class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div class="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <p class="text-sm font-bold text-slate-900">${escapeHtml(registration.reference_number)} · ${escapeHtml(registration.chinese_name)} / ${escapeHtml(registration.english_name)}</p>
                    <p class="mt-1 text-sm text-slate-600">${escapeHtml(registration.phone)} · ${escapeHtml(registration.email)} · WeChat: ${escapeHtml(registration.wechat_id)}</p>
                </div>
                <span class="rounded-full px-2 py-1 text-xs font-bold ${statusClass}">${statusLabel}</span>
            </div>
            <dl class="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
                <div><dt class="text-xs text-slate-500">出生日期</dt><dd>${escapeHtml(registration.birth_date)}</dd></div>
                <div><dt class="text-xs text-slate-500">澳門身份證</dt><dd class="break-all">${escapeHtml(registration.macau_id)}</dd></div>
                <div><dt class="text-xs text-slate-500">性別</dt><dd>${escapeHtml(registration.gender)}</dd></div>
                <div><dt class="text-xs text-slate-500">職業或主修科目</dt><dd>${escapeHtml(registration.occupation)}</dd></div>
                <div class="sm:col-span-2 lg:col-span-3"><dt class="text-xs text-slate-500">五階段確認</dt><dd>${registration.stage1 ? 'S1 ' : ''}${registration.stage2 ? 'S2 ' : ''}${registration.stage3 ? 'S3 ' : ''}${registration.stage4 ? 'S4 ' : ''}${registration.stage5 ? 'S5' : ''}</dd></div>
            </dl>
            <div class="mt-4 flex flex-wrap gap-2 border-t pt-3">
                <button type="button" data-racm-review="included" data-id="${escapeHtml(registration.id)}" data-reference="${escapeHtml(registration.reference_number)}" class="rounded-lg border border-green-300 bg-green-50 px-3 py-2 text-sm font-bold text-green-800">納入</button>
                <button type="button" data-racm-review="excluded" data-id="${escapeHtml(registration.id)}" data-reference="${escapeHtml(registration.reference_number)}" class="rounded-lg border border-red-300 bg-white px-3 py-2 text-sm font-bold text-red-700">不納入</button>
                <button type="button" data-racm-delete data-id="${escapeHtml(registration.id)}" data-reference="${escapeHtml(registration.reference_number)}" class="rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold text-slate-700">刪除</button>
            </div>
        </article>`;
    }

    async function loadRegistrations() {
        message.classList.add('hidden');
        list.innerHTML = '<p class="rounded-lg bg-white p-6 text-center text-sm text-slate-500">載入中…</p>';
        try {
            const response = await requestApi('racm-list');
            const result = await response.json();
            registrations = Array.isArray(result.registrations) ? result.registrations : [];
            applyFilter();
        } catch (error) {
            list.innerHTML = '';
            showMessage(error instanceof Error ? error.message : '載入失敗。');
        }
    }

    function applyFilter() {
        const filtered = activeFilter === 'all'
            ? registrations
            : registrations.filter(registration => (registration.review_status || 'pending') === activeFilter);
        list.innerHTML = filtered.length
            ? filtered.map(renderRegistration).join('')
            : '<p class="rounded-lg bg-white p-6 text-center text-sm text-slate-500">目前沒有符合篩選的報名資料。</p>';
    }

    async function setReview(button) {
        const status = button.dataset.racmReview;
        const label = status === 'included' ? '納入' : '不納入';
        if (!confirm(`確定將報名編號 ${button.dataset.reference} 設為「${label}」？`)) return;
        await requestApi('racm-set-review', { registrationId: button.dataset.id, reviewStatus: status });
        showMessage(`報名編號 ${button.dataset.reference} 已設為「${label}」。`, true);
        await loadRegistrations();
    }

    async function deleteRegistration(button) {
        if (!confirm(`確定永久刪除報名編號 ${button.dataset.reference}？此操作無法復原。`)) return;
        await requestApi('racm-delete', { registrationId: button.dataset.id });
        showMessage(`報名編號 ${button.dataset.reference} 已刪除。`, true);
        await loadRegistrations();
    }

    async function exportCsv() {
        try {
            const response = await requestApi('racm-export');
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = 'racm-registrations-included.csv';
            link.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            showMessage('已納入名單已匯出。', true);
        } catch (error) {
            showMessage(error instanceof Error ? error.message : '匯出失敗。');
        }
    }

    refresh.addEventListener('click', loadRegistrations);
    exportButton.addEventListener('click', exportCsv);
    document.getElementById('racm-registration-filter')?.addEventListener('click', event => {
        const button = event.target.closest('[data-racm-filter]');
        if (!button) return;
        activeFilter = button.dataset.racmFilter;
        applyFilter();
    });
    list.addEventListener('click', event => {
        const review = event.target.closest('[data-racm-review]');
        if (review) setReview(review).catch(error => showMessage(error.message));
        const remove = event.target.closest('[data-racm-delete]');
        if (remove) deleteRegistration(remove).catch(error => showMessage(error.message));
    });
    window.loadRacmRegistrationsAdmin = loadRegistrations;
})();
