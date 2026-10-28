const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json; charset=utf-8'
};

function respond(body: unknown, status: number): Response {
    return Response.json(body, { status, headers });
}

Deno.serve(async request => {
    if (request.method === 'OPTIONS') return new Response('ok', { headers });
    if (request.method !== 'POST') return respond({ error: 'Method not allowed' }, 405);
    const token = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
    const url = Deno.env.get('SUPABASE_URL');
    const anon = Deno.env.get('SUPABASE_ANON_KEY') || request.headers.get('apikey');
    if (!token || !url || !anon) return respond({ error: '需要已登入的管理員帳戶。' }, 401);

    try {
        const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
        const client = createClient(url, anon, {
            global: { headers: { Authorization: `Bearer ${token}` } },
            auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
        });
        const { data: { user }, error: authError } = await client.auth.getUser(token);
        if (authError || !user) return respond({ error: '登入狀態無效。' }, 401);
        const { data: admin, error: adminError } = await client.rpc('is_admin');
        if (adminError) {
            console.error('Image assistant admin verification failed:', adminError.message);
            return respond({ error: '無法確認管理員權限。' }, 500);
        }
        if (admin !== true) return respond({ error: 'Forbidden' }, 403);
        const body = await request.json().catch(() => null);
        if (!body || typeof body !== 'object' || typeof body.prompt !== 'string' || !body.prompt.trim()) {
            return respond({ error: '請提供圖片設計要求。' }, 400);
        }
        const apiKey = Deno.env.get('OPENAI_API_KEY')?.trim();
        const base = Deno.env.get('OPENAI_BASE_URL')?.trim() || '';
        const provider = new URL(base);
        if (!apiKey || provider.protocol !== 'https:' || !['ap-southeast-1.maas.qwencloudapi.com', 'token-plan.maas.qwencloudapi.com'].includes(provider.hostname)) {
            return respond({ error: '圖片服務尚未設定為支援的 QwenCloud 服務。' }, 503);
        }
        const response = await fetch(`https://${provider.hostname}/api/v1/services/aigc/multimodal-generation/generation`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'qwen-image-3.0-pro',
                input: { messages: [{ role: 'user', content: [{ text: `Create a decorative website background without any text, lettering, logos or personal information. ${body.prompt.trim().slice(0, 1200)}` }] }] },
                parameters: { size: '1024*1024', n: 1, watermark: false }
            }),
            signal: AbortSignal.timeout(100000)
        });
        if (!response.ok) {
            const result = await response.json().catch(() => null);
            const code = typeof result?.code === 'string' ? result.code : 'unknown';
            console.error('Qwen image request failed:', response.status, code);
            return respond({ error: `圖片生成服務失敗（${response.status}，${code}）。請檢查模型權限或稍後重試。` }, 502);
        }
        const result = await response.json();
        const image = result?.output?.choices?.[0]?.message?.content?.find((part: { image?: unknown }) => typeof part.image === 'string')?.image;
        if (typeof image !== 'string') return respond({ error: '圖片服務沒有返回圖片。' }, 502);
        const imageUrl = new URL(image);
        if (imageUrl.protocol !== 'https:' || !['aliyuncs.com', 'alicdn.com'].some(domain => imageUrl.hostname.endsWith(`.${domain}`))) {
            console.error('Qwen image response used an unexpected image host:', imageUrl.hostname);
            return respond({ error: '圖片服務回傳不受支援的圖片位置。' }, 502);
        }
        const imageResponse = await fetch(imageUrl, { redirect: 'error', signal: AbortSignal.timeout(30000) });
        if (!imageResponse.ok || !imageResponse.body) {
            console.error('Generated image download failed:', imageResponse.status);
            return respond({ error: '無法下載生成的圖片，請稍後再試。' }, 502);
        }
        const reader = imageResponse.body.getReader();
        const chunks: Uint8Array[] = [];
        let length = 0;
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            length += value.length;
            if (length > 6 * 1024 * 1024) {
                await reader.cancel();
                return respond({ error: '生成圖片超過大小限制，請重新生成。' }, 502);
            }
            chunks.push(value);
        }
        const bytes = new Uint8Array(length);
        let offset = 0;
        for (const chunk of chunks) {
            bytes.set(chunk, offset);
            offset += chunk.length;
        }
        if (length < 8 || ![137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte)) {
            return respond({ error: '生成圖片格式不是有效的 PNG。' }, 502);
        }
        let binary = '';
        for (let index = 0; index < bytes.length; index += 8192) {
            binary += String.fromCharCode(...bytes.subarray(index, index + 8192));
        }
        return respond({ imageBase64: btoa(binary) }, 200);
    } catch (error) {
        console.error('Image assistant failed:', error instanceof Error ? error.message : 'unknown error');
        return respond({ error: '圖片生成服務發生錯誤，請稍後再試。' }, 500);
    }
});
