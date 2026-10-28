drop policy if exists "Require responsible person phone" on public.submissions;

create policy "Require responsible person phone"
on public.submissions
as restrictive
for insert
to anon, authenticated
with check (
    identity_type not in ('club', 'org')
    or (nullif(btrim(contact_person_phone), '') is not null and length(contact_person_phone) <= 50)
);
