window.registrationAdminCommon = (() => {
    const filterLabels = { all: '全部', pending: '待處理', included: '已納入', excluded: '不納入' };
    const macauDateFormatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Macau', year: 'numeric', month: '2-digit', day: '2-digit'
    });
    const dialog = document.getElementById('registration-reauth-dialog');
    const form = document.getElementById('registration-reauth-form');
    const email = document.getElementById('registration-reauth-email');
    const password = document.getElementById('registration-reauth-password');
    const errorMessage = document.getElementById('registration-reauth-error');
    const submit = document.getElementById('registration-reauth-submit');
    let lastKnownEmail = '';
    let reloadAfterLogin;
    let sourceMessage;

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

    function createDashboard(prefix) {
        const filter = document.getElementById(`${prefix}-registration-filter`);
        return {
            updateCounts(items) {
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
                    document.getElementById(`${prefix}-count-${key}`).textContent = counts ? String(counts[key]) : '—';
                });
                filter.querySelectorAll(`[data-${prefix}-filter]`).forEach(button => {
                    const key = button.getAttribute(`data-${prefix}-filter`);
                    button.textContent = `${filterLabels[key]} (${counts ? counts[key] : '—'})`;
                });
            },
            selectFilter(selected) {
                filter.querySelectorAll(`[data-${prefix}-filter]`).forEach(button => {
                    const active = button.getAttribute(`data-${prefix}-filter`) === selected;
                    button.setAttribute('aria-pressed', String(active));
                    button.classList.toggle('ring-2', active);
                    button.classList.toggle('ring-slate-500', active);
                    button.classList.toggle('ring-offset-2', active);
                });
            }
        };
    }

    function showMessage(element, text, success = false, sessionExpired = false, reload) {
        const label = document.createElement('span');
        label.textContent = text;
        element.replaceChildren(label);
        if (sessionExpired) {
            const button = document.createElement('button');
            button.type = 'button';
            button.textContent = '重新登入';
            button.className = 'shrink-0 rounded-lg border border-red-300 bg-white px-3 py-2 font-semibold text-red-800 hover:bg-red-100';
            button.addEventListener('click', () => {
                reloadAfterLogin = reload;
                sourceMessage = element;
                form.reset();
                errorMessage.classList.add('hidden');
                email.value = lastKnownEmail || document.getElementById('admin-email').value.trim();
                dialog.showModal();
                (email.value ? password : email).focus();
            });
            element.append(button);
        }
        element.className = `mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg p-3 text-sm ${success ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`;
        element.classList.remove('hidden');
    }

    function showError(element, error, fallback, reload) {
        showMessage(element, error instanceof Error ? error.message : fallback, false, error instanceof SessionExpiredError, reload);
    }

    form.addEventListener('submit', async event => {
        event.preventDefault();
        errorMessage.classList.add('hidden');
        submit.disabled = true;
        try {
            const { data, error } = await supabaseClient.auth.signInWithPassword({
                email: email.value.trim(), password: password.value
            });
            if (error || !data.user) {
                throw new Error(error?.code === 'invalid_credentials' ? '電子郵件或密碼不正確。' : `登入失敗：${error?.message || '無法確認帳號'}`);
            }
            const roleCheck = await checkAdminRole();
            if (roleCheck.error || !roleCheck.isAdmin) {
                dialog.close();
                const { error: signOutError } = await supabaseClient.auth.signOut();
                showLogin();
                const roleMessage = roleCheck.error ? `權限檢查失敗：${roleCheck.error.message}` : '此帳號尚未獲管理員權限。';
                showLoginMessage(signOutError ? `${roleMessage} 登出失敗：${signOutError.message}` : roleMessage);
                return;
            }
            lastKnownEmail = data.user.email || email.value.trim();
            activeAdminRole = roleCheck.role;
            dialog.close();
            showApp();
            applyAdminRoleVisibility();
            if (activeAdminRole !== 'registration') {
                await reloadAfterLogin();
                await fetchSettings();
                await fetchSubmissions();
            }
        } catch (error) {
            if (dialog.open) {
                errorMessage.textContent = error instanceof Error ? error.message : '登入失敗，請稍後再試。';
                errorMessage.classList.remove('hidden');
            } else {
                showError(sourceMessage, error, '重新載入後台失敗。', reloadAfterLogin);
            }
        } finally {
            password.value = '';
            submit.disabled = false;
        }
    });
    document.getElementById('registration-reauth-cancel').addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => { password.value = ''; });

    async function requestApi(action, extra, fallback) {
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
            throw new Error(result.error || fallback);
        }
        return response;
    }

    return { createDashboard, showMessage, showError, requestApi };
})();
