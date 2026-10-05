-- Fresh Supabase application schema. Existing tables cause a safe failure.
CREATE SCHEMA IF NOT EXISTS private;
CREATE TABLE public.internship (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (title = btrim(title) AND title ~ '[^[:space:]]'),
  company text NOT NULL CHECK (company = btrim(company) AND company ~ '[^[:space:]]'),
  application_url text NOT NULL CHECK (application_url ~* '^https?://[^/[:space:]?#]+([/?#][^[:space:]]*)?$'),
  work_arrangement text NOT NULL CHECK (work_arrangement IN ('in-person','hybrid','remote')),
  deadline date,
  is_archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE RESTRICT
);
CREATE TABLE public.internship_location (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  internship_id uuid NOT NULL REFERENCES public.internship(id) ON DELETE CASCADE,
  city text NOT NULL CHECK (city = btrim(city) AND city ~ '[^[:space:]]'),
  state text NOT NULL CHECK (state IN (
    'AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA',
    'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM',
    'NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA',
    'WV','WI','WY','AS','GU','MP','PR','VI'
  )),
  UNIQUE (internship_id, city, state)
);
CREATE TABLE private.approved_member (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE
);
CREATE TABLE private.approved_editor (
  user_id uuid PRIMARY KEY REFERENCES private.approved_member(user_id) ON DELETE CASCADE
);
-- One profile per user, created when the member first saves it. New user details become columns here.
CREATE TABLE public.profile (
  user_id uuid PRIMARY KEY DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name text NOT NULL CHECK (first_name = btrim(first_name) AND first_name ~ '[^[:space:]]'),
  last_name text NOT NULL CHECK (last_name = btrim(last_name) AND last_name ~ '[^[:space:]]'),
  major text NOT NULL CHECK (major = btrim(major) AND major ~ '[^[:space:]]')
);
-- At most one resume per profile; a resume cannot exist without a profile to name it.
CREATE TABLE public.resume (
  user_id uuid PRIMARY KEY DEFAULT auth.uid() REFERENCES public.profile(user_id) ON DELETE CASCADE,
  object_path text NOT NULL UNIQUE,
  original_filename text NOT NULL CHECK (original_filename = btrim(original_filename) AND original_filename ~ '[^[:space:]]'),
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  -- Each upload gets a new '<user-id>/<name>.pdf' path (Supabase advises against overwriting).
  CONSTRAINT resume_object_path_check CHECK (object_path ~ ('^' || user_id::text || '/[^/]+\.pdf$'))
);
-- Supabase's advisor flags foreign keys without an index.
CREATE INDEX internship_created_by_idx ON public.internship(created_by);
CREATE INDEX internship_application_url_idx ON public.internship(application_url);
ALTER TABLE public.internship ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.internship_location ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resume ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.approved_member ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.approved_editor ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON private.approved_member, private.approved_editor FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public.internship, public.internship_location, public.profile, public.resume FROM PUBLIC, anon, authenticated;
