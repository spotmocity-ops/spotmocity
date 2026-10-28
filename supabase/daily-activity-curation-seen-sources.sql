create table if not exists public.activity_curation_seen_sources (
    source_url text primary key,
    title text not null default '',
    first_seen_at timestamptz not null default now()
);

alter table public.activity_curation_seen_sources enable row level security;

revoke all on public.activity_curation_seen_sources from public, anon, authenticated;

insert into public.activity_curation_seen_sources (source_url, title)
select distinct on (source_url) source_url, title
from public.curated_activity_drafts
order by source_url, created_at asc
on conflict (source_url) do nothing;
