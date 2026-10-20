-- Listing requests: any approved member submits a full listing, which starts pending (hidden from
-- members). Editors edit it, including its locations, then publish it or trash (delete) it.
-- Replaces internship_suggestion, so any suggestions still in that table are dropped.

-- Existing listings stay published. A row inserted directly (editors only) is published too;
-- create_listing() marks member submissions pending.
ALTER TABLE public.internship ADD COLUMN is_pending boolean NOT NULL DEFAULT false;

-- Members never see pending rows, including their own; editors still see every row.
-- Locations follow automatically, since read_locations checks the visible internship.
ALTER POLICY read_internships ON public.internship USING (
  (SELECT private.is_approved_editor()) OR (
    (SELECT private.is_approved_member()) AND NOT is_archived AND NOT is_pending
    AND (deadline IS NULL OR deadline >= (now() AT TIME ZONE 'America/New_York')::date)
  )
);

-- Editors publish a request (is_pending -> false) or trash it. Published listings still can't be
-- deleted, only archived. Deleting a request also deletes its locations (ON DELETE CASCADE).
GRANT UPDATE (is_pending), DELETE ON public.internship TO authenticated;
CREATE POLICY delete_pending_internships ON public.internship FOR DELETE TO authenticated
  USING ((SELECT private.is_approved_editor()) AND is_pending);

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

-- Creates a listing and its locations atomically: published for editors, pending for members.
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
      NOT private.is_approved_editor())
    RETURNING id INTO listing_id;
  PERFORM private.replace_locations(listing_id, p_locations);
  RETURN listing_id;
END;
$$;
REVOKE ALL ON FUNCTION private.create_listing(text,text,text,text,date,jsonb,boolean)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.create_listing(text,text,text,text,date,jsonb,boolean) TO authenticated;

-- Same name and arguments as before, so the app's call doesn't change. The exposed entry point
-- runs with the caller's permissions and hands off to the private function. Existing grants stay.
CREATE OR REPLACE FUNCTION public.create_listing(
  p_title text, p_company text, p_application_url text, p_work_arrangement text,
  p_deadline date DEFAULT NULL, p_locations jsonb DEFAULT '[]', p_allow_duplicate boolean DEFAULT false
)
RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $$ SELECT private.create_listing(p_title, p_company, p_application_url, p_work_arrangement,
  p_deadline, p_locations, p_allow_duplicate); $$;

-- Editors save a listing's details and locations atomically. Runs with the caller's permissions,
-- so RLS still checks every write.
CREATE FUNCTION public.update_listing(
  p_listing_id uuid, p_title text, p_company text, p_application_url text, p_work_arrangement text,
  p_deadline date, p_is_archived boolean, p_locations jsonb
)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF NOT private.is_approved_editor() THEN
    RAISE EXCEPTION 'Editor approval required.' USING ERRCODE = '42501';
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

DROP TABLE public.internship_suggestion;
