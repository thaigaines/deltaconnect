-- The members page marks accounts that haven't signed in yet as "Invited". Approval still happens
-- when the account is created; this only adds has_signed_in (opening the invite link counts).
-- Postgres can't change a function's result columns in place, so both functions are recreated.
DROP FUNCTION public.list_members();
DROP FUNCTION private.list_members();

-- Every approved member with their email, profile name (null without a profile), highest role,
-- and whether they have signed in at least once.
CREATE FUNCTION private.list_members()
RETURNS TABLE (user_id uuid, email text, first_name text, last_name text, role text, has_signed_in boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT private.is_approved_administrator() THEN
    RAISE EXCEPTION 'Administrator approval required.' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT m.user_id, u.email::text, p.first_name, p.last_name,
      CASE WHEN a.user_id IS NOT NULL THEN 'administrator'
        WHEN o.user_id IS NOT NULL THEN 'moderator'
        ELSE 'member' END,
      u.last_sign_in_at IS NOT NULL
    FROM private.approved_member m
    JOIN auth.users u ON u.id = m.user_id
    LEFT JOIN public.profile p ON p.user_id = m.user_id
    LEFT JOIN private.approved_moderator o ON o.user_id = m.user_id
    LEFT JOIN private.approved_administrator a ON a.user_id = m.user_id;
END;
$$;
REVOKE ALL ON FUNCTION private.list_members() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.list_members() TO authenticated;

CREATE FUNCTION public.list_members()
RETURNS TABLE (user_id uuid, email text, first_name text, last_name text, role text, has_signed_in boolean)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $$ SELECT * FROM private.list_members(); $$;
REVOKE ALL ON FUNCTION public.list_members() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_members() TO authenticated;
