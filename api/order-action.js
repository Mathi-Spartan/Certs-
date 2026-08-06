const V1_BASE = 'https://my.gogetssl.com/api'

async function getAuthKey() {
  const body = new URLSearchParams({
    user: process.env.GOGETSSL_USER || 'mathivanan@gogetssl.com',
    pass: process.env.GOGETSSL_API_PASSWORD
  })
  const r = await fetch(`${V1_BASE}/auth/`, {
    method: 'POST', body,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  })
  const d = await r.json()
  return d.key || null
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })

  const { action, order_id, reason, csr, webserver_type, domain } = req.body || {}
  if (!action || !order_id) return res.status(400).json({ error: 'action and order_id required' })

  try {
    const key = await getAuthKey()
    if (!key) return res.status(500).json({ error: 'GoGetSSL auth failed' })

    let result, r

    switch (action) {
      case 'status':
        r = await fetch(`${V1_BASE}/orders/status/${order_id}?auth_key=${key}`)
        result = await r.json()
        break

      case 'cancel':
        r = await fetch(`${V1_BASE}/orders/cancel_ssl_order/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ auth_key: key, order_id, reason: reason || 'end' })
        })
        result = await r.json()
        break

      case 'reissue':
        if (!csr) return res.status(400).json({ error: 'CSR required for reissue' })
        r = await fetch(`${V1_BASE}/orders/ssl/reissue/${order_id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ auth_key: key, order_id, csr, webserver_type: webserver_type || '1' })
        })
        result = await r.json()
        break

      case 'resend':
        r = await fetch(`${V1_BASE}/orders/ssl/resend/${order_id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ auth_key: key, order_id, domain: domain || '' })
        })
        result = await r.json()
        break

      case 'resend_email':
        r = await fetch(`${V1_BASE}/orders/ssl/resend_validation_email/${order_id}?auth_key=${key}`)
        result = await r.json()
        break

      case 'recheck_caa':
        r = await fetch(`${V1_BASE}/orders/ssl/recheck-caa/${order_id}?auth_key=${key}`)
        result = await r.json()
        break

      default:
        return res.status(400).json({ error: `Unknown action: ${action}` })
    }

    return res.status(200).json({ ok: true, action, order_id, result })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
