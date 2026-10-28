update storage.buckets
set file_size_limit = 52428800,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'video/mp4']
where id = 'homepage-content';

drop policy if exists "Admins can upload homepage images" on storage.objects;

create policy "Admins can upload homepage images"
on storage.objects
for insert
to authenticated
with check (
    bucket_id = 'homepage-content'
    and (
        name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(blog|ad|hero|hero-mobile|hero-frame|hero-mobile-frame)-image\.(jpg|jpeg|png|webp)$'
        or name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/hero-video\.mp4$'
    )
    and (select public.is_admin())
);
