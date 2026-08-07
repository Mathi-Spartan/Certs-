import { createClient } from '@supabase/supabase-js'

const adminSupabase = createClient(
  process.env.SUPABASE_URL || 'https://cbfwizrivaaqibykulis.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
)

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { email, password, full_name, company, role = 'partner' } = req.body || {}
  if (!email || !password) return res.status(400).json({ error: 'email and password required' })

  try {
    // Create auth user with service role (no email confirmation needed)
    const { data: authData, error: authErr } = await adminSupabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,  // auto-confirm email
      user_metadata: { full_name }
    })

    if (authErr) return res.status(400).json({ error: authErr.message })

    // Update profile with role, full_name, company
    const userId = authData.user.id
    const { error: profileErr } = await adminSupabase.from('profiles')
      .update({ role, full_name: full_name || '', company: company || '' })
      .eq('id', userId)

    if (profileErr) {
      // Profile may not exist yet if trigger hasn't fired — insert it
      await adminSupabase.from('profiles').insert({
        id: userId,
        email,
        full_name: full_name || '',
        company: company || '',
        role
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
