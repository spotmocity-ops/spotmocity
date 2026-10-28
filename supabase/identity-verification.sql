alter table public.submissions
    add column if not exists identity_document_path text,
    add column if not exists identity_verified boolean not null default false,
    add column if not exists identity_verified_at timestamptz,
    add column if not exists verification_phone text,
    add column if not exists phone_verified_at timestamptz,
    add column if not exists terms_version text;

drop policy if exists "Public can submit pending activities" on public.submissions;

create policy "Public can submit pending activities"
on public.submissions
for insert
to anon, authenticated
with check (
    identity_type in ('club', 'org', 'personal')
    and
    status = 'pending'
    and is_locked = false
    and identity_verified = false
    and identity_verified_at is null
    and phone_verified_at is null
    and (
        identity_document_path is null
        or identity_document_path ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(identity|business)-proof\.(pdf|jpg|jpeg|png|webp)$'
    )
    and (
        nullif(btrim(reg_number), '') is not null
        or identity_document_path is not null
    )
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
    'identity-documents',
    'identity-documents',
    false,
    10485760,
    array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = false,
    file_size_limit = 10485760,
    allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

drop policy if exists "Public can upload identity verification documents" on storage.objects;
drop policy if exists "Admins can view identity verification documents" on storage.objects;
drop policy if exists "Admins can delete identity verification documents" on storage.objects;

create policy "Public can upload identity verification documents"
on storage.objects
for insert
to anon, authenticated
with check (
    bucket_id = 'identity-documents'
    and name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(identity|business)-proof\.(pdf|jpg|jpeg|png|webp)$'
);

create policy "Admins can view identity verification documents"
on storage.objects
for select
to authenticated
using (bucket_id = 'identity-documents' and (select public.is_admin()));

create policy "Admins can delete identity verification documents"
on storage.objects
for delete
to authenticated
using (bucket_id = 'identity-documents' and (select public.is_admin()));
