(() => {
    if (!window.supabase) return;

    let client;
    try {
        client = supabaseClient;
    } catch {
        client = window.supabase.createClient(
            'https://owvsfvunlqudrhdsuqvk.supabase.co',
            'sb_publishable_4kBnCjtv4c7j-sb8l3BrUw_j63egBDR',
            { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
        );
    }

    async function applySiteBackground() {
        const { data, error } = await client
            .from('site_settings')
            .select('key, value')
            .in('key', ['background_page_url', 'background_page_strength', 'footer_background_color', 'footer_text_color']);
        if (error || !data) return;

        const settings = Object.fromEntries(data.map(item => [item.key, item.value]));
        const footerBackground = /^#[0-9a-fA-F]{6}$/.test(settings.footer_background_color || '') ? settings.footer_background_color : '';
        const footerText = /^#[0-9a-fA-F]{6}$/.test(settings.footer_text_color || '') ? settings.footer_text_color : '';
        document.querySelectorAll('footer').forEach(footer => {
            if (footerBackground) footer.style.backgroundColor = footerBackground;
            if (footerText) footer.style.color = footerText;
        });

        let imageUrl;
        try {
            imageUrl = new URL(settings.background_page_url);
        } catch {
            return;
        }
        if (!['http:', 'https:'].includes(imageUrl.protocol)) return;

        const rawStrength = Number(settings.background_page_strength);
        const strength = Number.isFinite(rawStrength) ? Math.max(0, Math.min(100, rawStrength)) : 2;
        const overlayOpacity = 0.9 * (1 - strength / 100);
        const body = document.body;
        body.style.backgroundImage = `linear-gradient(rgba(255, 255, 255, ${overlayOpacity}), rgba(255, 255, 255, ${overlayOpacity})), url(${JSON.stringify(imageUrl.href)})`;
        body.style.backgroundPosition = 'center';
        body.style.backgroundSize = 'cover';
        body.style.backgroundAttachment = 'fixed';
        body.style.backgroundRepeat = 'no-repeat';
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', applySiteBackground, { once: true });
    } else {
        applySiteBackground();
    }
})();