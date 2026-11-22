create table if not exists public.racm_registrations (
    id uuid primary key default gen_random_uuid(),
    reference_number text,
    english_name text not null,
    chinese_name text not null,
    birth_date_ciphertext text not null,
    birth_date_iv text not null,
    macau_id_ciphertext text not null,
    macau_id_iv text not null,
    gender text not null check (gender in ('Male', 'Female', 'Prefer not to say')),
    occupation text not null,
    phone text not null check (phone ~ '^[0-9]{8}$'),
    wechat_id text not null,
    email text not null,
    stage1 boolean not null default false,
    stage2 boolean not null default false,
    stage3 boolean not null default false,
    stage4 boolean not null default false,
    stage5 boolean not null default false,
    criteria_consent boolean not null check (criteria_consent),
    programme_consent boolean not null check (programme_consent),
    review_status text not null default 'pending' check (review_status in ('pending', 'included', 'excluded')),
    submitted_at timestamptz not null default now()
);

alter table public.racm_registrations
    add column if not exists reference_number text;

create sequence if not exists public.racm_registration_reference_seq
    start with 1
    increment by 1
    no cycle;

create or replace function public.next_racm_registration_reference()
returns text
language sql
volatile
as $$
    select lpad(nextval('public.racm_registration_reference_seq')::text, 4, '0');
$$;

alter table public.racm_registrations
    alter column reference_number set default public.next_racm_registration_reference();

update public.racm_registrations
set reference_number = public.next_racm_registration_reference()
where reference_number is null;

alter table public.racm_registrations
    alter column reference_number set not null;

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname = 'racm_registration_reference_number_unique'
          and conrelid = 'public.racm_registrations'::regclass
    ) then
        alter table public.racm_registrations
            add constraint racm_registration_reference_number_unique unique (reference_number);
    end if;
end
$$;

alter table public.racm_registrations enable row level security;
revoke all on public.racm_registrations from public, anon, authenticated;
grant select on public.racm_registrations to authenticated;

drop policy if exists "Admins can view RACM registrations" on public.racm_registrations;
create policy "Admins can view RACM registrations"
on public.racm_registrations
for select
to authenticated
using ((select public.is_admin()));
