-- Enforces member/editor access and ownership rules for public resume storage.
CREATE FUNCTION private.is_approved_member()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT EXISTS (SELECT 1 FROM private.approved_member WHERE user_id = auth.uid()); $$;
CREATE FUNCTION private.is_approved_editor()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT EXISTS (SELECT 1 FROM private.approved_editor WHERE user_id = auth.uid()); $$;
REVOKE ALL ON FUNCTION private.is_approved_member(), private.is_approved_editor() FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_approved_member(), private.is_approved_editor() TO authenticated;
GRANT USAGE ON SCHEMA public TO anon, authenticated;

CREATE FUNCTION public.my_permissions()
RETURNS TABLE (is_member boolean, is_editor boolean)
LANGUAGE sql STABLE SET search_path = ''
AS $$ SELECT private.is_approved_member(), private.is_approved_editor(); $$;
REVOKE ALL ON FUNCTION public.my_permissions() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.my_permissions() TO authenticated;

-- Editors see every listing. Regular members see only active listings.
GRANT SELECT ON public.internship, public.internship_location TO authenticated;
GRANT UPDATE (title, company, application_url, work_arrangement, deadline, is_archived)
  ON public.internship TO authenticated;
CREATE POLICY read_internships ON public.internship FOR SELECT TO authenticated USING (
  (SELECT private.is_approved_editor()) OR (
    (SELECT private.is_approved_member()) AND NOT is_archived
    AND (deadline IS NULL OR deadline >= (now() AT TIME ZONE 'America/New_York')::date)
  )
);
CREATE POLICY edit_internships ON public.internship FOR UPDATE TO authenticated
  USING ((SELECT private.is_approved_editor())) WITH CHECK ((SELECT private.is_approved_editor()));
GRANT INSERT (internship_id, city, state), UPDATE (city, state), DELETE
  ON public.internship_location TO authenticated;

CREATE POLICY read_locations ON public.internship_location FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.internship i WHERE i.id = internship_id));

CREATE POLICY create_locations ON public.internship_location FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.is_approved_editor()));

CREATE POLICY edit_locations ON public.internship_location FOR UPDATE TO authenticated
  USING ((SELECT private.is_approved_editor())) WITH CHECK ((SELECT private.is_approved_editor()));

CREATE POLICY delete_locations ON public.internship_location FOR DELETE TO authenticated
  USING ((SELECT private.is_approved_editor()));

-- This RPC is the only client creation path, so listing and locations are atomic.
CREATE FUNCTION public.create_listing(
  p_title text, p_company text, p_application_url text, p_work_arrangement text,
  p_deadline date DEFAULT NULL, p_locations jsonb DEFAULT '[]', p_allow_duplicate boolean DEFAULT false
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  listing_id uuid;
  clean_url text := btrim(p_application_url);
  location jsonb;
BEGIN
  -- If the caller isn't an approved editor, raise an error before creating anything.
  IF NOT private.is_approved_editor() THEN
    RAISE EXCEPTION 'Editor approval required.' USING ERRCODE = '42501';
  END IF;
  IF p_locations IS NULL OR jsonb_typeof(p_locations) <> 'array' THEN
    RAISE EXCEPTION 'Locations must be an array.' USING ERRCODE = '22023';
  END IF;
  -- Serialize creation for this URL so simultaneous submissions see duplicates.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(clean_url, 0));
  -- If a matching URL exists and no override was given, stop with a duplicate error.
  IF NOT coalesce(p_allow_duplicate, false) AND EXISTS (
    SELECT 1 FROM public.internship WHERE application_url = clean_url
  ) THEN
    RAISE EXCEPTION 'Duplicate application URL. Confirm to proceed.' USING ERRCODE = '23505';
  END IF;
  INSERT INTO public.internship (title, company, application_url, work_arrangement, deadline, created_by, created_at)
    VALUES (btrim(p_title), btrim(p_company), clean_url, p_work_arrangement, p_deadline, auth.uid(), now())
    RETURNING id INTO listing_id;
  -- For each location, check its value types, then insert the cleaned city/state.
  -- Any failed insert rolls back the listing and its locations together.
  FOR location IN SELECT value FROM jsonb_array_elements(p_locations) LOOP
    IF jsonb_typeof(location -> 'city') IS DISTINCT FROM 'string'
      OR jsonb_typeof(location -> 'state') IS DISTINCT FROM 'string' THEN
      RAISE EXCEPTION 'Each location needs city/state strings.' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.internship_location (internship_id, city, state)
      VALUES (listing_id, btrim(location ->> 'city'), upper(btrim(location ->> 'state')));
  END LOOP;
  RETURN listing_id;
END;
$$;
REVOKE ALL ON FUNCTION public.create_listing(text,text,text,text,date,jsonb,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_listing(text,text,text,text,date,jsonb,boolean) TO authenticated;

-- Resume listings are public, but only members may change their own metadata.
GRANT SELECT (first_name, last_name, major, object_path, original_filename, uploaded_at) ON public.resume TO anon;
GRANT SELECT ON public.resume TO authenticated;
GRANT INSERT (user_id, first_name, last_name, major, object_path, original_filename),
  UPDATE (first_name, last_name, major, object_path, original_filename), DELETE
  ON public.resume TO authenticated;
CREATE POLICY read_resumes ON public.resume FOR SELECT TO anon, authenticated USING (true);
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
-- Exact paths prevent extra files or nested folders. UPDATE supports replacement.
CREATE POLICY upload_resume_file ON storage.objects FOR INSERT TO authenticated WITH CHECK (
  (SELECT private.is_approved_member()) AND bucket_id = 'dsp-public-resumes'
  AND name = (SELECT auth.uid())::text || '/resume.pdf'
);
CREATE POLICY inspect_resume_file ON storage.objects FOR SELECT TO authenticated USING (
  (SELECT private.is_approved_member()) AND bucket_id = 'dsp-public-resumes'
  AND name = (SELECT auth.uid())::text || '/resume.pdf'
);
CREATE POLICY replace_resume_file ON storage.objects FOR UPDATE TO authenticated USING (
  (SELECT private.is_approved_member()) AND bucket_id = 'dsp-public-resumes'
  AND name = (SELECT auth.uid())::text || '/resume.pdf'
) WITH CHECK (
  (SELECT private.is_approved_member()) AND bucket_id = 'dsp-public-resumes'
  AND name = (SELECT auth.uid())::text || '/resume.pdf'
);
CREATE POLICY delete_resume_file ON storage.objects FOR DELETE TO authenticated USING (
  (SELECT private.is_approved_member()) AND bucket_id = 'dsp-public-resumes'
  AND name = (SELECT auth.uid())::text || '/resume.pdf'
);
