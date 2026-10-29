grant insert on public.curated_activity_drafts to authenticated;

drop policy if exists "Admins can insert curated activity drafts"
    on public.curated_activity_drafts;

create policy "Admins can insert curated activity drafts"
on public.curated_activity_drafts
for insert
to authenticated
with check ((select public.is_admin()));
