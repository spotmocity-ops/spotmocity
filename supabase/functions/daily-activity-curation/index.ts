type SearchResult = {
    title?: string;
    url?: string;
    content?: string;
    published_date?: string;
};

type ActivitySuggestion = {
    title?: string;
    org_name?: string;
    description?: string;
    promo_copy?: string;
    category?: string;
    subcategory?: string;
    age_range?: string;
    event_start?: string;
    event_end?: string;
    event_format?: string;
    location?: string;
    fee?: string;
    image_url?: string;
    source_url?: string;
    source_title?: string;
};

const categories = [
    { value: 'limited_offers', label: '限時優惠', subcategories: ['dining_drinks', 'experience_discounts', 'brand_popups', 'exclusive_benefits'] },
    { value: 'leisure', label: '精彩休閒', subcategories: ['exhibitions', 'markets', 'festivals', 'outdoors', 'art_exchange'] },
    { value: 'adult_social', label: '凝聚連結', subcategories: ['boardgames', 'deep_talk', 'wine_tasting', 'sound_healing', 'handicrafts', 'pet_socializing', 'reading_club'] },
    { value: 'senior_community', label: '樂齡與社區', subcategories: ['wellness_fitness', 'interest_classes', 'community_volunteering', 'parent_child_activities'] },
    { value: 'business_networking', label: '創業與交流', subcategories: ['small_communities', 'entrepreneurs', 'salons', 'cross_industry'] },
    { value: 'competitions_calls', label: '賽事與徵件', subcategories: ['arts_design', 'business_entrepreneurship', 'performing_arts_music', 'sports_esports', 'academic_stem'] },
    { value: 'school_education', label: '家庭與學校', subcategories: ['school_directory', 'campus_open_days', 'education_talks', 'mind_support'] },
    { value: 'learning_certificates', label: '學習與證書', subcategories: ['professional_certifications', 'language_exam_prep', 'visual_design_multimedia', 'wellness_professional_certification', 'tutoring_subject_support', 'practical_skills_growth', 'artificial_intelligence'] }
];

function macauDate(): string {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Macau',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).formatToParts(new Date());
    const values = Object.fromEntries(parts.filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
}

function safeHttpsUrl(value: unknown): string {
    try {
        const url = new URL(String(value ?? ''));
        if (url.protocol !== 'https:') return '';
        url.hash = '';
        return url.href;
    } catch {
        return '';
    }
}

function normalizeLocalDateTime(value: unknown): string | null {
    const match = String(value ?? '').trim().match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(?::\d{2})?$/);
    if (!match) return null;
    const parts = `${match[1]} ${match[2]}`.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/);
    if (!parts) return null;
    const [, year, month, day, hour, minute] = parts.map(Number);
    const date = new Date(Date.UTC(year, month - 1, day, hour, minute));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 ||
        date.getUTCDate() !== day || date.getUTCHours() !== hour || date.getUTCMinutes() !== minute) return null;
    return `${match[1]} ${match[2]}`;
}

function safeText(value: unknown, maximumLength: number): string {
    return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, maximumLength);
}

function getSupabaseServiceKey(): string | undefined {
    const secretKeys = Deno.env.get('SUPABASE_SECRET_KEYS');
    if (secretKeys) {
        try {
            const parsed: unknown = JSON.parse(secretKeys);
            if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
                const defaultKey = (parsed as Record<string, unknown>).default;
                if (typeof defaultKey === 'string' && defaultKey) return defaultKey;
            }
            console.error('SUPABASE_SECRET_KEYS does not contain a default key');
        } catch (error) {
            console.error('Could not parse SUPABASE_SECRET_KEYS:', error);
        }
    }
    return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
}

const macauCultureEventsFeed = 'https://www.icm.gov.mo/rss/files/rssEvents_C.xml';
const macauTourismWhatsonApi = 'https://www.macaotourism.gov.mo/api/enf/whatson';
const macauTourismWhatsonPage = 'https://www.macaotourism.gov.mo/zh-hant/events/whatson';
const ticketingSources = [
    { baseUrl: 'https://www.macauticket.com', label: '澳門售票網', organization: '澳門售票網' },
    { baseUrl: 'https://ticketing.enjoymacao.mo', label: '享澳門售票網', organization: '享澳門售票網' }
];

function decodeXml(value: string): string {
    return value.replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)))
        .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, '&')
        .replace(/&mdash;/gi, '—')
        .replace(/&ndash;/gi, '–')
        .replace(/&ldquo;/gi, '“')
        .replace(/&rdquo;/gi, '”')
        .replace(/&lsquo;/gi, '‘')
        .replace(/&rsquo;/gi, '’')
        .replace(/&hellip;/gi, '…')
        .replace(/&nbsp;/gi, ' ');
}

function readXmlTag(xml: string, tag: string): string {
    const match = xml.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}\\s*>`, 'i'));
    return match ? decodeXml(match[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')).trim() : '';
}

function plainText(value: string): string {
    return decodeXml(value).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function parseFeedDateRange(description: string, today: string): { start: string | null; end: string | null } {
    const text = plainText(description);
    const datePattern = /(?:(\d{4})年\s*)?(\d{1,2})月(\d{1,2})日|(?:(\d{4})年\s*)?(\d{1,2})[\/.-](\d{1,2})/g;
    const formatDate = (date: Date) => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
    const listedDays = text.match(/^\s*[\[（(]?\s*(\d{1,2})\s*[,，、]\s*(\d{1,2})\s*\/\s*(\d{1,2})/);
    if (listedDays) {
        const [, firstDayText, lastDayText, monthText] = listedDays;
        const year = Number(today.slice(0, 4));
        const month = Number(monthText);
        const firstDay = Number(firstDayText);
        const lastDay = Number(lastDayText);
        const startDate = new Date(Date.UTC(year, month - 1, firstDay));
        const endDate = new Date(Date.UTC(year, month - 1, lastDay));
        if (startDate.getUTCFullYear() === year && startDate.getUTCMonth() === month - 1 &&
            startDate.getUTCDate() === firstDay && endDate.getUTCFullYear() === year &&
            endDate.getUTCMonth() === month - 1 && endDate.getUTCDate() === lastDay && endDate >= startDate) {
            return { start: formatDate(startDate), end: formatDate(endDate) };
        }
    }
    const matches = [...text.matchAll(datePattern)];
    if (!matches.length) return { start: null, end: null };

    const first = matches[0];
    const startYear = Number(first[1] || first[4] || today.slice(0, 4));
    const startMonth = Number(first[2] || first[6]);
    const startDay = Number(first[3] || first[5]);
    const startDate = new Date(Date.UTC(startYear, startMonth - 1, startDay));
    if (startDate.getUTCFullYear() !== startYear || startDate.getUTCMonth() !== startMonth - 1 ||
        startDate.getUTCDate() !== startDay) return { start: null, end: null };

    let endDate = startDate;
    const rangeText = text.slice(first.index! + first[0].length, matches[1]?.index ?? first.index! + first[0].length + 1);
    if (matches[1] && /至|到|[-–—]/.test(rangeText)) {
        const second = matches[1];
        const endYear = Number(second[1] || second[4] || first[1] || first[4] || startYear);
        const endMonth = Number(second[2] || second[6]);
        const endDay = Number(second[3] || second[5]);
        endDate = new Date(Date.UTC(endYear, endMonth - 1, endDay));
        let expectedEndYear = endYear;
        if (endDate.getTime() < startDate.getTime() && startMonth >= 11 && endMonth <= 2 &&
            !second[1] && !second[4]) {
            expectedEndYear += 1;
            endDate = new Date(Date.UTC(expectedEndYear, endMonth - 1, endDay));
        }
        if (endDate.getUTCFullYear() !== expectedEndYear || endDate.getUTCMonth() !== endMonth - 1 ||
            endDate.getUTCDate() !== endDay || endDate.getTime() < startDate.getTime()) {
            endDate = startDate;
        }
    }

    return { start: formatDate(startDate), end: formatDate(endDate) };
}

function classifyOfficialEvent(title: string): { category: string; subcategory: string } {
    if (/親子|兒童|幼兒/.test(title)) return { category: 'senior_community', subcategory: 'parent_child_activities' };
    if (/講座|工作坊|課程|培訓|學堂/.test(title)) return { category: 'learning_certificates', subcategory: 'practical_skills_growth' };
    if (/市集|市場合|墟/.test(title)) return { category: 'leisure', subcategory: 'markets' };
    if (/音樂|演出|劇|音樂會|演奏/.test(title)) return { category: 'leisure', subcategory: 'festivals' };
    if (/節|巡遊|嘉年華/.test(title)) return { category: 'leisure', subcategory: 'festivals' };
    if (/展|書展|展覽/.test(title)) return { category: 'leisure', subcategory: 'exhibitions' };
    return { category: 'leisure', subcategory: 'art_exchange' };
}

async function searchOfficialActivities(): Promise<{
    suggestions: ActivitySuggestion[];
    sources: SearchResult[];
}> {
    const today = macauDate();
    const sourceResults = await Promise.allSettled([
        searchCultureBureauActivities(today),
        searchTourismBureauActivities(today),
        ...ticketingSources.map(source => searchTicketingSiteActivities(
            source.baseUrl, source.label, source.organization, today
        ))
    ]);
    const candidates: Array<{ suggestion: ActivitySuggestion; source: SearchResult; publishedAt: number }> = [];
    const sourceNames = [
        '澳門文化局官方活動 RSS',
        '澳門旅遊局官方活動資料',
        ...ticketingSources.map(source => `${source.label}公開活動清單`)
    ];
    let successfulSources = 0;
    for (const [index, result] of sourceResults.entries()) {
        if (result.status === 'fulfilled') {
            successfulSources++;
            candidates.push(...result.value);
        } else {
            console.error(`${sourceNames[index]} 搜集失敗：`, result.reason);
        }
    }
    if (!successfulSources) throw new Error('澳門文化局及旅遊局官方活動來源均無法讀取，請稍後重試。');
    const uniqueByUrl = new Map(candidates.map(item => [item.source.url, item]));
    const uniqueByTitleAndDates = new Map<string, (typeof candidates)[number]>();
    for (const item of uniqueByUrl.values()) {
        const titleKey = safeText(item.suggestion.title, 200).toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '');
        const dateKey = `${item.suggestion.event_start?.slice(0, 10) || ''}:${item.suggestion.event_end?.slice(0, 10) || ''}`;
        const key = `${titleKey}:${dateKey}`;
        if (titleKey && !uniqueByTitleAndDates.has(key)) uniqueByTitleAndDates.set(key, item);
    }
    const uniqueCandidates = [...uniqueByTitleAndDates.values()]
        .sort((first, second) =>
            String(first.suggestion.event_start || '').localeCompare(String(second.suggestion.event_start || '')) ||
            second.publishedAt - first.publishedAt
        );
    return {
        suggestions: uniqueCandidates.map(item => item.suggestion),
        sources: uniqueCandidates.map(item => item.source)
    };
}

async function fetchText(url: string, label: string): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    let response: Response;
    try {
        response = await fetch(url, {
            headers: { Accept: 'application/json, application/rss+xml, application/xml, text/xml' },
            signal: controller.signal
        });
        if (!response.ok) throw new Error(`${label}回應錯誤 (${response.status})`);
        return await response.text();
    } catch (error) {
        console.error(`Could not fetch ${label}:`, error);
        throw new Error(`無法讀取${label}，請稍後重試。`);
    } finally {
        clearTimeout(timeout);
    }
}

async function searchCultureBureauActivities(today: string): Promise<Array<{ suggestion: ActivitySuggestion; source: SearchResult; publishedAt: number }>> {
    const feedXml = await fetchText(macauCultureEventsFeed, '澳門文化局官方活動 RSS');
    if (feedXml.length > 1_000_000) throw new Error('澳門文化局活動 RSS 超過允許大小，已停止處理。');
    if (!/<rss\b/i.test(feedXml)) throw new Error('澳門文化局活動 RSS 格式無效。');

    const items = [...feedXml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item\s*>/gi)].map(match => match[1]);
    const candidates: Array<{ suggestion: ActivitySuggestion; source: SearchResult; publishedAt: number }> = [];
    for (const item of items) {
        const title = safeText(plainText(readXmlTag(item, 'title')), 200);
        const rawUrl = readXmlTag(item, 'link');
        const url = safeHttpsUrl(rawUrl.replace(/^http:\/\/www\.icm\.gov\.mo\//i, 'https://www.icm.gov.mo/'));
        const description = safeText(plainText(readXmlTag(item, 'description')), 1600);
        if (!title || !url || new URL(url).hostname !== 'www.icm.gov.mo' || !url.includes('/events/detail/')) continue;
        const dateRange = parseFeedDateRange(description, today);
        if (!dateRange.end || dateRange.end < today) continue;
        const category = classifyOfficialEvent(title);
        const source = { url, title, content: description };
        candidates.push({
            publishedAt: Date.parse(readXmlTag(item, 'pubDate')) || 0,
            source,
            suggestion: {
                title,
                org_name: '澳門文化局',
                description,
                promo_copy: '',
                category: category.category,
                subcategory: category.subcategory,
                age_range: '',
                event_start: dateRange.start ? `${dateRange.start} 00:00` : '',
                event_end: dateRange.end ? `${dateRange.end} 23:59` : '',
                event_format: 'offline',
                location: '',
                fee: '',
                image_url: '',
                source_url: url,
                source_title: title
            }
        });
    }
    return candidates;
}

function isValidIsoDate(value: unknown): value is string {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function parseTicketDateRange(value: unknown, today: string): { start: string; end: string } | null {
    const text = safeText(value, 120);
    const match = text.match(/^\s*(?:(\d{4})\s*\/)?(\d{1,2})\s*\/\s*(\d{1,2})(?:\s*[-~至–—]\s*(?:(\d{4})\s*\/)?(?:(\d{1,2})\s*\/\s*)?(\d{1,2}))?/);
    if (!match) return null;
    const [, startYearText, startMonthText, startDayText, endYearText, endMonthText, endDayText] = match;
    const startYear = Number(startYearText || today.slice(0, 4));
    const startMonth = Number(startMonthText);
    const startDay = Number(startDayText);
    const startDate = new Date(Date.UTC(startYear, startMonth - 1, startDay));
    if (startDate.getUTCFullYear() !== startYear || startDate.getUTCMonth() !== startMonth - 1 ||
        startDate.getUTCDate() !== startDay) return null;

    const endYear = Number(endYearText || startYear);
    const endMonth = Number(endMonthText || startMonth);
    const endDay = Number(endDayText || startDay);
    let expectedEndYear = endYear;
    let endDate = new Date(Date.UTC(endYear, endMonth - 1, endDay));
    if (endDate < startDate && startMonth >= 11 && endMonth <= 2 && !endYearText) {
        expectedEndYear++;
        endDate = new Date(Date.UTC(expectedEndYear, endMonth - 1, endDay));
    }
    if (endDate.getUTCFullYear() !== expectedEndYear || endDate.getUTCMonth() !== endMonth - 1 ||
        endDate.getUTCDate() !== endDay || endDate < startDate) return null;
    const formatDate = (date: Date) => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
    return { start: formatDate(startDate), end: formatDate(endDate) };
}

function classifyTicketActivity(title: string, type: string): { category: string; subcategory: string } {
    if (/體育|運動/.test(type)) return { category: 'competitions_calls', subcategory: 'sports_esports' };
    if (/音樂|戲劇|舞蹈|綜合節目|節目盛事/.test(type)) return { category: 'leisure', subcategory: 'festivals' };
    if (/展覽|展/.test(type)) return { category: 'leisure', subcategory: 'exhibitions' };
    return classifyOfficialEvent(title);
}

async function searchTicketingSiteActivities(
    baseUrl: string,
    label: string,
    organization: string,
    today: string
): Promise<Array<{ suggestion: ActivitySuggestion; source: SearchResult; publishedAt: number }>> {
    const html = await fetchText(`${baseUrl}/`, `${label}公開活動清單`);
    if (html.length > 5_000_000) throw new Error(`${label}頁面超過允許大小，已停止處理。`);
    const nextData = html.match(/<script\b(?=[^>]*\bid=["']__NEXT_DATA__["'])[^>]*>([\s\S]*?)<\/script\s*>/i)?.[1];
    if (!nextData) throw new Error(`${label}頁面沒有可讀取的公開活動清單。`);
    let parsed: unknown;
    try {
        parsed = JSON.parse(nextData);
    } catch {
        throw new Error(`${label}公開活動清單格式無效。`);
    }
    const pageProps = (parsed as { props?: { pageProps?: Record<string, unknown> } } | null)?.props?.pageProps;
    const showList = pageProps?.showListData;
    if (!Array.isArray(showList)) throw new Error(`${label}頁面缺少公開活動清單。`);

    const candidates: Array<{ suggestion: ActivitySuggestion; source: SearchResult; publishedAt: number }> = [];
    for (const result of showList) {
        if (typeof result !== 'object' || result === null) continue;
        const item = result as Record<string, unknown>;
        const programCode = safeText(item.ProCode, 40);
        const title = safeText(plainText(String(item.ProName1 ?? '')), 200);
        const dateRange = parseTicketDateRange(item.ShowDate, today);
        if (!programCode || !title || !dateRange || dateRange.end < today) continue;
        const sourceUrl = `${baseUrl}/programme/${encodeURIComponent(programCode)}`;
        const type = safeText(item.ProType, 100);
        const category = classifyTicketActivity(title, type);
        const time = String(item.ShowDate ?? '').match(/\b(\d{1,2}:\d{2})\b/)?.[1] || '00:00';
        const rawFee = safeText(item.Price, 120);
        const fee = /免費|(?:MOP\s*)?\$\s*\d/i.test(rawFee) ? rawFee : '';
        const source = { url: sourceUrl, title, content: type };
        candidates.push({
            publishedAt: Date.parse(`${dateRange.start}T${time}:00+08:00`) || 0,
            source,
            suggestion: {
                title,
                org_name: organization,
                description: type ? `節目類型：${type}。詳情及最新安排請以官方售票頁為準。` : '',
                promo_copy: '',
                category: category.category,
                subcategory: category.subcategory,
                age_range: '',
                event_start: `${dateRange.start} ${time}`,
                event_end: `${dateRange.end} 23:59`,
                event_format: 'offline',
                location: '',
                fee,
                image_url: '',
                source_url: sourceUrl,
                source_title: title
            }
        });
    }
    return candidates;
}

function classifyTourismEvent(title: string, typeNames: string[]): { category: string; subcategory: string } {
    const text = `${title} ${typeNames.join(' ')}`;
    if (/親子|兒童|幼兒/.test(text)) return { category: 'senior_community', subcategory: 'parent_child_activities' };
    if (/課程|工作坊|講座|展覽|教育|學習/.test(text)) return { category: 'learning_certificates', subcategory: 'practical_skills_growth' };
    if (/體育|運動|Sports|賽車|跑步|比賽/.test(text)) return { category: 'competitions_calls', subcategory: 'sports_esports' };
    if (/市集|文創市集|手作/.test(text)) return { category: 'leisure', subcategory: 'markets' };
    if (/音樂|演出|節|嘉年華|表演/.test(text)) return { category: 'leisure', subcategory: 'festivals' };
    if (/展覽|展/.test(text)) return { category: 'leisure', subcategory: 'exhibitions' };
    return classifyOfficialEvent(title);
}

async function searchTourismBureauActivities(today: string): Promise<Array<{ suggestion: ActivitySuggestion; source: SearchResult; publishedAt: number }>> {
    const [year, month] = today.split('-').map(Number);
    const months = Array.from({ length: 3 }, (_, offset) => {
        const date = new Date(Date.UTC(year, month - 1 + offset, 1));
        return `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
    });
    const responses = await Promise.all(months.map(async monthKey => {
        const url = new URL(macauTourismWhatsonApi);
        url.searchParams.set('m', monthKey);
        url.searchParams.set('lang', 'zh-hant');
        const payload = await fetchText(url.href, '澳門旅遊局官方活動資料');
        if (payload.length > 5_000_000) throw new Error('澳門旅遊局活動資料超過允許大小，已停止處理。');
        let parsed: unknown;
        try {
            parsed = JSON.parse(payload);
        } catch {
            throw new Error('澳門旅遊局官方活動資料格式無效。');
        }
        if (typeof parsed !== 'object' || parsed === null || !Array.isArray((parsed as { results?: unknown }).results)) {
            throw new Error('澳門旅遊局官方活動資料缺少活動清單。');
        }
        return (parsed as { results: unknown[] }).results;
    }));

    const candidates: Array<{ suggestion: ActivitySuggestion; source: SearchResult; publishedAt: number }> = [];
    for (const result of responses.flat()) {
        if (typeof result !== 'object' || result === null) continue;
        const item = result as Record<string, unknown>;
        const id = safeText(item.id, 40);
        const title = safeText(plainText(String(item.name ?? '')), 200);
        const dateRanges = Array.isArray(item.eventDateRange) ? item.eventDateRange : [];
        const validRanges = dateRanges
            .filter((range): range is unknown[] => Array.isArray(range) && range.length >= 2)
            .map(range => [range[0], range[1]])
            .filter((range): range is [string, string] => isValidIsoDate(range[0]) && isValidIsoDate(range[1]) && range[0] <= range[1]);
        if (!id || !title || !validRanges.length) continue;
        const eventStart = validRanges.map(range => range[0]).sort()[0];
        const eventEnd = validRanges.map(range => range[1]).sort().at(-1)!;
        if (eventEnd < today) continue;
        const sourceUrl = `${macauTourismWhatsonPage}/${encodeURIComponent(id)}`;
        const typeNames = Array.isArray(item.types)
            ? item.types.filter(type => typeof type === 'object' && type !== null)
                .map(type => safeText((type as Record<string, unknown>).name, 80))
            : [];
        const category = classifyTourismEvent(title, typeNames);
        const location = Array.isArray(item.location)
            ? item.location.filter(place => typeof place === 'object' && place !== null)
                .map(place => safeText((place as Record<string, unknown>).name, 120)).filter(Boolean).join('、')
            : '';
        const description = safeText(plainText(String(item.shortDesc ?? '')), 1600);
        const source = { url: sourceUrl, title, content: description };
        candidates.push({
            publishedAt: eventStart === today ? Date.now() : Date.parse(`${eventStart}T00:00:00+08:00`),
            source,
            suggestion: {
                title,
                org_name: '澳門旅遊局',
                description,
                promo_copy: '',
                category: category.category,
                subcategory: category.subcategory,
                age_range: '',
                event_start: `${eventStart} 00:00`,
                event_end: `${eventEnd} 23:59`,
                event_format: 'offline',
                location,
                fee: '',
                image_url: '',
                source_url: sourceUrl,
                source_title: title
            }
        });
    }
    return candidates;
}

function prepareDraft(suggestion: ActivitySuggestion, sourceResults: SearchResult[], imageUrls: Set<string>) {
    const sourceUrl = safeHttpsUrl(suggestion.source_url);
    const source = sourceResults.find(result => safeHttpsUrl(result.url) === sourceUrl);
    const title = safeText(suggestion.title, 200);
    if (!source || !title) return null;

    const normalizedCategory = safeText(suggestion.category, 80);
    const category = categories.find(item => item.value === normalizedCategory);
    const subcategory = category?.subcategories.includes(String(suggestion.subcategory || ''))
        ? String(suggestion.subcategory)
        : null;
    const eventStart = normalizeLocalDateTime(suggestion.event_start);
    const eventEnd = normalizeLocalDateTime(suggestion.event_end);
    const endTimestamp = eventEnd ? Date.parse(`${eventEnd.replace(' ', 'T')}:00+08:00`) : NaN;
    if ((eventEnd && Number.isFinite(endTimestamp) && endTimestamp < Date.now()) ||
        (!eventEnd && eventStart && eventStart.slice(0, 10) < macauDate())) return null;
    const imageUrl = safeHttpsUrl(suggestion.image_url);
    const eventFormat = ['online', '線上'].includes(String(suggestion.event_format || '').toLowerCase())
        ? 'online'
        : 'offline';

    return {
        title,
        org_name: safeText(suggestion.org_name, 200),
        description: safeText(suggestion.description, 1600),
        promo_copy: safeText(suggestion.promo_copy, 1000),
        category: category?.value || '',
        subcategory,
        age_range: safeText(suggestion.age_range, 80) || '年齡待公布',
        event_time: eventStart,
        event_end_date: eventEnd?.slice(0, 10) || null,
        event_end_time: eventEnd,
        event_format: eventFormat,
        location: safeText(suggestion.location, 240),
        fee: safeText(suggestion.fee, 120) || '費用待公布',
        poster_url: imageUrls.has(imageUrl) ? imageUrl : '',
        candidate_image_urls: [...imageUrls].slice(0, 12),
        source_url: sourceUrl,
        source_title: safeText(suggestion.source_title || source.title, 300),
        status: 'draft' as const,
        generated_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    };
}

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-cron-secret',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

function textResponse(body: string, status: number): Response {
    return new Response(body, { status, headers: corsHeaders });
}

function jsonResponse(body: unknown, status = 200): Response {
    return Response.json(body, { status, headers: corsHeaders });
}

Deno.serve(async request => {
    if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    if (request.method !== 'POST') return textResponse('Method not allowed', 405);

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = getSupabaseServiceKey();
    if (!supabaseUrl || !serviceRoleKey) {
        console.error('Activity curation Supabase environment is not configured');
        return textResponse('Activity curation Supabase environment is not configured', 500);
    }

    const cronSecret = Deno.env.get('ACTIVITY_CURATION_CRON_SECRET');
    const cronAuthorized = Boolean(cronSecret && request.headers.get('x-cron-secret') === cronSecret);
    if (!cronAuthorized) {
        const authorization = request.headers.get('authorization') || '';
        const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
        const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || request.headers.get('apikey');
        if (!token) return textResponse('Unauthorized: a signed-in user session is required', 401);
        if (!anonKey) {
            console.error('Could not verify activity curation user: Supabase public API key is unavailable');
            return textResponse('Could not verify administrator access', 500);
        }

        const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
        const authClient = createClient(supabaseUrl, anonKey, {
            global: { headers: { Authorization: `Bearer ${token}` } },
            auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
        });
        const { data: { user }, error: authError } = await authClient.auth.getUser(token);
        if (authError || !user) {
            console.error('Could not verify activity curation user:', authError?.message || 'No authenticated user returned');
            return textResponse('Unauthorized: the user session could not be verified', 401);
        }

        const { data: isAdmin, error: adminCheckError } = await authClient.rpc('is_admin');
        if (adminCheckError) {
            console.error('Could not verify activity curation admin role:', adminCheckError.message);
            return textResponse('Could not verify administrator access', 500);
        }
        if (isAdmin !== true) return textResponse('Forbidden', 403);
    }

    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    });
    const { data: run, error: runInsertError } = await supabase
        .from('activity_curation_runs')
        .insert({ status: 'running' })
        .select('id')
        .single();
    if (runInsertError) {
        console.error('Could not create activity curation run record:', runInsertError.message);
        return textResponse('Could not record activity curation run', 500);
    }

    try {
        const { suggestions: feedSuggestions, sources: feedSources } = await searchOfficialActivities();
        const feedSourceUrls = [...new Set(feedSources.map(source => source.url).filter((url): url is string => Boolean(url)))];
        let seenSourceUrls = new Set<string>();
        if (feedSourceUrls.length) {
            const batches = [];
            for (let index = 0; index < feedSourceUrls.length; index += 50) {
                batches.push(feedSourceUrls.slice(index, index + 50));
            }
            const lookupResults = await Promise.all(batches.map(batch => supabase
                .from('activity_curation_seen_sources')
                .select('source_url')
                .in('source_url', batch)));
            const lookupError = lookupResults.find(result => result.error)?.error;
            if (lookupError) throw new Error(`無法讀取已搜集來源記錄；請先套用每日活動搜尋遷移：${lookupError.message}`);
            seenSourceUrls = new Set(lookupResults.flatMap(result =>
                (result.data || []).map((item: { source_url: string }) => item.source_url)
            ));
        }
        const suggestions = feedSuggestions
            .filter(suggestion => !seenSourceUrls.has(String(suggestion.source_url)))
            .slice(0, 5);
        const selectedSourceUrls = new Set(suggestions.map(suggestion => suggestion.source_url));
        const sources = feedSources.filter(source => selectedSourceUrls.has(source.url));
        const drafts = suggestions
            .map(suggestion => prepareDraft(suggestion, sources, new Set<string>()))
            .filter((draft): draft is NonNullable<typeof draft> => draft !== null);

        const { data: inserted, error: insertError } = drafts.length
            ? await supabase.from('curated_activity_drafts')
                .upsert(drafts, { onConflict: 'source_url,title', ignoreDuplicates: true })
                .select('id')
            : { data: [], error: null };
        if (insertError) throw new Error(`草稿儲存失敗：${insertError.message}`);

        if (drafts.length) {
            const { error: seenInsertError } = await supabase.from('activity_curation_seen_sources').upsert(
                drafts.map(draft => ({
                    source_url: draft.source_url,
                    title: draft.title,
                    first_seen_at: new Date().toISOString()
                })),
                { onConflict: 'source_url', ignoreDuplicates: true }
            );
            if (seenInsertError) throw new Error(`活動草稿已儲存，但無法記錄已搜集來源：${seenInsertError.message}`);
        }

        const { error: runUpdateError } = await supabase
            .from('activity_curation_runs')
            .update({
                completed_at: new Date().toISOString(),
                status: 'succeeded',
                found_count: drafts.length,
                inserted_count: inserted?.length || 0
            })
            .eq('id', run.id);
        if (runUpdateError) throw new Error(`搜尋完成但執行紀錄更新失敗：${runUpdateError.message}`);

        return jsonResponse({
            success: true,
            found_count: drafts.length,
            inserted_count: inserted?.length || 0
        });
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : '未知活動搜集錯誤';
        console.error('Daily activity curation failed:', errorMessage);
        const { error: runUpdateError } = await supabase
            .from('activity_curation_runs')
            .update({
                completed_at: new Date().toISOString(),
                status: 'failed',
                error_message: errorMessage.slice(0, 1000)
            })
            .eq('id', run.id);
        if (runUpdateError) console.error('Could not save activity curation failure:', runUpdateError.message);
        return jsonResponse({ error: errorMessage }, 502);
    }
});
