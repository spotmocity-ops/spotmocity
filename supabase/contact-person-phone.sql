alter table public.submissions
    add column if not exists contact_person_phone text;
