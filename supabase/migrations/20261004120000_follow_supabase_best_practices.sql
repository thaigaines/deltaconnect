-- Follows Supabase's storage, security, and performance recommendations.

-- Replacement resumes upload to a new path instead of overwriting, as Supabase advises,
-- because its CDN can keep serving an overwritten file. Paths become '<user-id>/<name>.pdf'.
-- Postgres auto-named the original check 'resume_check' because it uses two columns.
ALTER TABLE public.resume DROP CONSTRAINT resume_check;
ALTER TABLE public.resume ADD CONSTRAINT resume_object_path_check
  CHECK (object_path ~ ('^' || user_id::text || '/[^/]+\.pdf$'));

-- Members may upload, inspect, and delete PDFs directly inside their own folder.
-- Nothing is overwritten anymore, so the UPDATE policy is removed.
DROP POLICY upload_resume_file ON storage.objects;
DROP POLICY inspect_resume_file ON storage.objects;
DROP POLICY replace_resume_file ON storage.objects;
DROP POLICY delete_resume_file ON storage.objects;
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

-- Supabase advises against SECURITY DEFINER functions in exposed schemas, so
-- create_listing now runs as the caller and RLS checks its inserts. Editors may
-- insert content columns; created_by and created_at come from their defaults.
GRANT INSERT (title, company, application_url, work_arrangement, deadline)
  ON public.internship TO authenticated;
CREATE POLICY create_internships ON public.internship FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.is_approved_editor()));
CREATE OR REPLACE FUNCTION public.create_listing(
  p_title text, p_company text, p_application_url text, p_work_arrangement text,
  p_deadline date DEFAULT NULL, p_locations jsonb DEFAULT '[]', p_allow_duplicate boolean DEFAULT false
)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
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
  INSERT INTO public.internship (title, company, application_url, work_arrangement, deadline)
    VALUES (btrim(p_title), btrim(p_company), clean_url, p_work_arrangement, p_deadline)
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

-- Supabase's advisor flags foreign keys without an index.
CREATE INDEX internship_created_by_idx ON public.internship(created_by);
