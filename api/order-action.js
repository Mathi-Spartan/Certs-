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
  return (await r.json()).key || null
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const body = req.body || {}
  const { action, order_id } = body

  try {
    const key = await getKey()
    if (!key) return res.status(500).json({ error: 'GoGetSSL auth failed — check credentials' })

    let r, result

    switch (action) {

      case 'status':
        r = await fetch(`${V1}/orders/status/${order_id}?auth_key=${key}`)
        result = await r.json()
        break

      case 'decode_csr': {
        r = await fetch(`${V1}/tools/csr/decode`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ auth_key: key, csr: body.csr || '' })
        })
        const raw = await r.json()
        if (raw.error) return res.status(200).json({ ok: true, action, result: { error: true, message: raw.message } })
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
        }
        break
      }

      // Generate certificate: uses add_ssl_order for ALL cases
      // This is the ONLY correct API for placing a cert with CSR
      // incomplete orders are shells — ignore them, place a proper order
      case 'generate': {
        const { csr, dcv_method, approver_email, product_id, period, contact } = body
        if (!csr) return res.status(400).json({ error: 'CSR required' })
        if (!dcv_method) return res.status(400).json({ error: 'DCV method required' })
        if (!product_id) return res.status(400).json({ error: 'product_id required' })

        const c = contact || {}
        const params = new URLSearchParams({
          auth_key: key,
          product_id: String(product_id),
          csr,
          server_count: '1',
          period: String(period || 12),
          webserver_type: '2',
          dcv_method,
          signature_hash: 'SHA2',
          admin_firstname: c.first_name || 'Admin',
          admin_lastname: c.last_name || 'User',
          admin_phone: c.phone || '',
          admin_title: c.title || 'Mr',
          admin_email: c.email || '',
          admin_city: c.city || '',
          admin_country: c.country || 'IN',
          admin_addressline1: c.address || '',
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

      // Reissue an ALREADY-ISSUED cert with new CSR
      case 'reissue': {
        const { csr, dcv_method, approver_email } = body
        if (!csr) return res.status(400).json({ error: 'CSR required' })
        const params = new URLSearchParams({ auth_key: key, order_id, csr, webserver_type: '2', signature_hash: 'SHA2' })
        if (dcv_method) params.set('dcv_method', dcv_method)
        if (approver_email) params.set('approver_email', approver_email)
        r = await fetch(`${V1}/orders/ssl/reissue/${order_id}`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params })
        result = await r.json()
        break
      }

      case 'change_dcv': {
        const { domain, new_method, approver_email } = body
        const params = new URLSearchParams({ auth_key: key, order_id, domain_name: domain || '', new_method: new_method || 'dns' })
        if (new_method === 'email' && approver_email) params.set('approver_email', approver_email)
        r = await fetch(`${V1}/orders/ssl/change_dcv/${order_id}`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params })
        result = await r.json()
        break
      }

      case 'revalidate': {
        r = await fetch(`${V1}/orders/ssl/revalidate/${order_id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ auth_key: key, order_id, ...(body.domain ? { domain: body.domain } : {}) })
        })
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
        // Treat already-cancelled as success
        if (result.error && result.message?.toLowerCase().includes('already in cancelled')) {
          result = { success: true, message: 'Already cancelled in GoGetSSL' }
        }
        // Update DB status
        if (result.success === true || result.success === 'true') {
          try {
            const { createClient } = await import('@supabase/supabase-js')
            const sb = createClient(process.env.SUPABASE_URL || 'https://cbfwizrivaaqibykulis.supabase.co',
              process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_rTbE5qvU7nDlDevl-WviAg_LSWim1hb')
            await sb.from('orders').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('gogetssl_order_id', Number(order_id))
          } catch(e) {}
        }
        break
      }

      case 'recheck_caa':
        r = await fetch(`${V1}/orders/ssl/recheck-caa/${order_id}?auth_key=${key}`)
        result = await r.json()
        break

      case 'domain_emails': {
        const domain = (body.domain || '').replace(/^\*\./, '')
        const std = ['admin','administrator','postmaster','hostmaster','webmaster'].map(p=>`${p}@${domain}`)
        try {
          const r1 = await fetch(`${V1}/tools/domain/emails`, { method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body: new URLSearchParams({auth_key:key, domain}) })
          const d1 = await r1.json()
          const api = [...(d1.ComodoApprovalEmails||[]), ...(d1.GeotrustApprovalEmails||[])]
          result = { emails: [...new Set([...std, ...api])], standard: std }
        } catch { result = { emails: std, standard: std } }
        break
      }

      default:
        return res.status(400).json({ error: `Unknown action: ${action}` })
    }

    return res.status(200).json({ ok: true, action, order_id, result })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
