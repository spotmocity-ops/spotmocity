type SubmissionWebhook = {
    type?: string;
    table?: string;
    schema?: string;
    record?: {
        status?: string;
        title?: string;
        org_name?: string;
        identity_type?: string;
        category?: string;
        subcategory?: string;
        description?: string;
        contact_email?: string;
        contact_phone?: string;
        wechat_id?: string;
        social_handle?: string;
        fee?: string;
        event_time?: string;
        event_end_date?: string;
    };
};

function escapeHtml(value: unknown): string {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    })[character]);
}

Deno.serve(async request => {
    if (request.method !== 'POST') {
        return new Response('Method not allowed', { status: 405 });
    }

    const webhookSecret = Deno.env.get('DATABASE_WEBHOOK_SECRET');
    if (!webhookSecret || request.headers.get('x-webhook-secret') !== webhookSecret) {
        return new Response('Unauthorized', { status: 401 });
    }

    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    const recipient = Deno.env.get('ADMIN_NOTIFICATION_EMAIL');
    const sender = Deno.env.get('RESEND_FROM_EMAIL');
    if (!resendApiKey || !recipient || !sender) {
        return new Response('Email environment variables are not configured', { status: 500 });
    }

    let webhook: SubmissionWebhook;
    try {
        webhook = await request.json();
    } catch {
        return new Response('Invalid JSON payload', { status: 400 });
    }

    if (webhook.type !== 'INSERT' || webhook.schema !== 'public' || webhook.table !== 'submissions') {
        return new Response('Unsupported database event', { status: 400 });
    }

    const submission = webhook.record;
    if (!submission || submission.status !== 'pending' || !submission.title) {
        return new Response('Invalid submission record', { status: 400 });
    }

    const title = String(submission.title).replace(/[\r\n]+/g, ' ').trim();
    const activityTime = submission.event_time || '未提供';
    const endDate = submission.event_end_date || '未提供';
    const dashboardUrl = Deno.env.get('ADMIN_DASHBOARD_URL');
    const dashboardLink = dashboardUrl
        ? `<p><a href="${escapeHtml(dashboardUrl)}">開啟管理後台審核</a></p>`
        : '<p>請登入 SpotMoCity 管理後台審核此活動。</p>';

    const text = [
        '有新的活動提交等待審核。',
        `活動名稱：${title}`,
        `主辦單位：${submission.org_name || '未提供'}`,
        `主辦身份：${submission.identity_type || '未提供'}`,
        `主分類：${submission.category || '未提供'}`,
        `子分類：${submission.subcategory || '未提供'}`,
        `活動簡介：${submission.description || '未提供'}`,
        `主辦方 Email：${submission.contact_email || '未提供'}`,
        `聯絡電話：${submission.contact_phone || '未提供'}`,
        `WeChat：${submission.wechat_id || '未提供'}`,
        `IG／FB：${submission.social_handle || '未提供'}`,
        `活動開始：${activityTime}`,
        `活動結束日期：${endDate}`,
        `費用：${submission.fee || '免費'}`,
        dashboardUrl ? `管理後台：${dashboardUrl}` : ''
    ].filter(Boolean).join('\n');

    const html = `<h2>有新的活動提交等待審核</h2>
        <p><strong>活動名稱：</strong>${escapeHtml(title)}</p>
        <p><strong>主辦單位：</strong>${escapeHtml(submission.org_name || '未提供')}</p>
        <p><strong>主辦身份：</strong>${escapeHtml(submission.identity_type || '未提供')}</p>
        <p><strong>主分類：</strong>${escapeHtml(submission.category || '未提供')}</p>
        <p><strong>子分類：</strong>${escapeHtml(submission.subcategory || '未提供')}</p>
        <p><strong>活動簡介：</strong>${escapeHtml(submission.description || '未提供')}</p>
        <p><strong>主辦方 Email：</strong>${escapeHtml(submission.contact_email || '未提供')}</p>
        <p><strong>聯絡電話：</strong>${escapeHtml(submission.contact_phone || '未提供')}</p>
        <p><strong>WeChat：</strong>${escapeHtml(submission.wechat_id || '未提供')}</p>
        <p><strong>IG／FB：</strong>${escapeHtml(submission.social_handle || '未提供')}</p>
        <p><strong>活動開始：</strong>${escapeHtml(activityTime)}</p>
        <p><strong>活動結束日期：</strong>${escapeHtml(endDate)}</p>
        <p><strong>費用：</strong>${escapeHtml(submission.fee || '免費')}</p>
        ${dashboardLink}`;

    const emailResponse = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            from: sender,
            to: [recipient],
            subject: `新活動待審核：${title}`,
            text,
            html
        })
    });

    if (!emailResponse.ok) {
        const errorText = await emailResponse.text();
        console.error('Resend email request failed:', emailResponse.status, errorText);
        return new Response('Email provider rejected the notification', { status: 502 });
    }

    return Response.json({ sent: true }, { status: 200 });
});