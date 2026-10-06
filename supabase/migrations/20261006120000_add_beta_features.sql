-- Beta features: graduation term/year and LinkedIn on profiles, moderator-only forum pinning,
-- and member internship suggestions that editors review.

-- Profiles: graduation term/year (both or neither, so profiles saved earlier stay valid; the form
-- requires them) and an optional LinkedIn profile link.
ALTER TABLE public.profile
  ADD COLUMN graduation_term text CHECK (graduation_term IN ('spring','summer','fall')),
  ADD COLUMN graduation_year smallint CHECK (graduation_year BETWEEN 2000 AND 2100),
  ADD COLUMN linkedin_url text CHECK (linkedin_url ~* '^https://([a-z]{2,3}\.)?linkedin\.com/in/[^/?#[:space:]]+/?$'),
  ADD CONSTRAINT profile_graduation_check CHECK ((graduation_term IS NULL) = (graduation_year IS NULL));
GRANT INSERT (graduation_term, graduation_year, linkedin_url), UPDATE (graduation_term, graduation_year, linkedin_url)
  ON public.profile TO authenticated;

-- Forum pinning. is_pinned is not client-writable; moderators change it only through
-- set_forum_post_pinned(), so authors can't pin and moderators still can't edit others' text.
ALTER TABLE public.forum_post ADD COLUMN is_pinned boolean NOT NULL DEFAULT false;

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

-- Internship suggestions: members submit leads; editors read them and dismiss (delete) them,
-- usually after adding a listing. Members can't read suggestions, including their own.
CREATE TABLE public.internship_suggestion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (title = btrim(title) AND title ~ '[^[:space:]]' AND char_length(title) <= 200),
  company text NOT NULL CHECK (company = btrim(company) AND company ~ '[^[:space:]]' AND char_length(company) <= 200),
  application_url text NOT NULL CHECK (application_url ~* '^https?://[^/[:space:]?#]+([/?#][^[:space:]]*)?$'),
  note text CHECK (note = btrim(note) AND note ~ '[^[:space:]]' AND char_length(note) <= 1000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX internship_suggestion_user_id_idx ON public.internship_suggestion(user_id);
ALTER TABLE public.internship_suggestion ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.internship_suggestion FROM PUBLIC, anon, authenticated;
GRANT SELECT, DELETE ON public.internship_suggestion TO authenticated;
GRANT INSERT (title, company, application_url, note) ON public.internship_suggestion TO authenticated;
CREATE POLICY create_suggestion ON public.internship_suggestion FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.is_approved_member()) AND user_id = (SELECT auth.uid()));
CREATE POLICY read_suggestions ON public.internship_suggestion FOR SELECT TO authenticated
  USING ((SELECT private.is_approved_editor()));
CREATE POLICY delete_suggestions ON public.internship_suggestion FOR DELETE TO authenticated
  USING ((SELECT private.is_approved_editor()));
