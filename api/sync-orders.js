import { createClient } from '@supabase/supabase-js'

const HEADERS = { Authorization: `GGS ${process.env.GOGETSSL_PARTNER_CODE}:${process.env.GOGETSSL_API_PASSWORD}` }
const BASE = 'https://my.gogetssl.com/api/v2/certificates'

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const PRODUCT_NAMES = {
  300: 'Sectigo ACME CaaS',
  400: 'RapidSSL DV + Automate',
  401: 'RapidSSL Wildcard + Automate',
  402: 'GeoTrust DV + Automate',
  403: 'GeoTrust Wildcard + Automate',
}
const CA_NAMES = { 300: 'Sectigo', 400: 'RapidSSL', 401: 'RapidSSL', 402: 'GeoTrust', 403: 'GeoTrust' }

// Fetch with 8s timeout
async function fetchWithTimeout(url, opts = {}, ms = 8000) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), ms)
  try {
    const r = await fetch(url, { ...opts, signal: ctrl.signal })
    clearTimeout(t)
    return r
  } catch { clearTimeout(t); return null }
}

// Scan AIS items in parallel batches of 10
async function scanAIS(start, end) {
  const found = []
  for (let batch = start; batch <= end; batch += 10) {
    const ids = Array.from({ length: Math.min(10, end - batch + 1) }, (_, i) => batch + i)
    const results = await Promise.all(ids.map(async id => {
      const r = await fetchWithTimeout(`${BASE}/ais/${id}`, { headers: HEADERS })
      if (!r || !r.ok) return null
      try { const d = await r.json(); return d?.order ? { item_id: id, data: d } : null } catch { return null }
    }))
    found.push(...results.filter(Boolean))
  }
  return found
}

// Scan ACME orders in parallel batches
async function scanACME(orderIds) {
  const found = []
  for (let i = 0; i < orderIds.length; i += 10) {
    const batch = orderIds.slice(i, i + 10)
    const results = await Promise.all(batch.map(async id => {
      const r = await fetchWithTimeout(`${BASE}/acme/${id}`, { headers: HEADERS })
      if (!r || !r.ok) return null
      try { const d = await r.json(); return d?.order ? { order_id: id, data: d } : null } catch { return null }
    }))
    found.push(...results.filter(Boolean))
  }
  return found
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).end()

  const synced = [], errors = []

  try {
    // --- AIS orders (item IDs 980–1050, parallel) ---
    const aisItems = await scanAIS(980, 1050)

    for (const { item_id, data } of aisItems) {
      const order = data.order
      const item = (data.items || [])[0] || {}
      const sub = item.subscription || {}
      const row = {
        gogetssl_order_id: order.id,
        gogetssl_item_id: item_id,
        product_name: PRODUCT_NAMES[item.product_id] || `Product #${item.product_id}`,
        ca: CA_NAMES[item.product_id] || 'GoGetSSL',
        domain: (item.domains || [])[0] || null,
        status: order.status,
        is_automation: true,
        api_response: data,
        subscription_begin: sub.begin || null,
        next_renewal: sub.next_renewal || null,
        updated_at: new Date().toISOString(),
      }
      const { error } = await supabase.from('orders').upsert(row, { onConflict: 'gogetssl_order_id' })
      if (error) errors.push(`AIS ${order.id}: ${error.message}`)
      else synced.push(order.id)
    }

    // --- ACME/CaaS orders (scan order IDs around known range) ---
    // Build candidate list: known IDs ± 50 range
    const { data: existing } = await supabase.from('orders').select('gogetssl_order_id').not('gogetssl_order_id', 'is', null)
    const knownIds = (existing || []).map(r => r.gogetssl_order_id).filter(Boolean)

    // Candidate ACME order IDs to scan
    const baseId = knownIds.length > 0 ? Math.min(...knownIds) : 3575500
    const candidates = Array.from({ length: 100 }, (_, i) => baseId - 10 + i)
      .filter(id => !knownIds.includes(id) && id > 0)

    const acmeFound = await scanACME(candidates)
    for (const { data } of acmeFound) {
      const order = data.order
      const item = (data.items || [])[0] || {}
      const sub = item.subscription || {}
      const row = {
        gogetssl_order_id: order.id,
        product_name: 'Sectigo ACME CaaS',
        ca: 'Sectigo',
        domain: (item.domains || [])[0] || null,
        status: order.status,
        is_automation: true,
        api_response: data,
        next_renewal: sub.next_renewal || null,
        updated_at: new Date().toISOString(),
      }
      const { error } = await supabase.from('orders').upsert(row, { onConflict: 'gogetssl_order_id' })
      if (error) errors.push(`ACME ${order.id}: ${error.message}`)
      else synced.push(order.id)
    }

    return res.status(200).json({
      synced: synced.length,
      order_ids: synced,
      errors,
      message: synced.length > 0
        ? `Synced ${synced.length} orders: ${synced.join(', ')}`
        : 'No new orders found in scanned range'
    })
  } catch (err) {
    return res.status(500).json({ error: err.message, synced: synced.length })
  }
}
