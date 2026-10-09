import { createClient } from '@supabase/supabase-js'

const configuredUrl = import.meta.env.VITE_SUPABASE_URL
// The release build referenced an unavailable project. Keep the existing MOA
// accounts by using their verified project for that stale production setting.
// This publishable key is public browser configuration, not a privileged key.
const useCorrectedProject = import.meta.env.PROD
  && configuredUrl?.replace(/\/$/, '') === 'https://ciisjtfsvjxuypflgwcj.supabase.co'
const supabaseUrl = useCorrectedProject
  ? 'https://pgquycmfnyxhoxekvcge.supabase.co'
  : configuredUrl
const supabasePublishableKey = useCorrectedProject
  ? 'sb_publishable_Dlx8zmpxW9fGKQ1hsS1zjw_j7FwiPqc'
  : import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

export const supabase = createClient(supabaseUrl, supabasePublishableKey)
