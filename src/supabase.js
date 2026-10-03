// Shares one Supabase client for Auth, database queries, and public Storage URLs.
// JavaScript and the Supabase library; no React hooks or JSX are used here.
import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
)
