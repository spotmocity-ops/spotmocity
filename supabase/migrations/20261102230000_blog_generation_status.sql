alter table public.blog_posts
    add column if not exists generation_id uuid,
    add column if not exists generation_status text not null default 'completed',
    add column if not exists generation_error text not null default '';

alter table public.blog_posts
    drop constraint if exists blog_posts_generation_status_check;

alter table public.blog_posts
    add constraint blog_posts_generation_status_check
    check (generation_status in ('generating', 'completed', 'failed'));
