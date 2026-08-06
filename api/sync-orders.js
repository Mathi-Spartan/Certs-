import { createClient } from '@supabase/supabase-js'

const GOGETSSL_AUTH = `GGS ${process.env.GOGETSSL_PARTNER_CODE}:${process.env.GOGETSSL_API_PASSWORD}`
const BASE_V2 = 'https://my.gogetssl.com/api/v2/certificates'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function fetchAIS(itemId) {
  const r = await fetch(`${BASE_V2}/ais/${itemId}`, { headers: { Authorization: GOGETSSL_AUTH } })
  if (!r.ok) return null
  return r.json()
}

async function fetchACME(orderId) {
  const r = await fetch(`${BASE_V2}/acme/${orderId}`, { headers: { Authorization: GOGETSSL_AUTH } })
  if (!r.ok) return null
  return r.json()
}

// Scan a range of AIS item IDs to discover orders
async function discoverAISOrders() {
  const found = []
  // Check items 900–1100 (widen as the account grows)
  for (let id = 900; id <= 1200; id++) {
    const data = await fetchAIS(id)
    if (data && data.order) {
      found.push({ type: 'ais', item_id: id, data })
    }
  }
  return found
}

const PRODUCT_NAMES = {
  300: 'Sectigo ACME CaaS',
  400: 'RapidSSL DV + Automate',
  401: 'RapidSSL Wildcard + Automate',
  402: 'GeoTrust DV + Automate',
  403: 'GeoTrust Wildcard + Automate',
}

const CA_NAMES = {
  300: 'Sectigo', 400: 'RapidSSL', 401: 'RapidSSL', 402: 'GeoTrust', 403: 'GeoTrust',
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    let synced = 0
    const errors = []

    // 1. Sync AIS (automation) orders
    const aisOrders = await discoverAISOrders()
    for (const { item_id, data } of aisOrders) {
      const order = data.order
      const items = data.items || []
      const item = items[0] || {}
      const productId = item.product_id
      const domains = item.domains || []
      const sub = item.subscription || {}

      const row = {
        gogetssl_order_id: order.id,
        gogetssl_item_id: item_id,
        product_name: PRODUCT_NAMES[productId] || `Product #${productId}`,
        ca: CA_NAMES[productId] || 'Unknown',
        domain: domains[0] || null,
        status: order.status,
        is_automation: true,
        api_response: data,
        subscription_begin: sub.begin || null,
        next_renewal: sub.next_renewal || null,
        updated_at: new Date().toISOString(),
      }

      const { error } = await supabase
        .from('orders')
        .upsert(row, { onConflict: 'gogetssl_order_id' })
      if (error) errors.push(`AIS ${order.id}: ${error.message}`)
      else synced++
    }

    // 2. Try known ACME order IDs from existing DB
    const { data: existing } = await supabase
      .from('orders')
      .select('gogetssl_order_id')
      .not('gogetssl_order_id', 'is', null)

    const knownIds = new Set((existing || []).map(r => r.gogetssl_order_id))

    // Also scan a range of recent ACME order IDs
    const recentBase = Math.min(...[...knownIds].filter(Number.isInteger)) - 10
    if (recentBase > 0) {
      for (let oid = recentBase; oid <= recentBase + 100; oid++) {
        if (knownIds.has(oid)) continue
        const data = await fetchACME(oid)
        if (!data || !data.order) continue
        const order = data.order
        const item = (data.items || [])[0] || {}
        const account = item.account || {}

        const row = {
          gogetssl_order_id: order.id,
          product_name: 'Sectigo ACME CaaS',
          ca: 'Sectigo',
          domain: (item.domains || [])[0] || null,
          status: order.status,
          is_automation: true,
          api_response: data,
          next_renewal: (item.subscription || {}).next_renewal || null,
          updated_at: new Date().toISOString(),
        }
        const { error } = await supabase.from('orders').upsert(row, { onConflict: 'gogetssl_order_id' })
        if (!error) synced++
      }
    }

    res.status(200).json({ synced, errors, message: `Synced ${synced} orders` })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
