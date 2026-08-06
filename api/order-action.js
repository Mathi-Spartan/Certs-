const V1 = 'https://my.gogetssl.com/api'

async function getKey() {
  const r = await fetch(`${V1}/auth/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      user: process.env.GOGETSSL_USER || 'mathivanan@gogetssl.com',
      pass: process.env.GOGETSSL_API_PASSWORD
    })
  })
  const d = await r.json()
  return d.key || null
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const body = req.body || {}
  const { action, order_id } = body
  if (!action) return res.status(400).json({ error: 'action required' })

  try {
    const key = await getKey()
    if (!key) return res.status(500).json({ error: 'GoGetSSL authentication failed' })

    let r, result

    switch (action) {

      case 'status':
        r = await fetch(`${V1}/orders/status/${order_id}?auth_key=${key}`)
        result = await r.json()
        break

      case 'domain_emails': {
        const domain = (body.domain || '').replace(/^\*\./, '')
        if (!domain) return res.status(400).json({ error: 'domain required' })
        // Standard 5 CA/B Forum email addresses
        const standardEmails = ['admin','administrator','postmaster','hostmaster','webmaster'].map(p => `${p}@${domain}`)
        // Also fetch from GoGetSSL for any additional ones
        const [r1, r2] = await Promise.all([
          fetch(`${V1}/tools/domain/emails`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ auth_key: key, domain }) }),
          fetch(`${V1}/tools/domain/emails/geotrust/`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ auth_key: key, domain }) }),
        ])
        const d1 = await r1.json(), d2 = await r2.json()
        const apiEmails = [...new Set([...(d1.ComodoApprovalEmails || []), ...(d1.GeotrustApprovalEmails || []), ...(d2.ComodoApprovalEmails || [])])]
        // Merge: standard first, then any extra from API
        const all = [...new Set([...standardEmails, ...apiEmails])]
        result = { emails: all, standard: standardEmails }
        break
      }

      case 'decode_csr': {
        const csr = body.csr || ''
        if (!csr) return res.status(400).json({ error: 'csr required' })
        r = await fetch(`${V1}/tools/csr/decode`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ auth_key: key, csr })
        })
        const raw = await r.json()
        if (raw.error) return res.status(200).json({ ok: true, action, result: { error: true, message: raw.message } })
        // Normalize: csrResult wrapper
        const cr = raw.csrResult || raw
        result = {
          cn: cr.CN || cr.cn,
          o: cr.O || cr.o,
          c: cr.C || cr.c,
          st: cr.S || cr.st,
          l: cr.L || cr.l,
          email: cr.Email || cr.email,
          key_size: cr['Key Size'] || cr.key_size,
          key_type: 'RSA',
          san: cr['dnsName(s)'] || [],
        }
        break
      }

      // Complete an INCOMPLETE order — uses add_ssl_order with product_id from original
      // This creates a new active order (GoGetSSL's actual behavior for incomplete orders)
      case 'complete_order': {
        const { csr, dcv_method, approver_email, product_id, contact } = body
        if (!csr) return res.status(400).json({ error: 'CSR required' })
        if (!dcv_method) return res.status(400).json({ error: 'DCV method required' })
        if (!product_id) return res.status(400).json({ error: 'product_id required' })

        const c = contact || {}
        const params = new URLSearchParams({
          auth_key: key,
          product_id: String(product_id),
          csr,
          server_count: '1',
          period: '12',
          webserver_type: '2',
          dcv_method,
          signature_hash: 'SHA2',
          // Admin contact
          admin_firstname: c.first_name || 'Admin',
          admin_lastname: c.last_name || 'User',
          admin_phone: c.phone || '',
          admin_title: c.title || 'Mr',
          admin_email: c.email || '',
          admin_city: c.city || '',
          admin_country: c.country || 'IN',
          admin_addressline1: c.address || '',
          // Tech contact (same as admin for DV)
          tech_firstname: c.first_name || 'Admin',
          tech_lastname: c.last_name || 'User',
          tech_phone: c.phone || '',
          tech_title: c.title || 'Mr',
          tech_email: c.email || '',
          tech_city: c.city || '',
          tech_country: c.country || 'IN',
          tech_addressline1: c.address || '',
        })
        if (dcv_method === 'email' && approver_email) params.set('approver_email', approver_email)

        r = await fetch(`${V1}/orders/add_ssl_order`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: params
        })
        result = await r.json()
        break
      }

      // Reissue an already-issued cert (different from completing incomplete)
      case 'reissue': {
        const { csr, dcv_method, approver_email, webserver_type } = body
        if (!csr) return res.status(400).json({ error: 'CSR required' })
        const params = new URLSearchParams({ auth_key: key, order_id, csr, webserver_type: webserver_type || '2', signature_hash: 'SHA2' })
        if (dcv_method) params.set('dcv_method', dcv_method)
        if (approver_email) params.set('approver_email', approver_email)
        r = await fetch(`${V1}/orders/ssl/reissue/${order_id}`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params })
        result = await r.json()
        break
      }

      case 'resend_email':
        r = await fetch(`${V1}/orders/ssl/resend_validation_email/${order_id}?auth_key=${key}`)
        result = await r.json()
        break

      case 'cancel': {
        r = await fetch(`${V1}/orders/cancel_ssl_order/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ auth_key: key, order_id, reason: body.reason || 'end' })
        })
        result = await r.json()
        break
      }

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
