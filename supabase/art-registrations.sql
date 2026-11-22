create table if not exists public.art_registrations (
    id uuid primary key default gen_random_uuid(),
    reference_number text,
    event_key text not null default 'public-art-2027' check (event_key = 'public-art-2027'),
    group_type text not null check (group_type in ('individual', 'team')),
    age_group text not null check (age_group in ('child', 'youth', 'adult', 'senior', 'intergenerational')),
    performance_categories text[] not null check (cardinality(performance_categories) > 0),
    other_category text,
    program_title text not null check (char_length(program_title) between 1 and 200),
    performer_count integer not null check (performer_count between 1 and 1000),
    duration_seconds integer not null check (duration_seconds between 1 and 300),
    program_description text not null check (char_length(program_description) between 1 and 100),
    contact_zh_name text not null,
    contact_en_name text not null,
    contact_gender text not null check (contact_gender in ('male', 'female')),
    contact_birth_date_ciphertext text not null,
    contact_birth_date_iv text not null,
    contact_document_type text not null check (contact_document_type in ('macau_id', 'hong_kong_id', 'passport', 'two_way_permit')),
    contact_document_number_ciphertext text not null,
    contact_document_number_iv text not null,
    contact_phone text not null check (contact_phone ~ '^[0-9]{8}$'),
    contact_email text not null,
    emergency_contact_name text not null,
    emergency_contact_relationship text not null,
    emergency_contact_phone text not null check (emergency_contact_phone ~ '^[0-9]{8}$'),
    team_name text,
    accompaniment text not null check (accompaniment in ('audio', 'video', 'live')),
    stage_requirements jsonb not null default '{}'::jsonb check (jsonb_typeof(stage_requirements) = 'object'),
    special_stage_requirements text not null default '',
    consent_agreed boolean not null check (consent_agreed),
    consent_version text not null,
    submission_status text not null default 'processing' check (submission_status in ('processing', 'submitted')),
    team_file_path text,
    team_file_name text,
    stage_file_path text,
    stage_file_name text,
    event_ends_at timestamptz not null default '2027-03-15 23:59:59+08',
    submitted_at timestamptz not null default now(),
    constraint art_registration_group_details check (
        (group_type = 'individual' and performer_count = 1 and team_name is null)
        or (group_type = 'team' and performer_count >= 2 and nullif(btrim(team_name), '') is not null)
    ),
    constraint art_registration_duration_limit check (
        (group_type = 'individual' and duration_seconds <= 180)
        or (group_type = 'team' and duration_seconds <= 300)
    ),
    constraint art_registration_other_category check (
        (not ('other' = any(performance_categories)) and other_category is null)
        or ('other' = any(performance_categories) and nullif(btrim(other_category), '') is not null)
    ),
    constraint art_registration_team_file_group check (
        team_file_path is null or group_type = 'team'
    ),
    constraint art_registration_stage_file check (
        (accompaniment = 'audio' and stage_file_name is not null and stage_file_path is not null)
        or (accompaniment = 'video' and stage_file_name is not null and stage_file_path is not null)
        or (accompaniment = 'live' and stage_file_name is null and stage_file_path is null)
    )
);

alter table public.art_registrations
    add column if not exists reference_number text,
    add column if not exists team_file_name text,
    add column if not exists stage_file_name text,
    add column if not exists stage_file_path text;

create sequence if not exists public.art_registration_reference_seq
    start with 202701
    increment by 1
    no cycle;

create or replace function public.next_art_registration_reference()
returns text
language sql
volatile
as $$
    select lpad(nextval('public.art_registration_reference_seq')::text, 7, '0');
$$;

alter table public.art_registrations
    alter column reference_number set default public.next_art_registration_reference();

update public.art_registrations
set reference_number = public.next_art_registration_reference()
where reference_number is null;

alter table public.art_registrations
    alter column reference_number set not null,
    add constraint art_registration_reference_number_unique unique (reference_number);

alter table public.art_registrations
    add column if not exists team_file_name text,
    add column if not exists stage_file_name text,
    add column if not exists stage_file_path text;

create table if not exists public.art_team_members (
    id uuid primary key default gen_random_uuid(),
    registration_id uuid not null references public.art_registrations (id) on delete cascade,
    member_order integer not null check (member_order between 1 and 1000),
    chinese_name text not null,
    english_name text not null,
    gender text not null check (gender in ('male', 'female')),
    birth_date_ciphertext text not null,
    birth_date_iv text not null,
    document_type text not null check (document_type in ('macau_id', 'hong_kong_id', 'passport', 'two_way_permit')),
    document_number_ciphertext text not null,
    document_number_iv text not null,
    created_at timestamptz not null default now(),
    unique (registration_id, member_order)
);

create index if not exists art_registrations_event_submitted_idx
    on public.art_registrations (event_key, submitted_at desc);
create index if not exists art_team_members_registration_order_idx
    on public.art_team_members (registration_id, member_order);

create table if not exists public.art_registration_aggregates (
    event_key text primary key,
    registration_count integer not null check (registration_count >= 0),
    performer_count integer not null check (performer_count >= 0),
    individual_count integer not null check (individual_count >= 0),
    team_count integer not null check (team_count >= 0),
    purged_at timestamptz not null default now()
);

alter table public.art_registrations enable row level security;
alter table public.art_team_members enable row level security;
alter table public.art_registration_aggregates enable row level security;

revoke all on public.art_registrations, public.art_team_members, public.art_registration_aggregates
    from public, anon, authenticated;

grant select on public.art_registrations, public.art_team_members, public.art_registration_aggregates
    to authenticated;

drop policy if exists "Admins can view art registrations" on public.art_registrations;
drop policy if exists "Admins can view art team members" on public.art_team_members;
drop policy if exists "Admins can view art registration aggregates" on public.art_registration_aggregates;

create policy "Admins can view art registrations"
on public.art_registrations
for select
to authenticated
using ((select public.is_admin()));

create policy "Admins can view art team members"
on public.art_team_members
for select
to authenticated
using ((select public.is_admin()));

create policy "Admins can view art registration aggregates"
on public.art_registration_aggregates
for select
to authenticated
using ((select public.is_admin()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
    'art-registration-files',
    'art-registration-files',
    false,
    104857600,
    array[
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/octet-stream',
        'audio/mpeg',
        'audio/wav',
        'audio/x-wav',
        'video/mp4'
    ]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
