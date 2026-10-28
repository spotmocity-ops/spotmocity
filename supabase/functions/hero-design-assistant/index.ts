const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json; charset=utf-8'
};

function respond(body: unknown, status = 200): Response {
    return Response.json(body, { status, headers: corsHeaders });
}

function cleanText(value: unknown, maxLength: number): string {
    return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, maxLength) : '';
}

function cleanContent(value: unknown, maxLength: number): string {
    return typeof value === 'string'
        ? value.replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, maxLength)
        : '';
}

function textResponse(message: string, status: number): Response {
    return new Response(message, { status, headers: corsHeaders });
}

Deno.serve(async request => {
    if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    if (request.method !== 'POST') return textResponse('Method not allowed', 405);

    const authorization = request.headers.get('authorization') || '';
    const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || request.headers.get('apikey');
    if (!token || !supabaseUrl || !anonKey) return textResponse('需要已登入的管理員帳戶。', 401);

    try {
        const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
        const authClient = createClient(supabaseUrl, anonKey, {
            global: { headers: { Authorization: `Bearer ${token}` } },
            auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
        });
        const { data: { user }, error: authError } = await authClient.auth.getUser(token);
        if (authError || !user) return textResponse('登入狀態無效，請重新登入。', 401);
        const { data: isAdmin, error: adminError } = await authClient.rpc('is_admin');
        if (adminError) {
            console.error('Could not verify hero assistant administrator:', adminError.message);
            return textResponse('無法確認管理員權限。', 500);
        }
        if (isAdmin !== true) return textResponse('Forbidden', 403);

        const apiKey = Deno.env.get('OPENAI_API_KEY');
        if (!apiKey) return textResponse('AI 設計服務尚未設定 OPENAI_API_KEY。', 503);
        const body = await request.json().catch(() => null);
        if (!body || typeof body !== 'object') return textResponse('請提供有效的設計內容。', 400);
        const title = cleanText(body.title, 160);
        const description = cleanText(body.description, 500);
        const prompt = cleanText(body.prompt, 1200);
        if (!title && !description && !prompt) return textResponse('請先填寫標題、簡介或自訂設計要求。', 400);

        const openAiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: Deno.env.get('OPENAI_MODEL') || 'gpt-4o-mini',
                response_format: { type: 'json_object' },
                messages: [
                    {
                        role: 'system',
                        content: '你是澳門活動與品牌頁面的繁體中文內容設計助手。只輸出 JSON，不使用 HTML，不捏造價格、地址、日期、獎項、人物或承諾；沒有資料時留空。JSON 欄位為 headline, subtitle, ctaLabel, customTheme(light|warm|dark), highlights(ticket,audience,award,venue), tabs(highlights,schedule,faq), members(array of name,role,bio,imageUrl)。'
                    },
                    {
                        role: 'user',
                        content: JSON.stringify({ title, description, designRequest: prompt })
                    }
                ],
                max_tokens: 1200
            })
        });
        if (!openAiResponse.ok) {
            console.error('OpenAI hero design request failed with status:', openAiResponse.status);
            return textResponse('AI 設計服務暫時失敗，請稍後再試。', 502);
        }
        const result = await openAiResponse.json();
        const content = result.choices?.[0]?.message?.content;
        if (typeof content !== 'string') return textResponse('AI 沒有回傳可用設計內容。', 502);
        let draft: Record<string, unknown>;
        try {
            draft = JSON.parse(content);
        } catch {
            console.error('AI hero design response was not valid JSON');
            return textResponse('AI 回傳格式無效，請重試。', 502);
        }
        const safeMembers = Array.isArray(draft.members)
            ? draft.members.slice(0, 8).filter(member => typeof member === 'object' && member !== null && !Array.isArray(member))
                .map(member => {
                    const person = member as Record<string, unknown>;
                    return {
                        name: cleanText(person.name, 100),
                        role: cleanText(person.role, 100),
                        bio: cleanText(person.bio, 500),
                        imageUrl: ''
                    };
                })
            : [];
        const rawHighlights = typeof draft.highlights === 'object' && draft.highlights !== null
            ? draft.highlights as Record<string, unknown>
            : {};
        const rawTabs = typeof draft.tabs === 'object' && draft.tabs !== null
            ? draft.tabs as Record<string, unknown>
            : {};
        return respond({
            design: {
                headline: cleanText(draft.headline, 160),
                subtitle: cleanText(draft.subtitle, 500),
                ctaLabel: cleanText(draft.ctaLabel, 80),
                customTheme: ['light', 'warm', 'dark'].includes(String(draft.customTheme)) ? String(draft.customTheme) : 'light',
                highlights: {
                    ticket: cleanText(rawHighlights.ticket, 240),
                    audience: cleanText(rawHighlights.audience, 240),
                    award: cleanText(rawHighlights.award, 240),
                    venue: cleanText(rawHighlights.venue, 240)
                },
                tabs: {
                    highlights: cleanContent(rawTabs.highlights, 3000),
                    schedule: cleanContent(rawTabs.schedule, 3000),
                    faq: cleanContent(rawTabs.faq, 3000)
                },
                members: safeMembers
            }
        });
    } catch (error) {
        console.error('Hero design assistant failed:', error);
        return textResponse('AI 設計服務發生錯誤，請稍後再試。', 500);
    }
});
