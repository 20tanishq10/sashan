import { createClient } from '@supabase/supabase-js'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

export default async function handler(req, res) {
  const { code } = req.query
  if (!code) return res.status(400).json({ error: 'missing code' })
  const { data, error } = await supabase.from('lobbies').select('*').eq('code', code).limit(1).single()
  if (error) return res.status(404).json({ error: 'Lobby not found' })
  return res.status(200).json({ code: data.code, status: data.status })
}
