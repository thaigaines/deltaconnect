-- Fresh Supabase application schema. Existing tables cause a safe failure.
CREATE SCHEMA IF NOT EXISTS private;
-- is_pending: a member's request awaiting moderator review; hidden from members, including its author.
CREATE TABLE public.internship (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (title = btrim(title) AND title ~ '[^[:space:]]'),
  company text NOT NULL CHECK (company = btrim(company) AND company ~ '[^[:space:]]'),
  application_url text NOT NULL CHECK (application_url ~* '^https?://[^/[:space:]?#]+([/?#][^[:space:]]*)?$'),
  work_arrangement text NOT NULL CHECK (work_arrangement IN ('in-person','hybrid','remote')),
  deadline date,
  is_archived boolean NOT NULL DEFAULT false,
  is_pending boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Null once the creator's account is deleted; the listing stays.
  created_by uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL
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
-- Roles stack: moderators must be members, administrators must be moderators.
CREATE TABLE private.approved_member (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE
);
-- Moderators review listing requests, edit listings, and moderate the forum.
CREATE TABLE private.approved_moderator (
  user_id uuid PRIMARY KEY REFERENCES private.approved_member(user_id) ON DELETE CASCADE
);
-- Administrators can also grant and remove the moderator role. Added only by hand in SQL.
CREATE TABLE private.approved_administrator (
  user_id uuid PRIMARY KEY REFERENCES private.approved_moderator(user_id) ON DELETE CASCADE
);
-- One profile per user, created when the member first saves it. New user details become columns here.
-- Graduation term and year are set together; LinkedIn is an optional linkedin.com/in/ link.
CREATE TABLE public.profile (
  user_id uuid PRIMARY KEY DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name text NOT NULL CHECK (first_name = btrim(first_name) AND first_name ~ '[^[:space:]]'),
  last_name text NOT NULL CHECK (last_name = btrim(last_name) AND last_name ~ '[^[:space:]]'),
  major text NOT NULL CHECK (major = btrim(major) AND major ~ '[^[:space:]]'),
  graduation_term text CHECK (graduation_term IN ('spring','summer','fall')),
  graduation_year smallint CHECK (graduation_year BETWEEN 2000 AND 2100),
  linkedin_url text CHECK (linkedin_url ~* '^https://([a-z]{2,3}\.)?linkedin\.com/in/[^/?#[:space:]]+/?$'),
  CONSTRAINT profile_graduation_check CHECK ((graduation_term IS NULL) = (graduation_year IS NULL))
);
-- Private contact details and directory choices, kept apart from profile because every member can
-- read every profile (forum names). Only the owner reads this row; list_directory() shares the
-- parts they opted in to. Everything starts hidden. Phone is optional, stored as +1 and 10 digits.
CREATE TABLE public.profile_contact (
  user_id uuid PRIMARY KEY DEFAULT auth.uid() REFERENCES public.profile(user_id) ON DELETE CASCADE,
  phone text CHECK (phone ~ '^\+1[2-9][0-9]{2}[2-9][0-9]{6}$'),
  show_in_directory boolean NOT NULL DEFAULT false,
  show_email boolean NOT NULL DEFAULT false,
  show_phone boolean NOT NULL DEFAULT false,
  CONSTRAINT profile_contact_show_phone_check CHECK (NOT show_phone OR phone IS NOT NULL)
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
-- Members-only forum: posts with a flat list of comments. Authors need a profile, which supplies
-- their name. edited_at stays null until the author first changes the text.
CREATE TABLE public.forum_post (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profile(user_id) ON DELETE CASCADE,
  title text NOT NULL CHECK (title = btrim(title) AND title ~ '[^[:space:]]' AND char_length(title) <= 200),
  body text NOT NULL CHECK (body = btrim(body) AND body ~ '[^[:space:]]' AND char_length(body) <= 10000),
  is_pinned boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  edited_at timestamptz
);
CREATE TABLE public.forum_comment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  forum_post_id uuid NOT NULL REFERENCES public.forum_post(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profile(user_id) ON DELETE CASCADE,
  body text NOT NULL CHECK (body = btrim(body) AND body ~ '[^[:space:]]' AND char_length(body) <= 5000),
  created_at timestamptz NOT NULL DEFAULT now(),
  edited_at timestamptz
);
-- Supabase's advisor flags foreign keys without an index.
CREATE INDEX internship_created_by_idx ON public.internship(created_by);
CREATE INDEX internship_application_url_idx ON public.internship(application_url);
CREATE INDEX forum_post_user_id_idx ON public.forum_post(user_id);
CREATE INDEX forum_comment_forum_post_id_idx ON public.forum_comment(forum_post_id);
CREATE INDEX forum_comment_user_id_idx ON public.forum_comment(user_id);
ALTER TABLE public.internship ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.internship_location ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_contact ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resume ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forum_post ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forum_comment ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.approved_member ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.approved_moderator ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.approved_administrator ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON private.approved_member, private.approved_moderator, private.approved_administrator
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public.internship, public.internship_location, public.profile, public.profile_contact, public.resume,
  public.forum_post, public.forum_comment FROM PUBLIC, anon, authenticated;
