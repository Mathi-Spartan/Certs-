import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import DashShell from '../components/DashShell'
import { supabase } from '../supabase'

export default function AdminDash() {
  const [stats, setStats] = useState({ partners: 0, orders: 0, unassigned: 0, expiring: 0 })
  const [recentOrders, setRecentOrders] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    const [{ count: partners }, { count: orders }, { data: ordersData }] = await Promise.all([
      supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'partner'),
      supabase.from('orders').select('*', { count: 'exact', head: true }),
      supabase.from('orders').select('*, assigned_to_profile:profiles!orders_assigned_to_fkey(full_name, email)').order('created_at', { ascending: false }).limit(8),
    ])
    const unassigned = (ordersData || []).filter(o => !o.assigned_to).length
    const expiring = (ordersData || []).filter(o => {
      if (!o.next_renewal) return false
      const days = (new Date(o.next_renewal) - new Date()) / 86400000
      return days > 0 && days < 30
    }).length
    setStats({ partners: partners || 0, orders: orders || 0, unassigned, expiring })
    setRecentOrders(ordersData || [])
    setLoading(false)
  }

  const statusPill = s => {
    const map = { active: 'green', cancelled: 'red', pending: 'amber', processing: 'blue' }
    return <span className={`pill pill-${map[s] || 'gray'}`}>{s}</span>
  }

  return (
    <DashShell>
      <div className="dash-topbar">
        <h2 style={{fontSize:'1.1rem'}}>Master admin dashboard</h2>
        <div style={{display:'flex', gap:10}}>
          <Link to="/admin/partners" className="btn btn-secondary btn-sm">Manage partners</Link>
          <Link to="/admin/orders" className="btn btn-primary btn-sm">View all orders</Link>
        </div>
      </div>
      <div className="dash-content">
        <div className="kpi-grid">
          <div className="kpi-card">
            <div className="kpi-label">Total partners</div>
            <div className="kpi-value">{loading ? '–' : stats.partners}</div>
            <div className="kpi-sub">active accounts</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Total orders</div>
            <div className="kpi-value">{loading ? '–' : stats.orders}</div>
            <div className="kpi-sub">in database</div>
          </div>
          <div className="kpi-card" style={{borderColor: stats.unassigned > 0 ? 'var(--amber)' : undefined}}>
            <div className="kpi-label">Unassigned</div>
            <div className="kpi-value" style={{color: stats.unassigned > 0 ? 'var(--amber)' : undefined}}>{loading ? '–' : stats.unassigned}</div>
            <div className="kpi-sub">need assignment</div>
          </div>
          <div className="kpi-card" style={{borderColor: stats.expiring > 0 ? 'var(--red)' : undefined}}>
            <div className="kpi-label">Expiring soon</div>
            <div className="kpi-value" style={{color: stats.expiring > 0 ? 'var(--red)' : undefined}}>{loading ? '–' : stats.expiring}</div>
            <div className="kpi-sub">within 30 days</div>
          </div>
        </div>

        <div className="card">
          <div className="section-head" style={{marginBottom:16}}>
            <h3>Recent orders</h3>
            <Link to="/admin/orders" style={{fontSize:13, color:'var(--blue-accent)'}}>View all →</Link>
          </div>
          {loading ? (
            <div style={{textAlign:'center', padding:32}}><div className="spinner" style={{margin:'0 auto'}} /></div>
          ) : recentOrders.length === 0 ? (
            <div className="empty-state">
              <h3>No orders yet</h3>
              <p style={{fontSize:13}}>Orders synced from GoGetSSL will appear here.</p>
              <Link to="/admin/orders" className="btn btn-primary btn-sm" style={{marginTop:12}}>Sync orders</Link>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Order ID</th><th>Product</th><th>Domain</th><th>Status</th><th>Assigned to</th><th>Renewal</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {recentOrders.map(o => (
                    <tr key={o.id}>
                      <td><span className="mono">#{o.gogetssl_order_id || o.id.slice(0,8)}</span></td>
                      <td style={{maxWidth:180}}>{o.product_name}</td>
                      <td><span className="mono" style={{fontSize:12}}>{o.domain || '—'}</span></td>
                      <td>{statusPill(o.status)}</td>
                      <td style={{fontSize:13, color:'var(--ink-muted)'}}>
                        {o.assigned_to_profile?.full_name || o.assigned_to_profile?.email || <span style={{color:'var(--amber)'}}>Unassigned</span>}
                      </td>
                      <td style={{fontSize:13, color:'var(--ink-muted)'}}>{o.next_renewal ? new Date(o.next_renewal).toLocaleDateString() : '—'}</td>
                      <td><Link to={`/admin/assign`} style={{fontSize:13, color:'var(--blue-accent)'}}>Assign →</Link></td>
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
