create schema if not exists extensions;
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

do $$
begin
    if not exists (
        select 1
        from vault.decrypted_secrets
        where name = 'activity-curation-function-url'
          and decrypted_secret is not null
          and decrypted_secret <> ''
    ) then
        raise exception 'Vault secret activity-curation-function-url is missing';
    end if;

    if not exists (
        select 1
        from vault.decrypted_secrets
        where name = 'activity-curation-cron-secret' 
          and decrypted_secret is not null
          and decrypted_secret <> ''
    ) then
        raise exception 'Vault secret activity-curation-cron-secret is missing';
    end if;
end;
$$;

do $$
declare
    existing_job record;
begin
    for existing_job in
        select jobid
        from cron.job
        where jobname = 'daily-activity-curation'
    loop
        perform cron.unschedule(existing_job.jobid);
    end loop;
end;
$$;

select cron.schedule(
    'daily-activity-curation',
    '40 9 * * *',
    $job$
    select net.http_post(
        url := (
            select decrypted_secret
            from vault.decrypted_secrets
            where name = 'activity-curation-function-url'
        ),
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-cron-secret', (
                select decrypted_secret
                from vault.decrypted_secrets
                where name = 'activity-curation-cron-secret'
            )
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 120000
    );
    $job$
);
