(() => {
    const list = document.getElementById('art-registration-admin-list');
    const message = document.getElementById('art-registration-admin-message');
    const refreshButton = document.getElementById('art-registration-refresh');
    const stageExportButton = document.getElementById('art-registration-export-stage');
    const insuranceExportButton = document.getElementById('art-registration-export-insurance');
    if (!list || !message || !refreshButton || !stageExportButton || !insuranceExportButton) return;

    let loading = false;

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, character => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        })[character]);
    }

    function showMessage(text, success = false) {
        message.textContent = text;
        message.className = `mb-4 rounded-lg p-3 text-sm ${success ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`;
        message.classList.remove('hidden');
    }

    function formatDateTime(value) {
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('zh-Hant', {
            dateStyle: 'medium',
            timeStyle: 'short',
            timeZone: 'Asia/Macau'
        }).format(date);
    }

    function formatDocumentType(value) {
        return ({
            macau_id: '澳門居民身份證',
            hong_kong_id: '香港居民身份證',
            passport: '護照',
            two_way_permit: '往來港澳通行證'
        })[value] || value;
    }

    function formatAgeGroup(value) {
        return ({
            child: '兒童組',
            youth: '青少年組',
            adult: '公開／成人組',
            senior: '長青組',
            intergenerational: '親子／跨代混合組'
        })[value] || value;
    }

    function formatCategory(value) {
        return ({
            music: '音樂',
            dance: '舞蹈',
            drama: '戲劇／曲藝',
            visual: '雜技／魔術／其他視覺藝術表演',
            other: '其他'
        })[value] || value;
    }

    function renderPerson(person, title, showDocument = true) {
        return `<section class="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <h4 class="font-semibold">${escapeHtml(title)}</h4>
            <dl class="mt-2 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
                <div><dt class="text-xs text-slate-500">中文姓名</dt><dd>${escapeHtml(person.chinese_name)}</dd></div>
                <div><dt class="text-xs text-slate-500">英文姓名</dt><dd>${escapeHtml(person.english_name)}</dd></div>
                <div><dt class="text-xs text-slate-500">性別</dt><dd>${person.gender === 'male' ? '男' : '女'}</dd></div>
                <div><dt class="text-xs text-slate-500">出生日期</dt><dd>${escapeHtml(person.birth_date)}</dd></div>
                ${showDocument ? `<div><dt class="text-xs text-slate-500">證件類型</dt><dd>${escapeHtml(formatDocumentType(person.document_type))}</dd></div>
                <div><dt class="text-xs text-slate-500">證件號碼</dt><dd class="break-all font-mono">${escapeHtml(person.document_number)}</dd></div>` : ''}
                ${person.phone ? `<div><dt class="text-xs text-slate-500">聯絡電話</dt><dd>${escapeHtml(person.phone)}</dd></div>` : ''}
                ${person.email ? `<div><dt class="text-xs text-slate-500">Email</dt><dd>${escapeHtml(person.email)}</dd></div>` : ''}
            </dl>
        </section>`;
    }

    function renderRegistration(registration) {
        const groupName = registration.group_type === 'team' ? registration.team_name : registration.program_title;
        const referenceNumber = registration.reference_number || registration.id;
        const categories = (registration.performance_categories || []).map(formatCategory);
        if (registration.other_category) categories.push(registration.other_category);
        const stage = registration.stage_requirements || {};
        const accompaniment = registration.accompaniment === 'audio'
            ? '播放音訊'
            : registration.accompaniment === 'video' ? '播放背景影片' : '純現場原聲';
        const members = (registration.members || []).map((member, index) =>
            renderPerson(member, `團體成員 ${index + 1}`)
        ).join('');
        const contact = registration.contact || {};
        return `<article class="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <details>
                <summary class="cursor-pointer list-none p-4 hover:bg-slate-50">
                    <span class="flex flex-wrap items-center justify-between gap-2">
                        <span>
                            <strong class="text-base">${escapeHtml(groupName)}</strong>
                            <span class="ml-2 rounded-full bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-800">${registration.group_type === 'team' ? '團體組' : '個人組'}</span>
                        </span>
                        <span class="text-xs text-slate-500">${escapeHtml(formatDateTime(registration.submitted_at))}</span>
                    </span>
                    <span class="mt-2 block text-sm text-slate-600">${escapeHtml(registration.program_title)} · ${escapeHtml(formatAgeGroup(registration.age_group))} · ${Number(registration.performer_count)} 人</span>
                </summary>
                <div class="space-y-4 border-t p-4">
                    <section>
                        <h3 class="font-semibold">節目資料</h3>
                        <dl class="mt-2 grid gap-2 text-sm sm:grid-cols-2">
                            <div><dt class="text-xs text-slate-500">表演類別</dt><dd>${escapeHtml([...categories].join('、'))}</dd></div>
                            <div><dt class="text-xs text-slate-500">時長</dt><dd>${Math.floor(registration.duration_seconds / 60)} 分 ${registration.duration_seconds % 60} 秒</dd></div>
                            <div class="sm:col-span-2"><dt class="text-xs text-slate-500">節目簡介</dt><dd class="whitespace-pre-line">${escapeHtml(registration.program_description)}</dd></div>
                        </dl>
                    </section>
                    ${renderPerson(contact, '主要聯絡人／個人參賽者')}
                    <section class="rounded-lg border border-slate-200 p-3">
                        <h4 class="font-semibold">緊急聯絡人</h4>
                        <p class="mt-1 text-sm">${escapeHtml(registration.emergency_contact_name)}（${escapeHtml(registration.emergency_contact_relationship)}）· ${escapeHtml(registration.emergency_contact_phone)}</p>
                    </section>
                    ${members ? `<section class="space-y-2"><h3 class="font-semibold">團體成員</h3>${members}</section>` : ''}
                    <section>
                        <h3 class="font-semibold">舞台需求</h3>
                        <dl class="mt-2 grid gap-2 text-sm sm:grid-cols-2">
                            <div><dt class="text-xs text-slate-500">伴奏</dt><dd>${escapeHtml(accompaniment)}</dd></div>
                            ${registration.stage_file_name ? `<div><dt class="text-xs text-slate-500">伴奏檔案</dt><dd class="break-all">${escapeHtml(registration.stage_file_name)} <button type="button" data-download-file="stage" data-registration-id="${escapeHtml(registration.id)}" class="ml-2 rounded border border-blue-300 px-2 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-50">下載原檔</button></dd></div>` : ''}
                            ${registration.team_file_name ? `<div><dt class="text-xs text-slate-500">團體 Excel 名單</dt><dd class="break-all">${escapeHtml(registration.team_file_name)} <button type="button" data-download-file="team" data-registration-id="${escapeHtml(registration.id)}" class="ml-2 rounded border border-blue-300 px-2 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-50">下載原檔</button></dd></div>` : ''}
                            <div><dt class="text-xs text-slate-500">手持無線麥克風</dt><dd>${Number(stage.wirelessMicCount || 0)} 支</dd></div>
                            <div><dt class="text-xs text-slate-500">頭戴／領夾麥克風</dt><dd>${Number(stage.headsetMicCount || 0)} 支</dd></div>
                            <div><dt class="text-xs text-slate-500">樂器收音／DI</dt><dd>${escapeHtml(stage.instrumentMicDetails || '不需要')}</dd></div>
                            <div><dt class="text-xs text-slate-500">場地鋼琴／電子琴</dt><dd>${stage.pianoRequired ? '需要' : '不需要'}</dd></div>
                            <div><dt class="text-xs text-slate-500">大型道具／樂器</dt><dd>${escapeHtml(stage.largePropsDetails || '不需要')}</dd></div>
                            <div class="sm:col-span-2"><dt class="text-xs text-slate-500">其他舞台需求</dt><dd class="whitespace-pre-line">${escapeHtml(registration.special_stage_requirements || '沒有')}</dd></div>
                        </dl>
                    </section>
                    <div class="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
                        <p class="text-xs text-slate-500">資料參考編號：<strong class="font-mono text-slate-700">${escapeHtml(referenceNumber)}</strong> · 同意版本：${escapeHtml(registration.consent_version)}</p>
                        <button type="button" data-delete-registration="${escapeHtml(registration.id)}" data-reference-number="${escapeHtml(referenceNumber)}" class="rounded-lg border border-red-300 bg-white px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50">刪除報名</button>
                    </div>
                </div>
            </details>
        </article>`;
    }

    async function requestApi(action, extraBody = {}) {
        const { data, error } = await supabaseClient.auth.getSession();
        if (error || !data.session?.access_token) throw new Error('管理員登入已失效，請重新登入。');
        const response = await fetch(`${supabaseUrl}/functions/v1/art-registration-api`, {
            method: 'POST',
            headers: {
                apikey: supabaseKey,
                Authorization: `Bearer ${data.session.access_token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ action, ...extraBody })
        });
        if (!response.ok) {
            const result = await response.json().catch(() => ({}));
            throw new Error(result.error || '管理資料載入失敗。');
        }
        return response;
    }

    async function loadRegistrations() {
        if (loading) return;
        loading = true;
        message.classList.add('hidden');
        list.innerHTML = '<p class="rounded-lg bg-white p-6 text-center text-sm text-slate-500">正在安全載入報名資料…</p>';
        refreshButton.disabled = true;
        try {
            const response = await requestApi('list');
            const result = await response.json();
            const registrations = Array.isArray(result.registrations) ? result.registrations : [];
            list.innerHTML = registrations.length
                ? registrations.map(renderRegistration).join('')
                : '<p class="rounded-lg bg-white p-6 text-center text-sm text-slate-500">目前沒有報名資料。</p>';
        } catch (error) {
            list.innerHTML = '';
            showMessage(error instanceof Error ? error.message : '管理資料載入失敗。');
        } finally {
            loading = false;
            refreshButton.disabled = false;
        }
    }

    async function exportCsv(action, filename, confirmSensitive = false) {
        if (confirmSensitive && !confirm('此檔案包含解密後的證件號碼及出生日期。請只交予獲授權的主辦／保險人員，並妥善刪除暫存檔。確定匯出？')) {
            return;
        }
        const button = action === 'export-stage' ? stageExportButton : insuranceExportButton;
        button.disabled = true;
        try {
            const response = await requestApi(action);
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = filename;
            link.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            showMessage('CSV 已匯出。請按個人資料保護要求安全保存及傳送。', true);
        } catch (error) {
            showMessage(error instanceof Error ? error.message : 'CSV 匯出失敗。');
        } finally {
            button.disabled = false;
        }
    }

    async function downloadRegistrationFile(registrationId, fileType) {
        try {
            const response = await requestApi('download-file', { registrationId, fileType });
            const blob = await response.blob();
            const disposition = response.headers.get('content-disposition') || '';
            const encodedName = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
            let filename = encodedName ? decodeURIComponent(encodedName) : fileType === 'stage' ? '舞台伴奏檔案' : '團體成員名單.xlsx';
            filename = filename.replace(/[\\/:*?"<>|]/g, '_');
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = filename;
            link.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            showMessage('檔案已解密並開始下載。請妥善刪除暫存副本。', true);
        } catch (error) {
            showMessage(error instanceof Error ? error.message : '檔案下載失敗。');
        }
    }

    async function deleteRegistration(registrationId, referenceNumber) {
        if (!confirm(`確定永久刪除資料參考編號 ${referenceNumber} 的報名、團體成員及相關檔案？此操作無法復原。`)) return;
        try {
            await requestApi('delete-registration', { registrationId });
            showMessage(`資料參考編號 ${referenceNumber} 已刪除。`, true);
            await loadRegistrations();
        } catch (error) {
            showMessage(error instanceof Error ? error.message : '報名刪除失敗。');
        }
    }

    refreshButton.addEventListener('click', loadRegistrations);
    stageExportButton.addEventListener('click', () => exportCsv('export-stage', 'art-stage-coordination.csv'));
    insuranceExportButton.addEventListener('click', () => exportCsv('export-insurance', 'art-insurance-roster.csv', true));
    list.addEventListener('click', event => {
        const deleteButton = event.target.closest('[data-delete-registration]');
        if (deleteButton) {
            deleteRegistration(deleteButton.dataset.deleteRegistration, deleteButton.dataset.referenceNumber);
            return;
        }
        const button = event.target.closest('[data-download-file]');
        if (!button) return;
        downloadRegistrationFile(button.dataset.registrationId, button.dataset.downloadFile);
    });
    window.loadArtRegistrationsAdmin = loadRegistrations;
})();
