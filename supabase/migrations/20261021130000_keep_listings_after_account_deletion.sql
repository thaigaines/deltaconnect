-- Deleting an Auth account no longer fails when its owner created a listing or request.
-- The listing stays and created_by becomes null; new listings still record their creator.
ALTER TABLE public.internship ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE public.internship DROP CONSTRAINT internship_created_by_fkey,
  ADD CONSTRAINT internship_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- Same function, but refusing an administrator target now uses the default error code (P0001),
-- so the app shows this message instead of the generic permission error used for 42501.
CREATE OR REPLACE FUNCTION private.set_moderator(p_user_id uuid, p_is_moderator boolean)
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
