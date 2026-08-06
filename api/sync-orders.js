const SUPABASE_URL = process.env.SUPABASE_URL || 'https://cbfwizrivaaqibykulis.supabase.co'
const SUPABASE_ANON = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_rTbE5qvU7nDlDevl-WviAg_LSWim1hb'
const GGS_V2_HEADERS = { Authorization: `GGS ${process.env.GOGETSSL_PARTNER_CODE}:${process.env.GOGETSSL_API_PASSWORD}` }
const V1_BASE = 'https://my.gogetssl.com/api'
const V2_BASE = 'https://my.gogetssl.com/api/v2/certificates'

const PRODUCT_NAMES = {
  300: 'Sectigo ACME CaaS', 400: 'RapidSSL DV + Automate',
  401: 'RapidSSL Wildcard + Automate', 402: 'GeoTrust DV + Automate',
  403: 'GeoTrust Wildcard + Automate',
}
const CA_NAMES = { 300: 'Sectigo', 400: 'RapidSSL', 401: 'RapidSSL', 402: 'GeoTrust', 403: 'GeoTrust' }

async function getV1AuthKey() {
  const body = new URLSearchParams({
    user: process.env.GOGETSSL_USER || 'mathivanan@gogetssl.com',
    pass: process.env.GOGETSSL_API_PASSWORD
  })
  const r = await fetch(`${V1_BASE}/auth/`, { method: 'POST', body, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } })
  const d = await r.json()
  return d.key || null
}

async function sbUpsert(row, authHeader) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/orders`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_ANON,
      'Authorization': authHeader,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(row)
  })
  if (!r.ok) return await r.text()
  return null
}

export default async function handler(req, res) {
  const authHeader = req.headers.authorization || ''
  if (!authHeader) return res.status(401).json({ error: 'Authorization header required' })

  const synced = [], errors = []

  try {
    // === V1: Get all 103 standard SSL orders ===
    const authKey = await getV1AuthKey()
    if (!authKey) {
      errors.push('V1 auth failed — check GOGETSSL_USER and GOGETSSL_API_PASSWORD env vars')
    } else {
      // Fetch full list
      const listRes = await fetch(`${V1_BASE}/orders/ssl/all?auth_key=${authKey}`)
      const listData = await listRes.json()
      const orders = listData.orders || []

      // Fetch details for all orders in parallel batches of 20
      for (let i = 0; i < orders.length; i += 20) {
        const batch = orders.slice(i, i + 20)
        const details = await Promise.all(batch.map(async o => {
          try {
            const r = await fetch(`${V1_BASE}/orders/status/${o.order_id}?auth_key=${authKey}`)
            return r.ok ? await r.json() : { order_id: o.order_id, status: o.status }
          } catch { return { order_id: o.order_id, status: o.status } }
        }))

        for (const d of details) {
          const row = {
            gogetssl_order_id: d.order_id,
            product_name: d.product_name || `Product #${d.product_id}`,
            ca: detectCA(d.product_id, d.product_name),
            domain: d.domain || null,
            status: d.status || 'unknown',
            is_automation: false,
            api_response: d,
            subscription_begin: d.begin_date || d.valid_from || null,
            next_renewal: d.end_date || d.valid_till || null,
            updated_at: new Date().toISOString(),
          }
          const err = await sbUpsert(row, authHeader)
          if (err) errors.push(`Order ${d.order_id}: ${err.slice(0, 80)}`)
          else synced.push(d.order_id)
        }
      }
    }

    // === V2: Automation orders (AIS items 980-1060) ===
    const aisIds = Array.from({ length: 81 }, (_, i) => 980 + i)
    for (let i = 0; i < aisIds.length; i += 20) {
      const batch = aisIds.slice(i, i + 20)
      const results = await Promise.all(batch.map(async id => {
        try {
          const r = await fetch(`${V2_BASE}/ais/${id}`, { headers: GGS_V2_HEADERS })
          if (!r.ok) return null
          const d = await r.json()
          return d?.order ? { item_id: id, data: d } : null
        } catch { return null }
      }))
      for (let j = 0; j < results.length; j++) {
        const res2 = results[j]
        if (!res2) continue
        const { item_id, data: d } = res2
        const order = d.order, item = (d.items || [])[0] || {}, sub = item.subscription || {}
        const row = {
          gogetssl_order_id: order.id,
          gogetssl_item_id: item_id,
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
        if (err) errors.push(`AIS ${order.id}: ${err.slice(0, 80)}`)
        else if (!synced.includes(order.id)) synced.push(order.id)
      }
    }

    // === V2: ACME orders 3575500-3575700 ===
    const acmeIds = Array.from({ length: 200 }, (_, i) => 3575500 + i)
    for (let i = 0; i < acmeIds.length; i += 20) {
      const batch = acmeIds.slice(i, i + 20)
      const results = await Promise.all(batch.map(async id => {
        try {
          const r = await fetch(`${V2_BASE}/acme/${id}`, { headers: GGS_V2_HEADERS })
          if (!r.ok) return null
          const d = await r.json()
          return d?.order ? { data: d } : null
        } catch { return null }
      }))
      for (const res2 of results.filter(Boolean)) {
        const { data: d } = res2
        const order = d.order, item = (d.items || [])[0] || {}, sub = item.subscription || {}
        const row = {
          gogetssl_order_id: order.id,
          product_name: 'Sectigo ACME CaaS', ca: 'Sectigo',
          domain: (item.domains || [])[0] || null,
          status: order.status, is_automation: true, api_response: d,
          next_renewal: sub.next_renewal || null,
          updated_at: new Date().toISOString(),
        }
        const err = await sbUpsert(row, authHeader)
        if (err) errors.push(`ACME ${order.id}: ${err.slice(0, 80)}`)
        else if (!synced.includes(order.id)) synced.push(order.id)
      }
    }

    return res.status(200).json({
      synced: synced.length,
      order_ids: synced,
      errors: errors.slice(0, 10),
      message: `Synced ${synced.length} orders from GoGetSSL`
    })
  } catch (err) {
    return res.status(500).json({ error: err.message, synced: synced.length })
  }
}

function detectCA(productId, productName) {
  if (!productName) return 'GoGetSSL'
  const n = productName.toLowerCase()
  if (n.includes('digicert') || n.includes('secure site')) return 'DigiCert'
  if (n.includes('thawte')) return 'Thawte'
  if (n.includes('geotrust')) return 'GeoTrust'
  if (n.includes('rapidssl')) return 'RapidSSL'
  if (n.includes('sectigo') || n.includes('comodo') || n.includes('positive')) return 'Sectigo'
  return 'GoGetSSL'
}
