grant delete on public.curated_activity_drafts to authenticated;

drop policy if exists "Admins can delete curated activity drafts" on public.curated_activity_drafts;

create policy "Admins can delete curated activity drafts"
on public.curated_activity_drafts
for delete
to authenticated
using ((select public.is_admin()));
