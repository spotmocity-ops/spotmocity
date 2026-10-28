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

function getOpenAiBaseUrl(): string {
    const configuredUrl = Deno.env.get('OPENAI_BASE_URL')?.trim() || 'https://api.openai.com/v1';
    return configuredUrl.replace(/\/+$/, '').replace(/\/chat\/completions$/, '');
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
        const current = body.current && typeof body.current === 'object' && !Array.isArray(body.current)
            ? body.current as Record<string, unknown> : {};
        if (!title && !description && !prompt) return textResponse('請先填寫標題、簡介或自訂設計要求。', 400);

        const openAiResponse = await fetch(`${getOpenAiBaseUrl()}/chat/completions`, {
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
                        content: '你是澳門活動及品牌頁面設計助手。按照設計要求選擇版面、配色及內容順序。mode 為 refine 時以 current 設計為基礎，只改使用者要求的部分；mode 為 new 時重新設計。allowTextRewrite 為 false 時必須保留現有文案；為 true 時可以按要求建議改寫。只輸出 JSON，不使用 HTML，不捏造資料；沒有資料留空。欄位：headline, subtitle, ctaLabel, customTheme(light|warm|dark|blue|green), customLayout(classic|split), customOrder(standard|details-first|people-first), highlights(ticket,audience,venue), explanation。classic 為上下排列，split 為桌面圖片與標題並排；順序分別為亮點優先、詳細內容優先、團隊優先。explanation 簡述所選設計，並明確指出不能滿足的要求；不可假裝已完成不支援的設計。'
                    },
                    {
                        role: 'user',
                        content: JSON.stringify({ title, description, designRequest: prompt, mode: body.mode === 'refine' ? 'refine' : 'new', allowTextRewrite: body.allowRewrite === true, current: {
                            headline: cleanText(current.headline, 160), subtitle: cleanText(current.subtitle, 500),
                            ctaLabel: cleanText(current.ctaLabel, 80),
                            customTheme: cleanText(current.customTheme, 20),
                            customLayout: cleanText(current.customLayout, 20),
                            customOrder: cleanText(current.customOrder, 20),
                            highlightTicket: cleanText(current.highlightTicket, 240),
                            highlightAudience: cleanText(current.highlightAudience, 240),
                            highlightVenue: cleanText(current.highlightVenue, 240)
                        } })
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
        if (!['light', 'warm', 'dark', 'blue', 'green'].includes(String(draft.customTheme)) ||
            !['classic', 'split'].includes(String(draft.customLayout)) ||
            !['standard', 'details-first', 'people-first'].includes(String(draft.customOrder))) {
            return textResponse('AI 未能產生有效的版面設定，請重試。', 502);
        }
        const rawHighlights = typeof draft.highlights === 'object' && draft.highlights !== null
            ? draft.highlights as Record<string, unknown>
            : {};
        return respond({
            design: {
                headline: cleanText(draft.headline, 160),
                subtitle: cleanText(draft.subtitle, 500),
                ctaLabel: cleanText(draft.ctaLabel, 80),
                explanation: cleanText(draft.explanation, 500),
                customTheme: String(draft.customTheme),
                customLayout: String(draft.customLayout),
                customOrder: String(draft.customOrder),
                highlights: {
                    ticket: cleanText(rawHighlights.ticket, 240),
                    audience: cleanText(rawHighlights.audience, 240),
                    award: cleanText(rawHighlights.award, 240),
                    venue: cleanText(rawHighlights.venue, 240)
                }
            }
        });
    } catch (error) {
        console.error('Hero design assistant failed:', error);
        return textResponse('AI 設計服務發生錯誤，請稍後再試。', 500);
    }
});
