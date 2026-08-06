import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import DashShell from '../components/DashShell'
import { supabase } from '../supabase'
import { useAuth } from '../AuthContext'

const STATUS_PILL = { active: 'green', cancelled: 'red', pending: 'amber', processing: 'blue', expired: 'gray' }

export default function PartnerDash() {
  const { session, profile } = useAuth()
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (session) loadOrders()
  }, [session])

  async function loadOrders() {
    const { data } = await supabase
      .from('orders')
      .select('*, customer:profiles!orders_customer_id_fkey(full_name, email)')
      .eq('assigned_to', session.user.id)
      .order('created_at', { ascending: false })
    setOrders(data || [])
    setLoading(false)
  }

  const active = orders.filter(o => o.status === 'active').length
  const unassignedToCustomer = orders.filter(o => !o.customer_id).length
  const expiring = orders.filter(o => {
    if (!o.next_renewal) return false
    const d = (new Date(o.next_renewal) - new Date()) / 86400000
    return d > 0 && d < 30
  }).length

  return (
    <DashShell>
      <div className="dash-topbar">
        <h2 style={{ fontSize: '1.1rem' }}>
          {profile?.full_name || profile?.email}
          {profile?.company && <span style={{ color: 'var(--ink-muted)', fontWeight: 400, fontSize: '0.9rem' }}> · {profile.company}</span>}
        </h2>
        <Link to="/partner/products" className="btn btn-primary btn-sm">Browse products</Link>
      </div>
      <div className="dash-content">
        <div className="kpi-grid">
          <div className="kpi-card">
            <div className="kpi-label">Assigned orders</div>
            <div className="kpi-value">{orders.length}</div>
            <div className="kpi-sub">total in portfolio</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Active</div>
            <div className="kpi-value">{active}</div>
            <div className="kpi-sub">currently active</div>
          </div>
          <div className="kpi-card" style={{ borderColor: unassignedToCustomer > 0 ? 'var(--amber)' : undefined }}>
            <div className="kpi-label">Needs customer</div>
            <div className="kpi-value" style={{ color: unassignedToCustomer > 0 ? 'var(--amber)' : undefined }}>{unassignedToCustomer}</div>
            <div className="kpi-sub">not yet assigned</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Expiring soon</div>
            <div className="kpi-value" style={{ color: expiring > 0 ? 'var(--red)' : undefined }}>{expiring}</div>
            <div className="kpi-sub">within 30 days</div>
          </div>
        </div>

        <div className="card">
          <div className="section-head" style={{ marginBottom: 16 }}>
            <h3>My orders</h3>
            <Link to="/partner/orders" style={{ fontSize: 13, color: 'var(--blue-accent)' }}>View all →</Link>
          </div>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 32 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
          ) : orders.length === 0 ? (
            <div className="empty-state">
              <h3>No orders assigned yet</h3>
              <p style={{ fontSize: 13 }}>Your SSL Distributor account manager will assign orders to your account.</p>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>GoGetSSL ID</th><th>Product</th><th>Domain</th><th>Status</th><th>Customer</th><th>Renewal</th><th></th></tr>
                </thead>
                <tbody>
                  {orders.slice(0, 10).map(o => (
                    <tr key={o.id}>
                      <td><span className="mono">#{o.gogetssl_order_id || '—'}</span></td>
                      <td style={{ fontSize: 13, maxWidth: 160 }}>{o.product_name}</td>
                      <td><span className="mono" style={{ fontSize: 12 }}>{o.domain || '—'}</span></td>
                      <td><span className={`pill pill-${STATUS_PILL[o.status] || 'gray'}`}>{o.status}</span></td>
                      <td style={{ fontSize: 13 }}>
                        {o.customer
                          ? o.customer.full_name || o.customer.email
                          : <span style={{ color: 'var(--ink-faint)' }}>Not assigned</span>}
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--ink-muted)' }}>{o.next_renewal ? new Date(o.next_renewal).toLocaleDateString() : '—'}</td>
                      <td>
                        {!o.customer_id && (
                          <Link to={`/partner/orders`} style={{ fontSize: 12, color: 'var(--blue-accent)' }}>Assign →</Link>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </DashShell>
  )
}
