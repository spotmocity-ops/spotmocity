(() => {
    const list = document.getElementById('racm-registration-admin-list');
    const message = document.getElementById('racm-registration-admin-message');
    const refresh = document.getElementById('racm-registration-refresh');
    const exportButton = document.getElementById('racm-registration-export');
    const filter = document.getElementById('racm-registration-filter');
    const reauthDialog = document.getElementById('racm-reauth-dialog');
    const reauthForm = document.getElementById('racm-reauth-form');
    const reauthEmail = document.getElementById('racm-reauth-email');
    const reauthPassword = document.getElementById('racm-reauth-password');
    const reauthError = document.getElementById('racm-reauth-error');
    const reauthSubmit = document.getElementById('racm-reauth-submit');
    if (!list || !message || !refresh || !exportButton) return;

    let registrations = [];
    let registrationsLoaded = false;
    let loadSequence = 0;
    let activeFilter = 'all';
    let lastKnownEmail = '';
    const filterLabels = { all: '全部', pending: '待處理', included: '已納入', excluded: '不納入' };
    const macauDateFormatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Macau', year: 'numeric', month: '2-digit', day: '2-digit'
    });

    class SessionExpiredError extends Error {
        constructor() {
            super('管理員登入已失效。');
        }
    }

    function macauDate(value) {
        const date = new Date(value);
        if (!value || Number.isNaN(date.getTime())) throw new Error('報名日期格式有誤，無法計算今日新增人數。');
        const parts = Object.fromEntries(macauDateFormatter.formatToParts(date).map(part => [part.type, part.value]));
        return `${parts.year}-${parts.month}-${parts.day}`;
    }

    function updateCounts(items) {
        const counts = items ? { all: items.length, pending: 0, included: 0, excluded: 0, today: 0 } : null;
        if (counts) {
            const today = macauDate(new Date());
            items.forEach(item => {
                const status = item.review_status || 'pending';
                if (!['pending', 'included', 'excluded'].includes(status)) throw new Error('報名狀態格式有誤，請重新整理。');
                counts[status]++;
                if (macauDate(item.submitted_at) === today) counts.today++;
            });
        }
        ['all', 'pending', 'included', 'today'].forEach(key => {
            document.getElementById(`racm-count-${key}`).textContent = counts ? String(counts[key]) : '—';
        });
        filter.querySelectorAll('[data-racm-filter]').forEach(button => {
            const key = button.dataset.racmFilter;
            button.textContent = `${filterLabels[key]} (${counts ? counts[key] : '—'})`;
        });
    }

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, character => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[character]));
    }

    function showMessage(text, success = false, sessionExpired = false) {
        const label = document.createElement('span');
        label.textContent = text;
        message.replaceChildren(label);
        if (sessionExpired) {
            const button = document.createElement('button');
            button.type = 'button';
            button.textContent = '重新登入';
            button.className = 'shrink-0 rounded-lg border border-red-300 bg-white px-3 py-2 font-semibold text-red-800 hover:bg-red-100';
            button.addEventListener('click', openReauthDialog);
            message.append(button);
        }
        message.className = `mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg p-3 text-sm ${success ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`;
        message.classList.remove('hidden');
    }

    function showError(error, fallback) {
        showMessage(error instanceof Error ? error.message : fallback, false, error instanceof SessionExpiredError);
    }

    function openReauthDialog() {
        reauthForm.reset();
        reauthError.classList.add('hidden');
        reauthEmail.value = lastKnownEmail || document.getElementById('admin-email').value.trim();
        reauthDialog.showModal();
        (reauthEmail.value ? reauthPassword : reauthEmail).focus();
    }

    async function reauthenticate(event) {
        event.preventDefault();
        reauthError.classList.add('hidden');
        reauthSubmit.disabled = true;
        try {
            const { data, error } = await supabaseClient.auth.signInWithPassword({
                email: reauthEmail.value.trim(), password: reauthPassword.value
            });
            if (error || !data.user) {
                throw new Error(error?.code === 'invalid_credentials' ? '電子郵件或密碼不正確。' : `登入失敗：${error?.message || '無法確認帳號'}`);
            }
            const roleCheck = await checkAdminRole();
            if (roleCheck.error || !roleCheck.isAdmin) {
                reauthDialog.close();
                const { error: signOutError } = await supabaseClient.auth.signOut();
                showLogin();
                const roleMessage = roleCheck.error ? `權限檢查失敗：${roleCheck.error.message}` : '此帳號尚未獲管理員權限。';
                showLoginMessage(signOutError ? `${roleMessage} 登出失敗：${signOutError.message}` : roleMessage);
                return;
            }
            lastKnownEmail = data.user.email || reauthEmail.value.trim();
            activeAdminRole = roleCheck.role;
            reauthDialog.close();
            showApp();
            applyAdminRoleVisibility();
            if (activeAdminRole !== 'registration') {
                await loadRegistrations();
                await fetchSettings();
                await fetchSubmissions();
            }
        } catch (error) {
            if (reauthDialog.open) {
                reauthError.textContent = error instanceof Error ? error.message : '登入失敗，請稍後再試。';
                reauthError.classList.remove('hidden');
            } else {
                showError(error, '重新載入後台失敗。');
            }
        } finally {
            reauthPassword.value = '';
            reauthSubmit.disabled = false;
        }
    }

    async function requestApi(action, extra = {}) {
        const { data, error } = await supabaseClient.auth.getSession();
        if (error) throw new Error(`取得登入狀態失敗：${error.message}`);
        if (!data.session?.access_token) throw new SessionExpiredError();
        lastKnownEmail = data.session.user?.email || lastKnownEmail;
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
            if (response.status === 401) throw new SessionExpiredError();
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
        const sequence = ++loadSequence;
        message.classList.add('hidden');
        registrationsLoaded = false;
        updateCounts(null);
        list.innerHTML = '<p class="rounded-lg bg-white p-6 text-center text-sm text-slate-500">載入中…</p>';
        try {
            const response = await requestApi('racm-list');
            const result = await response.json();
            if (sequence !== loadSequence) return;
            if (!Array.isArray(result.registrations)) throw new Error('報名資料格式有誤，請重新整理。');
            updateCounts(result.registrations);
            registrations = result.registrations;
            registrationsLoaded = true;
            applyFilter();
        } catch (error) {
            if (sequence !== loadSequence) return;
            registrations = [];
            updateCounts(null);
            list.innerHTML = '';
            showError(error, '載入失敗。');
        }
    }

    function applyFilter() {
        filter.querySelectorAll('[data-racm-filter]').forEach(button => {
            const active = button.dataset.racmFilter === activeFilter;
            button.setAttribute('aria-pressed', String(active));
            button.classList.toggle('ring-2', active);
            button.classList.toggle('ring-slate-500', active);
            button.classList.toggle('ring-offset-2', active);
        });
        if (!registrationsLoaded) return;
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
            showError(error, '匯出失敗。');
        }
    }

    refresh.addEventListener('click', loadRegistrations);
    exportButton.addEventListener('click', exportCsv);
    reauthForm.addEventListener('submit', reauthenticate);
    document.getElementById('racm-reauth-cancel').addEventListener('click', () => reauthDialog.close());
    reauthDialog.addEventListener('close', () => { reauthPassword.value = ''; });
    filter.addEventListener('click', event => {
        const button = event.target.closest('[data-racm-filter]');
        if (!button) return;
        activeFilter = button.dataset.racmFilter;
        applyFilter();
    });
    list.addEventListener('click', event => {
        const review = event.target.closest('[data-racm-review]');
        if (review) setReview(review).catch(error => showError(error, '更新失敗。'));
        const remove = event.target.closest('[data-racm-delete]');
        if (remove) deleteRegistration(remove).catch(error => showError(error, '刪除失敗。'));
    });
    window.loadRacmRegistrationsAdmin = loadRegistrations;
})();
