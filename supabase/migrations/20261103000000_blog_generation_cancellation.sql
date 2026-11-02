alter table public.blog_posts
    drop constraint if exists blog_posts_generation_status_check;

alter table public.blog_posts
    add constraint blog_posts_generation_status_check
    check (generation_status in ('generating', 'completed', 'failed', 'cancelled'));
