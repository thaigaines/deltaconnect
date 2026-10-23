-- Enforces member/moderator/administrator access and ownership rules for listings, profiles,
-- the public member directory, the forum, member management, and public resume storage.
CREATE FUNCTION private.is_approved_member()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT EXISTS (SELECT 1 FROM private.approved_member WHERE user_id = auth.uid()); $$;
CREATE FUNCTION private.is_approved_moderator()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT EXISTS (SELECT 1 FROM private.approved_moderator WHERE user_id = auth.uid()); $$;
CREATE FUNCTION private.is_approved_administrator()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT EXISTS (SELECT 1 FROM private.approved_administrator WHERE user_id = auth.uid()); $$;
REVOKE ALL ON FUNCTION private.is_approved_member(), private.is_approved_moderator(), private.is_approved_administrator()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_approved_member(), private.is_approved_moderator(), private.is_approved_administrator()
  TO authenticated;
GRANT USAGE ON SCHEMA public TO anon, authenticated;

CREATE FUNCTION public.my_permissions()
RETURNS TABLE (is_member boolean, is_moderator boolean, is_administrator boolean)
LANGUAGE sql STABLE SET search_path = ''
AS $$ SELECT private.is_approved_member(), private.is_approved_moderator(), private.is_approved_administrator(); $$;
REVOKE ALL ON FUNCTION public.my_permissions() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.my_permissions() TO authenticated;

-- Every new Auth account becomes an approved member. Public sign-ups are off, so new accounts
-- come only from the owner's invites. Only runs on account creation: accounts kept through a
-- reset are not approved, and revoked members stay revoked.
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

-- Members see only published, active listings (never pending ones, including their own).
-- Moderators see every row. Moderators insert and update content columns; created_by and
-- created_at come from their defaults.
GRANT SELECT ON public.internship, public.internship_location TO authenticated;
GRANT INSERT (title, company, application_url, work_arrangement, deadline),
  UPDATE (title, company, application_url, work_arrangement, deadline, is_archived, is_pending), DELETE
  ON public.internship TO authenticated;
CREATE POLICY read_internships ON public.internship FOR SELECT TO authenticated USING (
  (SELECT private.is_approved_moderator()) OR (
    (SELECT private.is_approved_member()) AND NOT is_archived AND NOT is_pending
    AND (deadline IS NULL OR deadline >= (now() AT TIME ZONE 'America/New_York')::date)
  )
);
CREATE POLICY create_internships ON public.internship FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.is_approved_moderator()));
-- Moderators publish a request (is_pending -> false) by updating it.
CREATE POLICY edit_internships ON public.internship FOR UPDATE TO authenticated
  USING ((SELECT private.is_approved_moderator())) WITH CHECK ((SELECT private.is_approved_moderator()));
-- Moderators trash requests. Published listings can't be deleted, only archived.
-- Deleting a request also deletes its locations (ON DELETE CASCADE).
CREATE POLICY delete_pending_internships ON public.internship FOR DELETE TO authenticated
  USING ((SELECT private.is_approved_moderator()) AND is_pending);
GRANT INSERT (internship_id, city, state), UPDATE (city, state), DELETE
  ON public.internship_location TO authenticated;

-- Locations follow their internship's visibility.
CREATE POLICY read_locations ON public.internship_location FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.internship i WHERE i.id = internship_id));

CREATE POLICY create_locations ON public.internship_location FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.is_approved_moderator()));

CREATE POLICY edit_locations ON public.internship_location FOR UPDATE TO authenticated
  USING ((SELECT private.is_approved_moderator())) WITH CHECK ((SELECT private.is_approved_moderator()));

CREATE POLICY delete_locations ON public.internship_location FOR DELETE TO authenticated
  USING ((SELECT private.is_approved_moderator()));

-- Replaces a listing's locations with p_locations ([{ "city": ..., "state": ... }]). It runs with
-- the caller's permissions, and its callers run it inside their own transaction, so any failed
-- insert rolls back the whole save. Deleting first lets a kept location be inserted again.
CREATE FUNCTION private.replace_locations(p_listing_id uuid, p_locations jsonb)
RETURNS void LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  location jsonb;
BEGIN
  IF p_locations IS NULL OR jsonb_typeof(p_locations) <> 'array' THEN
    RAISE EXCEPTION 'Locations must be an array.' USING ERRCODE = '22023';
  END IF;
  DELETE FROM public.internship_location WHERE internship_id = p_listing_id;
  FOR location IN SELECT value FROM jsonb_array_elements(p_locations) LOOP
    IF jsonb_typeof(location -> 'city') IS DISTINCT FROM 'string'
      OR jsonb_typeof(location -> 'state') IS DISTINCT FROM 'string' THEN
      RAISE EXCEPTION 'Each location needs city/state strings.' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.internship_location (internship_id, city, state)
      VALUES (p_listing_id, btrim(location ->> 'city'), upper(btrim(location ->> 'state')));
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION private.replace_locations(uuid, jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.replace_locations(uuid, jsonb) TO authenticated;

-- Creates a listing and its locations atomically: published for moderators, pending for members.
-- SECURITY DEFINER because members can't read pending rows, which the insert must return; so it
-- lives in the unexposed private schema and checks member approval itself.
CREATE FUNCTION private.create_listing(
  p_title text, p_company text, p_application_url text, p_work_arrangement text,
  p_deadline date, p_locations jsonb, p_allow_duplicate boolean
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  listing_id uuid;
  clean_url text := btrim(p_application_url);
BEGIN
  IF NOT private.is_approved_member() THEN
    RAISE EXCEPTION 'Member approval required.' USING ERRCODE = '42501';
  END IF;
  -- Serialize creation for this URL so simultaneous submissions see duplicates.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(clean_url, 0));
  -- Duplicates include pending and hidden rows, so members don't request a listing twice.
  IF NOT coalesce(p_allow_duplicate, false) AND EXISTS (
    SELECT 1 FROM public.internship WHERE application_url = clean_url
  ) THEN
    RAISE EXCEPTION 'Duplicate application URL. Confirm to proceed.' USING ERRCODE = '23505';
  END IF;
  -- created_by comes from its default, auth.uid(), which is still the caller here.
  INSERT INTO public.internship (title, company, application_url, work_arrangement, deadline, is_pending)
    VALUES (btrim(p_title), btrim(p_company), clean_url, p_work_arrangement, p_deadline,
      NOT private.is_approved_moderator())
    RETURNING id INTO listing_id;
  PERFORM private.replace_locations(listing_id, p_locations);
  RETURN listing_id;
END;
$$;
REVOKE ALL ON FUNCTION private.create_listing(text,text,text,text,date,jsonb,boolean)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.create_listing(text,text,text,text,date,jsonb,boolean) TO authenticated;

-- The app's creation path. The exposed entry point runs with the caller's permissions and hands
-- off to the private function (Supabase advises against SECURITY DEFINER in exposed schemas).
CREATE FUNCTION public.create_listing(
  p_title text, p_company text, p_application_url text, p_work_arrangement text,
  p_deadline date DEFAULT NULL, p_locations jsonb DEFAULT '[]', p_allow_duplicate boolean DEFAULT false
)
RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $$ SELECT private.create_listing(p_title, p_company, p_application_url, p_work_arrangement,
  p_deadline, p_locations, p_allow_duplicate); $$;
REVOKE ALL ON FUNCTION public.create_listing(text,text,text,text,date,jsonb,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_listing(text,text,text,text,date,jsonb,boolean) TO authenticated;

-- Moderators save a listing's details and locations atomically. Runs with the caller's
-- permissions, so RLS still checks every write.
CREATE FUNCTION public.update_listing(
  p_listing_id uuid, p_title text, p_company text, p_application_url text, p_work_arrangement text,
  p_deadline date, p_is_archived boolean, p_locations jsonb
)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF NOT private.is_approved_moderator() THEN
    RAISE EXCEPTION 'Moderator approval required.' USING ERRCODE = '42501';
  END IF;
  UPDATE public.internship
    SET title = btrim(p_title), company = btrim(p_company), application_url = btrim(p_application_url),
      work_arrangement = p_work_arrangement, deadline = p_deadline, is_archived = coalesce(p_is_archived, false)
    WHERE id = p_listing_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Listing not found.' USING ERRCODE = 'P0002';
  END IF;
  PERFORM private.replace_locations(p_listing_id, p_locations);
END;
$$;
REVOKE ALL ON FUNCTION public.update_listing(uuid,text,text,text,text,date,boolean,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_listing(uuid,text,text,text,text,date,boolean,jsonb) TO authenticated;

-- Members see every profile (forum author names); anyone signed in sees their own. Visitors read
-- profiles only through list_directory(). Approved members create and edit only their own.
GRANT SELECT ON public.profile TO authenticated;
GRANT INSERT (user_id, first_name, last_name, major, graduation_term, graduation_year, linkedin_url),
  UPDATE (first_name, last_name, major, graduation_term, graduation_year, linkedin_url)
  ON public.profile TO authenticated;
CREATE POLICY read_profiles ON public.profile FOR SELECT TO authenticated USING (
  (SELECT private.is_approved_member())
  OR user_id = (SELECT auth.uid())
);
CREATE POLICY create_profile ON public.profile FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.is_approved_member()) AND user_id = (SELECT auth.uid()));
CREATE POLICY edit_profile ON public.profile FOR UPDATE TO authenticated
  USING ((SELECT private.is_approved_member()) AND user_id = (SELECT auth.uid()))
  WITH CHECK ((SELECT private.is_approved_member()) AND user_id = (SELECT auth.uid()));

-- Contact details and directory choices: only the owner reads or writes their row.
GRANT SELECT ON public.profile_contact TO authenticated;
GRANT INSERT (user_id, phone, show_in_directory, show_email, show_phone),
  UPDATE (phone, show_in_directory, show_email, show_phone)
  ON public.profile_contact TO authenticated;
CREATE POLICY read_own_contact ON public.profile_contact FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));
CREATE POLICY create_own_contact ON public.profile_contact FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.is_approved_member()) AND user_id = (SELECT auth.uid()));
CREATE POLICY edit_own_contact ON public.profile_contact FOR UPDATE TO authenticated
  USING ((SELECT private.is_approved_member()) AND user_id = (SELECT auth.uid()))
  WITH CHECK ((SELECT private.is_approved_member()) AND user_id = (SELECT auth.uid()));

-- Public member directory. Visitors can't read profiles, contacts, resumes, or auth.users, so this
-- SECURITY DEFINER function in private returns only what each approved member chose to share:
-- members who opted in, with email and phone only when those are switched on. Revoked members drop out.
CREATE FUNCTION private.list_directory()
RETURNS TABLE (user_id uuid, first_name text, last_name text, major text, graduation_term text,
  graduation_year smallint, linkedin_url text, object_path text, email text, phone text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT p.user_id, p.first_name, p.last_name, p.major, p.graduation_term, p.graduation_year,
    p.linkedin_url, r.object_path,
    CASE WHEN c.show_email THEN u.email::text END,
    CASE WHEN c.show_phone THEN c.phone END
  FROM public.profile_contact c
  JOIN private.approved_member m ON m.user_id = c.user_id
  JOIN public.profile p ON p.user_id = c.user_id
  JOIN auth.users u ON u.id = c.user_id
  LEFT JOIN public.resume r ON r.user_id = c.user_id
  WHERE c.show_in_directory;
$$;
REVOKE ALL ON FUNCTION private.list_directory() FROM PUBLIC, anon, authenticated, service_role;
-- Visitors need the private schema for this one function; everything else in it stays revoked,
-- and future private functions start without the default PUBLIC execute permission.
GRANT USAGE ON SCHEMA private TO anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA private REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.list_directory() TO anon, authenticated;

CREATE FUNCTION public.list_directory()
RETURNS TABLE (user_id uuid, first_name text, last_name text, major text, graduation_term text,
  graduation_year smallint, linkedin_url text, object_path text, email text, phone text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $$ SELECT * FROM private.list_directory(); $$;
REVOKE ALL ON FUNCTION public.list_directory() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_directory() TO anon, authenticated;

-- Forum: only members read. Members write their own posts and comments; authors or moderators delete.
-- created_at, edited_at, and is_pinned are not client-writable.
GRANT SELECT, DELETE ON public.forum_post, public.forum_comment TO authenticated;
GRANT INSERT (user_id, title, body), UPDATE (title, body) ON public.forum_post TO authenticated;
GRANT INSERT (forum_post_id, user_id, body), UPDATE (body) ON public.forum_comment TO authenticated;
CREATE POLICY read_forum_posts ON public.forum_post FOR SELECT TO authenticated
  USING ((SELECT private.is_approved_member()));
CREATE POLICY create_forum_post ON public.forum_post FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.is_approved_member()) AND user_id = (SELECT auth.uid()));
CREATE POLICY edit_forum_post ON public.forum_post FOR UPDATE TO authenticated
  USING ((SELECT private.is_approved_member()) AND user_id = (SELECT auth.uid()))
  WITH CHECK ((SELECT private.is_approved_member()) AND user_id = (SELECT auth.uid()));
CREATE POLICY delete_forum_post ON public.forum_post FOR DELETE TO authenticated USING (
  ((SELECT private.is_approved_member()) AND user_id = (SELECT auth.uid()))
  OR (SELECT private.is_approved_moderator())
);
CREATE POLICY read_forum_comments ON public.forum_comment FOR SELECT TO authenticated
  USING ((SELECT private.is_approved_member()));
CREATE POLICY create_forum_comment ON public.forum_comment FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.is_approved_member()) AND user_id = (SELECT auth.uid()));
CREATE POLICY edit_forum_comment ON public.forum_comment FOR UPDATE TO authenticated
  USING ((SELECT private.is_approved_member()) AND user_id = (SELECT auth.uid()))
  WITH CHECK ((SELECT private.is_approved_member()) AND user_id = (SELECT auth.uid()));
CREATE POLICY delete_forum_comment ON public.forum_comment FOR DELETE TO authenticated USING (
  ((SELECT private.is_approved_member()) AND user_id = (SELECT auth.uid()))
  OR (SELECT private.is_approved_moderator())
);

-- Marks a post or comment as edited when its text changes. Comments have no title, so
-- to_jsonb reads title as null for both versions of a comment.
CREATE FUNCTION private.stamp_forum_edit()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.body IS DISTINCT FROM OLD.body
    OR to_jsonb(NEW) ->> 'title' IS DISTINCT FROM to_jsonb(OLD) ->> 'title' THEN
    NEW.edited_at := now();
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.stamp_forum_edit() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER stamp_forum_post_edit BEFORE UPDATE ON public.forum_post
  FOR EACH ROW EXECUTE FUNCTION private.stamp_forum_edit();
CREATE TRIGGER stamp_forum_comment_edit BEFORE UPDATE ON public.forum_comment
  FOR EACH ROW EXECUTE FUNCTION private.stamp_forum_edit();

-- Forum pinning. Moderators change is_pinned only through set_forum_post_pinned(), so authors
-- can't pin and moderators still can't edit others' text.
-- SECURITY DEFINER bypasses the author-only edit policy, so it lives in the unexposed private
-- schema and checks moderator approval itself.
CREATE FUNCTION private.set_forum_post_pinned(p_post_id uuid, p_pinned boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT private.is_approved_moderator() THEN
    RAISE EXCEPTION 'Moderator approval required.' USING ERRCODE = '42501';
  END IF;
  UPDATE public.forum_post SET is_pinned = coalesce(p_pinned, false) WHERE id = p_post_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Post not found.' USING ERRCODE = 'P0002';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION private.set_forum_post_pinned(uuid, boolean) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.set_forum_post_pinned(uuid, boolean) TO authenticated;

-- The exposed entry point runs with the caller's permissions and hands off to the private check.
CREATE FUNCTION public.set_forum_post_pinned(p_post_id uuid, p_pinned boolean)
RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $$ SELECT private.set_forum_post_pinned(p_post_id, p_pinned); $$;
REVOKE ALL ON FUNCTION public.set_forum_post_pinned(uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_forum_post_pinned(uuid, boolean) TO authenticated;

-- Member management (administrators only). Emails live in auth.users and roles in private,
-- neither reachable by clients, so both functions are SECURITY DEFINER in private and check
-- administrator approval themselves; public wrappers expose them with the caller's permissions.

-- Every approved member with their email, profile name (null without a profile), highest role,
-- and whether they have signed in at least once (opening the invite link counts).
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

-- Grants (true) or removes (false) a member's moderator role. Administrators keep theirs.
CREATE FUNCTION private.set_moderator(p_user_id uuid, p_is_moderator boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT private.is_approved_administrator() THEN
    RAISE EXCEPTION 'Administrator approval required.' USING ERRCODE = '42501';
  END IF;
  IF p_is_moderator IS NULL THEN
    RAISE EXCEPTION 'Choose whether to grant or remove the moderator role.' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM private.approved_member WHERE user_id = p_user_id) THEN
    RAISE EXCEPTION 'Member not found.' USING ERRCODE = 'P0002';
  END IF;
  -- Removing their moderator row would also remove their administrator row (ON DELETE CASCADE).
  -- The default error code (P0001) lets the app show this message instead of a generic one.
  IF EXISTS (SELECT 1 FROM private.approved_administrator WHERE user_id = p_user_id) THEN
    RAISE EXCEPTION 'Administrators always keep the moderator role.';
  END IF;
  IF p_is_moderator THEN
    INSERT INTO private.approved_moderator (user_id) VALUES (p_user_id) ON CONFLICT DO NOTHING;
  ELSE
    DELETE FROM private.approved_moderator WHERE user_id = p_user_id;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION private.set_moderator(uuid, boolean) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.set_moderator(uuid, boolean) TO authenticated;

CREATE FUNCTION public.set_moderator(p_user_id uuid, p_is_moderator boolean)
RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $$ SELECT private.set_moderator(p_user_id, p_is_moderator); $$;
REVOKE ALL ON FUNCTION public.set_moderator(uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_moderator(uuid, boolean) TO authenticated;

-- Members read and change only their own resume metadata; visitors see resumes through
-- list_directory(), which lists only members who opted in.
GRANT SELECT ON public.resume TO authenticated;
GRANT INSERT (user_id, object_path, original_filename), UPDATE (object_path, original_filename), DELETE
  ON public.resume TO authenticated;
CREATE POLICY read_own_resume ON public.resume FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));
CREATE POLICY create_resume ON public.resume FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.is_approved_member()) AND user_id = (SELECT auth.uid()));
CREATE POLICY edit_resume ON public.resume FOR UPDATE TO authenticated
  USING ((SELECT private.is_approved_member()) AND user_id = (SELECT auth.uid()))
  WITH CHECK ((SELECT private.is_approved_member()) AND user_id = (SELECT auth.uid()));
CREATE POLICY delete_resume ON public.resume FOR DELETE TO authenticated
  USING ((SELECT private.is_approved_member()) AND user_id = (SELECT auth.uid()));

CREATE FUNCTION private.stamp_resume()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  NEW.uploaded_at := now();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.stamp_resume() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER stamp_resume BEFORE INSERT OR UPDATE ON public.resume
  FOR EACH ROW EXECUTE FUNCTION private.stamp_resume();

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('dsp-public-resumes', 'dsp-public-resumes', true, 500000, ARRAY['application/pdf'])
ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = 500000,
  allowed_mime_types = ARRAY['application/pdf'];
-- Members may upload, inspect, and delete PDFs directly inside their own folder.
-- Files are never overwritten, so there is no UPDATE policy.
CREATE POLICY upload_resume_file ON storage.objects FOR INSERT TO authenticated WITH CHECK (
  (SELECT private.is_approved_member()) AND bucket_id = 'dsp-public-resumes'
  AND name ~ ('^' || (SELECT auth.uid())::text || '/[^/]+\.pdf$')
);
CREATE POLICY inspect_resume_file ON storage.objects FOR SELECT TO authenticated USING (
  (SELECT private.is_approved_member()) AND bucket_id = 'dsp-public-resumes'
  AND name ~ ('^' || (SELECT auth.uid())::text || '/[^/]+\.pdf$')
);
CREATE POLICY delete_resume_file ON storage.objects FOR DELETE TO authenticated USING (
  (SELECT private.is_approved_member()) AND bucket_id = 'dsp-public-resumes'
  AND name ~ ('^' || (SELECT auth.uid())::text || '/[^/]+\.pdf$')
);
