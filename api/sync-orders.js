const HEADERS = { Authorization: `GGS ${process.env.GOGETSSL_PARTNER_CODE}:${process.env.GOGETSSL_API_PASSWORD}` }
const BASE = 'https://my.gogetssl.com/api/v2/certificates'
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://cbfwizrivaaqibykulis.supabase.co'

const PRODUCT_NAMES = {
  300: 'Sectigo ACME CaaS',
  400: 'RapidSSL DV + Automate',
  401: 'RapidSSL Wildcard + Automate',
  402: 'GeoTrust DV + Automate',
  403: 'GeoTrust Wildcard + Automate',
}
const CA_NAMES = { 300: 'Sectigo', 400: 'RapidSSL', 401: 'RapidSSL', 402: 'GeoTrust', 403: 'GeoTrust' }

async function fetchItem(url, signal) {
  try {
    const r = await fetch(url, { headers: HEADERS, signal })
    if (!r.ok) return null
    const d = await r.json()
    return d?.order ? d : null
  } catch { return null }
}

async function sbUpsert(row, authHeader) {
  // Use ON CONFLICT via upsert endpoint
  const r = await fetch(`${SUPABASE_URL}/rest/v1/orders`, {
    method: 'POST',
    headers: {
      'apikey': process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || 'sb_publishable_rTbE5qvU7nDlDevl-WviAg_LSWim1hb',
      'Authorization': authHeader,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(row)
  })
  return r.ok ? null : await r.text()
}

export default async function handler(req, res) {
  // Get admin JWT from request header (sent by frontend)
  const authHeader = req.headers.authorization || req.headers['x-auth-token'] || ''
  if (!authHeader) {
    return res.status(401).json({ error: 'Authorization header required' })
  }

  const ctrl = new AbortController()
  const timeout = setTimeout(() => ctrl.abort(), 25000)

  const synced = [], errors = []

  try {
    // Parallel scan AIS items 980–1060
    const aisIds = Array.from({ length: 81 }, (_, i) => 980 + i)
    const batches = []
    for (let i = 0; i < aisIds.length; i += 15) batches.push(aisIds.slice(i, i + 15))

    for (const batch of batches) {
      const results = await Promise.all(
        batch.map(id => fetchItem(`${BASE}/ais/${id}`, ctrl.signal))
      )
      for (let i = 0; i < results.length; i++) {
        const d = results[i]
        if (!d) continue
        const order = d.order
        const item = (d.items || [])[0] || {}
        const sub = item.subscription || {}
        const row = {
          gogetssl_order_id: order.id,
          gogetssl_item_id: batch[i],
          product_name: PRODUCT_NAMES[item.product_id] || `Product #${item.product_id}`,
          ca: CA_NAMES[item.product_id] || 'GoGetSSL',
          domain: (item.domains || [])[0] || null,
          status: order.status,
          is_automation: true,
          api_response: d,
          subscription_begin: sub.begin || null,
          next_renewal: sub.next_renewal || null,
          updated_at: new Date().toISOString(),
        }
        const err = await sbUpsert(row, authHeader)
        if (err) errors.push(`AIS item ${batch[i]}: ${err}`)
        else synced.push(order.id)
      }
    }

    // ACME orders — scan known range around 3575500–3575700
    const acmeIds = Array.from({ length: 200 }, (_, i) => 3575500 + i)
    for (let i = 0; i < acmeIds.length; i += 20) {
      const batch = acmeIds.slice(i, i + 20)
      const results = await Promise.all(
        batch.map(id => fetchItem(`${BASE}/acme/${id}`, ctrl.signal))
      )
      for (let j = 0; j < results.length; j++) {
        const d = results[j]
        if (!d) continue
        const order = d.order
        const item = (d.items || [])[0] || {}
        const sub = item.subscription || {}
        const row = {
          gogetssl_order_id: order.id,
          product_name: 'Sectigo ACME CaaS',
          ca: 'Sectigo',
          domain: (item.domains || [])[0] || null,
          status: order.status,
          is_automation: true,
          api_response: d,
          next_renewal: sub.next_renewal || null,
          updated_at: new Date().toISOString(),
        }
        const err = await sbUpsert(row, authHeader)
        if (err) errors.push(`ACME ${order.id}: ${err}`)
        else if (!synced.includes(order.id)) synced.push(order.id)
      }
    }

    clearTimeout(timeout)
    return res.status(200).json({
      synced: synced.length,
      order_ids: synced,
      errors: errors.slice(0, 5),
      message: synced.length > 0
        ? `Synced ${synced.length} orders`
        : 'No orders found in scanned range (items 980–1060, orders 3575500–3575700)'
    })
  } catch (err) {
    clearTimeout(timeout)
    return res.status(500).json({ error: err.message, synced: synced.length })
  }
}
