create table if not exists public.featured_activity_analytics (
    id bigint generated always as identity primary key,
    page_id text not null,
    event_type text not null check (event_type in ('gallery_click', 'detail_view', 'contact_click')),
    occurred_at timestamptz not null default now()
);

create index if not exists featured_activity_analytics_page_time_idx
    on public.featured_activity_analytics (page_id, occurred_at);

alter table public.featured_activity_analytics enable row level security;

revoke all on public.featured_activity_analytics from public, anon, authenticated;
grant select on public.featured_activity_analytics to authenticated;

drop policy if exists "Admins can view featured activity analytics"
    on public.featured_activity_analytics;
create policy "Admins can view featured activity analytics"
on public.featured_activity_analytics
for select
to authenticated
using ((select public.is_admin()));

create or replace function public.track_featured_activity_event(p_page_id text, p_event_type text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    page_exists boolean;
begin
    if p_page_id is null or length(p_page_id) < 1 or length(p_page_id) > 120 then
        raise exception 'Invalid featured activity page id';
    end if;
    if p_event_type not in ('gallery_click', 'detail_view', 'contact_click') then
        raise exception 'Invalid featured activity event type';
    end if;

    select exists (
        select 1
        from (
            select value::jsonb as value
            from public.site_settings
            where key = 'home_hero_items'
        ) as setting
        cross join lateral jsonb_array_elements(
            case
                when jsonb_typeof(setting.value::jsonb) = 'array' then setting.value::jsonb
                else '[]'::jsonb
            end
        )
            with ordinality as featured(item, position)
        where coalesce(
                featured.item->>'pageId',
                'hero-' || coalesce(featured.item->>'order', featured.position::text)
            ) = p_page_id
    ) into page_exists;

    if not page_exists then
        raise exception 'Featured activity not found';
    end if;

    insert into public.featured_activity_analytics (page_id, event_type)
    values (p_page_id, p_event_type);
end;
$$;

revoke all on function public.track_featured_activity_event(text, text) from public;
grant execute on function public.track_featured_activity_event(text, text) to anon, authenticated;

create or replace function public.get_featured_activity_report(p_page_id text, p_ended_at timestamptz)
returns table (event_type text, event_count bigint)
language sql
stable
security invoker
set search_path = ''
as $$
    select analytics.event_type, count(*)::bigint
    from public.featured_activity_analytics as analytics
    where analytics.page_id = p_page_id
        and analytics.occurred_at <= p_ended_at
    group by analytics.event_type;
$$;

revoke all on function public.get_featured_activity_report(text, timestamptz) from public;
grant execute on function public.get_featured_activity_report(text, timestamptz) to authenticated;
