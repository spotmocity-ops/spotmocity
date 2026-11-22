alter table public.admin_users
    add column if not exists role text not null default 'full';

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname = 'admin_users_role_check'
          and conrelid = 'public.admin_users'::regclass
    ) then
        alter table public.admin_users
            add constraint admin_users_role_check
            check (role in ('full', 'registration'));
    end if;
end
$$;

create or replace function public.get_admin_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
    select role
    from public.admin_users
    where user_id = (select auth.uid())
    limit 1;
$$;

create or replace function public.is_registration_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1
        from public.admin_users
        where user_id = (select auth.uid())
          and role in ('full', 'registration')
    );
$$;

revoke all on function public.get_admin_role() from public;
grant execute on function public.get_admin_role() to authenticated;
revoke all on function public.is_registration_admin() from public;
grant execute on function public.is_registration_admin() to authenticated;
