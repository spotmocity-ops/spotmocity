alter table public.submissions
    add column if not exists is_life_service boolean not null default false,
    add column if not exists life_service_category text,
    add column if not exists life_service_subcategory text,
    add column if not exists life_service_summary text,
    add column if not exists life_service_details text,
    add column if not exists life_service_thumbnail_url text,
    add column if not exists life_service_pin_text text;

alter table public.curated_activity_drafts
    add column if not exists promotion_image_urls text[] not null default '{}',
    add column if not exists is_life_service boolean not null default false,
    add column if not exists life_service_category text,
    add column if not exists life_service_subcategory text,
    add column if not exists life_service_summary text,
    add column if not exists life_service_details text,
    add column if not exists life_service_thumbnail_url text;

create or replace view public.public_activities
with (security_barrier = true)
as
    select
        id,
        identity_type,
        org_name,
        title,
        category,
        age_range,
        event_time,
        location,
        fee,
        poster_url,
        wechat_id,
        contact_phone,
        registration_url,
        created_at,
        event_end_date,
        subcategory,
        description,
        promotion_image_urls,
        video_url,
        contact_email,
        social_handle,
        map_url,
        event_end_time,
        event_format,
        null::text as promo_copy,
        null::jsonb as related_links,
        null::text as source_url,
        null::text as source_title,
        poster_display_width,
        poster_display_scale,
        poster_display_position,
        is_life_service,
        life_service_category,
        life_service_subcategory,
        life_service_summary,
        life_service_details,
        life_service_thumbnail_url,
        life_service_pin_text
    from public.submissions
    where status = 'approved'
        and is_visible = true
        and (
            is_life_service = true
            or (event_end_time is not null and event_end_time >= (now() at time zone 'Asia/Macau'))
            or (
                event_end_time is null
                and event_end_date >= (now() at time zone 'Asia/Macau')::date
            )
        )
    union all
    select
        -id as id,
        'org'::text as identity_type,
        org_name,
        title,
        category,
        age_range,
        event_time,
        location,
        fee,
        poster_url,
        null::text as wechat_id,
        null::text as contact_phone,
        null::text as registration_url,
        created_at,
        event_end_date,
        subcategory,
        description,
        promotion_image_urls,
        null::text as video_url,
        null::text as contact_email,
        null::text as social_handle,
        null::text as map_url,
        event_end_time,
        event_format,
        promo_copy,
        related_links,
        source_url,
        source_title,
        poster_display_width,
        poster_display_scale,
        poster_display_position,
        is_life_service,
        life_service_category,
        life_service_subcategory,
        life_service_summary,
        life_service_details,
        life_service_thumbnail_url,
        null::text as life_service_pin_text
    from public.curated_activity_drafts
    where status = 'published'
        and event_end_date >= (now() at time zone 'Asia/Macau')::date
        and (
            event_end_time is null
            or event_end_time >= (now() at time zone 'Asia/Macau')
        );

grant select on public.public_activities to anon, authenticated;

notify pgrst, 'reload schema';
