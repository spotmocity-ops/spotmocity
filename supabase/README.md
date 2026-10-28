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

## Create the database webhook

In the Supabase Dashboard, open **Database → Webhooks** and create a webhook with:

- Table: `public.submissions`
- Event: `INSERT`
- Method: `POST`
- URL: `https://YOUR_PROJECT_REF.supabase.co/functions/v1/notify-admin-on-submission`
- Header: `x-webhook-secret` with the same value as `DATABASE_WEBHOOK_SECRET`

After saving, submit a test activity. The email is sent after the row is inserted and remains pending review. The notification includes an activity summary but omits registration numbers and other identity details.

## Daily Macau activity curation

The `daily-activity-curation` Edge Function reads Macau Cultural Affairs Bureau event RSS, the Macau Government Tourism Office's public What’s On data (three months at a time, Traditional Chinese), and public event listings from Macau Ticket and Enjoy Macao Ticketing. It uses deterministic parsing and category rules; it does not call an AI model, search relay, or AI API. Results link back to source event pages. The admin must verify dates, venue, fee, and other details before publishing. If a source is temporarily unavailable, results from available sources can still be collected; the run fails only when all sources are unavailable. The function runs daily at 17:40 Macau time after the database schedule below is configured. Results appear under **每日活動搜集** in the admin dashboard. Published activities disappear from the public activities view when their end time passes.

The Cultural Affairs Bureau and Tourism Office are government sources; the two ticketing websites provide additional public listings but are not government event directories. This is not a comprehensive Macau-wide event search. Some sources do not consistently provide structured venue, fee, or exact event times, so administrators may need to complete those fields.

The collector skips entries whose end date is before the current Macau date or cannot be parsed, and creates at most five new drafts per run. It checks all current candidates against a persistent source registry before selecting the next five; slash-formatted dates in Cultural Affairs Bureau entries use day/month order (for example, `2, 3/10` means October 2–3). It records each collected source URL separately from the draft so deleting an unwanted draft will not cause that source to return in later searches. Drafts are also checked in the admin UI; expired drafts and published records appear under **已過去**, and expired activities are not published in the public activity view. Admins can delete unwanted curated activities from the draft card. For an existing database, run [`curated-activity-draft-delete.sql`](./curated-activity-draft-delete.sql) and [`daily-activity-curation-seen-sources.sql`](./daily-activity-curation-seen-sources.sql) in the Supabase SQL Editor before deploying the updated function. The latter creates the private seen-source registry and backfills it from current drafts.

Facebook posts are not collected. Meta does not provide unrestricted access to search arbitrary public posts; integrating specific Facebook Pages requires a Meta app, Page IDs, a Page access token, and approved Page permissions. Do not put that token in browser code or send it in chat; it must be configured as a Supabase Edge Function secret.

The function stores source links but does not search for or download images. Administrators can add a poster while reviewing a draft. Verify source links, dates, and image usage rights before publishing. Search results are suggestions and must be checked against their original pages.

Administrators can adjust each activity poster thumbnail's zoom (100%–200%) and vertical position (0%–100%) in the activity editor. The homepage keeps a fixed thumbnail frame and crops the poster to these settings. Apply the latest `supabase-schema.sql` so the settings are saved and included in the public activity view.

Homepage notices and warm information are stored in `site_settings`. For an existing deployment, run [`homepage-content-read-policy.sql`](./homepage-content-read-policy.sql) in the Supabase SQL Editor so public visitors can read these settings; the latest `supabase-schema.sql` includes the same policy update for new or rebuilt databases.

## Featured content pages

The homepage can show up to nine independently editable featured cards. Each card supports a basic or custom detail page, wide/mobile imagery, optional transparent PNG frame overlays, image/YouTube/MP4 hero media, a countdown, CTA, four highlight cards, three text tabs, and a team list. Frame artwork is recommended at 1200 × 500 px for desktop and 960 × 580 px for mobile, with a transparent image window. Uploaded MP4 files are limited to 50 MB. For existing projects, run [`featured-content-assets.sql`](./featured-content-assets.sql) before uploading frame assets or MP4 files.

The admin AI design button uses the `hero-design-assistant` Edge Function. It is admin-authenticated and does not expose the provider key in browser code. Configure `OPENAI_API_KEY` as a Supabase Edge Function secret; optionally set `OPENAI_MODEL`. Without the secret the endpoint responds that AI is not configured, while manual page editing continues to work. Review generated content before saving or publishing; AI output is a draft and may require factual corrections.

Each featured card can be saved independently from its own editor. Detail pages support an adjustable background image, a compact responsive hero visual, up to five photos in the highlights tab, uploaded team-member portraits, and rich text for detail tabs (headings, emphasis, lists, font family, font weight, font size, HTTPS links, and HTTPS image URLs). Select text before applying font, weight, or size. Rich text is sanitized to an allowlist before rendering. For existing projects, run [`curated-activity-life-services.sql`](./curated-activity-life-services.sql) after [`life-service-categories.sql`](./life-service-categories.sql) to add the life-service fields to curated activity drafts and update `public_activities`. In the daily curation editor, select **核准後同時加入「生活服務與資源對接區」** and a resource category before publishing a curated activity to show it in the homepage resource area.

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
   The submission and admin pages are staged for document/manual identity verification. Personal submissions intentionally remain blocked until an SMS OTP provider is configured and the send/verify flow is implemented; do not publish these staged changes as a live identity-verification service yet.
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