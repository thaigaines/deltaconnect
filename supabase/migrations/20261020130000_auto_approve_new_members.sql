-- Every new Auth account becomes an approved member. Public sign-ups are off, so new accounts
-- come only from the owner's invites. Editors and moderators are still approved by hand.
-- Only runs on account creation: existing accounts are not approved, and revoked members stay revoked.

-- SECURITY DEFINER because no client role can write the approval tables. If this insert fails,
-- the account isn't created either, so an account never exists without its approval.
CREATE FUNCTION private.approve_new_member()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO private.approved_member (user_id) VALUES (NEW.id);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.approve_new_member() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER approve_new_member AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION private.approve_new_member();
