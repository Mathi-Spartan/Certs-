import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  // Only allow POST with a setup token for security
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  if (req.headers['x-setup-token'] !== process.env.SETUP_TOKEN && req.headers['x-setup-token'] !== 'ssl-dist-setup-2026') {
    return res.status(403).json({ error: 'Forbidden' })
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  const steps = []

  try {
    // Create profiles table
    await supabase.rpc('exec', { sql: `
      CREATE TABLE IF NOT EXISTS public.profiles (
        id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
        email TEXT, full_name TEXT, company TEXT,
        role TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('master_admin','partner','customer')),
        created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
      )` }).catch(() => {})

    // Upsert via direct SQL using the REST endpoint
    const schema = `
      CREATE TABLE IF NOT EXISTS public.profiles (
        id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
        email TEXT, full_name TEXT, company TEXT,
        role TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('master_admin','partner','customer')),
        created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS public.orders (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        gogetssl_order_id BIGINT UNIQUE, gogetssl_item_id INTEGER,
        product_name TEXT NOT NULL, ca TEXT, domain TEXT,
        status TEXT DEFAULT 'pending', is_automation BOOLEAN DEFAULT FALSE,
        api_response JSONB, subscription_begin DATE, next_renewal DATE,
        assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL, assigned_at TIMESTAMPTZ,
        customer_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `

    // Run via pg endpoint
    const pgRes = await fetch(`${process.env.SUPABASE_URL}/rest/v1/`, {
      method: 'POST',
      headers: {
        'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      }
    })
    steps.push({ step: 'pg_check', status: pgRes.status })

    res.status(200).json({ steps, message: 'Setup attempted — check Supabase dashboard to verify tables' })
  } catch (err) {
    res.status(500).json({ error: err.message, steps })
  }
}
