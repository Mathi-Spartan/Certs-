export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { email, password, full_name, company, role = 'partner' } = req.body || {}
  if (!email || !password) return res.status(400).json({ error: 'email and password required' })

  const SUPABASE_URL = process.env.SUPABASE_URL || 'https://cbfwizrivaaqibykulis.supabase.co'
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!SERVICE_KEY) return res.status(500).json({ error: 'SUPABASE_SERVICE_ROLE_KEY not configured' })

  try {
    // 1. Create auth user via Supabase Admin REST API
    const createRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`,
      },
      body: JSON.stringify({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name }
      })
    })

    const userData = await createRes.json()
    if (!createRes.ok) {
      return res.status(400).json({ error: userData.message || userData.error_description || JSON.stringify(userData) })
    }

    const userId = userData.id
    if (!userId) return res.status(500).json({ error: 'No user ID returned from Supabase' })

    // 2. Update profile row (created by DB trigger on signup)
    // Wait briefly for trigger to fire
    await new Promise(r => setTimeout(r, 500))

    const profileRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({ role, full_name: full_name || '', company: company || '', email })
    })

    // If patch failed (trigger hasn't fired yet), insert directly
    if (!profileRes.ok || profileRes.status === 204) {
      // Try insert as fallback
      await fetch(`${SUPABASE_URL}/rest/v1/profiles`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SERVICE_KEY,
          'Authorization': `Bearer ${SERVICE_KEY}`,
          'Prefer': 'resolution=merge-duplicates,return=minimal'
        },
        body: JSON.stringify({ id: userId, email, full_name: full_name || '', company: company || '', role })
      })
    }

    return res.status(200).json({
      ok: true,
      user_id: userId,
      email,
      role,
      message: `${role} account created for ${email}`
    })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
