// One shared Supabase client for login, database queries, and Storage links, plus where
// resume files are stored. Every file imports these instead of creating its own.
import { createClient } from '@supabase/supabase-js'

// Vite reads these values from .env.local (only variables starting with VITE_ reach the browser).
// The publishable key is safe in frontend code: the database's access rules (RLS) still
// decide what each user can read or change.
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
)

// Resume PDFs live in this public Storage bucket, one file per member at '<user-id>/resume.pdf'.
export const resumeBucket = 'dsp-public-resumes'
export function resumePath(userId) {
  return `${userId}/resume.pdf`
}
