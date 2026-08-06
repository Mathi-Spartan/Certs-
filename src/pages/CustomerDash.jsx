import { useState, useEffect } from 'react'
import DashShell from '../components/DashShell'
import { supabase } from '../supabase'
import { useAuth } from '../AuthContext'

const STATUS_PILL = { active: 'green', cancelled: 'red', pending: 'amber', processing: 'blue', expired: 'gray' }

export default function CustomerDash() {
  const { session, profile } = useAuth()
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(null)

  useEffect(() => { if (session) loadOrders() }, [session])

  async function loadOrders() {
    const { data } = await supabase
      .from('orders')
      .select('*')
      .eq('customer_id', session.user.id)
      .order('created_at', { ascending: false })
    setOrders(data || [])
    setLoading(false)
  }

  const active = orders.filter(o => o.status === 'active').length
  const expiring = orders.filter(o => {
    if (!o.next_renewal) return false
    return (new Date(o.next_renewal) - new Date()) / 86400000 < 30
  }).length

  const daysUntil = d => d ? Math.ceil((new Date(d) - new Date()) / 86400000) : null

  return (
    <DashShell>
      <div className="dash-topbar">
        <h2 style={{ fontSize: '1.1rem' }}>My SSL certificates</h2>
        <a href="mailto:mathivanan@gogetssl.com" className="btn btn-secondary btn-sm">Contact support</a>
      </div>
      <div className="dash-content">
        <div className="kpi-grid">
          <div className="kpi-card">
            <div className="kpi-label">Total certificates</div>
            <div className="kpi-value">{orders.length}</div>
            <div className="kpi-sub">in your account</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Active</div>
            <div className="kpi-value">{active}</div>
            <div className="kpi-sub">currently valid</div>
          </div>
          <div className="kpi-card" style={{ borderColor: expiring > 0 ? 'var(--amber)' : undefined }}>
            <div className="kpi-label">Expiring soon</div>
            <div className="kpi-value" style={{ color: expiring > 0 ? 'var(--amber)' : undefined }}>{expiring}</div>
            <div className="kpi-sub">within 30 days</div>
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
        ) : orders.length === 0 ? (
          <div className="empty-state card" style={{ padding: 48 }}>
            <h3>No certificates assigned yet</h3>
            <p style={{ fontSize: 13 }}>Your SSL Distributor partner will assign certificates to your account.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {orders.map(o => {
              const days = daysUntil(o.next_renewal)
              const isExpiring = days !== null && days < 30 && days > 0
              const isExpired = days !== null && days <= 0
              return (
                <div key={o.id} className="card" style={{ borderColor: isExpired ? 'var(--red)' : isExpiring ? 'var(--amber)' : undefined }}>
                  <div
                    style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}
                    onClick={() => setExpanded(expanded === o.id ? null : o.id)}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 600, fontSize: 14 }}>{o.product_name}</span>
                        <span className={`pill pill-${STATUS_PILL[o.status] || 'gray'}`}>{o.status}</span>
                        {isExpiring && <span className="pill pill-amber">Expires in {days}d</span>}
                        {isExpired && <span className="pill pill-red">Expired</span>}
                      </div>
                      <div style={{ display: 'flex', gap: 16, marginTop: 4, fontSize: 13, color: 'var(--ink-muted)', flexWrap: 'wrap' }}>
                        {o.domain && <span className="mono" style={{ fontSize: 12 }}>{o.domain}</span>}
                        <span>CA: {o.ca || '—'}</span>
                        {o.next_renewal && <span>Renewal: {new Date(o.next_renewal).toLocaleDateString()}</span>}
                      </div>
                    </div>
                    <span style={{ color: 'var(--ink-muted)', fontSize: 18, transition: 'transform .2s', transform: expanded === o.id ? 'rotate(180deg)' : '' }}>›</span>
                  </div>

                  {expanded === o.id && (
                    <div style={{ borderTop: '1px solid var(--border)', marginTop: 14, paddingTop: 14 }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 12, marginBottom: 16 }}>
                        {[
                          { label: 'GoGetSSL Order ID', val: o.gogetssl_order_id ? `#${o.gogetssl_order_id}` : '—' },
                          { label: 'Certificate Authority', val: o.ca || '—' },
                          { label: 'Domain', val: o.domain || '—' },
                          { label: 'Status', val: o.status },
                          { label: 'Order type', val: o.is_automation ? 'Automation (auto-renew)' : 'Standard' },
                          { label: 'Next renewal', val: o.next_renewal ? new Date(o.next_renewal).toLocaleDateString() : '—' },
                        ].map(r => (
                          <div key={r.label} style={{ background: 'var(--canvas)', borderRadius: 8, padding: '10px 12px' }}>
                            <div style={{ fontSize: 11, color: 'var(--ink-muted)', marginBottom: 3 }}>{r.label}</div>
                            <div style={{ fontSize: 13, fontWeight: 500 }} className={r.label === 'Domain' || r.label.includes('ID') ? 'mono' : ''}>{r.val}</div>
                          </div>
                        ))}
                      </div>

                      {o.is_automation && (
                        <div style={{ background: 'var(--blue-sky)', borderRadius: 8, padding: '12px 14px', border: '1px solid rgba(51,117,177,.15)' }}>
                          <div style={{ fontWeight: 500, fontSize: 13, marginBottom: 6 }}>⚡ Automation active</div>
                          <p style={{ fontSize: 13, color: 'var(--ink-mid)' }}>This certificate is managed automatically. Renewals happen without any action needed from you. Contact your provider if you need setup assistance.</p>
                        </div>
                      )}

                      <div style={{ marginTop: 14 }}>
                        <a href="mailto:mathivanan@gogetssl.com" className="btn btn-secondary btn-sm">Contact support about this certificate</a>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </DashShell>
  )
}
