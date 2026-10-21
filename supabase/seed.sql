-- Optional LOCAL development data. No accounts or approvals are created here.
-- Create a test Auth account, approve it as a moderator, and run this script in the
-- same SQL session after: SET app.seed_moderator_id = '<test-account-uuid>';
-- Without that setting, seeding is skipped. Never use real resumes in seed data.
begin;
do $$
declare
    moderator_id text := nullif(current_setting('app.seed_moderator_id', true), '');
    old_claims text := current_setting('request.jwt.claims', true);
    old_subject text := current_setting('request.jwt.claim.sub', true);
begin
    if moderator_id is null then
        raise notice 'Seed skipped: set app.seed_moderator_id to an approved local test moderator UUID.';
        return;
    end if;
    -- Temporarily use the test moderator's identity so creation exercises the real RPC.
    perform set_config('request.jwt.claim.sub', moderator_id::uuid::text, true);
    perform set_config('request.jwt.claims', json_build_object('sub', moderator_id)::text, true);

    perform public.create_listing(
        'Software Engineering Intern', 'Example Company',
        'https://example.com/internships/software', 'hybrid',
        (now() at time zone 'America/New_York')::date + 30,
        '[{"city":"Boston","state":"MA"},{"city":"New York","state":"NY"}]'::jsonb
    );
    perform public.create_listing(
        'Marketing Intern', 'Example Organization',
        'https://example.org/internships/marketing', 'remote'
    );
    -- Restore the session's original identity after creating the examples.
    perform set_config('request.jwt.claims', coalesce(old_claims, ''), true);
    perform set_config('request.jwt.claim.sub', coalesce(old_subject, ''), true);
end;
$$;
commit;
