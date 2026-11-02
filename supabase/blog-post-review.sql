create table if not exists public.blog_posts (
    id uuid primary key default gen_random_uuid(),
    activity_date date not null unique,
    suggested_title text not null,
    title text not null,
    html_content text not null default '',
    canva_card_text text not null default '',
    ig_caption text not null default '',
    hashtags text not null default '',
    cover_image_url text not null default '',
    source_activity_ids bigint[] not null default '{}',
    generation_id uuid,
    generation_status text not null default 'completed' check (generation_status in ('generating', 'completed', 'failed')),
    generation_error text not null default '',
    status text not null default 'draft' check (status in ('draft', 'published')),
    published_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists blog_posts_status_activity_date_idx
    on public.blog_posts (status, activity_date desc);

alter table public.blog_posts
    add column if not exists generation_id uuid,
    add column if not exists generation_status text not null default 'completed',
    add column if not exists generation_error text not null default '';

alter table public.blog_posts
    drop constraint if exists blog_posts_generation_status_check;

alter table public.blog_posts
    add constraint blog_posts_generation_status_check
    check (generation_status in ('generating', 'completed', 'failed'));

alter table public.blog_posts enable row level security;

drop policy if exists "Public can read published blog posts" on public.blog_posts;
create policy "Public can read published blog posts"
on public.blog_posts
for select
to anon, authenticated
using (status = 'published' or (select public.is_admin()));

drop policy if exists "Admins can insert blog posts" on public.blog_posts;
create policy "Admins can insert blog posts"
on public.blog_posts
for insert
to authenticated
with check ((select public.is_admin()));

drop policy if exists "Admins can update blog posts" on public.blog_posts;
create policy "Admins can update blog posts"
on public.blog_posts
for update
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

drop policy if exists "Admins can delete blog posts" on public.blog_posts;
create policy "Admins can delete blog posts"
on public.blog_posts
for delete
to authenticated
using ((select public.is_admin()));

revoke all on public.blog_posts from public;
revoke all on public.blog_posts from anon, authenticated;
grant select (id, activity_date, title, html_content, cover_image_url, status) on public.blog_posts to anon;
grant select on public.blog_posts to authenticated;
grant insert, update, delete on public.blog_posts to authenticated;

create or replace function public.publish_blog_post(p_blog_post_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    post public.blog_posts%rowtype;
    existing_links jsonb;
    retained_links jsonb;
    updated_links jsonb;
    blog_url text;
    blog_excerpt text;
begin
    if not (select public.is_admin()) then
        raise exception 'Administrator access is required to publish a blog post.';
    end if;

    update public.blog_posts
    set status = 'published',
        published_at = coalesce(published_at, now()),
        updated_at = now()
    where id = p_blog_post_id
    returning * into post;

    if not found then
        raise exception 'Blog post not found.';
    end if;

    blog_url := 'blog.html?id=' || post.id::text;
    blog_excerpt := left(regexp_replace(post.html_content, '<[^>]*>', ' ', 'g'), 240);
    select coalesce(value::jsonb, '[]'::jsonb)
    into existing_links
    from public.site_settings
    where key = 'home_blog_items'
    for update;
    existing_links := coalesce(existing_links, '[]'::jsonb);

    if jsonb_typeof(existing_links) <> 'array' then
        raise exception 'Homepage blog links must be a JSON array.';
    end if;

    select coalesce(jsonb_agg(item order by ordinal), '[]'::jsonb)
    into retained_links
    from jsonb_array_elements(existing_links) with ordinality as entries(item, ordinal)
    where item ->> 'url' is distinct from blog_url;

    updated_links := jsonb_build_array(jsonb_build_object(
        'title', post.title,
        'excerpt', blog_excerpt,
        'imageUrl', post.cover_image_url,
        'url', blog_url
    )) || retained_links;

    insert into public.site_settings (key, value)
    values ('home_blog_items', updated_links::text)
    on conflict (key) do update
        set value = excluded.value,
            updated_at = now();
end;
$$;

revoke all on function public.publish_blog_post(uuid) from public, anon;
grant execute on function public.publish_blog_post(uuid) to authenticated;
