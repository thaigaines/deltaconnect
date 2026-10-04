// The one shared Supabase client, plus where resume files are stored.
import { createClient } from '@supabase/supabase-js'

// Values come from .env.local (only VITE_ variables reach the browser).
// The publishable key is safe to expose; RLS decides what each user can do.
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
)

// One public PDF per member at '<user-id>/resume.pdf'.
export const resumeBucket = 'dsp-public-resumes'
export function resumePath(userId) {
  return `${userId}/resume.pdf`
}
