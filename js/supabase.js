const SUPABASE_URL = "https://gixndvzewaizeqqluezu.supabase.co"

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  "sb_publishable_uPia90G2N9lxbPChkDvGkQ_KeqSJY1a"
)

window.supabaseClient = supabaseClient
window.SUPABASE_URL = SUPABASE_URL