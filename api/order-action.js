const V1 = 'https://my.gogetssl.com/api'

async function getKey() {
  const r = await fetch(`${V1}/auth/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ user: process.env.GOGETSSL_USER || 'mathivanan@gogetssl.com', pass: process.env.GOGETSSL_API_PASSWORD })
  })
  const d = await r.json()
  return d.key || null
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const body = req.body || {}
  const { action, order_id } = body
  if (!action || !order_id) return res.status(400).json({ error: 'action and order_id required' })

  try {
    const key = await getKey()
    if (!key) return res.status(500).json({ error: 'GoGetSSL authentication failed — check GOGETSSL_USER and GOGETSSL_API_PASSWORD' })

    let r, result

    switch (action) {
      // Fetch live order status
      case 'status':
        r = await fetch(`${V1}/orders/status/${order_id}?auth_key=${key}`)
        result = await r.json()
        break

      // Fetch available DCV email addresses for a domain
      case 'domain_emails': {
        const domain = body.domain || ''
        if (!domain) return res.status(400).json({ error: 'domain required' })
        const [r1, r2] = await Promise.all([
          fetch(`${V1}/tools/domain/emails`, { method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body: new URLSearchParams({ auth_key:key, domain }) }),
          fetch(`${V1}/tools/domain/emails/geotrust/`, { method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body: new URLSearchParams({ auth_key:key, domain }) }),
        ])
        const d1 = await r1.json(), d2 = await r2.json()
        // Merge and deduplicate all approval emails
        const all = [...new Set([
          ...(d1.ComodoApprovalEmails || []),
          ...(d1.GeotrustApprovalEmails || []),
          ...(d2.ComodoApprovalEmails || []),
          ...(d2.GeotrustApprovalEmails || []),
        ])]
        result = { emails: all, raw: { comodo: d1, geotrust: d2 } }
        break
      }

      // Decode/validate a CSR — get domain from it
      case 'decode_csr': {
        const csr = body.csr || ''
        if (!csr) return res.status(400).json({ error: 'csr required' })
        r = await fetch(`${V1}/tools/csr/decode`, { method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body: new URLSearchParams({ auth_key:key, csr }) })
        result = await r.json()
        break
      }

      // Generate certificate for incomplete/new order — submits CSR + DCV
      case 'generate': {
        const { csr, dcv_method, approver_email, webserver_type, domain } = body
        if (!csr) return res.status(400).json({ error: 'CSR is required' })
        if (!dcv_method) return res.status(400).json({ error: 'DCV method is required' })

        const params = new URLSearchParams({
          auth_key: key,
          order_id,
          csr,
          dcv_method,
          webserver_type: webserver_type || '2',
          signature_hash: 'SHA2',
        })
        if (dcv_method === 'email' && approver_email) params.set('approver_email', approver_email)
        if (domain) params.set('domain', domain)

        r = await fetch(`${V1}/orders/ssl/reissue/${order_id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: params
        })
        result = await r.json()
        break
      }

      // Change DCV method on an existing order
      case 'change_dcv': {
        const { domain, new_method } = body
        r = await fetch(`${V1}/orders/ssl/change_validation_method/${order_id}/`, {
          method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'},
          body: new URLSearchParams({ auth_key:key, order_id, domain: domain||'', new_method: new_method||'http' })
        })
        result = await r.json()
        break
      }

      // Reissue with new CSR
      case 'reissue': {
        const { csr, dcv_method, approver_email, webserver_type } = body
        if (!csr) return res.status(400).json({ error: 'CSR required' })
        const params = new URLSearchParams({ auth_key:key, order_id, csr, webserver_type: webserver_type||'2', signature_hash:'SHA2' })
        if (dcv_method) params.set('dcv_method', dcv_method)
        if (approver_email) params.set('approver_email', approver_email)
        r = await fetch(`${V1}/orders/ssl/reissue/${order_id}`, { method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body: params })
        result = await r.json()
        break
      }

      // Resend validation email
      case 'resend_email':
        r = await fetch(`${V1}/orders/ssl/resend_validation_email/${order_id}?auth_key=${key}`)
        result = await r.json()
        break

      // Resend certificate
      case 'resend': {
        const params = new URLSearchParams({ auth_key:key, order_id })
        if (body.domain) params.set('domain', body.domain)
        r = await fetch(`${V1}/orders/ssl/resend/${order_id}`, { method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body: params })
        result = await r.json()
        break
      }

      // Cancel order
      case 'cancel': {
        r = await fetch(`${V1}/orders/cancel_ssl_order/`, {
          method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'},
          body: new URLSearchParams({ auth_key:key, order_id, reason: body.reason||'end' })
        })
        result = await r.json()
        break
      }

      // Check CAA record
      case 'recheck_caa':
        r = await fetch(`${V1}/orders/ssl/recheck-caa/${order_id}?auth_key=${key}`)
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
