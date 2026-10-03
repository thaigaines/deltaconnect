// One shared Supabase client for login, database queries, and Storage links.
// Every file imports this same client instead of creating its own.
import { createClient } from '@supabase/supabase-js'

// Vite reads these values from .env.local (only variables starting with VITE_ reach the browser).
// The publishable key is safe in frontend code: the database's access rules (RLS) still
// decide what each user can read or change.
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
)
