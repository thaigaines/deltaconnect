// The one shared Supabase client, plus where resume files are stored.
import { createClient } from '@supabase/supabase-js'

// Values come from .env.local (only VITE_ variables reach the browser).
// The publishable key is safe to expose; RLS decides what each user can do.
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
)

// Public resume PDFs, stored in each member's folder: '<user-id>/<random-id>.pdf'.
export const resumeBucket = 'dsp-public-resumes'
