-- Removes everything the migrations create so they can run again on a project.
-- DELETES ALL DELTACONNECT DATA, including listings, profiles, resumes, and approvals.
-- Auth accounts are kept; approve them again after rerunning the migrations.
-- Supabase blocks deleting files with SQL, so first empty the dsp-public-resumes bucket in the dashboard.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'dsp-public-resumes') THEN
    RAISE EXCEPTION 'Empty the dsp-public-resumes bucket in the dashboard first.';
  END IF;
END;
$$;
DROP POLICY IF EXISTS upload_resume_file ON storage.objects;
DROP POLICY IF EXISTS inspect_resume_file ON storage.objects;
DROP POLICY IF EXISTS replace_resume_file ON storage.objects;
DROP POLICY IF EXISTS delete_resume_file ON storage.objects;
-- Dropping the tables also drops their policies and triggers; CASCADE drops private's tables and functions.
DROP TABLE IF EXISTS public.resume, public.profile, public.internship_location, public.internship;
DROP FUNCTION IF EXISTS public.create_listing(text,text,text,text,date,jsonb,boolean), public.my_permissions();
DROP SCHEMA IF EXISTS private CASCADE;
