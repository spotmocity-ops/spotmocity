# Submission email notifications

This Edge Function sends an email to the administrator when a new pending row is inserted into `public.submissions`. It is designed to be called by a Supabase Database Webhook, not directly by the public website.

## Configure secrets

Create a Resend account and verify the sender domain/address. From the project root, set these Supabase Edge Function secrets:

```sh
supabase secrets set RESEND_API_KEY=re_xxxxxxxxx
supabase secrets set RESEND_FROM_EMAIL="SpotMoCity <notifications@your-verified-domain.com>"
supabase secrets set ADMIN_NOTIFICATION_EMAIL=admin@example.com
supabase secrets set DATABASE_WEBHOOK_SECRET=replace-with-a-long-random-secret
supabase secrets set ADMIN_DASHBOARD_URL=https://your-site.example/admin.html
```

Use your actual verified Resend sender, notification recipient, and site URL. Keep these values out of HTML and JavaScript files.

## Deploy

Install and authenticate the Supabase CLI, link it to the project, then deploy:

```sh
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase functions deploy notify-admin-on-submission --no-verify-jwt
```

The function checks the `x-webhook-secret` header itself. Do not remove that check or publish the secret in the website.

## Private organiser contact phone

Before deploying the updated submission form and admin frontend, run [`contact-person-phone.sql`](./contact-person-phone.sql) in the Supabase SQL Editor. The organiser's responsible-person phone is required for club and organisation submissions, stored separately from the required public contact phone, and displayed only to administrators. The public organiser email is optional. Old submissions may have no private phone. `public_activities` must not expose `contact_person_phone`; verify that the `submissions` table remains protected by admin-only SELECT row-level security and that anonymous and non-admin users cannot read it before enabling this feature. The submission notification intentionally omits the private number. Apply the column migration before publishing the form so inserts do not fail. After publishing, run [`require-contact-person-phone.sql`](./require-contact-person-phone.sql) to enforce the phone requirement on new club and organisation submissions at the database layer. Old browser tabs with the previous form will fail to submit until refreshed; existing records are unaffected.

## Activity promotional copy

Before deploying the updated submission form and admin frontend, run [`activity-promo-copy.sql`](./activity-promo-copy.sql) in the Supabase SQL Editor. It adds the optional `promo_copy` field to submissions and exposes it through `public_activities`; the activity detail modal displays it separately from the activity description.

## Poster horizontal position

Before deploying the updated admin and homepage, run [`poster-horizontal-position.sql`](./poster-horizontal-position.sql) against the linked Supabase project. It adds a horizontal crop position (defaulting to the current centered appearance) for submitted and curated activity posters and exposes it through `public_activities`.

## Create the database webhook

In the Supabase Dashboard, open **Database → Webhooks** and create a webhook with:

- Table: `public.submissions`
- Event: `INSERT`
- Method: `POST`
- URL: `https://YOUR_PROJECT_REF.supabase.co/functions/v1/notify-admin-on-submission`
- Header: `x-webhook-secret` with the same value as `DATABASE_WEBHOOK_SECRET`

After saving, submit a test activity. The email is sent after the row is inserted and remains pending review. The notification includes an activity summary but omits registration numbers and other identity details.

## Daily Macau activity curation

The `daily-activity-curation` Edge Function reads Macau Cultural Affairs Bureau event RSS, the Macau Government Tourism Office's public What’s On data (three months at a time, from [the What’s On page](https://www.macaotourism.gov.mo/zh-hans/whatson)), Macau Cultural Centre's public programme listings, the current Tap Siac Craft Market edition from [its official Chinese-language site](https://www.craftmarket.gov.mo/cn/), and public event listings from Macau Ticket and Enjoy Macao Ticketing. Cultural Centre programme dates, ticket prices, titles, and poster images are extracted from [its What's On page](https://www.ccm.gov.mo/whatson). The craft market's official page supplies the current edition's title, date range and banner image. Activity AI enrichment is disabled by default; to opt in, set `ACTIVITY_CURATION_AI_ENABLED=true` and configure `OPENAI_API_KEY`, `OPENAI_MODEL`, and, if needed, `OPENAI_BASE_URL`. Daily blog generation uses Qwen Cloud when configured and independently falls back to `OPENAI_API_KEY`, `OPENAI_BASE_URL`, and `OPENAI_MODEL` when the corresponding Qwen secrets are absent. For Qwen Cloud, the API key and API Host must be from the same Model Studio region; use the API Host shown for your workspace in the Model Studio console, ending in `/compatible-mode/v1`. Blog generation runs when new activities are collected for the Macau date. It sends selected activity source data to the configured OpenAI-compatible chat-completions endpoint. Blog generation failure is reported to the admin but does not discard successfully collected activity drafts. The source URL, title, organization, and event dates are preserved from the source; the activity result remains a draft and must be reviewed by an administrator. Results link back to source event pages. The admin must verify dates, venue, fee, and other details before publishing. If a source is temporarily unavailable, results from available sources can still be collected; the run fails only when all sources are unavailable. The function runs daily at 17:40 Macau time after the database schedule below is configured. Results appear under **每日活動搜集** in the admin dashboard. Published activities disappear from the public activities view when their end time passes.

The Cultural Affairs Bureau, Tourism Office, Cultural Centre, and Tap Siac Craft Market are official sources; the two ticketing websites provide additional public listings but are not government event directories. This is not a comprehensive Macau-wide event search. Some sources do not consistently provide structured venue, fee, or exact event times, so administrators may need to complete those fields.

Administrators can request **AI 重新整理建議** on an individual unpublished draft. This sends its last saved draft fields (not the current unsaved edits) to the configured AI provider. For supported source domains it also inspects the source page for candidate images and relevant links; inaccessible pages are reported and only the source link is offered. It requires `OPENAI_API_KEY`, `OPENAI_MODEL` and a Supabase-reachable `OPENAI_BASE_URL`, independently of the automatic collector's `ACTIVITY_CURATION_AI_ENABLED` setting. Suggestions are compared with the current editor values and are never saved automatically: confirm to apply them to the editor, check the source, then save. Existing links and candidate images are retained. Published records are excluded. This may incur provider charges.

The collector skips entries whose end date is before the current Macau date, leaves unparseable dates blank for administrator review, and creates at most five new drafts per run. It checks all current candidates against a persistent source registry before selecting the next five; slash-formatted dates in Cultural Affairs Bureau entries use day/month order (for example, `2, 3/10` means October 2–3). It records each collected source URL separately from the draft so deleting an unwanted draft will not cause that source to return in later searches. Drafts are also checked in the admin UI; expired drafts and published records appear under **已過去**, and expired activities are not published in the public activity view. Admins can add a manual draft, edit it in the same form as collected activities, and delete unwanted drafts from the draft card. For an existing database, run [`curated-activity-draft-delete.sql`](./curated-activity-draft-delete.sql), [`curated-activity-draft-manual-insert.sql`](./curated-activity-draft-manual-insert.sql), and [`daily-activity-curation-seen-sources.sql`](./daily-activity-curation-seen-sources.sql) in the Supabase SQL Editor before deploying the updated admin page. The manual-insert migration limits draft insertion to administrators. The seen-sources migration creates the private source registry and backfills it from current drafts.

Facebook posts are not collected. Meta does not provide unrestricted access to search arbitrary public posts; integrating specific Facebook Pages requires a Meta app, Page IDs, a Page access token, and approved Page permissions. Do not put that token in browser code or send it in chat; it must be configured as a Supabase Edge Function secret.

New drafts include the original source link and, when available, explicitly labelled relevant links and candidate images found in source page metadata. Images are not downloaded or automatically selected as posters. Check that each candidate depicts the event and that its usage rights permit publication; source pages may be unavailable or lack images. If no age is supplied, the draft uses `全年齡（待確認）` as a default, not a verified claim. Verify source links, age restrictions, dates, and image usage rights before publishing.

Administrators can adjust each activity poster thumbnail's zoom (100%–200%) and vertical position (0%–100%) in the activity editor. The homepage keeps a fixed thumbnail frame and crops the poster to these settings. Apply the latest `supabase-schema.sql` so the settings are saved and included in the public activity view.

## Daily blog review and publishing

Before deploying the updated admin page and `daily-activity-curation` function, run [`blog-post-review.sql`](./blog-post-review.sql) in the Supabase SQL Editor. It creates the daily blog table with administrator-only draft access, public read access only for published posts, and the `publish_blog_post` RPC. The RPC publishes the reviewed article and updates `home_blog_items` in one transaction. Deploy the database migration before the function and frontend; otherwise the collector will report the blog-generation error in its response. Existing blog installations must also apply [`20261102230000_blog_generation_status.sql`](./migrations/20261102230000_blog_generation_status.sql) before deploying the asynchronous manual generator.

The collector generates at most one blog draft per Macau calendar date from that day's newly collected activities. It does not overwrite an existing daily draft or published article. If AI generation fails, the activity drafts are still saved, the error is shown after a manual search, and another run can retry using that day's saved activities. Automatic generation uses Qwen Cloud. It prefers `DASHSCOPE_API_KEY`, `QWEN_BASE_URL`, and `QWEN_MODEL` when configured; if those secrets are absent, it reuses `OPENAI_API_KEY`, `OPENAI_BASE_URL`, and `OPENAI_MODEL` for the same OpenAI-compatible Qwen endpoint. The Qwen API key and API Host must be from the same Alibaba Cloud Model Studio region, and the Host must end in `/compatible-mode/v1`. Do not send API keys in chat or place them in browser code. Blog generation is independent of `ACTIVITY_CURATION_AI_ENABLED` and may incur provider charges.

In the admin dashboard, **網誌審核** provides a two-column workflow for editing the title and article, Canva card text, Instagram caption, and hashtags. Administrators may also select up to 20 AI-curated activities (draft or published) and approved, visible user submissions to generate a blog manually. The selector loads both sources in pages of 50 and identifies each activity's source and publication status. Choose Qwen Cloud or an OpenAI-compatible service. Leaving the model field empty reuses the configured server-side model, including the same `OPENAI_MODEL` used by daily activity AI; entering a model overrides it for that request. Qwen prefers `DASHSCOPE_API_KEY`, `QWEN_BASE_URL`, and `QWEN_MODEL`, falling back to the existing `OPENAI_*` secrets. An OpenAI-compatible service uses the `OPENAI_*` secrets. All keys remain server-side. For manual blog generation, available HTTPS activity-poster URLs are sent to the selected AI provider as image inputs; use a model that supports both image input (vision) and JSON output. The provider can access those public image URLs. Structured activity details remain authoritative, and poster text is only used to verify or supplement them. The generator reports how many posters were included. Manual generation creates or marks the daily draft as **生成中**, returns immediately, and updates the draft asynchronously; the admin editor polls and displays completion or failure. The AI request is limited to 90 seconds; drafts still marked generating after three minutes are shown as timed out, and a new confirmed generation safely replaces the stale job. It may replace today's existing draft only after confirmation; published articles cannot be overwritten by this action. **儲存修改** keeps the post as a draft. **核准並正式發布** publishes it and adds a same-site `blog.html?id=...` link to the homepage; Instagram content is only provided for copying and is never posted automatically. The public article page only reads published rows. Both the editor and public page sanitize article HTML and allow only HTTPS article links.

Homepage notices and warm information are stored in `site_settings`. For an existing deployment, run [`homepage-content-read-policy.sql`](./homepage-content-read-policy.sql) in the Supabase SQL Editor so public visitors can read these settings; the latest `supabase-schema.sql` includes the same policy update for new or rebuilt databases.

## Featured content pages

The homepage can show up to nine independently editable featured cards. Each card supports a basic or custom detail page, wide/mobile imagery, optional transparent PNG frame overlays, image/YouTube/MP4 hero media, a countdown, CTA, four highlight cards, three text tabs, and a team list. Frame artwork is recommended at 1200 × 500 px for desktop and 960 × 580 px for mobile, with a transparent image window. Uploaded MP4 files are limited to 50 MB. For existing projects, run [`featured-content-assets.sql`](./featured-content-assets.sql) before uploading frame assets or MP4 files.

The admin AI design button uses the admin-authenticated `hero-design-assistant` Edge Function; provider keys are never sent to the browser. Configure `OPENAI_API_KEY`, `OPENAI_MODEL` and, for an OpenAI-compatible provider, `OPENAI_BASE_URL` as Edge Function secrets. Deploy the function together with the frontend. In a custom detail page, choose either the original theme/section-order assistant or smart layout. Smart layout uses the configured model with JSON output and temperature 0.85 to suggest a constrained layout for the hero, highlights, detail tabs, team and contact sections. It controls section order, palettes, card styles and grid columns, without changing text or generating images. Image colours and dimensions are sampled in the browser when accessible; inaccessible images are reported and no image features are sent. The smart layout service logs failures and returns a clearly labelled standard layout. The original assistant can optionally suggest rewritten headline, subtitle, CTA and highlights; review suggestions for accuracy. Both modes show a scrollable preview before applying, can be refined or regenerated, and require a separate save. Editor changes invalidate the preview. Existing tabs, team members and images are not replaced, and pending uploads are not shown until saved. Existing hero-only smart layouts remain supported. The smart layout can be removed in the editor; on mobile sections use responsive grids and the hero is stacked.

For smart layout, invalid JSON or a response that fails validation is retried once; the extra call may incur charges. If both attempts fail, the fallback preview reports whether the failure was configuration, provider, or invalid output. Provider failures are not automatically retried.

The separate admin-authenticated `hero-image-assistant` generates a background using `qwen-image-3.0-pro` on a supported Singapore QwenCloud or Token Plan endpoint configured through `OPENAI_BASE_URL` and `OPENAI_API_KEY`. Each explicit request sends the card title, description and design instructions to Qwen and can incur usage charges. The generated PNG is shown for review; applying it selects a pending background upload and saving the card uploads it to `homepage-content`. It never replaces existing content automatically. The image service fetches only HTTPS image URLs under Alibaba's image domains, enforces a size limit and validates the PNG signature. A failed request reports an error without changing the existing background. Detail-page backgrounds use a translucent overlay, and smart hero text is adjusted to ensure contrast against its opaque text background.

Each featured card can be saved independently from its own editor. The **儲存全部置頂內容** buttons above and below the list save all current cards and removals together. Detail pages support an adjustable background image, a compact responsive hero visual, up to five photos in the highlights tab, uploaded team-member portraits, and rich text for detail tabs (headings, emphasis, lists, font family, font weight, font size, HTTPS links, and HTTPS image URLs). Select text before applying font, weight, or size. Rich text is sanitized to an allowlist before rendering. For existing projects, run [`curated-activity-life-services.sql`](./curated-activity-life-services.sql) after [`life-service-categories.sql`](./life-service-categories.sql) to add the life-service fields to curated activity drafts and update `public_activities`. To enable promotional image uploads for curated life-service entries, also run [`curated-life-service-promotion-images.sql`](./curated-life-service-promotion-images.sql). In the daily curation editor, select **核准後同時加入「生活服務與資源對接區」**, select a resource category, and upload up to two promotional images before publishing. The images appear only after visitors expand the service details; clicking the service thumbnail or an expanded promotional image opens it full-size.

## Life service classifications

For the homepage's dynamic service categories and approval fields, run
[`life-service-categories.sql`](./life-service-categories.sql) in the Supabase
SQL Editor, followed by [`homepage-content-read-policy.sql`](./homepage-content-read-policy.sql)
to allow public access to the category setting. The migration adds seven fields
to `submissions` and appends them to `public_activities`.

The `site_settings` key `home_service_categories` stores five fixed parent
category IDs (`space`, `business`, `health`, `support`, and `family_school`) with editable
display names, an optional category-level `pinText`, and an editable
`subcategories` array. Each approved service submission stores its selected
parent and child IDs in `life_service_category` and
`life_service_subcategory`, plus optional summary, details, and thumbnail URL.
In admin, services can be approved from the existing activity-submission
workflow; administrators can set a thumbnail URL or upload a separate image.
The existing activity promotional-image upload and the daily-curation uploader
both display service promotional images only after visitors expand the details.
Administrators can set a small pinned one-line text for each of the five
parent categories in the category settings. The homepage displays that text
under its category name. Service summaries and thumbnails appear in the
category modal, with contact information and other details available from each
item's expand button.
When no separate thumbnail is set, the activity poster is used.

The admin **活動日曆編輯** tab stores special-day dates, icons, and titles in
the `calendar_special_days` `site_settings` key. The homepage calendar shows
activity titles on their dates and displays each special-day icon in the
bottom-right corner of its date cell. The public homepage-content read policy
must include this key; the latest `homepage-content-read-policy.sql` and
`supabase-schema.sql` do so.

### Configure and deploy

1. Apply `supabase-schema.sql`, then [`identity-verification.sql`](./identity-verification.sql), in the Supabase SQL Editor. The latter creates a private identity-document bucket and admin-only read/delete policies.
   The submission and admin pages use manual identity/document verification for personal, club and organisation submissions. Personal submissions do not require SMS OTP; administrators must verify identity details before approving and remove identity documents and numbers as described in the terms.
2. Install the Supabase CLI, log in, and link it to this project. No Gemini or AI relay secret is needed for activity curation. Use a long, randomly generated value for `ACTIVITY_CURATION_CRON_SECRET`; it must be identical in the Edge Function and Vault:

   ```sh
   supabase login
   supabase link --project-ref owvsfvunlqudrhdsuqvk
   supabase secrets set ACTIVITY_CURATION_CRON_SECRET=your_long_random_secret
   ```

   Supabase provides the project URL and server-side API key to Edge Functions automatically; the function supports the current `SUPABASE_SECRET_KEYS` and legacy `SUPABASE_SERVICE_ROLE_KEY` environment variables. Do not add either reserved `SUPABASE_` variable as a custom secret. Keep the cron secret private.
3. Deploy the Edge Function:

   ```sh
   supabase functions deploy daily-activity-curation --no-verify-jwt
   ```

   The function reads the official RSS at runtime. If a run fails, confirm that the feed is reachable and valid XML, then check Supabase Edge Function logs.

   The administrator page's **立即手動搜尋** button invokes this function with the signed-in user's session. The function verifies the user and checks `public.is_admin()` before starting a search. The scheduled job continues to use `ACTIVITY_CURATION_CRON_SECRET`; that secret must never be placed in browser code.

4. In the Supabase SQL Editor, store the deployed function URL and the exact same cron secret in Vault. Run these `create_secret` statements only once per secret:

   ```sql
   select vault.create_secret(
       'https://owvsfvunlqudrhdsuqvk.supabase.co/functions/v1/daily-activity-curation',
       'activity-curation-function-url'
   );
   select vault.create_secret('PASTE_THE_CONFIGURED_CRON_SECRET_HERE', 'activity-curation-cron-secret');
   ```

   Do not commit the real secret or save it in the repository. If either Vault secret already exists, update that secret in Vault instead of creating a duplicate.
5. Run [`schedule-daily-activity-curation.sql`](./schedule-daily-activity-curation.sql) in the Supabase SQL Editor. It enables `pg_cron` and `pg_net`, checks that both Vault secrets exist, replaces any existing job with the same name, and schedules the function daily at 09:40 UTC (17:40 Macau time):

   Confirm the job is installed with:

   ```sql
   select jobname, schedule, active
   from cron.job
   where jobname = 'daily-activity-curation';
   ```

The Supabase scheduler uses UTC, so `40 9 * * *` is 17:40 in Macau (UTC+8). The scheduled `pg_net` request allows up to 120 seconds for the RSS fetch and parsing workflow to complete. The admin **每日活動搜集** page displays the latest run status and drafts, and administrators can start a refresh manually from that page. Check the Supabase Edge Function and `pg_cron` logs if a run fails. New feed results with the same source URL and activity title are not inserted again, so daily runs do not overwrite manual edits or republish existing records.