export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { email, password, full_name, company, role = 'partner' } = req.body || {}
  if (!email || !password) return res.status(400).json({ error: 'email and password required' })

  const SUPABASE_URL = process.env.SUPABASE_URL || 'https://cbfwizrivaaqibykulis.supabase.co'
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
  const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_rTbE5qvU7nDlDevl-WviAg_LSWim1hb'

  const hasServiceKey = SERVICE_KEY && !SERVICE_KEY.startsWith('REPLACE_')
  const authKey = hasServiceKey ? SERVICE_KEY : ANON_KEY

  try {
    let userId = null

    if (hasServiceKey) {
      // Try create user via admin API
      const r = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` },
        body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { full_name } })
      })
      const d = await r.json()

      if (!r.ok) {
        // If user already exists, find them and update profile
        if (d.code === 422 || d.msg?.includes('already') || d.error_description?.includes('already')) {
          // Find existing user
          const listR = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?email=${encodeURIComponent(email)}`, {
            headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` }
          })
          const listD = await listR.json()
          const existing = listD.users?.find(u => u.email === email)
          if (existing) {
            userId = existing.id
            // Also confirm their email if not confirmed
            await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${existing.id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json', 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` },
              body: JSON.stringify({ email_confirm: true, password })
            })
          } else {
            return res.status(400).json({ error: 'User already exists but could not be found' })
          }
        } else {
          return res.status(400).json({ error: d.message || d.msg || d.error_description || JSON.stringify(d) })
        }
      } else {
        userId = d.id
      }
    } else {
      // No service key — try signUp (requires email autoconfirm enabled)
      const r = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': ANON_KEY },
        body: JSON.stringify({ email, password, data: { full_name } })
      })
      const d = await r.json()
      if (d.error_code === 'user_already_exists' || d.code === 422) {
        return res.status(400).json({ error: `User ${email} already exists. Please run this SQL in Supabase dashboard to fix their role:\n\nUPDATE public.profiles SET role='partner', full_name='${full_name}', company='${company}' WHERE email='${email}';\nUPDATE auth.users SET email_confirmed_at=now() WHERE email='${email}';` })
      }
      if (!r.ok || (!d.id && !d.user?.id)) {
        return res.status(400).json({ error: d.msg || d.message || JSON.stringify(d) })
      }
      userId = d.user?.id || d.id
    }

    if (!userId) return res.status(500).json({ error: 'Could not get user ID' })

    // Wait for trigger
    await new Promise(r => setTimeout(r, 800))

    // Upsert profile with correct role
    const profileBody = { id: userId, email, full_name: full_name || '', company: company || '', role }
    
    // Try PATCH first
    const pR = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'apikey': authKey, 'Authorization': `Bearer ${authKey}`, 'Prefer': 'return=minimal' },
      body: JSON.stringify({ role, full_name: full_name || '', company: company || '', email })
    })

    // If no row matched, insert
    if (pR.status === 204 || !pR.ok) {
      await fetch(`${SUPABASE_URL}/rest/v1/profiles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': authKey, 'Authorization': `Bearer ${authKey}`, 'Prefer': 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(profileBody)
      })
    }

    return res.status(200).json({ ok: true, user_id: userId, email, role, message: `Partner account ready for ${email}` })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
