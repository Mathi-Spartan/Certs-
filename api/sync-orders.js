const SUPABASE_URL = process.env.SUPABASE_URL || 'https://cbfwizrivaaqibykulis.supabase.co'
const SUPABASE_ANON = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_rTbE5qvU7nDlDevl-WviAg_LSWim1hb'
const GGS_V2 = { Authorization: `GGS ${process.env.GOGETSSL_PARTNER_CODE}:${process.env.GOGETSSL_API_PASSWORD}` }
const V1 = 'https://my.gogetssl.com/api'
const V2 = 'https://my.gogetssl.com/api/v2/certificates'

const V2_PRODUCT_NAMES = {
  300:'Sectigo ACME CaaS', 400:'RapidSSL DV + Automate',
  401:'RapidSSL Wildcard + Automate', 402:'GeoTrust DV + Automate',
  403:'GeoTrust Wildcard + Automate',
}
const V2_CA = { 300:'Sectigo', 400:'RapidSSL', 401:'RapidSSL', 402:'GeoTrust', 403:'GeoTrust' }

// Product ID → name from GoGetSSL catalog
const V1_PRODUCT_MAP = {
  31:'RapidSSL DV', 32:'RapidSSL Wildcard DV', 33:'GeoTrust DV',
  34:'GeoTrust OV Wildcard', 35:'GeoTrust EV', 36:'GeoTrust OV',
  50:'Thawte SSL Web Server OV', 51:'Thawte SSL Web Server EV',
  65:'DigiCert Secure Site OV', 66:'DigiCert Secure Site EV',
  67:'DigiCert Secure Site Pro OV', 68:'DigiCert Secure Site Pro EV',
  175:'DigiCert Basic EV SSL', 176:'DigiCert Basic OV SSL',
}

function detectCA(productId, productName) {
  const n = (productName || '').toLowerCase()
  if (n.includes('digicert') || n.includes('secure site')) return 'DigiCert'
  if (n.includes('thawte')) return 'Thawte'
  if (n.includes('geotrust')) return 'GeoTrust'
  if (n.includes('rapidssl')) return 'RapidSSL'
  if (n.includes('sectigo') || n.includes('comodo') || n.includes('positive')) return 'Sectigo'
  const id = Number(productId)
  if ([65,66,67,68,175,176].includes(id)) return 'DigiCert'
  if ([50,51].includes(id)) return 'Thawte'
  if ([33,34,35,36].includes(id)) return 'GeoTrust'
  if ([31,32].includes(id)) return 'RapidSSL'
  return 'GoGetSSL'
}

async function getV1Key() {
  const r = await fetch(`${V1}/auth/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ user: process.env.GOGETSSL_USER || 'mathivanan@gogetssl.com', pass: process.env.GOGETSSL_API_PASSWORD })
  })
  const d = await r.json()
  return d.key || null
}

async function sbUpsert(row, authHeader) {
  const headers = { 'apikey': SUPABASE_ANON, 'Authorization': authHeader, 'Content-Type': 'application/json' }

  // First try upsert (insert or update on conflict)
  const r = await fetch(`${SUPABASE_URL}/rest/v1/orders`, {
    method: 'POST',
    headers: { ...headers, 'Prefer': 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(row)
  })
  if (r.ok) return null

  // If upsert fails (e.g. RLS on insert), try a PATCH on existing row
  const errText = await r.text()
  if (row.gogetssl_order_id) {
    const patch = await fetch(`${SUPABASE_URL}/rest/v1/orders?gogetssl_order_id=eq.${row.gogetssl_order_id}`, {
      method: 'PATCH',
      headers: { ...headers, 'Prefer': 'return=minimal' },
      body: JSON.stringify({ status: row.status, next_renewal: row.next_renewal, api_response: row.api_response, updated_at: row.updated_at })
    })
    return patch.ok ? null : (await patch.text()).slice(0, 120)
  }
  return errText.slice(0, 120)
}

export default async function handler(req, res) {
  const authHeader = req.headers.authorization || ''
  if (!authHeader) return res.status(401).json({ error: 'Authorization required' })

  const synced = [], errors = []

  try {
    // === V1: ALL standard SSL orders ===
    const key = await getV1Key()
    if (!key) {
      errors.push('V1 auth failed')
    } else {
      // Get complete order list (all statuses, all IDs)
      const listRes = await fetch(`${V1}/orders/ssl/all?auth_key=${key}`)
      const listData = await listRes.json()
      const allOrders = listData.orders || []

      // Fetch details in parallel batches of 25
      for (let i = 0; i < allOrders.length; i += 25) {
        const batch = allOrders.slice(i, i + 25)
        const details = await Promise.all(batch.map(async o => {
          try {
            const r = await fetch(`${V1}/orders/status/${o.order_id}?auth_key=${key}`)
            if (!r.ok) return { order_id: o.order_id, status: o.status, product_id: null }
            return r.json()
          } catch { return { order_id: o.order_id, status: o.status } }
        }))

        for (const d of details) {
          const pid = d.product_id
          const pname = V1_PRODUCT_MAP[pid] || d.product_name || (pid ? `Product #${pid}` : 'SSL Certificate')
          // Handle invalid dates from GoGetSSL
          const validTill = d.valid_till && d.valid_till !== '0000-00-00' ? d.valid_till : (d.end_date || null)
          const validFrom = d.valid_from && d.valid_from !== '0000-00-00' ? d.valid_from : (d.begin_date || null)
          const row = {
            gogetssl_order_id: d.order_id,
            product_name: pname,
            ca: detectCA(pid, pname),
            domain: d.domain || null,
            status: d.status || 'unknown',
            is_automation: false,
            api_response: d,
            subscription_begin: validFrom,
            next_renewal: validTill,
            updated_at: new Date().toISOString(),
          }
          const err = await sbUpsert(row, authHeader)
          if (err) errors.push(`#${d.order_id}: ${err}`)
          else synced.push(d.order_id)
        }
      }
    }

    // === V2: AIS automation orders (items 980–1100) ===
    const aisIds = Array.from({ length: 121 }, (_, i) => 980 + i)
    for (let i = 0; i < aisIds.length; i += 25) {
      const batch = aisIds.slice(i, i + 25)
      const results = await Promise.all(batch.map(async id => {
        try {
          const r = await fetch(`${V2}/ais/${id}`, { headers: GGS_V2 })
          if (!r.ok) return null
          const d = await r.json()
          return d?.order ? { item_id: id, data: d } : null
        } catch { return null }
      }))
      for (let j = 0; j < results.length; j++) {
        const result = results[j]
        if (!result) continue
        const { item_id, data: d } = result
        const order = d.order, item = (d.items || [])[0] || {}, sub = item.subscription || {}
        const row = {
          gogetssl_order_id: order.id,
          gogetssl_item_id: item_id,
          product_name: V2_PRODUCT_NAMES[item.product_id] || `Product #${item.product_id}`,
          ca: V2_CA[item.product_id] || 'GoGetSSL',
          domain: (item.domains || [])[0] || null,
          status: order.status,
          is_automation: true,
          api_response: d,
          subscription_begin: sub.begin || null,
          next_renewal: sub.next_renewal || null,
          updated_at: new Date().toISOString(),
        }
        const err = await sbUpsert(row, authHeader)
        if (err) errors.push(`AIS ${order.id}: ${err}`)
        else if (!synced.includes(order.id)) synced.push(order.id)
      }
    }

    // === V2: ACME/CaaS orders 3575450–3575750 ===
    const acmeIds = Array.from({ length: 300 }, (_, i) => 3575450 + i)
    for (let i = 0; i < acmeIds.length; i += 25) {
      const batch = acmeIds.slice(i, i + 25)
      const results = await Promise.all(batch.map(async id => {
        try {
          const r = await fetch(`${V2}/acme/${id}`, { headers: GGS_V2 })
          if (!r.ok) return null
          const d = await r.json()
          return d?.order ? { data: d } : null
        } catch { return null }
      }))
      for (const result of results.filter(Boolean)) {
        const { data: d } = result
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
        if (err) errors.push(`ACME ${order.id}: ${err}`)
        else if (!synced.includes(order.id)) synced.push(order.id)
      }
    }

    return res.status(200).json({ synced: synced.length, order_ids: synced, errors: errors.slice(0, 10), message: `Synced ${synced.length} orders` })
  } catch (err) {
    return res.status(500).json({ error: err.message, synced: synced.length })
  }
}
