const supabaseUrl = 'https://owvsfvunlqudrhdsuqvk.supabase.co';
const supabaseKey = 'sb_publishable_4kBnCjtv4c7j-sb8l3BrUw_j63egBDR';
const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);
const submissionsList = document.getElementById('submissions-list');
let submissions = [];
let activeSubmissionFilter = 'pending';
let activityFeedback = [];
let curatedActivityDrafts = [];
let activeCuratedDraftFilter = 'unpublished';
const activityCategoryGroups = window.SpotMoCityCategories;
function getCuratedActivityCategoryGroups() {
    const serviceCategories = homeServiceCategories.length ? homeServiceCategories : defaultHomeServiceCategories;
    return [...activityCategoryGroups, window.createLifeServiceActivityCategory(serviceCategories)];
}
let homeBlogItems = [];
let homeAdItems = [];
let homeHeroItems = [];
const defaultHomeServiceCategories = [
    { id: 'space', name: '空間/場地租借', icon: '🏢', subcategories: [] },
    { id: 'business', name: '法律/會計/商業', icon: '⚖️', subcategories: [] },
    { id: 'health', name: '健康/身心/診所', icon: '🏥', subcategories: [] },
    { id: 'support', name: '生活/營運支援', icon: '🛠️', subcategories: [] },
    {
        id: 'family_school',
        name: '家庭與學校',
        icon: '🏫',
        subcategories: [
            { id: 'school_directory', name: '學校目錄（幼兒園／中小學／大學）' },
            { id: 'campus_open_days', name: '校園開放日與招生' },
            { id: 'education_talks', name: '升學與留學講座' },
            { id: 'mind_support', name: '親子與成長支援' }
        ]
    }
];
let homeServiceCategories = normalizeHomeServiceCategories([]);
let heroImageCropper = null;
let heroImageCropUrl = '';
let heroImageCropInput = null;
let heroRichImageCropContext = null;
const heroRichEditorSelections = new Map();
const heroRichFontFamilies = {
    sans: 'Arial, "Noto Sans TC", sans-serif',
    serif: 'Georgia, "Noto Serif TC", serif',
    kai: 'KaiTi, DFKai-SB, serif',
    mono: '"Courier New", monospace'
};
const homeQuoteFontStacks = {
    sans: 'system-ui, -apple-system, "Segoe UI", sans-serif',
    serif: 'Georgia, "Noto Serif TC", serif',
    kai: 'KaiTi, DFKai-SB, serif',
    mono: 'ui-monospace, SFMono-Regular, monospace'
};
const supportedEventImageTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const maximumEventImageSize = 10 * 1024 * 1024;
const adminTodayParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Macau', year: 'numeric', month: '2-digit', day: '2-digit'
}).formatToParts(new Date()).reduce((parts, part) => {
    if (part.type !== 'literal') parts[part.type] = Number(part.value);
    return parts;
}, {});
let calendarEditYear = adminTodayParts.year;
let calendarEditMonth = adminTodayParts.month - 1;
let selectedCalendarEditDate = '';
let calendarSpecialDays = [];

function showLogin() {
    document.getElementById('login-screen').classList.remove('hidden');
    document.getElementById('admin-app').classList.add('hidden');
}

function showApp() {
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('admin-app').classList.remove('hidden');
}

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    })[character]);
}

function safeImageUrl(value) {
    try {
        const url = new URL(value);
        return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
    } catch {
        return '';
    }
}

function isValidEventImage(file) {
    return supportedEventImageTypes.has(file.type) && file.size > 0 && file.size <= maximumEventImageSize;
}

function clearEventImagePreview(preview) {
    revokeEventImagePreview(preview);
    preview.replaceChildren();
}

function renderEventImagePreview(preview, urls, files = []) {
    clearEventImagePreview(preview);
    const images = [
        ...urls.map(url => ({ src: safeImageUrl(url), alt: '現有圖片' })),
        ...files.map(file => {
            const src = URL.createObjectURL(file);
            preview.dataset.objectUrl = [preview.dataset.objectUrl, src].filter(Boolean).join(',');
            return { src, alt: '新圖片預覽' };
        })
    ].filter(image => image.src);
    preview.innerHTML = images.map(image =>
        `<img src="${escapeHtml(image.src)}" alt="${image.alt}" class="${['edit-poster-preview', 'edit-life-service-thumbnail-preview'].includes(preview.id) ? 'w-full h-full object-cover' : 'w-full max-h-64 object-contain bg-gray-50 rounded-lg border'}">`
    ).join('');
    preview.classList.toggle('hidden', images.length === 0);
}

function revokeEventImagePreview(preview) {
    (preview.dataset.objectUrl || '').split(',').filter(Boolean).forEach(url => URL.revokeObjectURL(url));
    preview.dataset.objectUrl = '';
}

function previewEditedPoster() {
    const input = document.getElementById('edit-poster-file');
    const preview = document.getElementById('edit-poster-preview');
    const file = input.files[0];
    if (file && !isValidEventImage(file)) {
        input.value = '';
        alert('主海報請使用 JPG、PNG 或 WebP，且不可超過 10 MB。');
    }
    const validFile = input.files[0];
    renderEventImagePreview(preview, validFile ? [] : [document.getElementById('edit-poster').value], validFile ? [validFile] : []);
    updatePosterCropPreview({ target: document.getElementById('edit-poster-display-scale') });
}

function previewEditedPromotionImages() {
    const input = document.getElementById('edit-promotion-files');
    const files = Array.from(input.files);
    if (files.length > 2 || files.some(file => !isValidEventImage(file))) {
        input.value = '';
        alert('宣傳圖片最多 2 張，請使用 JPG、PNG 或 WebP，且每張不可超過 10 MB。');
    }
    const validFiles = Array.from(input.files);
    if (validFiles.length) document.getElementById('edit-clear-promotion-images').checked = false;
    const storedImages = submissions.find(item => String(item.id) === document.getElementById('edit-id').value)?.promotion_image_urls;
    const existing = Array.isArray(storedImages) ? storedImages : [];
    renderEventImagePreview(document.getElementById('edit-promotion-preview'), validFiles.length ? [] : existing, validFiles);
}

function previewEditedLifeServiceThumbnail() {
    const input = document.getElementById('edit-life-service-thumbnail-file');
    const file = input.files[0];
    if (file && !isValidEventImage(file)) {
        input.value = '';
        alert('生活服務縮圖請使用 JPG、PNG 或 WebP，且不可超過 10 MB。');
    }
    const validFile = input.files[0];
    const url = document.getElementById('edit-life-service-thumbnail-url').value.trim();
    renderEventImagePreview(
        document.getElementById('edit-life-service-thumbnail-preview'),
        validFile ? [] : [url],
        validFile ? [validFile] : []
    );
}

function getEventMediaPath(value) {
    try {
        const url = new URL(value);
        const marker = '/storage/v1/object/public/event-media/';
        const markerIndex = url.pathname.indexOf(marker);
        if (markerIndex < 0) return '';
        const path = decodeURIComponent(url.pathname.slice(markerIndex + marker.length));
        return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/(poster|promo-[1-2])\.(jpg|jpeg|png|webp)$/i.test(path)
            ? path
            : '';
    } catch {
        return '';
    }
}

async function checkAdminRole() {
    const { data, error } = await supabaseClient.rpc('is_admin');
    return { isAdmin: !error && data === true, error };
}

async function loginAdmin(event) {
    event.preventDefault();
    const email = document.getElementById('admin-email').value.trim();
    const password = document.getElementById('admin-password').value;

    try {
        const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
        if (error || !data.user) {
            alert('登入失敗：' + (error?.message || '無法確認帳號'));
            return;
        }

        const roleCheck = await checkAdminRole();
        if (roleCheck.error) {
            await supabaseClient.auth.signOut();
            alert(`權限檢查失敗 (${roleCheck.error.code || '未知錯誤'})：${roleCheck.error.message}。請確認已在此 Supabase 專案執行完整 schema SQL。`);
            return;
        }

        if (!roleCheck.isAdmin) {
            await supabaseClient.auth.signOut();
            alert('此帳號尚未獲授管理員權限。');
            return;
        }

        showApp();
        await fetchSettings();
        await fetchSubmissions();
    } catch (error) {
        alert('登入失敗：' + (error?.message || '無法連線至 Supabase'));
    }
}

async function logoutAdmin() {
    await supabaseClient.auth.signOut();
    showLogin();
}

async function checkLogin() {
    const { data, error } = await supabaseClient.auth.getSession();
    if (error || !data.session) {
        showLogin();
        return;
    }

    const roleCheck = await checkAdminRole();
    if (!roleCheck.isAdmin) {
        await supabaseClient.auth.signOut();
        showLogin();
        return;
    }

    showApp();
    await fetchSettings();
    await fetchSubmissions();
}

function switchTab(tab) {
    const tabs = ['approvals', 'calendar', 'feedback', 'home-content', 'life-services', 'activity-curation', 'settings', 'backgrounds'];
    for (const name of tabs) {
        const active = name === tab;
        document.getElementById(`view-${name}`).classList.toggle('hidden', !active);
        document.getElementById(`tab-${name}`).classList.toggle('tab-active', active);
        document.getElementById(`tab-${name}`).classList.toggle('text-gray-400', !active);
    }
    if (tab === 'calendar') renderCalendarEditor();
    if (tab === 'feedback') fetchActivityFeedback();
    if (tab === 'activity-curation') fetchCuratedActivityDrafts();
    if (tab === 'settings' || tab === 'backgrounds' || tab === 'home-content' || tab === 'life-services') fetchSettings();
}

function toDateTimeLocalValue(value) {
    if (!value) return '';
    return String(value).replace(' ', 'T').slice(0, 16);
}

function isCuratedDraftExpired(item) {
    const endValue = item.event_end_time ||
        (item.event_end_date ? `${item.event_end_date} 23:59` : '') ||
        item.event_time;
    return Boolean(endValue && isEventExpired(toDateTimeLocalValue(endValue).replace('T', ' ')));
}

function renderCuratedActivityDrafts() {
    const list = document.getElementById('curated-drafts-list');
    list.querySelectorAll('[data-poster-preview]').forEach(preview => {
        if (preview.dataset.objectUrl) URL.revokeObjectURL(preview.dataset.objectUrl);
    });
    const publishedDrafts = curatedActivityDrafts.filter(item => item.status === 'published');
    const unpublishedDrafts = curatedActivityDrafts.filter(item => item.status !== 'published');
    const pastDrafts = curatedActivityDrafts.filter(isCuratedDraftExpired);
    const currentPublishedDrafts = publishedDrafts.filter(item => !pastDrafts.includes(item));
    const currentUnpublishedDrafts = unpublishedDrafts.filter(item => !pastDrafts.includes(item));
    const filterNav = document.getElementById('curated-draft-status-filters');
    filterNav.innerHTML = [
        ['published', '已上架', currentPublishedDrafts.length],
        ['unpublished', '未上架', currentUnpublishedDrafts.length],
        ['past', '已過去', pastDrafts.length]
    ].map(([filter, label, count]) => `<button type="button" data-curated-filter="${filter}" aria-pressed="${activeCuratedDraftFilter === filter}" class="rounded-lg border px-4 py-2 text-sm ${activeCuratedDraftFilter === filter ? 'border-blue-700 bg-blue-700 text-white' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'}">${label} <span class="${activeCuratedDraftFilter === filter ? 'text-blue-100' : 'text-gray-500'}">(${count})</span></button>`).join('');
    const filteredDrafts = activeCuratedDraftFilter === 'past' ? pastDrafts :
        activeCuratedDraftFilter === 'published' ? currentPublishedDrafts : currentUnpublishedDrafts;
    if (!filteredDrafts.length) {
        const emptyMessage = activeCuratedDraftFilter === 'published' ? '目前沒有已上架活動。' :
            activeCuratedDraftFilter === 'past' ? '目前沒有已過去的活動。' : '目前沒有未上架草稿。自動搜集後的新活動會顯示在這裡。';
        list.innerHTML = `<p class="bg-white border rounded-lg text-center text-gray-500 p-8">${emptyMessage}</p>`;
        return;
    }

    const categoryGroups = getCuratedActivityCategoryGroups();
    const categoryOptions = categoryGroups.map(category =>
        `<option value="${escapeHtml(category.value)}">${escapeHtml(category.label)}</option>`
    ).join('');
    const serviceCategories = homeServiceCategories.length ? homeServiceCategories : defaultHomeServiceCategories;
    const serviceCategoryOptions = serviceCategories.map(category =>
        `<option value="${escapeHtml(category.id)}">${escapeHtml(category.name)}</option>`
    ).join('');
    list.innerHTML = filteredDrafts.map(item => {
        const subcategoryOptions = categoryGroups
            .find(category => category.value === item.category)?.subcategories || [];
        const isExpired = isCuratedDraftExpired(item);
        const imageCandidates = Array.isArray(item.candidate_image_urls)
            ? item.candidate_image_urls.filter(url => /^https:\/\//i.test(url))
            : [];
        const sourceUrl = /^https:\/\//i.test(item.source_url || '') ? item.source_url : '';
        return `<article class="bg-white border rounded-xl shadow-sm p-4 md:p-5" data-curated-draft="${escapeHtml(item.id)}">
            <div class="flex flex-wrap items-center justify-between gap-2 mb-4">
                <div>
                    <span class="text-xs font-semibold px-2 py-1 rounded ${isExpired ? 'bg-gray-100 text-gray-700' : item.status === 'published' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}">${isExpired ? '已過期（自動下架）' : item.status === 'published' ? '已上架' : '待編輯草稿'}</span>
                    <span class="text-xs text-gray-500 ml-2">搜集時間：${escapeHtml(item.generated_at || item.created_at || '—')}</span>
                </div>
                ${sourceUrl ? `<a href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener noreferrer" class="text-sm text-blue-700 underline">原始來源：${escapeHtml(item.source_title || sourceUrl)}</a>` : ''}
            </div>
            <div class="grid gap-3 md:grid-cols-2">
                <label class="text-sm font-semibold">活動名稱<input data-field="title" maxlength="200" value="${escapeHtml(item.title)}" class="mt-1 w-full border rounded-lg px-3 py-2 font-normal"></label>
                <label class="text-sm font-semibold">主辦單位<input data-field="org_name" maxlength="200" value="${escapeHtml(item.org_name || '')}" class="mt-1 w-full border rounded-lg px-3 py-2 font-normal"></label>
                <label class="text-sm font-semibold">網站分類<select data-field="category" class="mt-1 w-full border rounded-lg px-3 py-2 font-normal"><option value="">請選擇分類</option>${categoryOptions}</select></label>
                <label class="text-sm font-semibold">子分類<select data-field="subcategory" class="mt-1 w-full border rounded-lg px-3 py-2 font-normal"><option value="">請選擇子分類</option>${subcategoryOptions.map(option => `<option value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</option>`).join('')}</select></label>
                <fieldset class="md:col-span-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                    <label class="flex items-start gap-2 text-sm font-semibold text-emerald-900"><input data-field="is_life_service" type="checkbox" ${item.is_life_service ? 'checked' : ''}><span>核准後同時加入「生活服務與資源對接區」</span></label>
                    <div class="mt-3 grid gap-3 sm:grid-cols-2">
                        <label class="text-sm font-semibold">資源主分類<select data-field="life_service_category" class="mt-1 w-full border rounded-lg px-3 py-2 font-normal"><option value="">請選擇資源主分類</option>${serviceCategoryOptions}</select></label>
                        <label class="text-sm font-semibold">資源子分類<select data-field="life_service_subcategory" class="mt-1 w-full border rounded-lg px-3 py-2 font-normal"><option value="">請選擇資源子分類</option>${(serviceCategories.find(category => category.id === item.life_service_category)?.subcategories || []).map(option => `<option value="${escapeHtml(option.id)}">${escapeHtml(option.name)}</option>`).join('')}</select></label>
                    </div>
                </fieldset>
                <label class="text-sm font-semibold">活動形式<select data-field="event_format" class="mt-1 w-full border rounded-lg px-3 py-2 font-normal"><option value="offline">線下</option><option value="online">線上</option></select></label>
                <label class="text-sm font-semibold">適合年齡<input data-field="age_range" maxlength="80" value="${escapeHtml(item.age_range || '不限')}" class="mt-1 w-full border rounded-lg px-3 py-2 font-normal"></label>
                <label class="text-sm font-semibold">活動開始<input data-field="event_time" type="datetime-local" value="${escapeHtml(toDateTimeLocalValue(item.event_time))}" class="mt-1 w-full border rounded-lg px-3 py-2 font-normal"></label>
                <label class="text-sm font-semibold">活動結束<input data-field="event_end_time" type="datetime-local" value="${escapeHtml(toDateTimeLocalValue(item.event_end_time || (item.event_end_date ? `${item.event_end_date}T23:59` : '')))}" class="mt-1 w-full border rounded-lg px-3 py-2 font-normal"></label>
                <label class="text-sm font-semibold">活動地址<input data-field="location" maxlength="240" value="${escapeHtml(item.location || '')}" class="mt-1 w-full border rounded-lg px-3 py-2 font-normal"></label>
                <label class="text-sm font-semibold">費用<input data-field="fee" maxlength="120" value="${escapeHtml(item.fee || '')}" class="mt-1 w-full border rounded-lg px-3 py-2 font-normal"></label>
                <label class="text-sm font-semibold md:col-span-2">活動簡介<textarea data-field="description" rows="4" maxlength="1600" class="mt-1 w-full border rounded-lg px-3 py-2 font-normal">${escapeHtml(item.description || '')}</textarea></label>
                <label class="text-sm font-semibold md:col-span-2">宣傳文案<textarea data-field="promo_copy" rows="3" maxlength="1000" class="mt-1 w-full border rounded-lg px-3 py-2 font-normal">${escapeHtml(item.promo_copy || '')}</textarea></label>
                <label class="text-sm font-semibold md:col-span-2">相關連結<textarea data-field="related_links" rows="3" placeholder="每行一個連結，格式：連結名稱 | https://example.com" class="mt-1 w-full border rounded-lg px-3 py-2 font-normal">${escapeHtml((Array.isArray(item.related_links) ? item.related_links : []).map(link => `${link.label || ''} | ${link.url || ''}`).join('\n'))}</textarea><span class="block text-xs text-gray-500 mt-1">可填報名、主辦方或活動詳情連結；每行一個，僅接受 HTTPS 網址。</span></label>
                <div class="md:col-span-2">
                    <label class="text-sm font-semibold">上傳海報圖片<input data-poster-file type="file" accept="image/jpeg,image/png,image/webp" class="mt-1 block w-full text-sm text-gray-600 file:mr-3 file:rounded file:border-0 file:bg-blue-50 file:px-4 file:py-2 file:font-semibold file:text-blue-700"></label>
                    <p class="text-xs text-gray-500 mt-1">支援 JPG、PNG、WebP，單張不超過 10 MB。選擇檔案後會取代圖片網址。</p>
                    <div data-poster-frame class="mt-2 w-full aspect-[4/3] bg-gray-100 rounded-lg border overflow-hidden ${safeImageUrl(item.poster_url || '') ? '' : 'hidden'}"><img data-poster-preview src="${escapeHtml(safeImageUrl(item.poster_url || ''))}" alt="活動海報預覽" class="w-full h-full object-cover"></div>
                    <label class="block text-xs font-medium text-gray-600 mt-3">縮圖大小：<output data-poster-scale-value>${getPosterDisplayScale(item.poster_display_scale)}%</output></label>
                    <input data-poster-display-scale type="range" min="100" max="200" step="10" value="${getPosterDisplayScale(item.poster_display_scale)}" class="w-full accent-blue-700">
                    <label class="block text-xs font-medium text-gray-600 mt-2">圖片上下位置：<output data-poster-position-value>${getPosterDisplayPosition(item.poster_display_position)}%</output></label>
                    <input data-poster-display-position type="range" min="0" max="100" step="5" value="${getPosterDisplayPosition(item.poster_display_position)}" class="w-full accent-blue-700">
                    <label class="block text-sm font-semibold mt-3">或輸入海報圖片網址<input data-field="poster_url" type="url" value="${escapeHtml(item.poster_url || '')}" class="mt-1 w-full border rounded-lg px-3 py-2 font-normal"></label>
                </div>
            </div>
            <div data-curated-candidates class="mt-3">${renderCuratedImageCandidates(imageCandidates)}</div>
            ${item.status === 'draft' ? '<section data-draft-ai-preview class="hidden mt-4 rounded-lg border border-violet-200 bg-violet-50 p-4" aria-live="polite"></section>' : ''}
            <div class="flex flex-wrap gap-2 mt-4">
                <button type="button" data-save-curated-draft class="bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold px-4 py-2 rounded-lg">儲存修改</button>
                ${item.status === 'draft' ? '<button type="button" data-preview-curated-ai class="bg-violet-700 hover:bg-violet-800 text-white text-sm font-semibold px-4 py-2 rounded-lg">AI 重新整理建議</button>' : ''}
                ${item.status === 'published'
                    ? '<button type="button" data-unpublish-curated-draft class="bg-gray-700 hover:bg-gray-800 text-white text-sm font-semibold px-4 py-2 rounded-lg">手動下架</button>'
                    : '<button type="button" data-publish-curated-draft class="bg-green-700 hover:bg-green-800 text-white text-sm font-semibold px-4 py-2 rounded-lg">儲存並上架</button>'}
                <button type="button" data-delete-curated-draft class="bg-red-700 hover:bg-red-800 text-white text-sm font-semibold px-4 py-2 rounded-lg">刪除活動</button>
            </div>
        </article>`;
    }).join('');

    for (const card of list.querySelectorAll('[data-curated-draft]')) {
        card.querySelector('[data-field="category"]').value =
            curatedActivityDrafts.find(item => String(item.id) === card.dataset.curatedDraft)?.category || '';
        card.querySelector('[data-field="subcategory"]').value =
            curatedActivityDrafts.find(item => String(item.id) === card.dataset.curatedDraft)?.subcategory || '';
        card.querySelector('[data-field="event_format"]').value =
            curatedActivityDrafts.find(item => String(item.id) === card.dataset.curatedDraft)?.event_format || 'offline';
        card.querySelector('[data-field="life_service_category"]').value =
            curatedActivityDrafts.find(item => String(item.id) === card.dataset.curatedDraft)?.life_service_category || '';
        card.querySelector('[data-field="life_service_subcategory"]').value =
            curatedActivityDrafts.find(item => String(item.id) === card.dataset.curatedDraft)?.life_service_subcategory || '';
        card.querySelector('[data-poster-display-scale]').addEventListener('input', updatePosterCropPreview);
        card.querySelector('[data-poster-display-position]').addEventListener('input', updatePosterCropPreview);
    }
}

function renderCuratedImageCandidates(urls) {
    return urls.length ? `<p class="text-xs text-gray-500 mb-2">候選圖片（請核對原始來源及使用權；點擊可填入海報網址）</p><div class="flex flex-wrap gap-2">${urls.map(url => `<button type="button" data-curated-image="${escapeHtml(url)}" class="border rounded-lg p-1 hover:border-blue-500"><img src="${escapeHtml(url)}" alt="候選活動海報" loading="lazy" class="w-24 h-20 object-cover rounded"></button>`).join('')}</div>` : '';
}

const curatedCandidateEdits = new WeakMap();

function getPosterDisplayScale(value) {
    const scale = Number(value);
    return Number.isFinite(scale) ? Math.min(200, Math.max(100, Math.round(scale / 10) * 10)) : 100;
}

function getPosterDisplayPosition(value) {
    if (value === null || value === undefined || value === '') return 50;
    const position = Number(value);
    return Number.isFinite(position) ? Math.min(100, Math.max(0, Math.round(position / 5) * 5)) : 50;
}

function updatePosterCropPreview(event) {
    const input = event.target.closest('[data-poster-display-scale], [data-poster-display-position], #edit-poster-display-scale, #edit-poster-display-position');
    if (!input) return;
    const isAdminEditor = input.id.startsWith('edit-');
    const container = input.closest('[data-curated-draft]') || document;
    const scaleInput = isAdminEditor ? document.getElementById('edit-poster-display-scale') : container.querySelector('[data-poster-display-scale]');
    const positionInput = isAdminEditor ? document.getElementById('edit-poster-display-position') : container.querySelector('[data-poster-display-position]');
    const scale = getPosterDisplayScale(scaleInput.value);
    const position = getPosterDisplayPosition(positionInput.value);
    scaleInput.value = String(scale);
    positionInput.value = String(position);
    const previewFrame = isAdminEditor ? document.getElementById('edit-poster-preview') : container.querySelector('[data-poster-frame]');
    applyPosterCropPreview(previewFrame, scale, position);
    const scaleOutput = isAdminEditor ? document.getElementById('edit-poster-display-scale-value') : container.querySelector('[data-poster-scale-value]');
    const positionOutput = isAdminEditor ? document.getElementById('edit-poster-display-position-value') : container.querySelector('[data-poster-position-value]');
    scaleOutput.value = `${scale}%`;
    scaleOutput.textContent = `${scale}%`;
    positionOutput.value = `${position}%`;
    positionOutput.textContent = `${position}%`;
}

function applyPosterCropPreview(previewFrame, scale, position) {
    previewFrame.querySelectorAll('img').forEach(preview => {
        preview.style.transform = `scale(${scale / 100})`;
        preview.style.objectPosition = `center ${position}%`;
    });
}

async function fetchCuratedActivityDrafts() {
    const list = document.getElementById('curated-drafts-list');
    const runStatus = document.getElementById('curation-run-status');
    list.innerHTML = '<p class="text-center text-gray-500 py-8">載入活動草稿中...</p>';
    const [draftResponse, runResponse] = await Promise.all([
        supabaseClient.from('curated_activity_drafts').select('*').order('created_at', { ascending: false }),
        supabaseClient.from('activity_curation_runs')
            .select('started_at, completed_at, status, found_count, inserted_count, error_message')
            .order('started_at', { ascending: false }).limit(1).maybeSingle()
    ]);
    if (draftResponse.error) {
        list.innerHTML = '<p class="bg-red-50 border border-red-200 rounded-lg text-red-800 p-4">活動草稿載入失敗。</p>';
        alert('活動草稿載入失敗：' + draftResponse.error.message);
        return;
    }

    curatedActivityDrafts = draftResponse.data || [];
    renderCuratedActivityDrafts();
    if (runResponse.error) {
        console.error('每日活動搜集狀態載入失敗：', runResponse.error);
        runStatus.textContent = '每日搜集狀態讀取失敗：' + runResponse.error.message;
        return;
    }
    const run = runResponse.data;
    if (!run) {
        runStatus.textContent = '尚未有執行紀錄；請先完成 Supabase Edge Function 與每日 17:40 排程設定。';
        return;
    }
    const completed = run.completed_at
        ? new Date(run.completed_at).toLocaleString('zh-Hant-MO', { timeZone: 'Asia/Macau' })
        : new Date(run.started_at).toLocaleString('zh-Hant-MO', { timeZone: 'Asia/Macau' });
    runStatus.textContent = run.status === 'succeeded'
        ? `最近搜集：${completed} · 找到 ${run.found_count} 項 · 新增草稿 ${run.inserted_count} 項`
        : run.status === 'failed'
            ? `最近搜集失敗：${completed} · ${run.error_message || '請檢查 Supabase Edge Function 記錄'}`
            : `每日搜集執行中：${completed}`;
}

async function runCuratedActivitySearch() {
    const button = document.getElementById('run-curated-search-btn');
    const status = document.getElementById('curation-run-status');
    if (button.disabled) return;
    button.disabled = true;
    button.textContent = '搜尋中…';
    status.textContent = '正在手動搜尋澳門活動並整理草稿，請稍候。';
    try {
        const { data, error } = await supabaseClient.functions.invoke('daily-activity-curation', {
            body: { source: 'admin' }
        });
        if (error) {
            const responseMessage = await error.context?.text?.().catch(() => '');
            throw new Error(responseMessage || error.message || '無法啟動手動搜尋');
        }
        if (!data?.success) throw new Error(data?.error || '搜尋服務沒有確認完成');
        await fetchCuratedActivityDrafts();
        status.textContent = `手動搜尋完成：找到 ${data.found_count} 項，新增草稿 ${data.inserted_count} 項。`;
    } catch (error) {
        status.textContent = `手動搜尋失敗：${error?.message || '請檢查 Edge Function 設定及執行記錄。'}`;
    } finally {
        button.disabled = false;
        button.textContent = '立即手動搜尋';
    }
}

async function saveCuratedActivityDraft(card, status) {
    const read = field => card.querySelector(`[data-field="${field}"]`).value.trim();
    const posterFile = card.querySelector('[data-poster-file]').files[0];
    if (posterFile && !isValidEventImage(posterFile)) {
        alert('海報請使用 JPG、PNG 或 WebP，且不可超過 10 MB。');
        return;
    }
    const endTime = read('event_end_time');
    const endDate = endTime ? endTime.slice(0, 10) : null;
    const changes = {
        title: read('title'),
        org_name: read('org_name'),
        category: read('category'),
        subcategory: read('subcategory') || null,
        event_format: read('event_format'),
        age_range: read('age_range') || '不限',
        event_time: read('event_time') ? read('event_time').replace('T', ' ') : null,
        event_end_date: endDate,
        event_end_time: endTime ? endTime.replace('T', ' ') : null,
        location: read('location'),
        fee: read('fee'),
        description: read('description'),
        promo_copy: read('promo_copy'),
        related_links: [],
        poster_url: read('poster_url'),
        poster_display_scale: getPosterDisplayScale(card.querySelector('[data-poster-display-scale]').value),
        poster_display_position: getPosterDisplayPosition(card.querySelector('[data-poster-display-position]').value),
        is_life_service: card.querySelector('[data-field="is_life_service"]').checked,
        life_service_category: card.querySelector('[data-field="is_life_service"]').checked
            ? read('life_service_category') || null
            : null,
        life_service_subcategory: card.querySelector('[data-field="is_life_service"]').checked
            ? read('life_service_subcategory') || null
            : null,
        life_service_summary: card.querySelector('[data-field="is_life_service"]').checked
            ? read('description') || read('promo_copy')
            : null,
        life_service_details: card.querySelector('[data-field="is_life_service"]').checked ? read('promo_copy') : null,
        life_service_thumbnail_url: card.querySelector('[data-field="is_life_service"]').checked ? read('poster_url') : null,
        status,
        updated_at: new Date().toISOString()
    };
    if (curatedCandidateEdits.has(card)) changes.candidate_image_urls = curatedCandidateEdits.get(card);

    const relatedLinksText = read('related_links');
    const relatedLinkLines = relatedLinksText ? relatedLinksText.split(/\r?\n/).map(line => line.trim()).filter(Boolean) : [];
    if (relatedLinkLines.length > 10) {
        alert('相關連結最多可新增 10 個。');
        return;
    }
    for (const line of relatedLinkLines) {
        const separatorIndex = line.indexOf('|');
        if (separatorIndex < 1) {
            alert('相關連結請依「連結名稱 | HTTPS 網址」格式，每行填寫一個。');
            return;
        }
        const label = line.slice(0, separatorIndex).trim();
        const url = line.slice(separatorIndex + 1).trim();
        if (!label || label.length > 60 || !safeImageUrl(url) || !url.toLowerCase().startsWith('https://')) {
            alert('請檢查相關連結：名稱須為 1 至 60 字，網址須為有效 HTTPS 網址。');
            return;
        }
        changes.related_links.push({ label, url });
    }

    if (changes.poster_url) {
        try {
            if (new URL(changes.poster_url).protocol !== 'https:') throw new Error('invalid protocol');
        } catch {
            alert('海報圖片網址必須是有效的 HTTPS 網址。');
            return;
        }
    }
    if (status === 'published' && (!changes.title || !changes.category || !changes.event_time || !changes.event_end_time || !changes.description || (changes.event_format === 'offline' && !changes.location))) {
        alert('上架前請填寫活動名稱、分類、形式、開始及結束時間、活動簡介；線下活動亦須填寫地址。');
        return;
    }
    if (status === 'published' && changes.category === 'life_services' && !changes.subcategory) {
        alert('上架生活服務與資源對接內容前，請選擇主分類或子分類。');
        return;
    }
    if (status === 'published' && changes.is_life_service &&
        !(homeServiceCategories.length ? homeServiceCategories : defaultHomeServiceCategories)
            .some(category => category.id === changes.life_service_category)) {
        alert('請選擇生活服務與資源對接區的資源主分類。');
        return;
    }
    const startTimestamp = changes.event_time ? Date.parse(`${changes.event_time.replace(' ', 'T')}:00+08:00`) : NaN;
    const endTimestamp = changes.event_end_time ? Date.parse(`${changes.event_end_time.replace(' ', 'T')}:00+08:00`) : NaN;
    if (status === 'published' && (!Number.isFinite(startTimestamp) || !Number.isFinite(endTimestamp) || startTimestamp > endTimestamp || endTimestamp <= Date.now())) {
        alert('請檢查活動開始及結束時間；結束時間必須晚於現在及開始時間。');
        return;
    }

    const imageBucket = supabaseClient.storage.from('event-media');
    let uploadedPosterPath = '';
    if (posterFile) {
        const extension = posterFile.type === 'image/jpeg' ? 'jpg' : posterFile.type === 'image/png' ? 'png' : 'webp';
        uploadedPosterPath = `${createHomepageUploadId()}/poster.${extension}`;
        const { error: uploadError } = await imageBucket.upload(uploadedPosterPath, posterFile, {
            cacheControl: '3600',
            contentType: posterFile.type,
            upsert: false
        });
        if (uploadError) {
            alert('海報上傳失敗：' + uploadError.message);
            return;
        }
        changes.poster_url = imageBucket.getPublicUrl(uploadedPosterPath).data.publicUrl;
    }
    if (changes.is_life_service) changes.life_service_thumbnail_url = changes.poster_url;

    const { error } = await supabaseClient.from('curated_activity_drafts')
        .update(changes)
        .eq('id', card.dataset.curatedDraft);
    if (error) {
        if (uploadedPosterPath) {
            const { error: cleanupError } = await imageBucket.remove([uploadedPosterPath]);
            if (cleanupError) alert('草稿儲存失敗，且清理新海報也失敗：' + cleanupError.message);
        }
        alert('活動草稿儲存失敗：' + error.message);
        return;
    }
    const existingDraft = curatedActivityDrafts.find(item => String(item.id) === card.dataset.curatedDraft);
    if ((uploadedPosterPath || changes.poster_url !== (existingDraft?.poster_url || '')) && existingDraft?.poster_url) {
        const oldPath = getEventMediaPath(existingDraft.poster_url);
        if (oldPath) {
            const { error: cleanupError } = await imageBucket.remove([oldPath]);
            if (cleanupError) alert('活動已儲存，但舊海報清理失敗：' + cleanupError.message);
        }
    }
    alert(status === 'published' ? '活動內容已儲存並上架。' : status === 'draft' ? '活動內容已儲存並下架。' : '活動內容已儲存。');
    await fetchCuratedActivityDrafts();
}

const curatedAiFields = [
    ['description', '活動簡介'],
    ['promo_copy', '宣傳文案'],
    ['age_range', '適合年齡'],
    ['location', '活動地址'],
    ['fee', '費用']
];
const pendingCuratedSuggestions = new WeakMap();

async function previewCuratedAi(card, button) {
    const preview = card.querySelector('[data-draft-ai-preview]');
    const original = Object.fromEntries(curatedAiFields.map(([field]) => [field, card.querySelector(`[data-field="${field}"]`).value]));
    original.related_links = card.querySelector('[data-field="related_links"]').value;
    pendingCuratedSuggestions.delete(card);
    preview.classList.add('hidden');
    button.disabled = true;
    button.textContent = 'AI 整理中…';
    try {
        const { data, error } = await supabaseClient.functions.invoke('daily-activity-curation', {
            body: { action: 'preview_draft', draft_id: card.dataset.curatedDraft }
        });
        if (error) {
            const message = await error.context?.text?.().catch(() => '');
            throw new Error(message || error.message || '無法產生 AI 建議。');
        }
        if (!data?.suggestion || typeof data.suggestion !== 'object') throw new Error('AI 沒有回傳有效的草稿建議。');
        const suggestion = data.suggestion;
        if (curatedAiFields.some(([field]) => typeof suggestion[field] !== 'string')) throw new Error('AI 草稿建議格式無效。');
        if (!Array.isArray(suggestion.image_urls) || !Array.isArray(suggestion.related_links)) throw new Error('來源圖片或連結格式無效；請確認後端已更新。');
        const imageUrls = suggestion.image_urls.filter(url => typeof url === 'string' && isAllowedHttpsUrl(url) && url).slice(0, 12);
        const links = suggestion.related_links.filter(link => link && typeof link.label === 'string' && link.label.trim() && typeof link.url === 'string' && link.url && isAllowedHttpsUrl(link.url)).slice(0, 10);
        const summary = curatedAiFields.map(([field, label]) => `${label}\n目前：${original[field] || '（空白）'}\n建議：${suggestion[field] || '（空白）'}`).join('\n\n') +
            `\n\n來源連結建議：\n${links.map(link => `${link.label} | ${link.url}`).join('\n') || '（無）'}\n\n候選圖片：${imageUrls.length} 張` +
            (suggestion.source_warning ? `\n${suggestion.source_warning}` : '');
        preview.innerHTML = '<h4 class="font-semibold text-violet-900">AI 草稿建議</h4><p class="mt-1 text-sm">內容根據上次儲存的草稿整理，連結及候選圖片來自來源頁。全年齡預設值、內容及圖片使用權請自行核實；確認後仍須按「儲存修改」。</p><pre data-draft-ai-summary class="mt-3 whitespace-pre-wrap break-words rounded bg-white p-3 text-sm"></pre><div data-preview-images class="mt-3"></div><div class="mt-3 flex gap-2"><button type="button" data-apply-curated-ai class="rounded bg-violet-700 px-3 py-2 text-sm text-white">確認套用建議</button><button type="button" data-cancel-curated-ai class="rounded border px-3 py-2 text-sm">取消</button></div>';
        preview.querySelector('[data-draft-ai-summary]').textContent = summary;
        preview.querySelector('[data-preview-images]').innerHTML = renderCuratedImageCandidates(imageUrls).replaceAll('data-curated-image=', 'data-preview-image=');
        pendingCuratedSuggestions.set(card, { original, suggestion, imageUrls, links });
        preview.classList.remove('hidden');
    } catch (error) {
        alert(`AI 重新整理失敗：${error?.message || '請檢查 AI 設定。'}`);
    } finally {
        button.disabled = false;
        button.textContent = 'AI 重新整理建議';
    }
}

function handleCuratedDraftActions(event) {
    const previewButton = event.target.closest('[data-preview-curated-ai]');
    if (previewButton) {
        previewCuratedAi(previewButton.closest('[data-curated-draft]'), previewButton);
        return;
    }
    const applyButton = event.target.closest('[data-apply-curated-ai]');
    if (applyButton) {
        const card = applyButton.closest('[data-curated-draft]');
        const pending = pendingCuratedSuggestions.get(card);
        if (!pending) {
            alert('找不到 AI 建議，請重新產生。');
            return;
        }
        if ([...curatedAiFields.map(([field]) => field), 'related_links'].some(field => card.querySelector(`[data-field="${field}"]`).value !== pending.original[field])) {
            alert('欄位已在產生建議後變更；為避免覆蓋，請重新產生建議。');
            return;
        }
        const relatedField = card.querySelector('[data-field="related_links"]');
        const lines = relatedField.value.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
        const existingUrls = new Set(lines.map(line => line.slice(line.indexOf('|') + 1).trim()));
        const additions = pending.links.filter(link => !existingUrls.has(link.url)).map(link => `${link.label.replace(/\|/g, ' ')} | ${link.url}`);
        if (lines.length + additions.length > 10) {
            alert('相關連結合共超過 10 個，請先整理現有連結再重新產生建議。');
            return;
        }
        curatedAiFields.forEach(([field]) => { card.querySelector(`[data-field="${field}"]`).value = pending.suggestion[field]; });
        relatedField.value = [...lines, ...additions].join('\n');
        const existing = curatedCandidateEdits.get(card) || curatedActivityDrafts.find(item => String(item.id) === card.dataset.curatedDraft)?.candidate_image_urls || [];
        const candidates = [...new Set([...existing, ...pending.imageUrls])].slice(0, 12);
        curatedCandidateEdits.set(card, candidates);
        card.querySelector('[data-curated-candidates]').innerHTML = renderCuratedImageCandidates(candidates);
        pendingCuratedSuggestions.delete(card);
        card.querySelector('[data-draft-ai-preview]').classList.add('hidden');
        alert('建議已填入編輯器；請核對後按「儲存修改」。');
        return;
    }
    const cancelButton = event.target.closest('[data-cancel-curated-ai]');
    if (cancelButton) {
        const card = cancelButton.closest('[data-curated-draft]');
        pendingCuratedSuggestions.delete(card);
        card.querySelector('[data-draft-ai-preview]').classList.add('hidden');
        return;
    }
    const imageButton = event.target.closest('[data-curated-image]');
    if (imageButton) {
        const card = imageButton.closest('[data-curated-draft]');
        card.querySelector('[data-field="poster_url"]').value = imageButton.dataset.curatedImage;
        return;
    }

    const button = event.target.closest('[data-delete-curated-draft]');
    if (button) {
        deleteCuratedActivityDraft(button.closest('[data-curated-draft]'));
        return;
    }

    const saveButton = event.target.closest('[data-save-curated-draft], [data-publish-curated-draft], [data-unpublish-curated-draft]');
    if (!saveButton) return;
    const card = saveButton.closest('[data-curated-draft]');
    const status = saveButton.hasAttribute('data-publish-curated-draft') ? 'published' :
        saveButton.hasAttribute('data-unpublish-curated-draft') ? 'draft' :
            curatedActivityDrafts.find(item => String(item.id) === card.dataset.curatedDraft)?.status || 'draft';
    saveCuratedActivityDraft(card, status);
}

async function deleteCuratedActivityDraft(card) {
    const item = curatedActivityDrafts.find(draft => String(draft.id) === card?.dataset.curatedDraft);
    if (!item) {
        alert('找不到要刪除的活動，請重新整理後再試。');
        return;
    }
    if (!confirm(`確定永久刪除「${item.title}」？此操作無法復原。`)) return;

    const { error } = await supabaseClient.from('curated_activity_drafts').delete().eq('id', item.id);
    if (error) {
        alert('活動刪除失敗：' + error.message);
        return;
    }

    if (item.poster_url) {
        const imagePath = getEventMediaPath(item.poster_url);
        if (imagePath) {
            const { error: imageError } = await supabaseClient.storage.from('event-media').remove([imagePath]);
            if (imageError) {
                alert('活動已刪除，但海報檔案清理失敗：' + imageError.message);
            }
        }
    }
    await fetchCuratedActivityDrafts();
}

function updateCuratedSubcategoryOptions(event) {
    const categorySelect = event.target.closest('[data-field="category"]');
    const serviceCategorySelect = event.target.closest('[data-field="life_service_category"]');
    if (!categorySelect && !serviceCategorySelect) return;
    const card = event.target.closest('[data-curated-draft]');
    const subcategoryField = categorySelect ? 'subcategory' : 'life_service_subcategory';
    const subcategorySelect = card.querySelector(`[data-field="${subcategoryField}"]`);
    const currentValue = subcategorySelect.value;
    const subcategories = categorySelect
        ? getCuratedActivityCategoryGroups().find(category => category.value === categorySelect.value)?.subcategories || []
        : (homeServiceCategories.length ? homeServiceCategories : defaultHomeServiceCategories)
            .find(category => category.id === serviceCategorySelect.value)?.subcategories || [];
    const optionValue = categorySelect ? option => option.value : option => option.id;
    const optionLabel = categorySelect ? option => option.label : option => option.name;
    subcategorySelect.innerHTML = `<option value="">請選擇子分類</option>${subcategories.map(option => `<option value="${escapeHtml(optionValue(option))}">${escapeHtml(optionLabel(option))}</option>`).join('')}`;
    if (subcategories.some(option => optionValue(option) === currentValue)) subcategorySelect.value = currentValue;
}

function previewCuratedPoster(event) {
    const fileInput = event.target.closest('[data-poster-file]');
    const urlInput = event.target.closest('[data-field="poster_url"]');
    if (!fileInput && !urlInput) return;
    const card = event.target.closest('[data-curated-draft]');
    const preview = card.querySelector('[data-poster-preview]');
    const frame = card.querySelector('[data-poster-frame]');
    if (preview.dataset.objectUrl) {
        URL.revokeObjectURL(preview.dataset.objectUrl);
        preview.dataset.objectUrl = '';
    }

    if (fileInput) {
        const file = fileInput.files[0];
        if (!file) return;
        if (!isValidEventImage(file)) {
            fileInput.value = '';
            alert('海報請使用 JPG、PNG 或 WebP，且不可超過 10 MB。');
            return;
        }
        const objectUrl = URL.createObjectURL(file);
        preview.dataset.objectUrl = objectUrl;
        preview.src = objectUrl;
        frame.classList.remove('hidden');
        card.querySelector('[data-field="poster_url"]').value = '';
        applyPosterCropPreview(
            frame,
            getPosterDisplayScale(card.querySelector('[data-poster-display-scale]').value),
            getPosterDisplayPosition(card.querySelector('[data-poster-display-position]').value)
        );
        return;
    }

    const imageUrl = safeImageUrl(urlInput.value.trim());
    if (imageUrl) {
        preview.src = imageUrl;
        frame.classList.remove('hidden');
        applyPosterCropPreview(
            frame,
            getPosterDisplayScale(card.querySelector('[data-poster-display-scale]').value),
            getPosterDisplayPosition(card.querySelector('[data-poster-display-position]').value)
        );
    } else {
        preview.removeAttribute('src');
        frame.classList.add('hidden');
    }
}

function renderActivityFeedback() {
    const list = document.getElementById('feedback-list');
    if (!activityFeedback.length) {
        list.innerHTML = '<p class="bg-white border rounded-lg text-center text-gray-500 p-8">目前沒有瀏覽者回饋。</p>';
        return;
    }

    list.innerHTML = activityFeedback.map(item => {
        const activity = submissions.find(submission => String(submission.id) === String(item.activity_id));
        const feedbackType = item.feedback_type === 'content_correction' ? '更正活動內容' : '提供建議';
        return `<article class="bg-white border rounded-lg p-4 space-y-3">
            <div class="flex flex-wrap items-center justify-between gap-2">
                <div>
                    <span class="text-xs font-semibold text-blue-800 bg-blue-50 px-2 py-1 rounded">${feedbackType}</span>
                    <span class="text-sm text-gray-500 ml-2">${escapeHtml(item.created_at || '')}</span>
                </div>
                <span class="text-sm font-semibold">${item.status === 'resolved' ? '已解決' : item.status === 'dismissed' ? '不採納' : item.status === 'reviewing' ? '處理中' : '待處理'}</span>
            </div>
            ${activity ? `<p class="text-sm text-gray-600">相關活動：${escapeHtml(activity.title)}（${escapeHtml(activity.org_name)}）</p>` : item.activity_id ? '<p class="text-sm text-gray-500">相關活動已不存在</p>' : ''}
            <p class="text-gray-800 whitespace-pre-line">${escapeHtml(item.message)}</p>
            ${item.contact ? `<p class="text-sm text-gray-500">回覆聯絡：${escapeHtml(item.contact)}</p>` : ''}
            <div class="flex flex-wrap items-center gap-2 pt-1">
                <label class="sr-only" for="feedback-status-${escapeHtml(item.id)}">回饋處理狀態</label>
                <select id="feedback-status-${escapeHtml(item.id)}" data-feedback-status class="border rounded-lg px-3 py-2 text-sm">
                    <option value="pending" ${item.status === 'pending' ? 'selected' : ''}>待處理</option>
                    <option value="reviewing" ${item.status === 'reviewing' ? 'selected' : ''}>處理中</option>
                    <option value="resolved" ${item.status === 'resolved' ? 'selected' : ''}>已解決</option>
                    <option value="dismissed" ${item.status === 'dismissed' ? 'selected' : ''}>不採納</option>
                </select>
                <button type="button" data-save-feedback="${escapeHtml(item.id)}" class="bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold px-4 py-2 rounded-lg">儲存狀態</button>
            </div>
        </article>`;
    }).join('');
}

async function fetchActivityFeedback() {
    const list = document.getElementById('feedback-list');
    list.innerHTML = '<p class="text-center text-gray-500 py-8">載入回饋中...</p>';
    const { data, error } = await supabaseClient.from('activity_feedback')
        .select('*')
        .order('created_at', { ascending: false });
    if (error) {
        list.innerHTML = `<p class="text-red-600">讀取回饋失敗：${escapeHtml(error.message)}</p>`;
        return;
    }
    activityFeedback = data || [];
    renderActivityFeedback();
}

async function saveActivityFeedbackStatus(event) {
    const button = event.target.closest('[data-save-feedback]');
    if (!button) return;
    const card = button.closest('article');
    const status = card.querySelector('[data-feedback-status]').value;
    const { error } = await supabaseClient.from('activity_feedback')
        .update({ status })
        .eq('id', button.dataset.saveFeedback);
    if (error) {
        alert('更新回饋狀態失敗：' + error.message);
        return;
    }
    await fetchActivityFeedback();
}

function updateAdminSubcategoryOptions(selectedValues = '') {
    const categories = new Set(Array.from(
        document.querySelectorAll('#edit-category input[name="editCategory"]:checked'),
        input => input.value
    ));
    const selected = new Set(Array.isArray(selectedValues)
        ? selectedValues
        : String(selectedValues || '').split(',').filter(Boolean));
    const container = document.getElementById('edit-subcategory');
    const groups = activityCategoryGroups.filter(category => categories.has(category.value));
    container.innerHTML = groups.length ? groups.map(category => `<fieldset class="space-y-1">
        <legend class="text-sm font-semibold text-gray-700">${escapeHtml(category.label)}</legend>
        ${category.subcategories.map(subcategory => `<label class="flex items-start gap-2 rounded px-2 py-1 hover:bg-white">
            <input type="checkbox" name="editSubcategory" value="${escapeHtml(subcategory.value)}" ${selected.has(subcategory.value) ? 'checked' : ''} class="mt-0.5 h-4 w-4 shrink-0 accent-blue-600">
            <span class="text-sm text-gray-700">${escapeHtml(subcategory.label)}</span>
        </label>`).join('')}
    </fieldset>`).join('') : '<p class="text-sm text-gray-500">請先勾選主分類。</p>';
}

function getAdminCategoryLabel(value) {
    const values = Array.isArray(value) ? value : String(value || '').split(',').filter(Boolean);
    return values.map(categoryValue =>
        activityCategoryGroups.find(item => item.value === categoryValue)?.label || categoryValue
    ).filter(Boolean).join('、') || '未分類';
}

function getAdminSubcategoryLabel(categoryValue, subcategoryValue) {
    const values = Array.isArray(subcategoryValue)
        ? subcategoryValue
        : String(subcategoryValue || '').split(',').filter(Boolean);
    return values.map(value => {
        const category = activityCategoryGroups.find(item =>
            item.subcategories.some(subcategory => subcategory.value === value)
        );
        return category?.subcategories.find(subcategory => subcategory.value === value)?.label || value;
    }).filter(Boolean).join('、');
}

function renderSubmissionCategoryBadges(item) {
    const activityCategories = (Array.isArray(item.category) ? item.category : String(item.category || '').split(','))
        .map(value => value.trim())
        .filter(Boolean);
    const activitySubcategories = (Array.isArray(item.subcategory) ? item.subcategory : String(item.subcategory || '').split(','))
        .map(value => value.trim())
        .filter(Boolean);
    const lifeServiceCategory = homeServiceCategories.find(category => category.id === item.life_service_category);
    const lifeServiceSubcategory = lifeServiceCategory?.subcategories.find(subcategory => subcategory.id === item.life_service_subcategory);
    const activityBadges = [
        ...activityCategories.map(value => getAdminCategoryLabel(value)),
        ...activitySubcategories.map(value => getAdminSubcategoryLabel('', value))
    ];

    return `<div class="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
        <span class="font-semibold text-gray-600">活動分類：</span>
        ${activityBadges.length
            ? activityBadges.map(label => `<span class="rounded-full bg-blue-50 px-2.5 py-1 font-medium text-blue-800">${escapeHtml(label)}</span>`).join('')
            : '<span class="text-gray-500">未分類</span>'}
        ${item.is_life_service === true
            ? `<span class="ml-1 font-semibold text-gray-600">生活服務：</span><span class="rounded-full bg-amber-50 px-2.5 py-1 font-medium text-amber-800">${escapeHtml(lifeServiceCategory?.name || '未選主分類')}${lifeServiceSubcategory ? ` · ${escapeHtml(lifeServiceSubcategory.name)}` : ''}</span>`
            : ''}
    </div>`;
}

function isAllowedMapUrl(value) {
    if (!value) return true;
    try {
        const url = new URL(value);
        const host = url.hostname.toLowerCase();
        return url.protocol === 'https:' && (
            host === 'maps.apple.com' || host === 'maps.app.goo.gl' ||
            (host === 'goo.gl' && url.pathname.startsWith('/maps')) ||
            host === 'google.com' || host.endsWith('.google.com') ||
            host === 'openstreetmap.org' || host.endsWith('.openstreetmap.org')
        );
    } catch {
        return false;
    }
}

function isAllowedHttpsUrl(value) {
    if (!value) return true;
    try {
        return new URL(value).protocol === 'https:';
    } catch {
        return false;
    }
}

function updateAdminEventFormat() {
    const isOnline = document.querySelector('input[name="edit-event-format"]:checked')?.value === 'online';
    const locationLabel = document.getElementById('edit-location-label');
    locationLabel.textContent = isOnline ? '線上平台／參加方式' : '活動地址';
    document.getElementById('edit-location').placeholder = isOnline
        ? '例如 Zoom、Teams 或線上參加方式'
        : '輸入場地名稱或完整地址';
    document.getElementById('edit-map-field').classList.toggle('hidden', isOnline);
    if (isOnline) document.getElementById('edit-map-url').value = '';
}

function populateAdminCategories() {
    const select = document.getElementById('edit-category');
    select.innerHTML = activityCategoryGroups.map(category => `<label class="flex items-start gap-2 rounded px-2 py-1 hover:bg-gray-50">
        <input type="checkbox" name="editCategory" value="${escapeHtml(category.value)}" class="mt-0.5 h-4 w-4 shrink-0 accent-blue-600">
        <span class="text-sm font-normal text-gray-700">${escapeHtml(category.label)}</span>
    </label>`).join('');
    updateAdminSubcategoryOptions();
}

function parseContentItems(value) {
    try {
        const items = JSON.parse(value || '[]');
        return Array.isArray(items) ? items.filter(item => item && typeof item === 'object') : [];
    } catch {
        return [];
    }
}

function renderContentRows(containerId, items, fields, removeAttribute) {
    const container = document.getElementById(containerId);
    container.querySelectorAll('[data-content-preview][data-object-url]').forEach(preview => URL.revokeObjectURL(preview.dataset.objectUrl));
    if (!items.length) {
        container.innerHTML = '<p class="text-sm text-gray-500">尚未新增內容。</p>';
        return;
    }

    container.innerHTML = items.map((item, index) => `<article data-content-row class="bg-white border rounded-lg p-4 grid gap-3 md:grid-cols-2">
        ${fields.map(field => {
            const imageUrl = field.imageUpload ? safeImageUrl(item[field.name] || '') || '' : '';
            const crop = field.crop;
            const cropAttributes = crop
                ? `data-hero-image data-crop-ratio="${crop.ratio}" data-crop-width="${crop.width}" data-crop-height="${crop.height}"`
                : '';
            const previewAspectClass = crop ? (crop.ratio > 2.5 ? 'aspect-[3/1]' : crop.ratio >= 2 ? 'aspect-[2/1]' : 'aspect-[8/5]') : 'max-h-40';
            const fieldValue = item[field.name] ?? (field.name === 'order' ? index + 1 : field.defaultValue) ?? '';
            const rangeAttributes = field.type === 'range' || field.type === 'number'
                ? `${field.min !== undefined ? `min="${field.min}"` : ''} ${field.max !== undefined ? `max="${field.max}"` : ''} step="${field.step || 1}"`
                : '';
            const rangeOutput = field.type === 'range'
                ? `<output data-content-output="${field.name}" class="ml-2">${escapeHtml(fieldValue)}%</output>`
                : '';
            const previewClass = field.previewRatio
                ? 'w-[225px] max-w-full aspect-[45/14] object-cover rounded-lg border overflow-hidden'
                : `w-full ${previewAspectClass} object-cover rounded-lg border`;
            const previewStyle = field.previewRatio
                ? ` style="transform:scale(${Math.min(200, Math.max(100, Number(item.imageScale) || 100)) / 100});transform-origin:center;object-position:center ${Math.min(100, Math.max(0, Number(item.imagePosition ?? 50)))}%"`
                : '';
            return `<div><label class="text-sm font-medium text-gray-700">${field.label}<input data-content-field="${field.name}" type="${field.type || 'text'}" ${rangeAttributes} value="${escapeHtml(fieldValue)}" class="mt-1 w-full border rounded-lg px-3 py-2 font-normal">${rangeOutput}</label>${field.imageUpload ? `<label class="block mt-2 text-xs font-medium text-gray-600">從電腦選擇圖片<input type="file" data-content-image data-image-field="${field.name}" data-image-variant="${field.imageVariant || ''}" ${cropAttributes} accept="image/jpeg,image/png,image/webp" class="mt-1 block w-full text-xs file:mr-2 file:rounded file:border-0 file:bg-blue-50 file:px-3 file:py-1.5 file:font-semibold file:text-blue-700"></label><div class="${imageUrl ? '' : 'hidden'} mt-2 ${field.previewRatio             ? 'w-[225px] max-w-full aspect-[45/14] overflow-hidden rounded-lg bg-gray-100' : ''}"><img data-content-preview="${field.name}" ${field.previewRatio ? `data-image-scale-preview="${field.name}"` : ''} src="${escapeHtml(imageUrl)}" alt="${escapeHtml(field.label)}預覽" class="${imageUrl ? '' : 'hidden'} ${previewClass}"${previewStyle}></div></div>` : '</div>'}`;
        }).join('')}
        ${containerId === 'home-ad-editor' ? `<div class="flex items-center gap-2">
            <button type="button" data-move-ad="up" aria-label="廣告上移" ${index === 0 ? 'disabled' : ''} class="rounded border px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-40">↑ 上移</button>
            <button type="button" data-move-ad="down" aria-label="廣告下移" ${index === items.length - 1 ? 'disabled' : ''} class="rounded border px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-40">↓ 下移</button>
            <button type="button" ${removeAttribute}="${index}" class="text-sm text-red-700 hover:underline">移除</button>
        </div>` : `<button type="button" ${removeAttribute}="${index}" class="justify-self-start text-sm text-red-700 hover:underline">移除</button>`}
    </article>`).join('');
}

function collectContentRows(containerId) {
    return Array.from(document.querySelectorAll(`#${containerId} [data-content-row]`)).map(row =>
        Object.fromEntries(Array.from(row.querySelectorAll('[data-content-field]')).map(input => [
            input.dataset.contentField,
            input.type === 'checkbox' ? input.checked : input.value.trim()
        ]))
    ).filter(item => Object.entries(item).some(([key, value]) => key !== 'order' && value));
}

function contentRowHasValues(row) {
    return Array.from(row.querySelectorAll('[data-content-field]'))
        .some(input => input.dataset.contentField !== 'order' && (input.type === 'checkbox' ? input.checked : input.value.trim())) ||
        Array.from(row.querySelectorAll('[data-content-image], [data-content-media]')).some(input => input.files[0]);
}

function moveHomeAd(index, offset) {
    homeAdItems = Array.from(document.querySelectorAll('#home-ad-editor [data-content-row]')).map(row =>
        Object.fromEntries(Array.from(row.querySelectorAll('[data-content-field]')).map(input => [input.dataset.contentField, input.value.trim()]))
    );
    const targetIndex = index + offset;
    if (targetIndex < 0 || targetIndex >= homeAdItems.length) return;
    const [item] = homeAdItems.splice(index, 1);
    homeAdItems.splice(targetIndex, 0, item);
    homeAdItems = homeAdItems.map((ad, itemIndex) => ({ ...ad, order: itemIndex + 1 }));
    renderHomeContentEditors();
}

function renderHomeContentEditors() {
    renderContentRows('home-blog-editor', homeBlogItems, [
        { name: 'title', label: '標題' },
        { name: 'excerpt', label: '簡介' },
        { name: 'imageUrl', label: '封面圖片網址（選填）', type: 'url', imageUpload: true },
        { name: 'url', label: '網頁連結', type: 'url' }
    ], 'data-remove-blog');
    renderContentRows('home-ad-editor', homeAdItems, [
        { name: 'order', label: '顯示位置（1 為最高）', type: 'number', min: 1, step: 1 },
        { name: 'title', label: '標題（選填）' },
        { name: 'description', label: '簡介' },
        { name: 'imageUrl', label: '圖片網址（選填）', type: 'url', imageUpload: true, previewRatio: 225 / 70 },
        { name: 'imageScale', label: '圖片縮放', type: 'range', min: 100, max: 200, step: 5, defaultValue: 100 },
        { name: 'imagePosition', label: '圖片上下位置', type: 'range', min: 0, max: 100, step: 5, defaultValue: 50 },
        { name: 'url', label: '外部網頁連結', type: 'url' }
    ], 'data-remove-ad');
    renderHomeHeroEditors();
}

function renderHeroTextField(name, label, value = '', type = 'text', options = '') {
    return `<label class="block text-sm font-medium text-gray-700">${label}<input data-content-field="${name}" type="${type}" value="${escapeHtml(value)}" ${options} class="mt-1 w-full border rounded-lg px-3 py-2 font-normal"></label>`;
}

function renderHeroTextarea(name, label, value = '', placeholder = '', rows = 3) {
    return `<label class="block text-sm font-medium text-gray-700">${label}<textarea data-content-field="${name}" rows="${rows}" placeholder="${escapeHtml(placeholder)}" class="mt-1 w-full border rounded-lg px-3 py-2 font-normal">${escapeHtml(value)}</textarea></label>`;
}

function renderHeroRichEditor(name, label, value = '', placeholder = '') {
    const editorId = `rich-editor-${name}-${createHomepageUploadId()}`;
    return `<div class="space-y-2"><p class="text-sm font-medium text-gray-700">${label}</p>
        <div class="flex flex-wrap gap-1 rounded-t-lg border border-b-0 bg-gray-50 p-2" role="toolbar" aria-label="${label}格式工具">
            <button type="button" data-rich-command="bold" data-editor="${editorId}" class="rounded border bg-white px-2 py-1 text-xs font-bold" aria-label="粗體">B</button>
            <button type="button" data-rich-command="italic" data-editor="${editorId}" class="rounded border bg-white px-2 py-1 text-xs italic" aria-label="斜體">I</button>
            <button type="button" data-rich-command="formatBlock" data-command-value="h2" data-editor="${editorId}" class="rounded border bg-white px-2 py-1 text-xs">標題</button>
            <button type="button" data-rich-command="insertUnorderedList" data-editor="${editorId}" class="rounded border bg-white px-2 py-1 text-xs">項目清單</button>
            <button type="button" data-rich-command="insertOrderedList" data-editor="${editorId}" class="rounded border bg-white px-2 py-1 text-xs">編號清單</button>
            <label class="flex items-center gap-1 text-xs">字體<select data-rich-style="fontFamily" data-editor="${editorId}" class="rounded border bg-white px-2 py-1"><option value="">選擇字體</option><option value="sans">無襯線</option><option value="serif">襯線</option><option value="kai">楷體</option><option value="mono">等寬</option></select></label>
            <label class="flex items-center gap-1 text-xs">字重<select data-rich-style="fontWeight" data-editor="${editorId}" class="rounded border bg-white px-2 py-1"><option value="">字重</option><option value="400">標準</option><option value="500">中等</option><option value="600">半粗</option><option value="700">粗體</option></select></label>
            <label class="flex items-center gap-1 text-xs">大小<select data-rich-style="fontSize" data-editor="${editorId}" class="rounded border bg-white px-2 py-1"><option value="">字體大小</option>${[12, 14, 16, 18, 20, 24, 28, 32, 36].map(size => `<option value="${size}px">${size}px</option>`).join('')}</select></label>
            <button type="button" data-rich-link data-editor="${editorId}" class="rounded border bg-white px-2 py-1 text-xs">插入連結</button>
            <button type="button" data-rich-image data-editor="${editorId}" class="rounded border bg-white px-2 py-1 text-xs">插入圖片</button>
            <button type="button" data-rich-table data-editor="${editorId}" class="rounded border bg-white px-2 py-1 text-xs">插入表格</button>
            <label class="flex items-center gap-1 text-xs">水平<select data-rich-cell-style="textAlign" data-editor="${editorId}" class="rounded border bg-white px-2 py-1"><option value="">水平對齊</option><option value="left">靠左</option><option value="center">置中</option><option value="right">靠右</option></select></label>
            <label class="flex items-center gap-1 text-xs">垂直<select data-rich-cell-style="verticalAlign" data-editor="${editorId}" class="rounded border bg-white px-2 py-1"><option value="">垂直對齊</option><option value="top">靠上</option><option value="middle">置中</option><option value="bottom">靠下</option></select></label>
        </div>
        <div id="${editorId}" data-rich-editor contenteditable="true" role="textbox" aria-multiline="true" data-placeholder="${escapeHtml(placeholder)}" class="min-h-36 rounded-b-lg border bg-white p-3 text-sm leading-6 focus:outline-none focus:ring-2 focus:ring-blue-200">${sanitizeHeroRichHtml(value)}</div>
        <p class="text-xs text-gray-500">表格對齊前，先將游標放在儲存格，再設定水平／垂直位置。圖片可由工具列上傳、拖放至編輯器，或貼上截圖；上傳前可裁剪，插入後可拖曳圖片右下角調整寬度。</p>
        <textarea data-content-field="${name}" data-rich-value hidden>${escapeHtml(value)}</textarea>
    </div>`;
}

function saveHeroRichEditorSelection(editor) {
    const selection = window.getSelection();
    if (!editor || !selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    if (editor.contains(range.startContainer) && editor.contains(range.endContainer)) {
        heroRichEditorSelections.set(editor.id, range.cloneRange());
    }
}

function restoreHeroRichEditorSelection(editor) {
    const range = heroRichEditorSelections.get(editor.id);
    if (!range || !editor.contains(range.startContainer) || !editor.contains(range.endContainer)) return false;
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    return true;
}

function openHeroRichInsertDialog(editor, type) {
    if (!editor) return;
    saveHeroRichEditorSelection(editor);
    if (!restoreHeroRichEditorSelection(editor)) {
        alert('請先在圖文編輯器中點選插入位置。');
        return;
    }
    const dialog = document.getElementById('hero-rich-insert-dialog');
    const isImage = type === 'image';
    const isTable = type === 'table';
    dialog.dataset.insertType = type;
    dialog.dataset.editorId = editor.id;
    document.getElementById('hero-rich-insert-title').textContent = isTable ? '插入表格' : isImage ? '插入圖片' : '插入連結';
    document.getElementById('hero-rich-insert-url-row').classList.toggle('hidden', isTable);
    document.getElementById('hero-rich-insert-url').required = !isTable && !isImage;
    document.getElementById('hero-rich-insert-text-row').classList.toggle('hidden', isImage || isTable);
    document.getElementById('hero-rich-insert-alt-row').classList.toggle('hidden', !isImage);
    document.getElementById('hero-rich-insert-file-row').classList.toggle('hidden', !isImage);
    document.getElementById('hero-rich-insert-table-row').classList.toggle('hidden', !isTable);
    document.getElementById('hero-rich-insert-url').value = '';
    document.getElementById('hero-rich-insert-text').value = '';
    document.getElementById('hero-rich-insert-alt').value = '';
    document.getElementById('hero-rich-insert-file').value = '';
    document.getElementById('hero-rich-insert-rows').value = '3';
    document.getElementById('hero-rich-insert-columns').value = '3';
    dialog.showModal();
    document.getElementById(isTable ? 'hero-rich-insert-rows' : 'hero-rich-insert-url').focus();
}

function insertHeroRichContent(editor, type, url, text, alt) {
    editor.focus();
    if (!restoreHeroRichEditorSelection(editor)) {
        alert('找不到編輯位置，請重新選取插入位置後再試。');
        return false;
    }
    const selection = window.getSelection();
    const range = selection.getRangeAt(0);
    let inserted;
    if (type === 'image') {
        inserted = document.createElement('img');
        inserted.src = url;
        inserted.alt = alt;
        inserted.loading = 'lazy';
        inserted.className = 'rich-editor-image';
        range.deleteContents();
        range.insertNode(inserted);
    } else {
        inserted = document.createElement('a');
        inserted.href = url;
        inserted.rel = 'noopener noreferrer';
        const selectedContent = range.extractContents();
        if (selectedContent.textContent.trim()) inserted.append(selectedContent);
        else inserted.textContent = text || url;
        range.insertNode(inserted);
    }
    const nextRange = document.createRange();
    if (type === 'image') nextRange.setStartAfter(inserted);
    else nextRange.selectNodeContents(inserted);
    nextRange.collapse(type === 'image');
    selection.removeAllRanges();
    selection.addRange(nextRange);
    saveHeroRichEditorSelection(editor);
    editor.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
}

async function uploadHeroRichImage(file) {
    const allowedTypes = {
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/webp': 'webp'
    };
    if (!allowedTypes[file.type]) throw new Error('圖片只接受 JPG、PNG 或 WebP 格式。');
    if (file.size > 10 * 1024 * 1024) throw new Error('圖片大小不可超過 10 MB。');
    if (file.size === 0) throw new Error('圖片檔案是空的，請重新選擇。');
    const bucket = supabaseClient.storage.from('homepage-content');
    const path = `${createHomepageUploadId()}/hero-image.${allowedTypes[file.type]}`;
    const { error } = await bucket.upload(path, file, {
        cacheControl: '3600',
        contentType: file.type,
        upsert: false
    });
    if (error) throw new Error(`圖片上傳失敗：${error.message}`);
    return { bucket, path, url: bucket.getPublicUrl(path).data.publicUrl };
}

function insertHeroRichTable(editor, rowCount, columnCount) {
    editor.focus();
    if (!restoreHeroRichEditorSelection(editor)) {
        alert('找不到編輯位置，請重新選取插入位置後再試。');
        return false;
    }
    const selection = window.getSelection();
    const range = selection.getRangeAt(0);
    const table = document.createElement('table');
    table.className = 'rich-table';
    const body = document.createElement('tbody');
    for (let rowIndex = 0; rowIndex < rowCount; rowIndex++) {
        const row = document.createElement('tr');
        for (let columnIndex = 0; columnIndex < columnCount; columnIndex++) {
            const cell = document.createElement(rowIndex === 0 ? 'th' : 'td');
            cell.className = 'rich-table-cell';
            cell.append(document.createElement('br'));
            row.append(cell);
        }
        body.append(row);
    }
    table.append(body);
    range.deleteContents();
    range.insertNode(table);
    const firstCell = table.querySelector('th, td');
    const nextRange = document.createRange();
    nextRange.selectNodeContents(firstCell);
    nextRange.collapse(true);
    selection.removeAllRanges();
    selection.addRange(nextRange);
    saveHeroRichEditorSelection(editor);
    editor.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
}

function applyHeroRichCellAlignment(editor, property, value) {
    const allowedValues = property === 'textAlign' ? ['left', 'center', 'right'] : ['top', 'middle', 'bottom'];
    if (!allowedValues.includes(value)) return;
    editor.focus();
    if (!restoreHeroRichEditorSelection(editor)) {
        alert('請先將游標放在要調整的表格儲存格內。');
        return;
    }
    const selection = window.getSelection();
    const anchor = selection?.anchorNode;
    const element = anchor?.nodeType === Node.ELEMENT_NODE ? anchor : anchor?.parentElement;
    const cell = element?.closest('th, td');
    if (!cell || !editor.contains(cell)) {
        alert('請先將游標放在要調整的表格儲存格內。');
        return;
    }
    cell.style[property] = value;
    editor.dispatchEvent(new Event('input', { bubbles: true }));
}

function applyHeroRichStyle(editor, property, value) {
    const styleValues = {
        fontFamily: heroRichFontFamilies,
        fontWeight: { 400: '400', 500: '500', 600: '600', 700: '700' },
        fontSize: Object.fromEntries([12, 14, 16, 18, 20, 24, 28, 32, 36].map(size => [`${size}px`, `${size}px`]))
    };
    const styleValue = styleValues[property]?.[value];
    if (!styleValue) return;
    editor.focus();
    restoreHeroRichEditorSelection(editor);
    const selection = window.getSelection();
    if (!selection?.rangeCount || !editor.contains(selection.anchorNode)) {
        alert('請先在編輯器選取要套用格式的文字。');
        return;
    }
    const range = selection.getRangeAt(0);
    if (range.collapsed) {
        alert('請先選取文字，再套用字體、字重或大小。');
        return;
    }
    const span = document.createElement('span');
    span.style[property] = styleValue;
    span.append(range.extractContents());
    range.insertNode(span);
    const nextRange = document.createRange();
    nextRange.selectNodeContents(span);
    selection.removeAllRanges();
    selection.addRange(nextRange);
    heroRichEditorSelections.set(editor.id, nextRange.cloneRange());
    editor.dispatchEvent(new Event('input', { bubbles: true }));
}

function sanitizeHeroRichHtml(value) {
    const template = document.createElement('template');
    template.innerHTML = String(value || '');
    const allowedTags = new Set(['P', 'BR', 'H2', 'H3', 'UL', 'OL', 'LI', 'STRONG', 'B', 'EM', 'I', 'U', 'BLOCKQUOTE', 'A', 'IMG', 'SPAN', 'TABLE', 'THEAD', 'TBODY', 'TFOOT', 'TR', 'TH', 'TD']);
    const cleanNode = node => {
        if (node.nodeType === Node.TEXT_NODE) return document.createTextNode(node.textContent || '');
        if (node.nodeType !== Node.ELEMENT_NODE) return document.createDocumentFragment();
        if (!allowedTags.has(node.tagName)) {
            const fragment = document.createDocumentFragment();
            Array.from(node.childNodes).forEach(child => fragment.append(cleanNode(child)));
            return fragment;
        }
        const element = document.createElement(node.tagName.toLowerCase());
        if (node.tagName === 'TABLE') element.className = 'rich-table';
        if (node.tagName === 'TH' || node.tagName === 'TD') element.className = 'rich-table-cell';
        if (node.tagName === 'TH' || node.tagName === 'TD') {
            if (['left', 'center', 'right'].includes(node.style.textAlign)) element.style.textAlign = node.style.textAlign;
            if (['top', 'middle', 'bottom'].includes(node.style.verticalAlign)) element.style.verticalAlign = node.style.verticalAlign;
        }
        if (node.tagName === 'A') {
            const href = safeImageUrl(node.getAttribute('href') || '');
            if (!href) {
                const fragment = document.createDocumentFragment();
                Array.from(node.childNodes).forEach(child => fragment.append(cleanNode(child)));
                return fragment;
            }
            element.href = href;
            element.rel = 'noopener noreferrer';
        } else if (node.tagName === 'IMG') {
            const src = safeImageUrl(node.getAttribute('src') || '');
            if (!src) return document.createDocumentFragment();
            element.src = src;
            element.alt = (node.getAttribute('alt') || '').slice(0, 200);
            element.loading = 'lazy';
            element.className = 'my-3 max-h-[32rem] max-w-full rounded-lg object-contain rich-editor-image';
            const imageWidth = node.style.width;
            if (/^(?:\d{1,4}(?:\.\d+)?px|(?:100|[1-9]?\d)%)$/.test(imageWidth)) element.style.width = imageWidth;
        } else if (node.tagName === 'SPAN') {
            const fontFamily = node.style.fontFamily;
            const fontWeight = node.style.fontWeight;
            const fontSize = node.style.fontSize;
            if (Object.values(heroRichFontFamilies).includes(fontFamily)) element.style.fontFamily = fontFamily;
            if (['400', '500', '600', '700'].includes(fontWeight)) element.style.fontWeight = fontWeight;
            if (/^(12|14|16|18|20|24|28|32|36)px$/.test(fontSize)) element.style.fontSize = fontSize;
        }
        if (node.tagName !== 'IMG') Array.from(node.childNodes).forEach(child => element.append(cleanNode(child)));
        return element;
    };
    const output = document.createDocumentFragment();
    Array.from(template.content.childNodes).forEach(child => output.append(cleanNode(child)));
    return Array.from(output.childNodes).map(node => {
        const wrapper = document.createElement('div');
        wrapper.append(node.cloneNode(true));
        return wrapper.innerHTML;
    }).join('');
}

function renderHeroImageField(item, name, label, help, crop = null, removable = false) {
    const url = safeImageUrl(item[name] || '');
    const variant = name === 'mobileImageUrl' ? 'mobile' : name === 'frameUrl' ? 'frame' : name === 'mobileFrameUrl' ? 'mobile-frame' : '';
    const cropAttributes = crop
        ? `data-hero-image data-crop-ratio="${crop.ratio}" data-crop-width="${crop.width}" data-crop-height="${crop.height}"`
        : '';
    return `<div data-hero-image-field><label class="block text-sm font-medium text-gray-700">${label}<input data-content-field="${name}" type="url" value="${escapeHtml(item[name] || '')}" class="mt-1 w-full border rounded-lg px-3 py-2 font-normal" placeholder="https://..."></label><label class="block mt-2 text-xs font-medium text-gray-600">上傳圖片<input type="file" data-content-image data-image-field="${name}" data-image-variant="${variant}" ${cropAttributes} accept="image/jpeg,image/png,image/webp" class="mt-1 block w-full text-xs"></label>${removable ? '<button type="button" data-remove-hero-image class="mt-2 rounded border border-red-200 px-2 py-1 text-xs text-red-700 hover:bg-red-50">刪除圖片</button>' : ''}<p class="mt-1 text-xs text-gray-500">${help}</p><img data-content-preview="${name}" src="${escapeHtml(url)}" alt="${escapeHtml(label)}預覽" class="${url ? '' : 'hidden'} mt-2 max-h-32 rounded border object-contain"></div>`;
}

function renderHeroTeamMember(member = {}, index = 0) {
    const imageUrl = safeImageUrl(member.imageUrl || '');
    const imageField = `teamMemberImage-${index}`;
    const memberType = ['嘉賓', '導師', '品牌團隊'].includes(member.memberType) ? member.memberType : '嘉賓';
    return `<article data-team-member class="rounded-lg border bg-white p-3 space-y-3">
        <div class="flex items-center justify-between gap-2"><h4 data-team-member-title class="text-sm font-semibold text-gray-800">${memberType} ${index + 1}</h4><button type="button" data-remove-team-member class="rounded border border-red-200 px-2 py-1 text-xs text-red-700 hover:bg-red-50">移除</button></div>
        <div class="grid gap-3 sm:grid-cols-2">
            <label class="text-xs font-medium text-gray-700">介紹類別<select data-team-member-field="memberType" class="mt-1 w-full border rounded px-3 py-2 text-sm font-normal">${['嘉賓', '導師', '品牌團隊'].map(type => `<option value="${type}" ${memberType === type ? 'selected' : ''}>${type}</option>`).join('')}</select></label>
            <label class="text-xs font-medium text-gray-700">姓名<input data-team-member-field="name" value="${escapeHtml(member.name || '')}" maxlength="100" class="mt-1 w-full border rounded px-3 py-2 text-sm font-normal"></label>
            <label class="text-xs font-medium text-gray-700">職稱<input data-team-member-field="role" value="${escapeHtml(member.role || '')}" maxlength="100" class="mt-1 w-full border rounded px-3 py-2 text-sm font-normal"></label>
        </div>
        <label class="block text-xs font-medium text-gray-700">簡介<textarea data-team-member-field="bio" rows="2" maxlength="500" class="mt-1 w-full border rounded px-3 py-2 text-sm font-normal">${escapeHtml(member.bio || '')}</textarea></label>
        <label class="block text-xs font-medium text-gray-700">圖片網址（選填）<input data-team-member-image-url type="url" value="${escapeHtml(imageUrl)}" placeholder="https://..." class="mt-1 w-full border rounded px-3 py-2 text-sm font-normal"></label>
        <label class="block text-xs font-medium text-gray-700">上傳嘉賓圖片<input type="file" data-content-image data-image-field="${imageField}" data-team-image-index="${index}" accept="image/jpeg,image/png,image/webp" class="mt-1 block w-full"></label>
        <button type="button" data-remove-hero-image class="rounded border border-red-200 px-2 py-1 text-xs text-red-700 hover:bg-red-50">刪除圖片</button>
        <img data-content-preview="${imageField}" src="${escapeHtml(imageUrl)}" alt="嘉賓 ${index + 1} 圖片預覽" class="${imageUrl ? '' : 'hidden'} h-20 w-20 rounded-full border object-cover">
    </article>`;
}

function syncHeroTeamMembers(row) {
    const members = Array.from(row.querySelectorAll('[data-team-member]')).map(memberCard => ({
        memberType: memberCard.querySelector('[data-team-member-field="memberType"]').value,
        name: memberCard.querySelector('[data-team-member-field="name"]').value.trim(),
        role: memberCard.querySelector('[data-team-member-field="role"]').value.trim(),
        bio: memberCard.querySelector('[data-team-member-field="bio"]').value.trim(),
        imageUrl: memberCard.querySelector('[data-team-member-image-url]').value.trim()
    }));
    row.querySelector('[data-content-field="teamJson"]').value = JSON.stringify(members);
    row.querySelector('[data-team-member-count]').textContent = `${members.length}/8 位`;
    row.querySelector('[data-add-team-member]').disabled = members.length >= 8;
    row.querySelector('[data-add-team-member]').classList.toggle('opacity-50', members.length >= 8);
}

function updateHeroTeamMemberIndexes(row) {
    row.querySelectorAll('[data-team-member]').forEach((memberCard, index) => {
        const memberName = memberCard.querySelector('[data-team-member-field="name"]').value.trim();
        const memberType = memberCard.querySelector('[data-team-member-field="memberType"]').value;
        memberCard.querySelector('[data-team-member-title]').textContent = memberName || `${memberType} ${index + 1}`;
        const fileInput = memberCard.querySelector('[data-content-image]');
        const imageField = `teamMemberImage-${index}`;
        fileInput.dataset.imageField = imageField;
        fileInput.dataset.teamImageIndex = String(index);
        const preview = memberCard.querySelector('[data-content-preview]');
        preview.dataset.contentPreview = imageField;
        preview.alt = `${memberCard.querySelector('[data-team-member-field="name"]').value.trim() || `嘉賓 ${index + 1}`}圖片預覽`;
    });
    syncHeroTeamMembers(row);
}

function renderHomeHeroEditors() {
    const editor = document.getElementById('home-hero-editor');
    editor.innerHTML = homeHeroItems.length ? homeHeroItems.map((item, index) => {
        const pageId = item.pageId || `hero-${item.order ?? index + 1}`;
        const template = item.template === 'custom' ? 'custom' : 'basic';
        const details = item.details && typeof item.details === 'object' ? item.details : {};
        const highlights = details.highlights || {
            ticket: item.highlightTicket || '',
            audience: item.highlightAudience || '',
            award: item.highlightAward || '',
            venue: item.highlightVenue || ''
        };
        const tabs = details.tabs || {
            highlights: item.tabHighlights || '',
            schedule: item.tabSchedule || '',
            faq: item.tabFaq || ''
        };
        const highlightImageUrls = Array.isArray(tabs.highlightsImageUrls)
            ? tabs.highlightsImageUrls.slice(0, 5)
            : [
                tabs.highlightsImageUrl || item.tabHighlightsImageUrl1 || item.tabHighlightsImageUrl || '',
                item.tabHighlightsImageUrl2 || '',
                item.tabHighlightsImageUrl3 || '',
                item.tabHighlightsImageUrl4 || '',
                item.tabHighlightsImageUrl5 || ''
            ];
        while (highlightImageUrls.length < 5) highlightImageUrls.push('');
        let members = Array.isArray(details.members) ? details.members : [];
        if (!Array.isArray(details.members) && item.teamJson) {
            try { members = JSON.parse(item.teamJson); } catch { members = []; }
        }
        const memberJson = JSON.stringify(members);
        const videoUrl = item.heroMediaUrl || '';
        return `<article data-content-row data-home-hero-card="${index}" class="rounded-xl border bg-white p-4 shadow-sm space-y-3">
            <input data-content-field="pageId" type="hidden" value="${escapeHtml(pageId)}">
            <div class="flex flex-wrap items-center justify-between gap-2">
                <h3 class="font-semibold text-gray-800">置頂內容 ${index + 1}</h3>
                <div class="flex flex-wrap gap-2"><button type="button" data-save-hero="${index}" class="rounded bg-green-700 px-3 py-1.5 text-sm text-white hover:bg-green-800">儲存此內容</button><button type="button" data-remove-hero="${index}" class="rounded border border-red-200 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50">移除此內容</button></div>
            </div>
            <div class="grid gap-3 md:grid-cols-2">
                ${renderHeroTextField('order', '顯示次序', item.order ?? index + 1, 'number', 'min="1" step="1" required')}
                ${renderHeroTextField('title', '卡片標題', item.title || '')}
                ${renderHeroTextField('description', '卡片簡介', item.description || '')}
                ${renderHeroImageField(item, 'imageUrl', '拍立得圖片', '建議 1200 × 400 px（3:1），可上傳後裁剪，JPG／PNG／WebP，最多 10 MB。', { ratio: 3, width: 1200, height: 400 })}
                ${renderHeroImageField(item, 'mobileImageUrl', '手機版圖片（選填）', '建議 960 × 480 px（2:1），可上傳後裁剪，未設定時使用拍立得圖片。', { ratio: 2, width: 960, height: 480 })}
                ${renderHeroImageField(item, 'frameUrl', '自訂拍立得邊框（選填）', '以 440 × 215 px 邊框為基準：置頂圖片 425 × 140 px，四周留框（上方留 5 px、左右各 7.5 px）；下方白色圓角文字框寬 405 px。不同尺寸會按比例縮放。')}
                ${renderHeroImageField(item, 'mobileFrameUrl', '手機版邊框（選填）', '手機版邊框沿用相同圖片尺寸與留框比例；未設定時沿用桌面版邊框。')}
            </div>
            <details class="rounded-lg border bg-gray-50 p-3">
                <summary class="cursor-pointer font-semibold text-sm text-gray-800">編輯詳細內容頁</summary>
                <div class="mt-4 space-y-4">
                    <label class="block text-sm font-medium text-gray-700">詳情頁版本<select data-content-field="template" class="mt-1 w-full border rounded-lg px-3 py-2 font-normal"><option value="basic" ${template === 'basic' ? 'selected' : ''}>基本版（一般排版）</option><option value="custom" ${template === 'custom' ? 'selected' : ''}>自訂版（可使用 AI 設計）</option></select></label>
                    <div data-hero-custom-options class="${template === 'custom' ? '' : 'hidden'} space-y-3 rounded-lg border border-violet-200 bg-white p-3">
                        <input type="hidden" data-content-field="smartLayoutJson" value="${escapeHtml(item.smartLayout ? JSON.stringify(item.smartLayout) : '')}">
                        <div class="grid gap-3 md:grid-cols-2">
                            <label class="block text-sm font-medium text-gray-700">自訂版風格<select data-content-field="customTheme" class="mt-1 w-full border rounded-lg px-3 py-2 font-normal">${[['light', '清新明亮'], ['warm', '溫暖活力'], ['dark', '沉浸深色'], ['blue', '清爽藍色'], ['green', '自然綠色']].map(([value, label]) => `<option value="${value}" ${(item.customTheme || 'light') === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
                            <label class="block text-sm font-medium text-gray-700">自訂版排版<select data-content-field="customLayout" class="mt-1 w-full border rounded-lg px-3 py-2 font-normal"><option value="classic" ${item.customLayout !== 'split' ? 'selected' : ''}>上下排列</option><option value="split" ${item.customLayout === 'split' ? 'selected' : ''}>圖片與標題並排（電腦版）</option></select></label>
                            <label class="block text-sm font-medium text-gray-700">自訂版內容順序<select data-content-field="customOrder" class="mt-1 w-full border rounded-lg px-3 py-2 font-normal"><option value="standard" ${!['details-first', 'people-first'].includes(item.customOrder) ? 'selected' : ''}>亮點優先</option><option value="details-first" ${item.customOrder === 'details-first' ? 'selected' : ''}>詳細內容優先</option><option value="people-first" ${item.customOrder === 'people-first' ? 'selected' : ''}>團隊優先</option></select></label>
                        </div>
                        ${renderHeroTextarea('customPrompt', '自訂版設計要求', item.customPrompt || '', '例如：藍色、圖片與標題並排、詳細內容優先。', 3)}
                        <label class="flex items-start gap-2 text-sm text-gray-700"><input type="checkbox" data-hero-ai-rewrite><span>允許 AI 建議改寫標題、副標題、按鈕及亮點文字（預設保留原文）</span></label>
                        <label class="block text-sm font-medium text-gray-700">AI 設計模式<select data-hero-ai-mode class="mt-1 w-full border rounded-lg px-3 py-2 font-normal"><option value="smart">智慧排版（圖片與標題區）</option><option value="classic">原有主題及內容順序設計</option></select></label>
                        <p class="text-xs text-gray-500">智慧排版只調整頂部圖片與標題區，保留文字、詳細分頁及團隊；手機版會自動改為上下排列。不會產生圖片。</p>
                        <button type="button" data-clear-smart-layout class="rounded border px-3 py-1.5 text-sm">移除已套用的智慧排版</button>
                        <div class="flex flex-wrap gap-2"><button type="button" data-hero-ai="${index}" class="rounded border border-violet-300 px-3 py-1.5 text-sm text-violet-800 hover:bg-violet-50">✨ AI 設計助手</button><button type="button" data-show-hero-ai-preview class="hidden rounded border bg-white px-3 py-1.5 text-sm">預覽 AI 設計</button></div>
                        <div data-hero-ai-preview class="hidden rounded-lg border border-violet-200 bg-violet-50 p-3"></div>
                    </div>
                    <fieldset class="space-y-3"><legend class="font-semibold text-gray-800 mb-2">1. 頂部視覺與核心行動區</legend>
                        <div class="rounded-lg border bg-white p-3">
                            <p class="text-sm font-semibold text-gray-800">詳情頁背景圖片</p>
                            ${renderHeroImageField(item, 'pageBackgroundUrl', '背景圖片網址（選填）', '建議使用橫向大圖；圖片會以背景方式顯示在詳情頁。', null, true)}
                            <div class="mt-3 grid gap-3 sm:grid-cols-2">
                                <label class="block text-xs font-medium text-gray-700">背景放大：<output data-hero-range-output="pageBackgroundScale">${Math.min(160, Math.max(100, Number(item.pageBackgroundScale) || 100))}%</output><input data-content-field="pageBackgroundScale" type="range" min="100" max="160" step="5" value="${Math.min(160, Math.max(100, Number(item.pageBackgroundScale) || 100))}" class="mt-2 w-full"></label>
                                <label class="block text-xs font-medium text-gray-700">背景上下位置：<output data-hero-range-output="pageBackgroundPosition">${Math.min(100, Math.max(0, Number(item.pageBackgroundPosition ?? 50)))}%</output><input data-content-field="pageBackgroundPosition" type="range" min="0" max="100" step="5" value="${Math.min(100, Math.max(0, Number(item.pageBackgroundPosition ?? 50)))}" class="mt-2 w-full"></label>
                            </div>
                        </div>
                        <div class="grid gap-3 md:grid-cols-2">
                            <label class="block text-sm font-medium text-gray-700">主視覺類型<select data-content-field="heroMediaType" class="mt-1 w-full border rounded-lg px-3 py-2 font-normal"><option value="image" ${item.heroMediaType === 'youtube' || item.heroMediaType === 'mp4' ? '' : 'selected'}>大圖／微動圖</option><option value="youtube" ${item.heroMediaType === 'youtube' ? 'selected' : ''}>YouTube 影片</option><option value="mp4" ${item.heroMediaType === 'mp4' ? 'selected' : ''}>MP4 影片</option></select></label>
                            ${renderHeroTextField('heroMediaUrl', 'YouTube／MP4 網址（可選填 HTTPS）', videoUrl, 'url')}
                        </div>
                        <label class="block text-sm font-medium text-gray-700">上傳 MP4 影片（最多 50 MB）<input type="file" data-content-media accept="video/mp4" class="mt-1 block w-full text-xs"></label>
                        ${renderHeroTextField('headline', '主標題', item.headline || item.title || '')}
                        ${renderHeroTextField('subtitle', '溫柔吸引人的副標題', item.subtitle || item.description || '')}
                        <div class="grid gap-3 md:grid-cols-2">
                            <label class="flex items-center gap-2 text-sm"><input data-content-field="countdownEnabled" type="checkbox" ${item.countdownEnabled ? 'checked' : ''}>顯示倒數模組</label>
                            ${renderHeroTextField('countdownTarget', '報名截止／活動開始時間', item.countdownTarget || '', 'datetime-local')}
                            ${renderHeroTextField('ctaLabel', '行動按鈕文字', item.ctaLabel || '✍️ 立即線上報名')}
                            ${renderHeroTextField('ctaUrl', '行動按鈕網址', item.ctaUrl || '', 'url')}
                        </div>
                    </fieldset>
                    <fieldset class="space-y-3"><legend class="font-semibold text-gray-800 mb-2">聯絡方式與報名資訊</legend>
                        <div class="grid gap-3 md:grid-cols-2">
                            ${renderHeroTextField('contactEmail', 'Email', item.contactEmail || '', 'email')}
                            ${renderHeroTextField('contactPhone', '電話', item.contactPhone || '', 'tel')}
                            ${renderHeroTextField('facebookUrl', 'Facebook 專頁', item.facebookUrl || '', 'url')}
                            ${renderHeroTextField('instagramUrl', 'Instagram 專頁', item.instagramUrl || '', 'url')}
                        </div>
                        ${renderHeroTextarea('registrationMethod', '報名方式', item.registrationMethod || '', '例如：填寫線上表格報名；名額有限，額滿即止。', 3)}
                    </fieldset>
                    <fieldset class="space-y-3"><legend class="font-semibold text-gray-800 mb-2">2. 核心亮點與快訊卡片</legend>
                        <div class="grid gap-3 md:grid-cols-2">
                            ${renderHeroTextField('highlightTicket', '💰 價錢', highlights.ticket || '')}
                            ${renderHeroTextField('highlightAudience', '👥 適合對象', highlights.audience || '')}
                            ${renderHeroTextField('highlightVenue', '📍 活動地點／交通', highlights.venue || '')}
                        </div>
                    </fieldset>
                    <fieldset class="space-y-3"><legend class="font-semibold text-gray-800 mb-2">3. 深度內容與分頁</legend>
                        ${renderHeroRichEditor('tabHighlights', '標籤 A｜活動／品牌亮點', tabs.highlights || '', '輸入文字，使用工具列設定格式或插入圖片。')}
                        <div><p class="text-sm font-medium text-gray-700 mb-2">標籤 A｜現場／產品相片（最多 5 張）</p><div class="grid gap-3 sm:grid-cols-2">${highlightImageUrls.map((url, imageIndex) => renderHeroImageField({ [`tabHighlightsImageUrl${imageIndex + 1}`]: url }, `tabHighlightsImageUrl${imageIndex + 1}`, `相片 ${imageIndex + 1}`, '建議 1200 × 800 px；每張可上傳 JPG／PNG／WebP，最多 10 MB。', { ratio: 3 / 2, width: 1200, height: 800 }, true)).join('')}</div></div>
                        ${renderHeroRichEditor('tabSchedule', '標籤 B｜詳細內容', tabs.schedule || '', '輸入活動詳細內容，可設定標題、清單或插入圖片。')}
                        ${renderHeroRichEditor('tabFaq', '標籤 C｜常見問題 FAQ', tabs.faq || '', '輸入問題與答案，可使用標題、清單、連結或圖片。')}
                    </fieldset>
                    <fieldset class="space-y-3"><legend class="font-semibold text-gray-800 mb-2">4. 嘉賓／導師／品牌團隊</legend>
                        <div class="flex flex-wrap items-center justify-between gap-2"><p class="text-sm font-medium text-gray-700">嘉賓／導師／品牌團隊</p><span data-team-member-count class="text-xs text-gray-500">${members.length}/8 位</span></div>
                        <div data-team-members class="space-y-3">${members.map((member, memberIndex) => renderHeroTeamMember(member, memberIndex)).join('')}</div>
                        <button type="button" data-add-team-member class="rounded border border-blue-300 px-3 py-2 text-sm font-medium text-blue-800 hover:bg-blue-50">＋ 新增嘉賓／團隊成員</button>
                        <p class="text-xs text-gray-500">每位成員可直接填寫姓名、職稱、簡介並上傳圖片；圖片限 JPG／PNG／WebP，每張不超過 10 MB。</p>
                        <textarea data-content-field="teamJson" class="hidden">${escapeHtml(memberJson)}</textarea>
                    </fieldset>
                </div>
            </details>
        </article>`;
    }).join('') : '<p class="text-sm text-gray-500">尚未新增置頂內容，請先新增，再於詳細內容頁選擇版本。</p>';
}

function snapshotHeroEditor(row) {
    return JSON.stringify(Array.from(row.querySelectorAll('input, select, textarea, [data-rich-editor]')).filter(input => !input.closest('[data-hero-ai-preview]')).map(input => {
        if (input.matches('[data-rich-editor]')) return input.innerHTML;
        if (input.type === 'file') return Array.from(input.files).map(file => [file.name, file.size, file.lastModified]);
        return input.type === 'checkbox' ? input.checked : input.value;
    }));
}

function heroPreviewItem(row, design, allowRewrite) {
    const item = Object.fromEntries(Array.from(row.querySelectorAll('[data-content-field]')).map(input => [
        input.dataset.contentField, input.type === 'checkbox' ? input.checked : input.value
    ]));
    const members = JSON.parse(item.teamJson || '[]');
    const value = (name, suggestion) => allowRewrite && typeof suggestion === 'string' && suggestion.trim() ? suggestion : item[name];
    let smartLayout = null;
    if (Object.hasOwn(design, 'smartLayout')) smartLayout = design.smartLayout;
    else if (item.smartLayoutJson) {
        try { smartLayout = JSON.parse(item.smartLayoutJson); } catch { console.error('Invalid saved smart layout JSON'); }
    }
    return {
        ...item, template: 'custom',
        smartLayout,
        customTheme: design.customTheme, customLayout: design.customLayout, customOrder: design.customOrder,
        headline: value('headline', design.headline), subtitle: value('subtitle', design.subtitle),
        ctaLabel: value('ctaLabel', design.ctaLabel),
        details: {
            highlights: {
                ticket: value('highlightTicket', design.highlights.ticket),
                audience: value('highlightAudience', design.highlights.audience),
                venue: value('highlightVenue', design.highlights.venue)
            },
            tabs: {
                highlights: item.tabHighlights, schedule: item.tabSchedule, faq: item.tabFaq,
                highlightsImageUrls: Array.from({ length: 5 }, (_, i) => item[`tabHighlightsImageUrl${i + 1}`]).filter(Boolean)
            },
            members
        }
    };
}

const heroAiDrafts = new WeakMap();

async function getHeroImageFeatures(row) {
    const input = row.querySelector('[data-content-image][data-image-field="imageUrl"]');
    const file = input.files[0];
    const url = file ? URL.createObjectURL(file) : safeImageUrl(row.querySelector('[data-content-field="imageUrl"]').value.trim());
    if (!url) return { colors: [], ratio: '', unavailable: true };
    try {
        const image = new Image();
        if (!file) image.crossOrigin = 'anonymous';
        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('image timeout')), 8000);
            image.onload = () => { clearTimeout(timeout); resolve(); };
            image.onerror = () => { clearTimeout(timeout); reject(new Error('image load failed')); };
            image.src = url;
        });
        const ratio = `${image.naturalWidth}:${image.naturalHeight}`;
        const canvas = document.createElement('canvas');
        canvas.width = 16;
        canvas.height = 16;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('canvas unavailable');
        context.drawImage(image, 0, 0, 16, 16);
        const pixels = context.getImageData(0, 0, 16, 16).data;
        const counts = new Map();
        for (let i = 0; i < pixels.length; i += 4) {
            if (pixels[i + 3] < 128) continue;
            const color = `#${[pixels[i], pixels[i + 1], pixels[i + 2]].map(value => Math.min(255, Math.round(value / 32) * 32).toString(16).padStart(2, '0')).join('')}`;
            counts.set(color, (counts.get(color) || 0) + 1);
        }
        return { colors: [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(entry => entry[0]), ratio, unavailable: false };
    } catch (error) {
        console.warn('Could not inspect featured image:', error);
        return { colors: [], ratio: '', unavailable: true };
    } finally {
        if (file) URL.revokeObjectURL(url);
    }
}

async function requestHeroAiDesign(index, mode = 'new') {
    const row = document.querySelector(`#home-hero-editor [data-home-hero-card="${index}"]`);
    if (!row) return;
    if (row.querySelector('[data-content-field="template"]').value !== 'custom') return;
    const previous = heroAiDrafts.get(row);
    if (mode === 'refine' && (!previous || previous.snapshot !== snapshotHeroEditor(row))) {
        alert('編輯器內容已變動，請先重新生成設計，避免覆蓋修改。');
        return;
    }
    const prompt = mode === 'refine'
        ? row.querySelector('[data-hero-ai-revision]').value.trim()
        : row.querySelector('[data-content-field="customPrompt"]').value.trim();
    if (mode === 'refine' && !prompt) {
        alert('請輸入想在目前設計上修改的要求。');
        return;
    }
    const title = row.querySelector('[data-content-field="title"]').value.trim();
    const description = row.querySelector('[data-content-field="description"]').value.trim();
    const allowRewrite = row.querySelector('[data-hero-ai-rewrite]').checked;
    const smart = row.querySelector('[data-hero-ai-mode]').value === 'smart';
    const snapshot = snapshotHeroEditor(row);
    const current = Object.fromEntries(['headline', 'subtitle', 'ctaLabel', 'highlightTicket', 'highlightAudience', 'highlightVenue', 'customTheme', 'customLayout', 'customOrder'].map(name =>
        [name, row.querySelector(`[data-content-field="${name}"]`).value.trim()]
    ));
    const button = row.querySelector('[data-hero-ai]');
    if (button.disabled) return;
    if (mode === 'refine') {
        if (smart !== previous.smart) {
            alert('設計模式已變更，請先重新生成預覽。');
            return;
        }
        Object.assign(current, {
            headline: previous.item.headline, subtitle: previous.item.subtitle, ctaLabel: previous.item.ctaLabel,
            highlightTicket: previous.item.details.highlights.ticket,
            highlightAudience: previous.item.details.highlights.audience,
            highlightVenue: previous.item.details.highlights.venue,
            customTheme: previous.item.customTheme, customLayout: previous.item.customLayout, customOrder: previous.item.customOrder
        });
    }
    button.disabled = true;
    button.textContent = 'AI 設計中…';
    row.querySelectorAll('[data-hero-ai-action]').forEach(control => { control.disabled = true; });
    try {
        const features = smart ? await getHeroImageFeatures(row) : null;
        const { data, error } = await supabaseClient.functions.invoke('hero-design-assistant', {
            body: { title, description, prompt, current, allowRewrite, mode,
                ...(smart ? { action: 'smart-layout', imageColors: features.colors, imageRatio: features.ratio,
                    previousLayout: mode === 'refine' ? previous.item.smartLayout : null } : {}) }
        });
        if (error) {
            const responseMessage = await error.context?.text?.().catch(() => '');
            throw new Error(responseMessage || error.message || 'AI 設計服務無法使用');
        }
        if (smart && (!window.isSmartLayout(data?.layout) || typeof data.usedFallback !== 'boolean')) {
            throw new Error('智慧排版回傳格式無效，請確認已部署最新設計服務後重試。');
        }
        if (!smart && !data?.design) throw new Error(data?.error || 'AI 沒有回傳可用設計');
        const design = smart ? {
            smartLayout: data.layout, customTheme: current.customTheme, customLayout: current.customLayout,
            customOrder: current.customOrder, headline: '', subtitle: '', ctaLabel: '',
            highlights: { ticket: '', audience: '', venue: '' },
            explanation: `${data.usedFallback ? 'AI 未能產生有效排版，以下為預設標準排版。' : '智慧排版已產生，可預覽後再決定是否套用。'}${features.unavailable ? ' 未能讀取圖片顏色或比例，本次未使用圖片特徵。' : ''}`
        } : { ...data.design, smartLayout: null };
        if (!['light', 'warm', 'dark', 'blue', 'green'].includes(design.customTheme) ||
            !['classic', 'split'].includes(design.customLayout) ||
            !['standard', 'details-first', 'people-first'].includes(design.customOrder) ||
            !design.highlights || ['headline', 'subtitle', 'ctaLabel'].some(name => typeof design[name] !== 'string') ||
            ['ticket', 'audience', 'venue'].some(name => typeof design.highlights[name] !== 'string')) {
            throw new Error('AI 回傳的設計格式無效，請確認已部署最新設計服務後重試。');
        }
        if (!row.isConnected) return;
        if (snapshotHeroEditor(row) !== snapshot) throw new Error('設計期間內容已修改，請重新產生預覽。');
        const item = heroPreviewItem(row, design, smart ? false : allowRewrite);
        if (mode === 'refine' && allowRewrite && !smart) {
            for (const name of ['headline', 'subtitle', 'ctaLabel']) {
                if (!design[name].trim()) item[name] = previous.item[name];
            }
            for (const name of ['ticket', 'audience', 'venue']) {
                if (!design.highlights[name].trim()) item.details.highlights[name] = previous.item.details.highlights[name];
            }
        }
        heroAiDrafts.set(row, { item, design, snapshot, allowRewrite, smart });
        const preview = row.querySelector('[data-hero-ai-preview]');
        const hasPendingFiles = Array.from(row.querySelectorAll('[data-content-image], [data-content-media]')).some(input => input.files.length);
        preview.innerHTML = `<h4 class="font-semibold text-violet-900">AI 設計預覽</h4>
            <p class="mt-1 text-sm text-gray-700">預覽尚未套用或儲存。${!smart && allowRewrite ? '已允許 AI 建議改寫標題、副標題、按鈕及亮點，請核對內容。' : '所有原有文字保持不變。'}詳細分頁和團隊保持不變。</p>
            <p data-hero-ai-explanation class="mt-1 whitespace-pre-line text-sm text-violet-900"></p>
            ${hasPendingFiles ? '<p class="mt-1 text-sm text-amber-800">尚未上傳的圖片或影片不會出現在預覽，儲存後才會顯示。</p>' : ''}
            <div class="mt-3 flex gap-2"><button type="button" data-hero-preview-size="desktop" aria-pressed="true" class="rounded border bg-white px-3 py-1 text-sm">電腦版</button><button type="button" data-hero-preview-size="mobile" aria-pressed="false" class="rounded border bg-white px-3 py-1 text-sm">手機版</button></div>
            <div class="mt-2 overflow-x-auto"><iframe title="AI 置頂詳情頁預覽" class="h-[36rem] max-w-none rounded border bg-white" style="width: 1024px" src="hero-detail.html?embed=1&amp;preview=1"></iframe></div>
            <label class="mt-3 block text-sm font-medium">在這個設計上修改<textarea data-hero-ai-revision rows="2" maxlength="1200" class="mt-1 w-full rounded border p-2 font-normal" placeholder="例如：保留排版，換成綠色"></textarea></label>
            <div class="mt-3 flex flex-wrap gap-2"><button type="button" data-hero-ai-action data-refine-hero-ai class="rounded border border-violet-300 bg-white px-3 py-2 text-sm">按意見修改此設計</button><button type="button" data-hero-ai-action data-regenerate-hero-ai class="rounded border bg-white px-3 py-2 text-sm">重新生成</button><button type="button" data-hero-ai-action data-apply-hero-ai class="rounded bg-violet-700 px-3 py-2 text-sm text-white">確認套用到編輯器</button><button type="button" data-hero-ai-action data-cancel-hero-ai class="rounded border bg-white px-3 py-2 text-sm">關閉預覽</button></div>`;
        preview.classList.remove('hidden');
        row.querySelector('[data-show-hero-ai-preview]').classList.remove('hidden');
        preview.querySelector('[data-hero-ai-explanation]').textContent = typeof design.explanation === 'string' ? design.explanation : '';
        const frame = preview.querySelector('iframe');
        preview.querySelectorAll('[data-hero-preview-size]').forEach(button => button.addEventListener('click', () => {
            frame.style.width = button.dataset.heroPreviewSize === 'desktop' ? '1024px' : '390px';
            preview.querySelectorAll('[data-hero-preview-size]').forEach(option => option.setAttribute('aria-pressed', String(option === button)));
        }));
        frame.addEventListener('load', () => frame.contentWindow.postMessage({ type: 'featured-design-preview', item }, location.protocol === 'file:' ? '*' : location.origin), { once: true });
        preview.querySelector('[data-cancel-hero-ai]').addEventListener('click', () => preview.classList.add('hidden'));
        preview.querySelector('[data-refine-hero-ai]').addEventListener('click', () => requestHeroAiDesign(index, 'refine'));
        preview.querySelector('[data-regenerate-hero-ai]').addEventListener('click', () => requestHeroAiDesign(index, 'new'));
        preview.querySelector('[data-apply-hero-ai]').addEventListener('click', () => {
            if (snapshotHeroEditor(row) !== snapshot) {
                alert('預覽後內容已修改，請重新產生 AI 預覽，避免覆蓋修改。');
                return;
            }
            const fields = {
                template: item.template, customTheme: item.customTheme, customLayout: item.customLayout,
                smartLayoutJson: item.smartLayout ? JSON.stringify(item.smartLayout) : '',
                customOrder: item.customOrder, headline: item.headline, subtitle: item.subtitle, ctaLabel: item.ctaLabel,
                highlightTicket: item.details.highlights.ticket, highlightAudience: item.details.highlights.audience,
                highlightVenue: item.details.highlights.venue
            };
            Object.entries(fields).forEach(([name, value]) => { row.querySelector(`[data-content-field="${name}"]`).value = value; });
            heroAiDrafts.delete(row);
            row.querySelector('[data-show-hero-ai-preview]').classList.add('hidden');
            preview.replaceChildren();
            preview.classList.add('hidden');
            alert('已套用設計草稿；請核對後按「儲存此內容」或「儲存全部置頂內容」。');
        });
    } catch (error) {
        alert(`AI 設計助手無法完成：${error?.message || '請稍後再試。'}`);
    } finally {
        button.disabled = false;
        button.textContent = '✨ AI 設計助手';
        row.querySelectorAll('[data-hero-ai-action]').forEach(control => { control.disabled = false; });
    }
}

function normalizeHomeServiceCategories(value) {
    const savedCategories = Array.isArray(value) ? value : [];
    return defaultHomeServiceCategories.map(category => {
        const saved = savedCategories.find(item => item?.id === category.id);
        const subcategories = Array.isArray(saved?.subcategories) ? saved.subcategories : category.subcategories;
        return {
            ...category,
            name: typeof saved?.name === 'string' && saved.name.trim() ? saved.name.trim() : category.name,
            pinText: typeof saved?.pinText === 'string' ? saved.pinText.trim() : '',
            subcategories: subcategories
                .filter(item => item && typeof item.id === 'string' && typeof item.name === 'string' && item.id.trim() && item.name.trim())
                .map(item => ({ id: item.id.trim(), name: item.name.trim() }))
        };
    });
}

function renderHomeServiceCategoryEditor() {
    const editor = document.getElementById('home-service-category-editor');
    editor.innerHTML = homeServiceCategories.map((category, categoryIndex) => `
        <article data-service-category-editor="${categoryIndex}" class="rounded-lg border bg-white p-4 space-y-3">
            <label class="block text-sm font-semibold text-gray-800">${escapeHtml(category.icon)} 主分類名稱
                <input type="text" data-service-category-name maxlength="60" value="${escapeHtml(category.name)}" class="mt-1 w-full rounded border px-3 py-2 font-normal">
            </label>
            <label class="block text-sm font-medium text-gray-700">主分類置頂短句（選填，顯示於主頁分類名稱下方）
                <input type="text" data-service-category-pin-text value="${escapeHtml(category.pinText || '')}" class="mt-1 w-full rounded border px-3 py-2 font-normal" placeholder="輸入此分類的一行短句">
            </label>
            <div class="space-y-2">
                ${(category.subcategories || []).map((subcategory, subcategoryIndex) => `
                    <div class="flex items-center gap-2">
                        <input type="hidden" data-service-subcategory-id value="${escapeHtml(subcategory.id)}">
                        <input type="text" data-service-subcategory-name maxlength="50" value="${escapeHtml(subcategory.name)}" aria-label="${escapeHtml(category.name)}子分類名稱 ${subcategoryIndex + 1}" class="min-w-0 flex-1 rounded border px-3 py-2 text-sm">
                        <button type="button" data-remove-service-subcategory="${categoryIndex}:${subcategoryIndex}" class="shrink-0 text-sm text-red-700 hover:underline">刪除</button>
                    </div>`).join('')}
            </div>
            <button type="button" data-add-service-subcategory="${categoryIndex}" class="rounded border px-3 py-1.5 text-sm hover:bg-gray-50">＋ 新增子分類</button>
        </article>`).join('');
}

function collectHomeServiceCategories() {
    return homeServiceCategories.map((category, categoryIndex) => {
        const editor = document.querySelector(`[data-service-category-editor="${categoryIndex}"]`);
        const name = editor.querySelector('[data-service-category-name]').value.trim();
        const pinText = editor.querySelector('[data-service-category-pin-text]').value.trim();
        const subcategories = Array.from(editor.querySelectorAll('[data-service-subcategory-name]'), input => {
            const row = input.closest('div');
            return { id: row.querySelector('[data-service-subcategory-id]').value.trim(), name: input.value.trim() };
        });
        return { ...category, name, pinText, subcategories };
    });
}

async function saveHomeServiceCategories() {
    const categories = collectHomeServiceCategories();
    if (categories.some(category => !category.name)) {
        alert('請填寫所有主分類的名稱。');
        return;
    }
    if (categories.some(category => category.subcategories.some(item => !item.name))) {
        alert('請為每個子分類輸入名稱，或刪除空白項目。');
        return;
    }
    const { data: assignedServices, error: assignmentsError } = await supabaseClient
        .from('submissions')
        .select('id, life_service_category, life_service_subcategory')
        .eq('is_life_service', true);
    if (assignmentsError) {
        alert('無法確認已上架服務的分類使用情況：' + assignmentsError.message);
        return;
    }
    const removedAssignment = (assignedServices || []).find(service =>
        !categories.some(category =>
            category.id === service.life_service_category &&
            category.subcategories.some(item => item.id === service.life_service_subcategory)
        )
    );
    if (removedAssignment) {
        alert('有已上架服務仍使用即將刪除的分類。請先在審核編輯中重新分類該服務，再儲存分類設定。');
        return;
    }
    const { error } = await supabaseClient.from('site_settings').upsert({
        key: 'home_service_categories',
        value: JSON.stringify(categories),
        updated_at: new Date().toISOString()
    }, { onConflict: 'key' });
    if (error) {
        alert('生活服務分類儲存失敗：' + error.message);
        return;
    }
    homeServiceCategories = categories;
    renderHomeServiceCategoryEditor();
    updateLifeServiceAdminOptions();
    alert('生活服務分類已儲存。');
}

function updateLifeServiceAdminOptions(selectedCategoryId, selectedSubcategoryId) {
    const categorySelect = document.getElementById('edit-life-service-category');
    const subcategorySelect = document.getElementById('edit-life-service-subcategory');
    const currentCategoryId = selectedCategoryId || categorySelect.value;
    categorySelect.innerHTML = homeServiceCategories.map(category =>
        `<option value="${escapeHtml(category.id)}">${escapeHtml(category.name)}</option>`
    ).join('');
    const category = homeServiceCategories.find(item => item.id === currentCategoryId) || homeServiceCategories[0];
    if (!category) {
        subcategorySelect.innerHTML = '<option value="">請先新增子分類</option>';
        return;
    }
    categorySelect.value = category.id;
    subcategorySelect.innerHTML = (category.subcategories || []).map(subcategory =>
        `<option value="${escapeHtml(subcategory.id)}">${escapeHtml(subcategory.name)}</option>`
    ).join('') || '<option value="">請先在生活服務設定新增子分類</option>';
    if (selectedSubcategoryId && category.subcategories.some(item => item.id === selectedSubcategoryId)) {
        subcategorySelect.value = selectedSubcategoryId;
    }
}

function updateLifeServiceAdminVisibility() {
    document.getElementById('edit-life-service-fields').classList.toggle(
        'hidden',
        !document.getElementById('edit-is-life-service').checked
    );
}

function updateHomeQuoteStylePreview() {
    const preview = document.getElementById('home-quote-style-preview');
    preview.style.color = document.getElementById('home-quote-color').value;
    preview.style.fontWeight = document.getElementById('home-quote-weight').value;
    preview.style.fontFamily = homeQuoteFontStacks[document.getElementById('home-quote-font').value] || homeQuoteFontStacks.sans;
}

async function saveHomeQuoteStyle() {
    const updatedAt = new Date().toISOString();
    const { error } = await supabaseClient.from('site_settings').upsert([
        { key: 'home_mindfulness_quote_color', value: document.getElementById('home-quote-color').value, updated_at: updatedAt },
        { key: 'home_mindfulness_quote_weight', value: document.getElementById('home-quote-weight').value, updated_at: updatedAt },
        { key: 'home_mindfulness_quote_font', value: document.getElementById('home-quote-font').value, updated_at: updatedAt }
    ], { onConflict: 'key' });
    if (error) {
        alert('正念語句樣式儲存失敗：' + error.message);
        return;
    }
    alert('正念語句樣式已儲存。');
}

const validHomepageImageTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const maxHomepageImageSize = 10 * 1024 * 1024;

function updateContentImagePreview(event) {
    const positionInput = event.target.closest('[data-content-field="imagePosition"]');
    if (positionInput) {
        const row = positionInput.closest('[data-content-row]');
        const position = Math.min(100, Math.max(0, Number(positionInput.value) || 0));
        row.querySelector('[data-content-output="imagePosition"]').value = `${position}%`;
        row.querySelector('[data-content-output="imagePosition"]').textContent = `${position}%`;
        const preview = row.querySelector('[data-image-scale-preview="imageUrl"]');
        if (preview) preview.style.objectPosition = `center ${position}%`;
        return;
    }
    const scaleInput = event.target.closest('[data-content-field="imageScale"]');
    if (scaleInput) {
        const row = scaleInput.closest('[data-content-row]');
        const scale = Math.min(200, Math.max(100, Number(scaleInput.value) || 100));
        row.querySelector('[data-content-output="imageScale"]').value = `${scale}%`;
        row.querySelector('[data-content-output="imageScale"]').textContent = `${scale}%`;
        const preview = row.querySelector('[data-image-scale-preview="imageUrl"]');
        if (preview) preview.style.transform = `scale(${scale / 100})`;
        return;
    }
    const input = event.target.closest('[data-content-image]');
    if (!input) return;
    const file = input.files[0];
    if (!file) return;
    const preview = input.closest('[data-content-row]').querySelector(`[data-content-preview="${input.dataset.imageField}"]`);
    if (!validHomepageImageTypes.has(file.type) || file.size > maxHomepageImageSize) {
        input.value = '';
        alert('圖片請使用 JPG、PNG 或 WebP，且不得超過 10 MB。');
        return;
    }
    if (input.hasAttribute('data-hero-image')) {
        openHeroImageCropper(input, file);
        return;
    }
    if (preview.dataset.objectUrl) URL.revokeObjectURL(preview.dataset.objectUrl);
    const objectUrl = URL.createObjectURL(file);
    preview.dataset.objectUrl = objectUrl;
    preview.src = objectUrl;
    preview.classList.remove('hidden');
    preview.parentElement.classList.remove('hidden');
}

function closeHeroImageCropper(clearInput) {
    if (heroImageCropper) {
        heroImageCropper.destroy();
        heroImageCropper = null;
    }
    if (heroImageCropUrl) {
        URL.revokeObjectURL(heroImageCropUrl);
        heroImageCropUrl = '';
    }
    if (clearInput && heroImageCropInput) heroImageCropInput.value = '';
    heroImageCropInput = null;
    heroRichImageCropContext = null;
    const modal = document.getElementById('hero-crop-modal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

function openHeroImageCropper(input, file, richContext = null) {
    if (!validHomepageImageTypes.has(file.type) || file.size === 0 || file.size > maxHomepageImageSize) {
        if (input) input.value = '';
        alert('圖片請使用 JPG、PNG 或 WebP，且檔案大小需大於 0 並不超過 10 MB。');
        return;
    }
    if (!window.Cropper) {
        if (input) input.value = '';
        alert('圖片裁剪工具載入失敗，請重新整理管理後台後再試。');
        return;
    }
    closeHeroImageCropper(true);
    heroImageCropInput = input;
    heroRichImageCropContext = richContext;
    heroImageCropUrl = URL.createObjectURL(file);
    const image = document.getElementById('hero-crop-image');
    const modal = document.getElementById('hero-crop-modal');
    document.getElementById('hero-crop-title').textContent = richContext ? '裁剪插入圖片' : '裁剪置頂輪播圖片';
    document.getElementById('hero-crop-description').textContent = richContext
        ? '拖曳選取裁剪範圍，並可縮放或移動圖片；完成後會上傳並插入編輯器。'
        : '拖曳圖片調整位置，使用滑鼠滾輪或觸控縮放；裁剪比例為 3:1。';
    image.src = heroImageCropUrl;
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    image.onload = () => {
        heroImageCropper = new Cropper(image, {
            aspectRatio: richContext ? NaN : Number(input.dataset.cropRatio),
            viewMode: 1,
            autoCropArea: 0.9,
            responsive: true,
            background: false
        });
    };
}

function applyHeroImageCrop() {
    if (!heroImageCropper || (!heroImageCropInput && !heroRichImageCropContext)) return;
    const richContext = heroRichImageCropContext;
    const canvasOptions = richContext
        ? { maxWidth: 1600, maxHeight: 1200, imageSmoothingEnabled: true, imageSmoothingQuality: 'high' }
        : { width: Number(heroImageCropInput.dataset.cropWidth), height: Number(heroImageCropInput.dataset.cropHeight), imageSmoothingEnabled: true, imageSmoothingQuality: 'high' };
    const canvas = heroImageCropper.getCroppedCanvas(canvasOptions);
    canvas.toBlob(blob => {
        if (!blob) {
            alert('裁剪圖片失敗，請重新選擇圖片再試。');
            return;
        }
        if (blob.size > maxHomepageImageSize) {
            alert('裁剪後圖片仍超過 10 MB，請縮小裁剪範圍或選擇其他圖片。');
            return;
        }
        const croppedFile = new File([blob], `hero-${Date.now()}.webp`, { type: 'image/webp' });
        if (richContext) {
            void uploadAndInsertHeroRichImage(croppedFile, richContext);
            closeHeroImageCropper(false);
            return;
        }
        const transfer = new DataTransfer();
        transfer.items.add(croppedFile);
        heroImageCropInput.files = transfer.files;

        const preview = heroImageCropInput.closest('[data-content-row]').querySelector(`[data-content-preview="${heroImageCropInput.dataset.imageField}"]`);
        if (preview.dataset.objectUrl) URL.revokeObjectURL(preview.dataset.objectUrl);
        const objectUrl = URL.createObjectURL(croppedFile);
        preview.dataset.objectUrl = objectUrl;
        preview.src = objectUrl;
        preview.classList.remove('hidden');
        closeHeroImageCropper(false);
    }, 'image/webp', 0.9);
}

async function uploadAndInsertHeroRichImage(file, context) {
    let uploaded = null;
    try {
        uploaded = await uploadHeroRichImage(file);
        if (!insertHeroRichContent(context.editor, 'image', uploaded.url, '', context.alt || file.name || '內容圖片')) {
            const { error } = await uploaded.bucket.remove([uploaded.path]);
            if (error) console.error('Rich image cleanup failed:', error.message);
        }
    } catch (error) {
        if (uploaded) {
            const { error: cleanupError } = await uploaded.bucket.remove([uploaded.path]);
            if (cleanupError) console.error('Rich image cleanup failed:', cleanupError.message);
        }
        alert(error.message || '圖片上傳或插入失敗。');
    }
}

function openHeroRichImageCropper(file, editor, alt = '') {
    if (!editor) return;
    saveHeroRichEditorSelection(editor);
    if (!restoreHeroRichEditorSelection(editor)) {
        alert('請先在圖文編輯器中點選插入位置。');
        return;
    }
    openHeroImageCropper(null, file, { editor, alt });
}

function createHomepageUploadId() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, character => {
        const random = crypto.getRandomValues(new Uint8Array(1))[0] % 16;
        return (character === 'x' ? random : (random & 0x3) | 0x8).toString(16);
    });
}

async function saveHomepageItems(containerId, settingKey, label, folder, onlyRow = null) {
    const allRows = Array.from(document.querySelectorAll(`#${containerId} [data-content-row]`));
    const rows = onlyRow ? [onlyRow] : allRows;
    let items = onlyRow ? [] : collectContentRows(containerId);
    if (rows.some(row => Array.from(row.querySelectorAll('[data-content-image]')).some(input => {
        const file = input.files[0];
        return file && (!validHomepageImageTypes.has(file.type) || file.size > maxHomepageImageSize);
    }))) {
        alert('圖片請使用 JPG、PNG 或 WebP，且不得超過 10 MB。');
        return false;
    }
    if (rows.some(row => Array.from(row.querySelectorAll('[data-content-media]')).some(input => {
        const file = input.files[0];
        return file && (file.type !== 'video/mp4' || file.size > 50 * 1024 * 1024);
    }))) {
        alert('影片請使用 MP4 格式，且不得超過 50 MB。');
        return false;
    }
    if (settingKey === 'home_ad_items' || settingKey === 'home_hero_items') {
        const orderedRows = (onlyRow ? [onlyRow] : allRows).filter(contentRowHasValues);
        const orders = orderedRows.map(row => Number(row.querySelector('[data-content-field="order"]').value));
        if (orderedRows.some((row, index) => !Number.isInteger(orders[index]) || orders[index] < 1)) {
            alert(settingKey === 'home_ad_items'
                ? '請為每則廣告輸入大於 0 的整數顯示位置。'
                : '請為每張置頂圖片輸入大於 0 的整數顯示次序。');
            return false;
        }
        if (new Set(orders).size !== orders.length) {
            alert(settingKey === 'home_ad_items'
                ? '廣告顯示位置不可重複。'
                : '置頂圖片的顯示次序不可重複。');
            return false;
        }
    }
    if (settingKey === 'home_hero_items') {
        const heroRows = onlyRow ? [onlyRow] : allRows.filter(contentRowHasValues);
        if (heroRows.length > 9) {
            alert('首頁置頂內容最多設定 9 張。');
            return false;
        }
        for (const row of heroRows) {
            const value = row.querySelector('[data-content-field="smartLayoutJson"]').value;
            if (value) {
                let layout;
                try { layout = JSON.parse(value); } catch { layout = null; }
                if (!window.isSmartLayout(layout)) {
                    alert('智慧排版資料格式無效，請移除智慧排版或重新生成後再儲存。');
                    return false;
                }
            }
        }
        if (heroRows.some(row => {
            try {
                const members = JSON.parse(row.querySelector('[data-content-field="teamJson"]').value || '[]');
                return !Array.isArray(members) || members.length > 8 ||
                    members.some(member => !member || typeof member !== 'object' || Array.isArray(member));
            } catch {
                return true;
            }
        })) {
            alert('團隊介紹資料必須是最多 8 位成員的有效 JSON 陣列。');
            return false;
        }
        if (heroRows.some(row => {
            const desktopImageUrl = row.querySelector('[data-content-field="imageUrl"]').value.trim();
            const desktopImageFile = row.querySelector('[data-content-image][data-image-field="imageUrl"]').files[0];
            return !desktopImageUrl && !desktopImageFile;
        })) {
            alert('請為每張置頂圖片選擇電腦版圖片或輸入圖片網址。');
            return false;
        }
        for (const row of heroRows) {
            const invalidUrl = Array.from(row.querySelectorAll('[data-content-field][type="url"]'))
                .find(input => input.value.trim() && !safeImageUrl(input.value.trim()));
            const members = JSON.parse(row.querySelector('[data-content-field="teamJson"]').value || '[]');
            const invalidMemberIndex = members.findIndex(member => member.imageUrl && !safeImageUrl(member.imageUrl));
            if (invalidUrl || invalidMemberIndex !== -1) {
                const field = invalidUrl || row.querySelectorAll('[data-team-member-image-url]')[invalidMemberIndex];
                const name = invalidUrl
                    ? invalidUrl.closest('label')?.firstChild?.textContent.trim() || '網址'
                    : `團隊成員 ${invalidMemberIndex + 1} 的圖片網址`;
                const card = row.querySelector('[data-content-field="order"]').value.trim();
                const details = field?.closest('details');
                if (details) details.open = true;
                alert(`置頂內容 ${card} 的「${name}」格式不正確。請輸入完整的 HTTP 或 HTTPS 網址；不需要的欄位可留空。`);
                field?.focus();
                return false;
            }
        }
    }

    const uploadedPaths = [];
    const bucket = supabaseClient.storage.from('homepage-content');
    let itemIndex = 0;

    try {
        for (const row of rows) {
            const item = Object.fromEntries(Array.from(row.querySelectorAll('[data-content-field]')).map(input => [
                input.dataset.contentField,
                input.type === 'checkbox'
                    ? input.checked
                    : ['pageBackgroundScale', 'pageBackgroundPosition'].includes(input.dataset.contentField)
                        ? Number(input.value)
                    : input.dataset.contentField === 'imageScale'
                    ? Math.min(200, Math.max(100, Number(input.value) || 100))
                    : input.dataset.contentField === 'imagePosition'
                        ? Math.min(100, Math.max(0, Number(input.value) || 0))
                    : input.dataset.contentField === 'order'
                        ? Number(input.value)
                    : input.value.trim()
            ]));
            if (!contentRowHasValues(row)) continue;

            for (const imageInput of row.querySelectorAll('[data-content-image]')) {
                const file = imageInput.files[0];
                if (!file) continue;
                const extension = file.type === 'image/jpeg' ? 'jpg' : file.type === 'image/png' ? 'png' : 'webp';
                const variant = imageInput.dataset.imageVariant ? `-${imageInput.dataset.imageVariant}` : '';
                const path = `${createHomepageUploadId()}/${folder}${variant}-image.${extension}`;
                const { error } = await bucket.upload(path, file, {
                    cacheControl: '3600',
                    contentType: file.type,
                    upsert: false
                });
                if (error) throw error;
                uploadedPaths.push(path);
                const publicUrl = bucket.getPublicUrl(path).data.publicUrl;
                item[imageInput.dataset.imageField] = publicUrl;
                const urlField = row.querySelector(`[data-content-field="${imageInput.dataset.imageField}"]`);
                if (urlField) urlField.value = publicUrl;
                if (imageInput.dataset.teamImageIndex !== undefined) {
                    const memberCard = row.querySelectorAll('[data-team-member]')[Number(imageInput.dataset.teamImageIndex)];
                    if (memberCard) {
                        memberCard.querySelector('[data-team-member-image-url]').value = publicUrl;
                        syncHeroTeamMembers(row);
                    }
                }
            }
            for (const mediaInput of row.querySelectorAll('[data-content-media]')) {
                const file = mediaInput.files[0];
                if (!file) continue;
                const path = `${createHomepageUploadId()}/${folder}-video.mp4`;
                const { error } = await bucket.upload(path, file, {
                    cacheControl: '3600',
                    contentType: file.type,
                    upsert: false
                });
                if (error) throw error;
                uploadedPaths.push(path);
                item.heroMediaUrl = bucket.getPublicUrl(path).data.publicUrl;
                row.querySelector('[data-content-field="heroMediaUrl"]').value = item.heroMediaUrl;
            }
            if (settingKey === 'home_hero_items') {
                if (item.smartLayoutJson) item.smartLayout = JSON.parse(item.smartLayoutJson);
                delete item.smartLayoutJson;
                const members = JSON.parse(item.teamJson || '[]').map((member, memberIndex) => ({
                    ...member,
                    imageUrl: item[`teamMemberImage-${memberIndex}`] || member.imageUrl || ''
                }));
                const highlightImageUrls = Array.from({ length: 5 }, (_, imageIndex) =>
                    item[`tabHighlightsImageUrl${imageIndex + 1}`]
                ).filter(Boolean);
                item.details = {
                    highlights: {
                        ticket: item.highlightTicket,
                        audience: item.highlightAudience,
                        award: item.highlightAward,
                        venue: item.highlightVenue
                    },
                    tabs: {
                        highlights: item.tabHighlights,
                        schedule: item.tabSchedule,
                        faq: item.tabFaq,
                        highlightsImageUrls: highlightImageUrls
                    },
                    members
                };
                Object.keys(item).filter(key =>
                    /^tabHighlightsImageUrl[1-5]$/.test(key) || /^teamMemberImage-\d+$/.test(key)
                ).forEach(key => delete item[key]);
                ['highlightTicket', 'highlightAudience', 'highlightAward', 'highlightVenue', 'tabHighlights', 'tabSchedule', 'tabFaq', 'teamJson', 'customPrompt'].forEach(key => delete item[key]);
                item.pageId = item.pageId || `hero-${createHomepageUploadId()}`;
            }
            items[itemIndex] = item;
            itemIndex++;
        }
    } catch (error) {
        if (uploadedPaths.length) await bucket.remove(uploadedPaths);
        const message = error?.message || '未知錯誤';
        const rlsHint = /row-level security|42501/i.test(`${error?.code || ''} ${message}`)
            ? '\n請確認目前登入帳號具有管理員權限，並已在 Supabase 執行更新後的首頁圖片 Storage policy。'
            : '';
        alert(`${label}圖片上傳失敗：${message}${rlsHint}`);
        return false;
    }

    if (onlyRow && settingKey === 'home_hero_items') {
        const { data, error } = await supabaseClient.from('site_settings').select('value').eq('key', settingKey).maybeSingle();
        if (error) {
            if (uploadedPaths.length) await bucket.remove(uploadedPaths);
            alert(`${label}讀取現有內容失敗：${error.message}`);
            return false;
        }
        const savedItems = parseContentItems(data?.value);
        const replacementIndex = savedItems.findIndex((item, index) =>
            (item.pageId || `hero-${item.order ?? index + 1}`) === items[0]?.pageId
        );
        if (replacementIndex < 0 && savedItems.length >= 9) {
            if (uploadedPaths.length) await bucket.remove(uploadedPaths);
            alert('首頁置頂內容最多設定 9 張，請先移除一張已儲存內容。');
            return false;
        }
        const otherItems = savedItems.filter((_, index) => index !== replacementIndex);
        if (otherItems.some(item => Number(item.order) === Number(items[0]?.order))) {
            if (uploadedPaths.length) await bucket.remove(uploadedPaths);
            alert('置頂內容的顯示次序不可與其他已儲存內容重複。');
            return false;
        }
        if (replacementIndex < 0) savedItems.push(items[0]);
        else savedItems[replacementIndex] = items[0];
        items = savedItems;
    }
    if (settingKey === 'home_ad_items' || settingKey === 'home_hero_items') {
        items.forEach(item => {
            if (item.order !== undefined) item.order = Number(item.order);
        });
        items.sort((first, second) => Number(first.order) - Number(second.order));
    }
    const saved = await saveSettingValue(settingKey, JSON.stringify(items), label);
    if (!saved && uploadedPaths.length) await bucket.remove(uploadedPaths);
    if (saved) {
        if (onlyRow) {
            onlyRow.querySelectorAll('[data-content-image], [data-content-media]').forEach(input => {
                input.value = '';
            });
        }
        if (settingKey === 'home_blog_items') homeBlogItems = items;
        if (settingKey === 'home_ad_items') homeAdItems = items;
        if (settingKey === 'home_hero_items') homeHeroItems = items;
        if (!onlyRow) renderHomeContentEditors();
    }
    return saved;
}

function getSubmissionDateKey(value) {
    const match = String(value || '').match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    return match ? `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}` : '';
}

function submissionOccursOnDate(item, date) {
    const startDate = getSubmissionDateKey(item.event_time);
    if (!startDate) return false;
    const endDate = getSubmissionDateKey(getEventEndDateTime(item)) || startDate;
    return date >= startDate && date <= (endDate < startDate ? startDate : endDate);
}

function getDateTimeInputValue(value) {
    const match = String(value || '').match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/);
    return match ? `${match[1]}T${match[2]}` : '';
}

function getMacauDateTimeKey() {
    const parts = new Intl.DateTimeFormat('sv-SE', {
        timeZone: 'Asia/Macau',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).format(new Date());
    return parts.replace(' ', 'T');
}

function getEventEndDateTime(item) {
    return item.event_end_time || (item.event_end_date ? `${item.event_end_date} 23:59` : '');
}

function isEventExpired(endDate) {
    return Boolean(endDate && endDate.replace(' ', 'T') < getMacauDateTimeKey());
}

function getSubmissionStatusLabel(item) {
    if (item.status !== 'approved') return item.status === 'pending' ? '待審核' : '已駁回';
    const endDateTime = getEventEndDateTime(item);
    if (!endDateTime) return '缺少結束日期（首頁隱藏）';
    if (isEventExpired(endDateTime)) return '已自動下架';
    return item.is_visible === false ? '手動下架' : '已上架';
}

function renderVisibilityButton(item) {
    if (item.status !== 'approved') return '<span class="text-xs text-gray-400">核准後可設定顯示</span>';
    const label = item.is_visible === false ? '手動上架' : '手動下架';
    const style = item.is_visible === false ? 'bg-green-600 hover:bg-green-700' : 'bg-gray-700 hover:bg-gray-800';
    return `<button type="button" data-toggle-visibility="${escapeHtml(item.id)}" class="text-white text-sm font-semibold px-3 py-2 rounded-lg ${style}">${label}</button>`;
}

function renderSubmissionStatusFilters() {
    const nav = document.getElementById('submission-status-filters');
    const isPast = item => {
        const endDateTime = getEventEndDateTime(item);
        return Boolean(endDateTime && isEventExpired(endDateTime));
    };
    const groups = {
        approved: submissions.filter(item => item.status === 'approved' && !isPast(item) && getSubmissionStatusLabel(item) === '已上架'),
        pending: submissions.filter(item => item.status === 'pending'),
        special: submissions.filter(item => item.status === 'rejected' || (item.status === 'approved' && !isPast(item) && getSubmissionStatusLabel(item) !== '已上架')),
        past: submissions.filter(item => item.status === 'approved' && isPast(item))
    };
    const labels = {
        approved: '已審批',
        pending: '未審批',
        special: '拒審／特殊情況',
        past: '已過去'
    };
    nav.innerHTML = Object.entries(groups).map(([filter, items]) =>
        `<button type="button" data-submission-filter="${filter}" aria-pressed="${activeSubmissionFilter === filter}" class="rounded-lg border px-4 py-2 text-sm ${activeSubmissionFilter === filter ? 'border-blue-700 bg-blue-700 text-white' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'}">${labels[filter]} <span class="${activeSubmissionFilter === filter ? 'text-blue-100' : 'text-gray-500'}">(${items.length})</span></button>`
    ).join('');
}

async function toggleSubmissionVisibility(event) {
    const button = event.target.closest('[data-toggle-visibility]');
    if (!button) return;
    const item = submissions.find(submission => String(submission.id) === button.dataset.toggleVisibility);
    if (!item || item.status !== 'approved') return;

    const shouldShow = item.is_visible === false;
    if (shouldShow && (!getEventEndDateTime(item) || isEventExpired(getEventEndDateTime(item)))) {
        alert('活動結束時間已過或尚未設定，請先更新結束日期及時間再上架。');
        return;
    }

    const { error } = await supabaseClient.from('submissions')
        .update({ is_visible: shouldShow })
        .eq('id', item.id);
    if (error) {
        alert('顯示狀態更新失敗：' + error.message);
        return;
    }

    await fetchSubmissions();
}

function renderCalendarEditor() {
    const monthDate = new Date(Date.UTC(calendarEditYear, calendarEditMonth, 1, 12));
    document.getElementById('calendar-edit-month').textContent = new Intl.DateTimeFormat('zh-Hant-MO', {
        timeZone: 'Asia/Macau', year: 'numeric', month: 'long'
    }).format(monthDate);

    const firstWeekday = new Date(Date.UTC(calendarEditYear, calendarEditMonth, 1)).getUTCDay();
    const daysInMonth = new Date(Date.UTC(calendarEditYear, calendarEditMonth + 1, 0)).getUTCDate();
    const eventCounts = new Map();
    for (let day = 1; day <= daysInMonth; day++) {
        const key = `${calendarEditYear}-${String(calendarEditMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const count = submissions.filter(item => submissionOccursOnDate(item, key)).length;
        if (count) eventCounts.set(key, count);
    }

    const calendar = document.getElementById('calendar-edit-days');
    calendar.innerHTML = '';
    for (let cell = 0; cell < 42; cell++) {
        const day = cell - firstWeekday + 1;
        if (day < 1 || day > daysInMonth) {
            calendar.insertAdjacentHTML('beforeend', '<span class="aspect-square" aria-hidden="true"></span>');
            continue;
        }

        const key = `${calendarEditYear}-${String(calendarEditMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const count = eventCounts.get(key) || 0;
        const specialDay = calendarSpecialDays.find(item => item.date === key);
        const selected = key === selectedCalendarEditDate;
        const classes = selected ? 'bg-blue-600 text-white' : 'border-transparent hover:bg-blue-50';
        calendar.insertAdjacentHTML('beforeend', `<button type="button" role="gridcell" data-admin-date="${key}" aria-pressed="${selected}" title="${escapeHtml(specialDay ? `${specialDay.icon} ${specialDay.title} · ${count} 項活動` : `${count} 項活動`)}" class="relative aspect-square min-h-9 border rounded-lg flex flex-col items-center justify-center text-sm ${classes}">
            <span>${day}</span>${specialDay ? `<span class="absolute bottom-0.5 right-1 text-xs">${escapeHtml(specialDay.icon)}</span>` : count ? '<span class="w-1.5 h-1.5 rounded-full bg-amber-500" aria-hidden="true"></span>' : ''}
        </button>`);
    }

    document.getElementById('calendar-edit-clear').classList.toggle('hidden', !selectedCalendarEditDate);
    renderCalendarEditList();
}

function renderCalendarSpecialDaysEditor() {
    const editor = document.getElementById('calendar-special-days-editor');
    editor.innerHTML = calendarSpecialDays.length
        ? calendarSpecialDays.map((item, index) => `<div data-calendar-special-day="${index}" class="grid gap-2 sm:grid-cols-[160px_90px_minmax(0,1fr)_auto]">
            <label class="text-xs font-medium text-gray-600">日期
                <input type="date" data-special-day-date value="${escapeHtml(item.date)}" class="mt-1 w-full rounded border px-3 py-2 text-sm text-gray-800">
            </label>
            <label class="text-xs font-medium text-gray-600">小圖案
                <input type="text" data-special-day-icon value="${escapeHtml(item.icon)}" aria-label="特別日子圖案 ${index + 1}" class="mt-1 w-full rounded border px-3 py-2 text-center text-lg" placeholder="🎉">
            </label>
            <label class="text-xs font-medium text-gray-600">特別日子標題
                <input type="text" data-special-day-title value="${escapeHtml(item.title)}" class="mt-1 w-full rounded border px-3 py-2 text-sm text-gray-800" placeholder="例如：澳門回歸紀念日">
            </label>
            <button type="button" data-remove-calendar-special-day="${index}" class="self-end rounded px-3 py-2 text-sm text-red-700 hover:bg-red-50">刪除</button>
        </div>`).join('')
        : '<p class="text-sm text-gray-500">尚未設定特別日子。</p>';
}

function collectCalendarSpecialDays() {
    return Array.from(document.querySelectorAll('[data-calendar-special-day]'), row => ({
        date: row.querySelector('[data-special-day-date]').value,
        icon: row.querySelector('[data-special-day-icon]').value.trim(),
        title: row.querySelector('[data-special-day-title]').value.trim()
    }));
}

async function saveCalendarSpecialDays() {
    const items = collectCalendarSpecialDays();
    const validDate = value => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
        const date = new Date(`${value}T00:00:00Z`);
        return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
    };
    if (items.some(item => !validDate(item.date) || !item.title || !item.icon)) {
        alert('請為每個特別日子填寫有效日期、小圖案及標題。');
        return;
    }
    if (new Set(items.map(item => item.date)).size !== items.length) {
        alert('特別日子日期不可重複。');
        return;
    }

    const { error } = await supabaseClient.from('site_settings').upsert({
        key: 'calendar_special_days',
        value: JSON.stringify(items),
        updated_at: new Date().toISOString()
    }, { onConflict: 'key' });
    if (error) {
        alert('特別日子儲存失敗：' + error.message);
        return;
    }
    calendarSpecialDays = items;
    renderCalendarSpecialDaysEditor();
    renderCalendarEditor();
    alert('特別日子已儲存。');
}

function renderCalendarEditList() {
    const list = document.getElementById('calendar-edit-list');
    const visibleItems = selectedCalendarEditDate
        ? submissions.filter(item => submissionOccursOnDate(item, selectedCalendarEditDate))
        : submissions;

    if (!submissions.length) {
        list.innerHTML = '<p class="bg-white border rounded-lg text-center text-gray-500 p-8">目前沒有活動資料。提交活動後，這裡會顯示日期編輯欄位。</p>';
        return;
    }
    if (!visibleItems.length) {
        list.innerHTML = '<p class="bg-white border rounded-lg text-center text-gray-500 p-8">這個日期沒有活動。</p>';
        return;
    }

    list.innerHTML = visibleItems.map(item => `<article class="bg-white border rounded-lg p-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_220px_190px_auto_auto] md:items-center">
        <div class="min-w-0">
            <h3 class="font-semibold truncate">${escapeHtml(item.title)}</h3>
            <p class="text-sm text-gray-500">${escapeHtml(item.org_name)} · ${escapeHtml(getSubmissionStatusLabel(item))} · ${escapeHtml(getAdminCategoryLabel(item.category))} / ${escapeHtml(getAdminSubcategoryLabel(item.category, item.subcategory))}</p>
        </div>
        <label class="text-sm text-gray-600">開始日期及時間
            <input type="datetime-local" data-admin-event-time class="mt-1 w-full border rounded-lg px-3 py-2 text-gray-800" value="${escapeHtml(getDateTimeInputValue(item.event_time))}">
        </label>
        <label class="text-sm text-gray-600">結束日期及時間
            <input type="datetime-local" data-admin-end-date class="mt-1 w-full border rounded-lg px-3 py-2 text-gray-800" value="${escapeHtml(getDateTimeInputValue(getEventEndDateTime(item)))}" required>
        </label>
        ${renderVisibilityButton(item)}
        <button type="button" data-save-calendar-event="${escapeHtml(item.id)}" class="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-4 py-2 rounded-lg">儲存日期</button>
    </article>`).join('');
}

async function saveCalendarEvent(event) {
    const button = event.target.closest('[data-save-calendar-event]');
    if (!button) return;
    const card = button.closest('article');
    const eventTime = card.querySelector('[data-admin-event-time]').value;
    const endDateTime = card.querySelector('[data-admin-end-date]').value;
    if (!eventTime || !endDateTime) {
        alert('請填寫活動開始及結束日期時間。');
        return;
    }
    if (endDateTime < eventTime) {
        alert('活動結束日期及時間不可早於活動開始日期及時間。');
        return;
    }

    const { error } = await supabaseClient.from('submissions').update({
        event_time: eventTime.replace('T', ' '),
        event_end_date: endDateTime.slice(0, 10),
        event_end_time: endDateTime.replace('T', ' ')
    }).eq('id', button.dataset.saveCalendarEvent);
    if (error) {
        alert('日期儲存失敗：' + error.message);
        return;
    }

    alert('活動日期已儲存。');
    await fetchSubmissions();
}

async function fetchSubmissions() {
    submissionsList.innerHTML = '<p class="text-center text-gray-500 py-10">載入中...</p>';
    const { data, error } = await supabaseClient
        .from('submissions')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        submissionsList.innerHTML = `<p class="text-red-500">讀取失敗：${escapeHtml(error.message)}</p>`;
        return;
    }

    submissions = data || [];
    renderCalendarEditor();
    renderSubmissionStatusFilters();
    const visibleSubmissions = submissions.filter(item => {
        const endDateTime = getEventEndDateTime(item);
        const isPast = Boolean(endDateTime && isEventExpired(endDateTime));
        if (activeSubmissionFilter === 'approved') return item.status === 'approved' && !isPast && getSubmissionStatusLabel(item) === '已上架';
        if (activeSubmissionFilter === 'pending') return item.status === 'pending';
        if (activeSubmissionFilter === 'past') return item.status === 'approved' && isPast;
        return item.status === 'rejected' || (item.status === 'approved' && !isPast && getSubmissionStatusLabel(item) !== '已上架');
    });
    if (!visibleSubmissions.length) {
        const emptyMessage = activeSubmissionFilter === 'approved' ? '目前沒有已審批並上架的活動。' :
            activeSubmissionFilter === 'pending' ? '目前沒有未審批的活動。' :
            activeSubmissionFilter === 'past' ? '目前沒有已過去的活動。' : '目前沒有拒審或特殊情況的活動。';
        submissionsList.innerHTML = `<p class="text-center text-gray-500 py-10">${emptyMessage}</p>`;
        return;
    }

    submissionsList.innerHTML = visibleSubmissions.map(item => {
        const statusText = getSubmissionStatusLabel(item);
        const statusClass = item.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
            item.status === 'rejected' ? 'bg-red-100 text-red-800' :
            statusText === '已上架' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-700';
        const poster = safeImageUrl(item.poster_url);
        const promotionImages = Array.isArray(item.promotion_image_urls) ? item.promotion_image_urls : [];
        const videoUrl = safeImageUrl(item.video_url);
        const mediaLinks = promotionImages.map((url, index) => {
            const safeUrl = safeImageUrl(url);
            return safeUrl ? `<a href="${escapeHtml(safeUrl)}" target="_blank" rel="noopener noreferrer" class="text-blue-700 underline">宣傳圖 ${index + 1}</a>` : '';
        }).filter(Boolean).join(' · ');

        return `<article class="bg-white rounded-xl shadow-sm border p-4 flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
            <div class="flex gap-4 flex-1">
                ${poster ? `<img src="${escapeHtml(poster)}" alt="活動海報" class="w-20 h-20 object-cover rounded-lg border">` : ''}
                <div>
                    <div class="flex items-center gap-2 mb-1">
                        <h3 class="font-bold text-lg">${escapeHtml(item.title)}</h3>
                        <span class="text-xs px-2 py-0.5 rounded-full ${statusClass}">${escapeHtml(statusText)}</span>
                    </div>
                    <p class="text-sm text-gray-600">主辦：${escapeHtml(item.org_name)} (${escapeHtml(item.identity_type)}) | 費用：${escapeHtml(item.fee || (Number(item.total_amount) > 0 ? `MOP ${item.total_amount}` : '免費'))}</p>
                    ${['club', 'org'].includes(item.identity_type) ? `<p class="text-sm text-gray-500 mt-1">負責人姓名：${escapeHtml(item.contact_person || '未提供')}</p>` : ''}
                    ${['club', 'org'].includes(item.identity_type) ? `<p class="text-sm text-gray-500 mt-1">負責人電話（僅管理員）：${escapeHtml(item.contact_person_phone || '未提供')}</p>` : ''}
                    <p class="text-sm text-gray-500 mt-1">日期：${escapeHtml(item.event_time || '待安排')} 至 ${escapeHtml(getEventEndDateTime(item).replace('T', ' ') || '未設定')} | 年齡：${escapeHtml(item.age_range)}</p>
                    ${renderSubmissionCategoryBadges(item)}
                    <p class="text-sm text-gray-500 mt-1">${item.event_format === 'online' ? '線上平台／參加方式' : '活動地址'}：${escapeHtml(item.location || '未提供')}</p>
                    ${item.description ? `<p class="text-sm text-gray-600 mt-2">${escapeHtml(item.description)}</p>` : ''}
                    <p class="text-sm text-gray-500 mt-2">Email：${escapeHtml(item.contact_email || '未提供')} · 電話：${escapeHtml(item.contact_phone || '未提供')}</p>
                    ${item.verification_phone ? `<p class="text-sm text-gray-500">身份核實手機（內部）：${escapeHtml(item.verification_phone)}${item.phone_verified_at ? ' · OTP 已核實' : ' · OTP 尚未核實'}</p>` : ''}
                    <p class="text-sm text-gray-500">WeChat：${escapeHtml(item.wechat_id || '未提供')} · IG／FB：${escapeHtml(item.social_handle || '未提供')}</p>
                    <div class="mt-2 flex gap-2">
                        ${mediaLinks}
                        ${videoUrl ? `<a href="${escapeHtml(videoUrl)}" target="_blank" rel="noopener noreferrer" class="text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded">查看影片</a>` : ''}
                        <span class="text-xs ${item.agreed_terms ? 'text-green-600' : 'text-red-600'}">${item.agreed_terms ? '已同意條款' : '未同意條款'}</span>
                    </div>
                    <div class="mt-2 flex flex-wrap items-center gap-2">
                        <span class="text-xs px-2 py-1 rounded ${item.identity_verified ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}">身份核實：${item.identity_verified ? `已核實${item.identity_verified_at ? `（${escapeHtml(new Date(item.identity_verified_at).toLocaleString('zh-HK'))}）` : ''}` : '待核實'}</span>
                        ${item.identity_document_path ? `<button data-view-identity-document="${escapeHtml(item.id)}" class="text-xs text-blue-700 underline">查看核實文件</button>` : ''}
                        ${!item.identity_verified ? `<button data-verify-identity="${escapeHtml(item.id)}" class="text-xs bg-amber-600 text-white px-2 py-1 rounded">核實並刪除身份資料</button>` : ''}
                    </div>
                </div>
            </div>
            <div class="flex flex-col gap-2 w-full md:w-auto">
                ${renderVisibilityButton(item)}
                <button data-edit-id="${escapeHtml(item.id)}" class="w-full bg-gray-800 text-white px-4 py-2 rounded-lg text-sm hover:bg-gray-700">編輯 / 審核</button>
            </div>
        </article>`;
    }).join('');
}

async function openIdentityDocument(id) {
    const item = submissions.find(submission => String(submission.id) === String(id));
    if (!item?.identity_document_path) {
        alert('此申請沒有可查看的身份核實文件。');
        return;
    }

    const { data, error } = await supabaseClient.storage
        .from('identity-documents')
        .createSignedUrl(item.identity_document_path, 60);
    if (error) {
        alert('無法開啟核實文件：' + error.message);
        return;
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
}

async function verifySubmissionIdentity(id) {
    const item = submissions.find(submission => String(submission.id) === String(id));
    if (!item || item.identity_verified) return;
    if (!item.identity_document_path && !String(item.reg_number || '').trim()) {
        alert('此申請沒有可核對的登記編號或身份核實文件。');
        return;
    }
    if (!confirm('確認已核對此提交者的身份／登記資料？核實後會清除線上證件編號及核實文件，僅保留已核實標記與時間。')) return;

    const verifiedAt = new Date().toISOString();
    const { error: updateError } = await supabaseClient.from('submissions').update({
        identity_verified: true,
        identity_verified_at: verifiedAt,
        reg_number: ''
    }).eq('id', item.id);
    if (updateError) {
        alert('儲存核實結果失敗：' + updateError.message);
        return;
    }

    if (item.identity_document_path) {
        const { error: deleteError } = await supabaseClient.storage
            .from('identity-documents')
            .remove([item.identity_document_path]);
        if (deleteError) {
            const { error: rollbackError } = await supabaseClient.from('submissions').update({
                identity_verified: false,
                identity_verified_at: null,
                reg_number: item.reg_number || ''
            }).eq('id', item.id);
            const rollbackDetail = rollbackError ? ` 核實狀態回復亦失敗：${rollbackError.message}` : '';
            alert('核實文件未能刪除，身份核實未完成：' + deleteError.message + rollbackDetail);
            return;
        }

        const { error: clearPathError } = await supabaseClient.from('submissions').update({
            identity_document_path: null
        }).eq('id', item.id);
        if (clearPathError) {
            alert('文件已從線上儲存空間刪除，但資料庫未能清除文件路徑：' + clearPathError.message);
            await fetchSubmissions();
            return;
        }
    }

    await fetchSubmissions();
    alert('身份核實完成；線上證件編號及文件已清除。服務供應商備份會依保存週期清除。');
}

function openEditModal(item) {
    document.getElementById('edit-id').value = item.id;
    document.getElementById('edit-title').value = item.title || '';
    document.getElementById('edit-description').value = item.description || '';
    document.getElementById('edit-is-life-service').checked = item.is_life_service === true;
    document.getElementById('edit-life-service-summary').value = item.life_service_summary || '';
    document.getElementById('edit-life-service-details').value = item.life_service_details || '';
    document.getElementById('edit-life-service-thumbnail-url').value = item.life_service_thumbnail_url || '';
    document.getElementById('edit-life-service-thumbnail-file').value = '';
    renderEventImagePreview(document.getElementById('edit-life-service-thumbnail-preview'), [item.life_service_thumbnail_url || '']);
    updateLifeServiceAdminOptions(item.life_service_category || undefined, item.life_service_subcategory || undefined);
    updateLifeServiceAdminVisibility();
    const eventTime = String(item.event_time || '').match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/);
    document.getElementById('edit-event-time').value = eventTime ? `${eventTime[1]}T${eventTime[2]}` : '';
    document.getElementById('edit-event-end-date').value = getDateTimeInputValue(getEventEndDateTime(item));
    document.querySelector(`input[name="edit-event-format"][value="${item.event_format === 'online' ? 'online' : 'offline'}"]`).checked = true;
    updateAdminEventFormat();
    document.getElementById('edit-location').value = item.location || '';
    document.getElementById('edit-map-url').value = item.map_url || '';
    document.getElementById('edit-registration-url').value = item.registration_url || '';
    const selectedCategories = new Set(String(item.category || '').split(',').filter(Boolean));
    for (const input of document.querySelectorAll('#edit-category input[name="editCategory"]')) {
        input.checked = selectedCategories.has(input.value);
    }
    updateAdminSubcategoryOptions(item.subcategory || '');
    document.getElementById('edit-age').value = item.age_range || '';
    document.getElementById('edit-poster').value = item.poster_url || '';
    document.getElementById('edit-poster-file').value = '';
    renderEventImagePreview(document.getElementById('edit-poster-preview'), [item.poster_url || '']);
    const posterDisplayScale = getPosterDisplayScale(item.poster_display_scale);
    const posterDisplayPosition = getPosterDisplayPosition(item.poster_display_position);
    document.getElementById('edit-poster-display-scale').value = String(posterDisplayScale);
    document.getElementById('edit-poster-display-scale-value').value = `${posterDisplayScale}%`;
    document.getElementById('edit-poster-display-scale-value').textContent = `${posterDisplayScale}%`;
    document.getElementById('edit-poster-display-position').value = String(posterDisplayPosition);
    document.getElementById('edit-poster-display-position-value').value = `${posterDisplayPosition}%`;
    document.getElementById('edit-poster-display-position-value').textContent = `${posterDisplayPosition}%`;
    applyPosterCropPreview(document.getElementById('edit-poster-preview'), posterDisplayScale, posterDisplayPosition);
    document.getElementById('edit-promotion-files').value = '';
    document.getElementById('edit-clear-promotion-images').checked = false;
    renderEventImagePreview(
        document.getElementById('edit-promotion-preview'),
        Array.isArray(item.promotion_image_urls) ? item.promotion_image_urls : []
    );
    document.getElementById('edit-video-url').value = item.video_url || '';
    document.getElementById('edit-contact-email').value = item.contact_email || '';
    document.getElementById('edit-contact-phone').value = item.contact_phone || '';
    document.getElementById('edit-contact-person-phone').value = item.contact_person_phone || '';
    document.getElementById('edit-wechat').value = item.wechat_id || '';
    document.getElementById('edit-social-handle').value = item.social_handle || '';
    const modal = document.getElementById('edit-modal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function closeEditModal() {
    const modal = document.getElementById('edit-modal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    revokeEventImagePreview(document.getElementById('edit-poster-preview'));
    revokeEventImagePreview(document.getElementById('edit-promotion-preview'));
    revokeEventImagePreview(document.getElementById('edit-life-service-thumbnail-preview'));
}

async function updateSubmission(status = null) {
    const id = document.getElementById('edit-id').value;
    const item = submissions.find(submission => String(submission.id) === id);
    if (!item) {
        alert('找不到要更新的活動資料，請重新整理後再試。');
        return;
    }
    if (status === 'approved' && (item.identity_document_path || item.reg_number || item.identity_type === 'personal') && !item.identity_verified) {
        alert('請先完成身份／商戶資料核實，並確認核實文件及證件編號已清除，再核准此申請。');
        return;
    }
    const eventTime = document.getElementById('edit-event-time').value;
    const eventEndTime = document.getElementById('edit-event-end-date').value;
    if (status !== 'rejected' && (!eventTime || !eventEndTime)) {
        alert('請填寫活動開始及結束日期時間。');
        return;
    }
    const selectedCategories = Array.from(
        document.querySelectorAll('#edit-category input[name="editCategory"]:checked'),
        input => input.value
    );
    const selectedSubcategories = Array.from(
        document.querySelectorAll('#edit-subcategory input[name="editSubcategory"]:checked'),
        input => input.value
    );
    if (status !== 'rejected' && (!selectedCategories.length || !selectedSubcategories.length)) {
        alert('請至少勾選一項主分類及一項子分類。');
        return;
    }
    if (status !== 'rejected' && eventEndTime < eventTime) {
        alert('活動結束日期及時間不可早於活動開始日期及時間。');
        return;
    }
    const mapUrl = document.getElementById('edit-map-url').value.trim();
    if (!isAllowedMapUrl(mapUrl)) {
        alert('地圖連結請使用 HTTPS 的 Google Maps、Apple 地圖或 OpenStreetMap 網址。');
        return;
    }
    const registrationUrl = document.getElementById('edit-registration-url').value.trim();
    if (!isAllowedHttpsUrl(registrationUrl)) {
        alert('活動報名連結請使用有效的 HTTPS 網址。');
        return;
    }
    const isLifeService = document.getElementById('edit-is-life-service').checked;
    const lifeServiceCategory = document.getElementById('edit-life-service-category').value;
    const lifeServiceSubcategory = document.getElementById('edit-life-service-subcategory').value;
    if (status !== 'rejected' && isLifeService) {
        const category = homeServiceCategories.find(item => item.id === lifeServiceCategory);
        if (!category || !category.subcategories.some(item => item.id === lifeServiceSubcategory)) {
            alert('請先設定生活服務主分類及子分類，再選擇有效的分類。');
            return;
        }
    }
    const posterFile = document.getElementById('edit-poster-file').files[0];
    const promotionFiles = Array.from(document.getElementById('edit-promotion-files').files);
    const lifeServiceThumbnailFile = document.getElementById('edit-life-service-thumbnail-file').files[0];
    const clearPromotionImages = document.getElementById('edit-clear-promotion-images').checked;
    const posterUrlInput = document.getElementById('edit-poster').value.trim();
    const lifeServiceThumbnailUrlInput = document.getElementById('edit-life-service-thumbnail-url').value.trim();
    if (posterFile && !isValidEventImage(posterFile)) {
        alert('主海報請使用 JPG、PNG 或 WebP，且不可超過 10 MB。');
        return;
    }
    if (promotionFiles.length > 2 || promotionFiles.some(file => !isValidEventImage(file))) {
        alert('宣傳圖片最多 2 張，請使用 JPG、PNG 或 WebP，且每張不可超過 10 MB。');
        return;
    }
    if (clearPromotionImages && promotionFiles.length) {
        alert('請選擇上傳新宣傳圖片，或移除現有圖片，不能同時選擇兩者。');
        return;
    }
    if (posterUrlInput && !safeImageUrl(posterUrlInput)) {
        alert('主海報圖片網址必須是有效的 HTTP 或 HTTPS 網址。');
        return;
    }
    if (lifeServiceThumbnailFile && !isValidEventImage(lifeServiceThumbnailFile)) {
        alert('生活服務縮圖請使用 JPG、PNG 或 WebP，且不可超過 10 MB。');
        return;
    }
    if (lifeServiceThumbnailUrlInput && (!safeImageUrl(lifeServiceThumbnailUrlInput) || !isAllowedHttpsUrl(lifeServiceThumbnailUrlInput))) {
        alert('生活服務縮圖網址必須是有效的 HTTPS 網址。');
        return;
    }
    const changes = {
        title: document.getElementById('edit-title').value.trim(),
        description: document.getElementById('edit-description').value.trim(),
        event_time: eventTime ? eventTime.replace('T', ' ') : null,
        event_end_date: eventEndTime ? eventEndTime.slice(0, 10) : null,
        event_end_time: eventEndTime ? eventEndTime.replace('T', ' ') : null,
        event_format: document.querySelector('input[name="edit-event-format"]:checked').value,
        location: document.getElementById('edit-location').value.trim(),
        map_url: mapUrl || null,
        registration_url: registrationUrl || null,
        category: selectedCategories.join(','),
        subcategory: selectedSubcategories.join(','),
        age_range: document.getElementById('edit-age').value.trim(),
        poster_url: posterUrlInput,
        poster_display_scale: getPosterDisplayScale(document.getElementById('edit-poster-display-scale').value),
        poster_display_position: getPosterDisplayPosition(document.getElementById('edit-poster-display-position').value),
        video_url: document.getElementById('edit-video-url').value.trim() || null,
        contact_email: document.getElementById('edit-contact-email').value.trim(),
        contact_phone: document.getElementById('edit-contact-phone').value.trim(),
        contact_person_phone: document.getElementById('edit-contact-person-phone').value.trim() || null,
        wechat_id: document.getElementById('edit-wechat').value.trim(),
        social_handle: document.getElementById('edit-social-handle').value.trim(),
        is_life_service: status === 'rejected' ? false : isLifeService,
        life_service_category: isLifeService && status !== 'rejected' ? lifeServiceCategory : null,
        life_service_subcategory: isLifeService && status !== 'rejected' ? lifeServiceSubcategory : null,
        life_service_summary: isLifeService && status !== 'rejected' ? document.getElementById('edit-life-service-summary').value.trim() : null,
        life_service_details: isLifeService && status !== 'rejected' ? document.getElementById('edit-life-service-details').value.trim() : null,
        life_service_thumbnail_url: isLifeService && status !== 'rejected' ? lifeServiceThumbnailUrlInput || null : null
    };
    if (status) changes.status = status;
    if (status === 'approved') {
        changes.is_locked = true;
        changes.is_visible = true;
    }

    const uploadedPaths = [];
    const bucket = supabaseClient.storage.from('event-media');
    try {
        if (posterFile) {
            const extension = posterFile.type === 'image/jpeg' ? 'jpg' : posterFile.type === 'image/png' ? 'png' : 'webp';
            const path = `${createHomepageUploadId()}/poster.${extension}`;
            const { error } = await bucket.upload(path, posterFile, {
                cacheControl: '3600',
                contentType: posterFile.type,
                upsert: false
            });
            if (error) throw error;
            uploadedPaths.push(path);
            changes.poster_url = bucket.getPublicUrl(path).data.publicUrl;
        }

        if (lifeServiceThumbnailFile && isLifeService && status !== 'rejected') {
            const extension = lifeServiceThumbnailFile.type === 'image/jpeg' ? 'jpg' : lifeServiceThumbnailFile.type === 'image/png' ? 'png' : 'webp';
            const path = `${createHomepageUploadId()}/life-service-thumbnail.${extension}`;
            const { error } = await bucket.upload(path, lifeServiceThumbnailFile, {
                cacheControl: '3600',
                contentType: lifeServiceThumbnailFile.type,
                upsert: false
            });
            if (error) throw error;
            uploadedPaths.push(path);
            changes.life_service_thumbnail_url = bucket.getPublicUrl(path).data.publicUrl;
        }

        if (promotionFiles.length) {
            const imageUrls = [];
            for (const [index, file] of promotionFiles.entries()) {
                const extension = file.type === 'image/jpeg' ? 'jpg' : file.type === 'image/png' ? 'png' : 'webp';
                const path = `${createHomepageUploadId()}/promo-${index + 1}.${extension}`;
                const { error } = await bucket.upload(path, file, {
                    cacheControl: '3600',
                    contentType: file.type,
                    upsert: false
                });
                if (error) throw error;
                uploadedPaths.push(path);
                imageUrls.push(bucket.getPublicUrl(path).data.publicUrl);
            }
            changes.promotion_image_urls = imageUrls;
        } else if (clearPromotionImages) {
            changes.promotion_image_urls = [];
        }
    } catch (error) {
        if (uploadedPaths.length) {
            const { error: cleanupError } = await bucket.remove(uploadedPaths);
            if (cleanupError) alert('新圖片上傳失敗，且清理未完成的圖片也失敗：' + cleanupError.message);
        }
        alert('活動圖片上傳失敗：' + (error?.message || '請檢查 event-media bucket 和 Storage policy。'));
        return;
    }

    const { error } = await supabaseClient.from('submissions').update(changes).eq('id', id);
    if (error) {
        if (uploadedPaths.length) {
            const { error: cleanupError } = await bucket.remove(uploadedPaths);
            if (cleanupError) alert('資料更新失敗，且清理新圖片也失敗：' + cleanupError.message);
        }
        alert('更新失敗：' + error.message);
        return;
    }

    const replacedImageUrls = [];
    if (posterFile || posterUrlInput !== (item.poster_url || '')) replacedImageUrls.push(item.poster_url);
    if (lifeServiceThumbnailFile || lifeServiceThumbnailUrlInput !== (item.life_service_thumbnail_url || '') || !isLifeService || status === 'rejected') {
        replacedImageUrls.push(item.life_service_thumbnail_url);
    }
    if (promotionFiles.length || clearPromotionImages) {
        replacedImageUrls.push(...(Array.isArray(item.promotion_image_urls) ? item.promotion_image_urls : []));
    }
    const oldPaths = replacedImageUrls.map(getEventMediaPath).filter(Boolean);
    let cleanupMessage = '';
    if (oldPaths.length) {
        const { error: cleanupError } = await bucket.remove(oldPaths);
        if (cleanupError) cleanupMessage = `\n新圖片及活動資料已儲存，但舊圖片清理失敗：${cleanupError.message}`;
    }

    closeEditModal();
    if (status === 'approved') alert(`活動已核准，修改內容已儲存。${cleanupMessage}`);
    else if (status === 'rejected') alert(`活動已駁回。${cleanupMessage}`);
    else alert(`活動修改已儲存。${cleanupMessage}`);
    await fetchSubmissions();
}

async function fetchSettings() {
    const { data, error } = await supabaseClient.from('site_settings').select('*');
    if (error) {
        alert('讀取條款失敗：' + error.message);
        return;
    }

    homeBlogItems = [];
    homeAdItems = [];
    homeHeroItems = [];
    calendarSpecialDays = [];
    homeServiceCategories = normalizeHomeServiceCategories([]);
    for (const item of data || []) {
        if (item.key === 'purpose_text') document.getElementById('edit-purpose').value = item.value;
        if (item.key === 'terms_text') document.getElementById('edit-terms').value = item.value;
        if (item.key === 'background_top_url') document.getElementById('background-top-url').value = item.value;
        if (item.key === 'background_middle_url') document.getElementById('background-middle-url').value = item.value;
        if (item.key === 'background_hero_outer_url') document.getElementById('background-hero-outer-url').value = item.value;
        if (item.key === 'background_page_url') document.getElementById('background-page-url').value = item.value;
        if (item.key === 'background_top_strength') document.getElementById('background-top-strength').value = item.value;
        if (item.key === 'background_middle_strength') document.getElementById('background-middle-strength').value = item.value;
        if (item.key === 'background_hero_outer_strength') document.getElementById('background-hero-outer-strength').value = item.value;
        if (item.key === 'background_page_strength') document.getElementById('background-page-strength').value = item.value;
        if (item.key === 'home_mindfulness_quote') document.getElementById('home-mindfulness-quote').value = item.value;
        if (item.key === 'home_notice_content') document.getElementById('home-notice-content').value = item.value;
        if (item.key === 'home_warm_info_content') document.getElementById('home-warm-info-content').value = item.value;
        if (item.key === 'home_mindfulness_quote_color' && /^#[0-9a-fA-F]{6}$/.test(item.value)) document.getElementById('home-quote-color').value = item.value;
        if (item.key === 'home_mindfulness_quote_weight' && ['300', '400', '500', '600', '700'].includes(item.value)) document.getElementById('home-quote-weight').value = item.value;
        if (item.key === 'home_mindfulness_quote_font' && Object.hasOwn(homeQuoteFontStacks, item.value)) document.getElementById('home-quote-font').value = item.value;
        if (item.key === 'footer_background_color' && /^#[0-9a-fA-F]{6}$/.test(item.value)) document.getElementById('footer-background-color').value = item.value;
        if (item.key === 'footer_text_color' && /^#[0-9a-fA-F]{6}$/.test(item.value)) document.getElementById('footer-text-color').value = item.value;
        if (item.key === 'home_blog_items') homeBlogItems = parseContentItems(item.value);
        if (item.key === 'home_ad_items') homeAdItems = parseContentItems(item.value);
        if (item.key === 'home_hero_items') homeHeroItems = parseContentItems(item.value);
        if (item.key === 'calendar_special_days') {
            try {
                const parsed = JSON.parse(item.value || '[]');
                calendarSpecialDays = Array.isArray(parsed)
                    ? parsed.filter(day => day && /^\d{4}-\d{2}-\d{2}$/.test(day.date) && typeof day.icon === 'string' && typeof day.title === 'string')
                    : [];
            } catch (error) {
                calendarSpecialDays = [];
                console.warn('Calendar special days are invalid:', error);
            }
        }
        if (item.key === 'home_service_categories') {
            try {
                homeServiceCategories = normalizeHomeServiceCategories(JSON.parse(item.value || '[]'));
            } catch (error) {
                homeServiceCategories = normalizeHomeServiceCategories([]);
                console.warn('Life service categories are invalid:', error);
            }
        }
    }

    updateBackgroundPreview('background-top-url', 'background-top-preview');
    updateBackgroundPreview('background-middle-url', 'background-middle-preview');
    updateBackgroundPreview('background-hero-outer-url', 'background-hero-outer-preview');
    updateBackgroundPreview('background-page-url', 'background-page-preview');
    updateAllBackgroundStrengthLabels();
    updateHomeQuoteStylePreview();
    renderHomeContentEditors();
    renderHomeServiceCategoryEditor();
    renderCalendarSpecialDaysEditor();
}

async function saveSetting(key, textareaId, label) {
    return saveSettingValue(key, document.getElementById(textareaId).value, label);
}

async function saveSettingValue(key, value, label) {
    const { error } = await supabaseClient.from('site_settings').upsert({
        key,
        value,
        updated_at: new Date().toISOString()
    }, { onConflict: 'key' });
    if (error) {
        alert(`${label}儲存失敗：` + error.message);
        return false;
    }
    alert(`${label}已儲存。`);
    return true;
}

async function saveFooterColors() {
    const updatedAt = new Date().toISOString();
    const { error } = await supabaseClient.from('site_settings').upsert([
        { key: 'footer_background_color', value: document.getElementById('footer-background-color').value, updated_at: updatedAt },
        { key: 'footer_text_color', value: document.getElementById('footer-text-color').value, updated_at: updatedAt }
    ], { onConflict: 'key' });
    if (error) {
        alert('頁尾顏色儲存失敗：' + error.message);
        return;
    }
    alert('頁尾顏色已儲存。');
}

function updateBackgroundPreview(inputId, previewId) {
    const preview = document.getElementById(previewId);
    if (preview.dataset.objectUrl) {
        URL.revokeObjectURL(preview.dataset.objectUrl);
        delete preview.dataset.objectUrl;
    }
    const imageUrl = safeImageUrl(document.getElementById(inputId).value.trim());
    if (!imageUrl) {
        preview.removeAttribute('src');
        preview.classList.add('hidden');
        return;
    }

    preview.src = imageUrl;
    preview.classList.remove('hidden');
}

function updateBackgroundFilePreview(fileInputId, urlInputId, previewId) {
    const fileInput = document.getElementById(fileInputId);
    const file = fileInput.files[0];
    if (!file) {
        updateBackgroundPreview(urlInputId, previewId);
        return;
    }

    const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type) || file.size > 10 * 1024 * 1024) {
        fileInput.value = '';
        alert('請選擇 JPG、PNG 或 WebP 圖片，檔案大小不可超過 10 MB。');
        updateBackgroundPreview(urlInputId, previewId);
        return;
    }

    const preview = document.getElementById(previewId);
    if (preview.dataset.objectUrl) URL.revokeObjectURL(preview.dataset.objectUrl);
    const objectUrl = URL.createObjectURL(file);
    preview.dataset.objectUrl = objectUrl;
    preview.src = objectUrl;
    preview.classList.remove('hidden');
}

function updateBackgroundStrengthLabel(inputId) {
    const input = document.getElementById(inputId);
    document.getElementById(`${inputId}-value`).textContent = `${input.value}%`;
}

function updateAllBackgroundStrengthLabels() {
    ['background-top-strength', 'background-middle-strength', 'background-hero-outer-strength', 'background-page-strength']
        .forEach(updateBackgroundStrengthLabel);
}

async function saveBackground(key, fileInputId, urlInputId, label) {
    const fileInput = document.getElementById(fileInputId);
    const file = fileInput.files[0];
    let imageUrl = document.getElementById(urlInputId).value.trim();

    if (file) {
        const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
        if (!validTypes.includes(file.type) || file.size > 10 * 1024 * 1024) {
            alert('請選擇 JPG、PNG 或 WebP 圖片，檔案大小不可超過 10 MB。');
            return;
        }

        const path = key === 'background_top_url' ? 'background-top' :
            key === 'background_middle_url' ? 'background-middle' :
            key === 'background_hero_outer_url' ? 'background-hero-outer' : 'background-page';
        const bucket = supabaseClient.storage.from('site-backgrounds');
        try {
            const { error } = await bucket.upload(path, file, {
                cacheControl: '60',
                contentType: file.type,
                upsert: true
            });
            if (error) {
                alert(`${label}上傳失敗：` + error.message);
                return;
            }

            imageUrl = `${bucket.getPublicUrl(path).data.publicUrl}?v=${Date.now()}`;
            document.getElementById(urlInputId).value = imageUrl;
        } catch (error) {
            alert(`${label}上傳失敗：` + (error?.message || '無法連線至 Storage'));
            return;
        }
    }

    const strengthKey = key.replace('_url', '_strength');
    const strengthInputId = key.replace('_url', '-strength').replaceAll('_', '-');
    const updatedAt = new Date().toISOString();
    const { error } = await supabaseClient.from('site_settings').upsert([
        { key, value: imageUrl, updated_at: updatedAt },
        { key: strengthKey, value: document.getElementById(strengthInputId).value, updated_at: updatedAt }
    ], { onConflict: 'key' });
    if (error) {
        alert(`${label}儲存失敗：` + error.message);
        return;
    }

    alert(`${label}及深淺設定已儲存。`);
    fileInput.value = '';
}

function bindEvents() {
    populateAdminCategories();
    document.getElementById('login-form').addEventListener('submit', loginAdmin);
    document.getElementById('logout-btn').addEventListener('click', logoutAdmin);
    document.getElementById('refresh-btn').addEventListener('click', fetchSubmissions);
    document.getElementById('save-purpose-btn').addEventListener('click', () =>
        saveSetting('purpose_text', 'edit-purpose', '關於我們')
    );
    document.getElementById('save-terms-btn').addEventListener('click', () =>
        saveSetting('terms_text', 'edit-terms', '服務條款')
    );
    document.getElementById('save-background-top-btn').addEventListener('click', () =>
        saveBackground('background_top_url', 'background-top-file', 'background-top-url', '頂部背景圖片')
    );
    document.getElementById('save-background-middle-btn').addEventListener('click', () =>
        saveBackground('background_middle_url', 'background-middle-file', 'background-middle-url', '中部背景圖片')
    );
    document.getElementById('save-background-hero-outer-btn').addEventListener('click', () =>
        saveBackground('background_hero_outer_url', 'background-hero-outer-file', 'background-hero-outer-url', '置頂圖片框外背景')
    );
    document.getElementById('save-background-page-btn').addEventListener('click', () =>
        saveBackground('background_page_url', 'background-page-file', 'background-page-url', '主頁大背景')
    );
    document.getElementById('save-edit-btn').addEventListener('click', () => updateSubmission());
    document.getElementById('edit-poster-file').addEventListener('change', previewEditedPoster);
    document.getElementById('edit-life-service-thumbnail-file').addEventListener('change', previewEditedLifeServiceThumbnail);
    document.getElementById('edit-life-service-thumbnail-url').addEventListener('input', previewEditedLifeServiceThumbnail);
    document.getElementById('edit-poster-display-scale').addEventListener('input', updatePosterCropPreview);
    document.getElementById('edit-poster-display-position').addEventListener('input', updatePosterCropPreview);
    document.getElementById('edit-poster').addEventListener('input', () => {
        if (!document.getElementById('edit-poster-file').files.length) previewEditedPoster();
    });
    document.getElementById('edit-promotion-files').addEventListener('change', previewEditedPromotionImages);
    document.getElementById('edit-clear-promotion-images').addEventListener('change', event => {
        if (event.currentTarget.checked) {
            document.getElementById('edit-promotion-files').value = '';
            renderEventImagePreview(document.getElementById('edit-promotion-preview'), []);
        } else {
            previewEditedPromotionImages();
        }
    });
    document.getElementById('background-top-file').addEventListener('change', () =>
        updateBackgroundFilePreview('background-top-file', 'background-top-url', 'background-top-preview')
    );
    document.getElementById('background-middle-file').addEventListener('change', () =>
        updateBackgroundFilePreview('background-middle-file', 'background-middle-url', 'background-middle-preview')
    );
    document.getElementById('background-hero-outer-file').addEventListener('change', () =>
        updateBackgroundFilePreview('background-hero-outer-file', 'background-hero-outer-url', 'background-hero-outer-preview')
    );
    document.getElementById('background-page-file').addEventListener('change', () =>
        updateBackgroundFilePreview('background-page-file', 'background-page-url', 'background-page-preview')
    );
    document.getElementById('background-top-url').addEventListener('input', () =>
        updateBackgroundPreview('background-top-url', 'background-top-preview')
    );
    document.getElementById('background-middle-url').addEventListener('input', () =>
        updateBackgroundPreview('background-middle-url', 'background-middle-preview')
    );
    document.getElementById('background-hero-outer-url').addEventListener('input', () =>
        updateBackgroundPreview('background-hero-outer-url', 'background-hero-outer-preview')
    );
    document.getElementById('background-page-url').addEventListener('input', () =>
        updateBackgroundPreview('background-page-url', 'background-page-preview')
    );
    ['background-top-strength', 'background-middle-strength', 'background-hero-outer-strength', 'background-page-strength']
        .forEach(inputId => document.getElementById(inputId).addEventListener('input', () => updateBackgroundStrengthLabel(inputId)));
    document.getElementById('close-modal-btn').addEventListener('click', closeEditModal);
    document.getElementById('approve-btn').addEventListener('click', () => updateSubmission('approved'));
    document.getElementById('reject-btn').addEventListener('click', () => {
        if (confirm('確定要駁回此申請嗎？')) updateSubmission('rejected');
    });
    document.getElementById('tab-approvals').addEventListener('click', () => switchTab('approvals'));
    document.getElementById('tab-calendar').addEventListener('click', () => switchTab('calendar'));
    document.getElementById('tab-feedback').addEventListener('click', () => switchTab('feedback'));
    document.getElementById('tab-home-content').addEventListener('click', () => switchTab('home-content'));
    document.getElementById('tab-life-services').addEventListener('click', () => switchTab('life-services'));
    document.getElementById('tab-activity-curation').addEventListener('click', () => switchTab('activity-curation'));
    document.getElementById('tab-settings').addEventListener('click', () => switchTab('settings'));
    document.getElementById('tab-backgrounds').addEventListener('click', () => switchTab('backgrounds'));
    document.getElementById('refresh-feedback-btn').addEventListener('click', fetchActivityFeedback);
    document.getElementById('feedback-list').addEventListener('click', saveActivityFeedbackStatus);
    document.getElementById('refresh-curated-drafts-btn').addEventListener('click', fetchCuratedActivityDrafts);
    document.getElementById('run-curated-search-btn').addEventListener('click', runCuratedActivitySearch);
    document.getElementById('curated-drafts-list').addEventListener('click', handleCuratedDraftActions);
    document.getElementById('curated-drafts-list').addEventListener('change', updateCuratedSubcategoryOptions);
    document.getElementById('curated-drafts-list').addEventListener('change', previewCuratedPoster);
    document.getElementById('curated-drafts-list').addEventListener('input', previewCuratedPoster);
    document.getElementById('edit-category').addEventListener('change', () => {
        const selectedSubcategories = Array.from(
            document.querySelectorAll('#edit-subcategory input[name="editSubcategory"]:checked'),
            option => option.value
        );
        updateAdminSubcategoryOptions(selectedSubcategories);
    });
    document.querySelectorAll('input[name="edit-event-format"]').forEach(input => {
        input.addEventListener('change', updateAdminEventFormat);
    });
    document.getElementById('save-home-quote-btn').addEventListener('click', () =>
        saveSetting('home_mindfulness_quote', 'home-mindfulness-quote', '正念語句')
    );
    document.getElementById('save-home-notice-btn').addEventListener('click', () =>
        saveSetting('home_notice_content', 'home-notice-content', '首頁通告')
    );
    document.getElementById('save-home-warm-info-btn').addEventListener('click', () =>
        saveSetting('home_warm_info_content', 'home-warm-info-content', '首頁溫馨資訊')
    );
    document.getElementById('save-home-service-categories-btn').addEventListener('click', saveHomeServiceCategories);
    document.getElementById('home-service-category-editor').addEventListener('click', event => {
        const addButton = event.target.closest('[data-add-service-subcategory]');
        if (addButton) {
            homeServiceCategories = collectHomeServiceCategories();
            const categoryIndex = Number(addButton.dataset.addServiceSubcategory);
            const category = homeServiceCategories[categoryIndex];
            if (!category) return;
            category.subcategories.push({ id: `${category.id}-sub-${Date.now()}`, name: '' });
            renderHomeServiceCategoryEditor();
            return;
        }
        const removeButton = event.target.closest('[data-remove-service-subcategory]');
        if (!removeButton) return;
        homeServiceCategories = collectHomeServiceCategories();
        const [categoryIndex, subcategoryIndex] = removeButton.dataset.removeServiceSubcategory.split(':').map(Number);
        homeServiceCategories[categoryIndex]?.subcategories.splice(subcategoryIndex, 1);
        renderHomeServiceCategoryEditor();
    });
    document.getElementById('edit-is-life-service').addEventListener('change', updateLifeServiceAdminVisibility);
    document.getElementById('edit-life-service-category').addEventListener('change', event =>
        updateLifeServiceAdminOptions(event.currentTarget.value, '')
    );
    document.getElementById('save-home-quote-style-btn').addEventListener('click', saveHomeQuoteStyle);
    ['home-quote-color', 'home-quote-weight', 'home-quote-font'].forEach(id => {
        document.getElementById(id).addEventListener('input', updateHomeQuoteStylePreview);
        document.getElementById(id).addEventListener('change', updateHomeQuoteStylePreview);
    });
    document.getElementById('save-footer-colors-btn').addEventListener('click', saveFooterColors);
    document.getElementById('add-home-blog-btn').addEventListener('click', () => {
        homeBlogItems.push({ title: '', excerpt: '', url: '' });
        renderHomeContentEditors();
    });
    document.getElementById('save-home-blogs-btn').addEventListener('click', () => {
        saveHomepageItems('home-blog-editor', 'home_blog_items', '網誌', 'blog');
    });
    document.getElementById('home-blog-editor').addEventListener('click', event => {
        const button = event.target.closest('[data-remove-blog]');
        if (!button) return;
        homeBlogItems = collectContentRows('home-blog-editor');
        homeBlogItems.splice(Number(button.dataset.removeBlog), 1);
        renderHomeContentEditors();
    });
    document.getElementById('add-home-ad-btn').addEventListener('click', () => {
        const nextOrder = Math.max(homeAdItems.length, ...homeAdItems.map((item, index) => Number(item.order) || index + 1)) + 1;
        homeAdItems.push({ order: nextOrder, title: '', description: '', imageUrl: '', url: '' });
        renderHomeContentEditors();
    });
    document.getElementById('save-home-ads-btn').addEventListener('click', () => {
        saveHomepageItems('home-ad-editor', 'home_ad_items', '廣告', 'ad');
    });
    ['home-blog-editor', 'home-ad-editor', 'home-hero-editor'].forEach(id => {
        document.getElementById(id).addEventListener('change', updateContentImagePreview);
        document.getElementById(id).addEventListener('input', updateContentImagePreview);
    });
    document.getElementById('home-ad-editor').addEventListener('click', event => {
        const moveButton = event.target.closest('[data-move-ad]');
        if (moveButton) {
            const row = moveButton.closest('[data-content-row]');
            const index = Array.from(row.parentElement.querySelectorAll('[data-content-row]')).indexOf(row);
            moveHomeAd(index, moveButton.dataset.moveAd === 'up' ? -1 : 1);
            return;
        }
        const button = event.target.closest('[data-remove-ad]');
        if (!button) return;
        homeAdItems = Array.from(document.querySelectorAll('#home-ad-editor [data-content-row]')).map(row =>
            Object.fromEntries(Array.from(row.querySelectorAll('[data-content-field]')).map(input => [input.dataset.contentField, input.value.trim()]))
        );
        homeAdItems.splice(Number(button.dataset.removeAd), 1);
        renderHomeContentEditors();
    });
    const addHomeHero = () => {
        const template = 'basic';
        if (homeHeroItems.length >= 9) {
            alert('首頁置頂內容最多設定 9 張。');
            return;
        }
        homeHeroItems = collectContentRows('home-hero-editor');
        homeHeroItems.push({
            pageId: `hero-${createHomepageUploadId()}`,
            template,
            order: homeHeroItems.length + 1,
            title: '',
            description: '',
            imageUrl: '',
            mobileImageUrl: '',
            frameUrl: '',
            mobileFrameUrl: '',
            details: { highlights: {}, tabs: {}, members: [] }
        });
        renderHomeContentEditors();
    };
    document.getElementById('add-home-hero-btn').addEventListener('click', addHomeHero);
    const saveAllHeroButtons = ['save-home-hero-btn', 'save-home-hero-top-btn'].map(id => document.getElementById(id));
    const saveAllHeroes = async () => {
        if (saveAllHeroButtons.some(button => button.disabled)) return;
        saveAllHeroButtons.forEach(button => {
            button.disabled = true;
            button.textContent = '儲存中…';
        });
        try {
            await saveHomepageItems('home-hero-editor', 'home_hero_items', '置頂圖片', 'hero');
        } finally {
            saveAllHeroButtons.forEach(button => {
                button.disabled = false;
                button.textContent = '儲存全部置頂內容';
            });
        }
    };
    saveAllHeroButtons.forEach(button => button.addEventListener('click', saveAllHeroes));
    document.getElementById('cancel-hero-crop-btn').addEventListener('click', () => closeHeroImageCropper(true));
    document.getElementById('apply-hero-crop-btn').addEventListener('click', applyHeroImageCrop);
    document.getElementById('hero-crop-modal').addEventListener('click', event => {
        if (event.target.id === 'hero-crop-modal') closeHeroImageCropper(true);
    });
    document.getElementById('home-hero-editor').addEventListener('click', event => {
        const richStyle = event.target.closest('[data-rich-style]');
        if (richStyle) return;
        const richCommand = event.target.closest('[data-rich-command]');
        if (richCommand) {
            const editor = document.getElementById(richCommand.dataset.editor);
            restoreHeroRichEditorSelection(editor);
            editor.focus();
            document.execCommand(richCommand.dataset.richCommand, false, richCommand.dataset.commandValue || null);
            saveHeroRichEditorSelection(editor);
            editor.dispatchEvent(new Event('input', { bubbles: true }));
            return;
        }
        const richLink = event.target.closest('[data-rich-link]');
        if (richLink) {
            openHeroRichInsertDialog(document.getElementById(richLink.dataset.editor), 'link');
            return;
        }
        const richImage = event.target.closest('[data-rich-image]');
        if (richImage) {
            openHeroRichInsertDialog(document.getElementById(richImage.dataset.editor), 'image');
            return;
        }
        const richTable = event.target.closest('[data-rich-table]');
        if (richTable) {
            openHeroRichInsertDialog(document.getElementById(richTable.dataset.editor), 'table');
            return;
        }
        const addMemberButton = event.target.closest('[data-add-team-member]');
        if (addMemberButton) {
            const row = addMemberButton.closest('[data-content-row]');
            const memberCards = row.querySelectorAll('[data-team-member]');
            if (memberCards.length >= 8) return;
            row.querySelector('[data-team-members]').insertAdjacentHTML('beforeend', renderHeroTeamMember({}, memberCards.length));
            updateHeroTeamMemberIndexes(row);
            return;
        }
        const clearSmartLayout = event.target.closest('[data-clear-smart-layout]');
        if (clearSmartLayout) {
            const row = clearSmartLayout.closest('[data-content-row]');
            row.querySelector('[data-content-field="smartLayoutJson"]').value = '';
            alert('已移除智慧排版草稿；請儲存此內容以更新網站。');
            return;
        }
        const removeImageButton = event.target.closest('[data-remove-hero-image]');
        if (removeImageButton) {
            const container = removeImageButton.closest('[data-hero-image-field], [data-team-member]');
            const urlInput = container.querySelector('[data-content-field][type="url"], [data-team-member-image-url]');
            const fileInput = container.querySelector('[data-content-image]');
            const preview = container.querySelector('[data-content-preview]');
            urlInput.value = '';
            fileInput.value = '';
            if (preview.dataset.objectUrl) {
                URL.revokeObjectURL(preview.dataset.objectUrl);
                delete preview.dataset.objectUrl;
            }
            preview.removeAttribute('src');
            preview.classList.add('hidden');
            urlInput.dispatchEvent(new Event('input', { bubbles: true }));
            return;
        }
        const removeMemberButton = event.target.closest('[data-remove-team-member]');
        if (removeMemberButton) {
            const row = removeMemberButton.closest('[data-content-row]');
            removeMemberButton.closest('[data-team-member]').remove();
            updateHeroTeamMemberIndexes(row);
            return;
        }
        const saveButton = event.target.closest('[data-save-hero]');
        if (saveButton) {
            const row = saveButton.closest('[data-content-row]');
            saveHomepageItems('home-hero-editor', 'home_hero_items', '置頂內容', 'hero', row);
            return;
        }
        const aiButton = event.target.closest('[data-hero-ai]');
        if (aiButton) {
            requestHeroAiDesign(Number(aiButton.dataset.heroAi));
            return;
        }
        const showPreview = event.target.closest('[data-show-hero-ai-preview]');
        if (showPreview) {
            showPreview.closest('[data-content-row]').querySelector('[data-hero-ai-preview]').classList.remove('hidden');
            return;
        }
        const button = event.target.closest('[data-remove-hero]');
        if (!button) return;
        homeHeroItems = collectContentRows('home-hero-editor');
        homeHeroItems.splice(Number(button.dataset.removeHero), 1);
        renderHomeContentEditors();
    });
    document.getElementById('home-hero-editor').addEventListener('input', event => {
        const row = event.target.closest('[data-home-hero-card]');
        if (!row) return;
        if (event.target.matches('[data-rich-editor]')) {
            const field = event.target.parentElement.querySelector('[data-rich-value]');
            if (field) field.value = event.target.innerHTML;
            saveHeroRichEditorSelection(event.target);
            return;
        }
        const range = event.target.closest('[data-content-field="pageBackgroundScale"], [data-content-field="pageBackgroundPosition"]');
        if (range) {
            const output = row.querySelector(`[data-hero-range-output="${range.dataset.contentField}"]`);
            if (output) output.value = `${range.value}%`;
            if (output) output.textContent = `${range.value}%`;
            return;
        }
        if (event.target.matches('[data-team-member-field], [data-team-member-image-url]')) updateHeroTeamMemberIndexes(row);
    });
    document.getElementById('home-hero-editor').addEventListener('mousedown', event => {
        const toolbarControl = event.target.closest('[data-rich-command], [data-rich-link], [data-rich-image], [data-rich-table], [data-rich-style], [data-rich-cell-style]');
        if (!toolbarControl) return;
        const editor = document.getElementById(toolbarControl.dataset.editor);
        saveHeroRichEditorSelection(editor);
        if (toolbarControl.tagName !== 'SELECT') event.preventDefault();
    });
    document.getElementById('home-hero-editor').addEventListener('change', event => {
        const row = event.target.closest('[data-home-hero-card]');
        if (row && event.target.matches('[data-content-field="template"]')) {
            row.querySelector('[data-hero-custom-options]').classList.toggle('hidden', event.target.value !== 'custom');
            return;
        }
        if (row && event.target.matches('[data-team-member-field="memberType"]')) {
            updateHeroTeamMemberIndexes(row);
            return;
        }
        const cellControl = event.target.closest('[data-rich-cell-style]');
        if (cellControl && cellControl.value) {
            applyHeroRichCellAlignment(
                document.getElementById(cellControl.dataset.editor),
                cellControl.dataset.richCellStyle,
                cellControl.value
            );
            cellControl.value = '';
            return;
        }
        const control = event.target.closest('[data-rich-style]');
        if (!control || !control.value) return;
        const editor = document.getElementById(control.dataset.editor);
        applyHeroRichStyle(editor, control.dataset.richStyle, control.value);
        control.value = '';
    });
    document.getElementById('home-hero-editor').addEventListener('paste', async event => {
        const editor = event.target.closest('[data-rich-editor]');
        if (!editor) return;
        const imageItem = Array.from(event.clipboardData?.items || []).find(item => item.kind === 'file' && item.type.startsWith('image/'));
        if (!imageItem) return;
        const file = imageItem.getAsFile();
        if (!file) return;
        event.preventDefault();
        openHeroRichImageCropper(file, editor, file.name || '剪貼簿圖片');
    });
    document.getElementById('home-hero-editor').addEventListener('dragover', event => {
        const editor = event.target.closest('[data-rich-editor]');
        if (!editor || !Array.from(event.dataTransfer?.types || []).includes('Files')) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
    });
    document.getElementById('home-hero-editor').addEventListener('drop', event => {
        const editor = event.target.closest('[data-rich-editor]');
        if (!editor) return;
        const files = Array.from(event.dataTransfer?.files || []);
        if (!files.length) return;
        event.preventDefault();
        const file = files.find(item => validHomepageImageTypes.has(item.type));
        if (!file) {
            alert('拖放圖片請使用 JPG、PNG 或 WebP 格式。');
            return;
        }
        const pointRange = document.caretRangeFromPoint?.(event.clientX, event.clientY);
        const caretPosition = document.caretPositionFromPoint?.(event.clientX, event.clientY);
        const range = pointRange || (caretPosition ? (() => {
            const result = document.createRange();
            result.setStart(caretPosition.offsetNode, caretPosition.offset);
            result.collapse(true);
            return result;
        })() : null);
        if (range && editor.contains(range.startContainer)) {
            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(range);
            heroRichEditorSelections.set(editor.id, range.cloneRange());
        } else {
            saveHeroRichEditorSelection(editor);
        }
        openHeroRichImageCropper(file, editor, file.name || '拖放圖片');
    });
    document.getElementById('home-hero-editor').addEventListener('pointerup', event => {
        if (event.target.matches('[data-rich-editor] img.rich-editor-image')) {
            event.target.closest('[data-rich-editor]').dispatchEvent(new Event('input', { bubbles: true }));
        }
    });
    const heroRichInsertDialog = document.getElementById('hero-rich-insert-dialog');
    const closeHeroRichInsertDialog = () => heroRichInsertDialog.close();
    document.getElementById('hero-rich-insert-cancel').addEventListener('click', closeHeroRichInsertDialog);
    heroRichInsertDialog.querySelector('[data-rich-insert-cancel]').addEventListener('click', closeHeroRichInsertDialog);
    document.getElementById('hero-rich-insert-form').addEventListener('submit', async event => {
        event.preventDefault();
        const insertType = heroRichInsertDialog.dataset.insertType;
        const editor = document.getElementById(heroRichInsertDialog.dataset.editorId);
        if (insertType === 'table') {
            const rows = Number(document.getElementById('hero-rich-insert-rows').value);
            const columns = Number(document.getElementById('hero-rich-insert-columns').value);
            if (!Number.isInteger(rows) || rows < 1 || rows > 20 || !Number.isInteger(columns) || columns < 1 || columns > 10) {
                alert('表格列數請輸入 1 至 20 列、1 至 10 欄。');
                return;
            }
            if (insertHeroRichTable(editor, rows, columns)) heroRichInsertDialog.close();
            return;
        }
        const insertButton = heroRichInsertDialog.querySelector('[type="submit"]');
        insertButton.disabled = true;
        let uploaded = null;
        try {
            let url = '';
            if (insertType === 'image') {
                const file = document.getElementById('hero-rich-insert-file').files[0];
                const enteredUrl = document.getElementById('hero-rich-insert-url').value.trim();
                if (file) {
                    openHeroRichImageCropper(file, editor, document.getElementById('hero-rich-insert-alt').value.trim() || file.name);
                    heroRichInsertDialog.close();
                    return;
                } else {
                    url = safeImageUrl(enteredUrl);
                    if (!url || !url.startsWith('https://')) throw new Error('請選擇圖片檔案，或輸入有效的 HTTPS 圖片網址。');
                }
            } else {
                url = safeImageUrl(document.getElementById('hero-rich-insert-url').value.trim());
                if (!url || !url.startsWith('https://')) throw new Error('網址必須是有效的 HTTPS 網址。');
            }
            const inserted = insertHeroRichContent(
                editor,
                insertType,
                url,
                document.getElementById('hero-rich-insert-text').value.trim(),
                document.getElementById('hero-rich-insert-alt').value.trim()
            );
            if (!inserted && uploaded) {
                await uploaded.bucket.remove([uploaded.path]);
                uploaded = null;
            }
            if (inserted) heroRichInsertDialog.close();
        } catch (error) {
            if (uploaded) {
                const { error: cleanupError } = await uploaded.bucket.remove([uploaded.path]);
                if (cleanupError) console.error('Rich image cleanup failed:', cleanupError.message);
            }
            alert(error.message || '插入圖片時發生錯誤。');
        } finally {
            insertButton.disabled = false;
        }
    });
    submissionsList.addEventListener('click', toggleSubmissionVisibility);
    document.getElementById('submission-status-filters').addEventListener('click', event => {
        const button = event.target.closest('[data-submission-filter]');
        if (!button) return;
        activeSubmissionFilter = button.dataset.submissionFilter;
        renderSubmissionStatusFilters();
        fetchSubmissions();
    });
    document.getElementById('curated-draft-status-filters').addEventListener('click', event => {
        const button = event.target.closest('[data-curated-filter]');
        if (!button) return;
        activeCuratedDraftFilter = button.dataset.curatedFilter;
        renderCuratedActivityDrafts();
    });
    document.getElementById('calendar-edit-list').addEventListener('click', toggleSubmissionVisibility);
    document.getElementById('calendar-edit-days').addEventListener('click', event => {
        const button = event.target.closest('[data-admin-date]');
        if (!button) return;
        selectedCalendarEditDate = button.dataset.adminDate;
        renderCalendarEditor();
    });
    document.getElementById('calendar-edit-list').addEventListener('click', saveCalendarEvent);
    document.getElementById('add-calendar-special-day').addEventListener('click', () => {
        calendarSpecialDays = collectCalendarSpecialDays();
        calendarSpecialDays.push({ date: '', icon: '🎉', title: '' });
        renderCalendarSpecialDaysEditor();
    });
    document.getElementById('calendar-special-days-editor').addEventListener('click', event => {
        const button = event.target.closest('[data-remove-calendar-special-day]');
        if (!button) return;
        calendarSpecialDays = collectCalendarSpecialDays();
        calendarSpecialDays.splice(Number(button.dataset.removeCalendarSpecialDay), 1);
        renderCalendarSpecialDaysEditor();
    });
    document.getElementById('save-calendar-special-days').addEventListener('click', saveCalendarSpecialDays);
    document.getElementById('calendar-edit-clear').addEventListener('click', () => {
        selectedCalendarEditDate = '';
        renderCalendarEditor();
    });
    document.getElementById('calendar-edit-prev').addEventListener('click', () => {
        calendarEditMonth--;
        if (calendarEditMonth < 0) {
            calendarEditMonth = 11;
            calendarEditYear--;
        }
        selectedCalendarEditDate = '';
        renderCalendarEditor();
    });
    document.getElementById('calendar-edit-next').addEventListener('click', () => {
        calendarEditMonth++;
        if (calendarEditMonth > 11) {
            calendarEditMonth = 0;
            calendarEditYear++;
        }
        selectedCalendarEditDate = '';
        renderCalendarEditor();
    });
    submissionsList.addEventListener('click', event => {
        const documentButton = event.target.closest('[data-view-identity-document]');
        if (documentButton) {
            openIdentityDocument(documentButton.dataset.viewIdentityDocument);
            return;
        }
        const verifyButton = event.target.closest('[data-verify-identity]');
        if (verifyButton) {
            verifySubmissionIdentity(verifyButton.dataset.verifyIdentity);
            return;
        }
        const button = event.target.closest('[data-edit-id]');
        if (!button) return;
        const item = submissions.find(submission => String(submission.id) === button.dataset.editId);
        if (item) openEditModal(item);
    });
}

supabaseClient.auth.onAuthStateChange(event => {
    if (event === 'SIGNED_OUT') showLogin();
});

document.addEventListener('DOMContentLoaded', () => {
    bindEvents();
    checkLogin();
});