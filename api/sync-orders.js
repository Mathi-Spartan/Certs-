const SUPABASE_URL = process.env.SUPABASE_URL || 'https://cbfwizrivaaqibykulis.supabase.co'
const SUPABASE_ANON = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_rTbE5qvU7nDlDevl-WviAg_LSWim1hb'
const GGS_V2 = { Authorization: `GGS ${process.env.GOGETSSL_PARTNER_CODE}:${process.env.GOGETSSL_API_PASSWORD}` }
const V1 = 'https://my.gogetssl.com/api'
const V2 = 'https://my.gogetssl.com/api/v2/certificates'

// Complete GoGetSSL product catalog (all 78 products)
const PRODUCT_MAP = {"12":"GeoTrust QuickSSL Premium SAN","24":"Thawte SSL Web Server Multi-Domain Wildcard","25":"GeoTrust TrueBusinessID SAN Wildcard","26":"GeoTrust QuickSSL Premium","27":"GeoTrust TrueBusinessID","28":"GeoTrust TrueBusinessID Wildcard","29":"GeoTrust TrueBusinessID EV","30":"GeoTrust TrueBusinessID SAN","31":"RapidSSL Standard","32":"RapidSSL WildcardSSL","35":"Thawte Web Server SSL","36":"Thawte SSL 123","37":"Thawte Web Server EV","38":"Thawte Wildcard SSL Certificate","39":"DigiCert Code Signing SSL","41":"DigiCert Secure Site","42":"DigiCert Secure Site PRO","43":"DigiCert Secure Site PRO EV","44":"DigiCert Secure Site EV","45":"Sectigo PositiveSSL","46":"Sectigo PositiveSSL Wildcard","47":"Sectigo InstantSSL","48":"Sectigo InstantSSL Pro","49":"Sectigo InstantSSL Premium","50":"Sectigo InstantSSL Premium Wildcard","53":"Sectigo SSL UCC OV","54":"Sectigo Multi-Domain SSL","55":"Sectigo EV SSL","57":"Sectigo Multi-Domain EV SSL","63":"Sectigo PositiveSSL Multi-Domain Wildcard (3 SAN)","65":"GoGetSSL 90-day Trial SSL","66":"GoGetSSL Domain SSL","67":"GoGetSSL Wildcard SSL","68":"GoGetSSL Multi-Domain SSL","71":"GeoTrust TrueBusinessID EV SAN","75":"Sectigo Essential SSL","76":"Sectigo Essential Wildcard SSL","77":"Sectigo PositiveSSL Multi-Domain","82":"Sectigo SSL Certificate","84":"DigiCert Secure Site Wildcard","85":"Sectigo SSL UCC DV","86":"Sectigo Intel vPro AMT","89":"DigiCert EV Code Signing Certificate","99":"Sectigo PositiveSSL Multi-Domain Wildcard","100":"Sectigo Multi-Domain Wildcard SSL","105":"Sectigo SSL Wildcard","111":"Thawte SSL 123 Wildcard","112":"GeoTrust QuickSSL Premium Wildcard","113":"DigiCert Secure Site PRO Wildcard","118":"Sectigo PositiveSSL EV","119":"Sectigo PositiveSSL EV MDC","120":"Sectigo UCC DV Wildcard SSL","125":"Sectigo EnterpriseSSL","126":"Sectigo EnterpriseSSL Pro","127":"Sectigo EnterpriseSSL Pro Wildcard","128":"Sectigo UCC OV Wildcard SSL","129":"Sectigo EnterpriseSSL Pro EV","130":"Sectigo EnterpriseSSL Pro EV MDC","131":"Sectigo EV Code Signing SSL","132":"GoGetSSL BusinessTrust EV","133":"GoGetSSL BusinessTrust EV SAN","134":"GoGetSSL BusinessTrust","135":"GoGetSSL BusinessTrust Wildcard","136":"GoGetSSL BusinessTrust SAN","138":"GoGetSSL EV Code Signing","139":"GoGetSSL Multi-Domain Wildcard SSL","144":"GoGetSSL Public IP SAN","173":"DigiCert Basic OV","174":"DigiCert Wildcard SSL","175":"DigiCert Basic EV SSL","180":"DigiCert Multi-Domain SSL","182":"DigiCert EV Multi-Domain","185":"GoGetSSL Secure Domain SSL","300":"Sectigo ACME Certificate-as-a-Service","400":"RapidSSL Plan + Automate","401":"RapidSSL Wildcard Plan + Automate","402":"GeoTrust DV Plan + Automate","403":"GeoTrust DV Wildcard Plan + Automate"}

const V2_PRODUCT_NAMES = {
  300:'Sectigo ACME CaaS', 400:'RapidSSL DV + Automate',
  401:'RapidSSL Wildcard + Automate', 402:'GeoTrust DV + Automate',
  403:'GeoTrust Wildcard + Automate',
}
const V2_CA = { 300:'Sectigo', 400:'RapidSSL', 401:'RapidSSL', 402:'GeoTrust', 403:'GeoTrust' }

// Product ID → name from GoGetSSL catalog

function detectCA(productId, productName) {
  const n = (productName || '').toLowerCase()
  if (n.includes('digicert')) return 'DigiCert'
  if (n.includes('thawte')) return 'Thawte'
  if (n.includes('geotrust')) return 'GeoTrust'
  if (n.includes('rapidssl')) return 'RapidSSL'
  if (n.includes('sectigo') || n.includes('comodo') || n.includes('positive') || n.includes('gogetssl')) return 'Sectigo/GoGetSSL'
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
          const pname = PRODUCT_MAP[String(pid)] || d.product_name || (pid ? `Product #${pid}` : 'SSL Certificate')
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
