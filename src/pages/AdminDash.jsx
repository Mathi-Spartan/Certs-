import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import DashShell from '../components/DashShell'
import { supabase } from '../supabase'

const SP = { active:'green', issued:'green', cancelled:'red', revoked:'red', expired:'red', pending:'amber', incomplete:'amber' }
const V1_NAMES = {31:'RapidSSL DV',32:'RapidSSL Wildcard',33:'GeoTrust DV',34:'GeoTrust OV Wildcard',35:'GeoTrust EV',36:'GeoTrust OV',50:'Thawte SSL OV',51:'Thawte SSL EV',65:'DigiCert Secure Site OV',66:'DigiCert Secure Site EV',67:'DigiCert Secure Site Pro OV',68:'DigiCert Secure Site Pro EV',175:'DigiCert Basic EV',176:'DigiCert Basic OV'}

function resolveProduct(o) {
  const r = o?.api_response
  if (!r) return o?.product_name || '—'
  if (r.product_name) return r.product_name
  return V1_NAMES[r.product_id] || o?.product_name || (r.product_id ? `Product #${r.product_id}` : '—')
}

export default function AdminDash() {
  const [orders, setOrders] = useState([])
  const [partnerCount, setPartnerCount] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    const [{ data: ord }, { count: pCount }] = await Promise.all([
      supabase.from('orders')
        .select('*, partner:profiles!orders_assigned_to_fkey(full_name,email)')
        .order('gogetssl_order_id', { ascending: false })
        .limit(10),
      supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'partner'),
    ])
    setOrders(ord || [])
    setPartnerCount(pCount || 0)
    setLoading(false)
  }

  // Need total count separately
  const [totalOrders, setTotalOrders] = useState(0)
  useEffect(() => {
    supabase.from('orders').select('*', { count: 'exact', head: true }).then(({ count }) => setTotalOrders(count || 0))
  }, [])

  const unassigned = orders.filter ? 0 : 0 // will derive from full stats below
  const [stats, setStats] = useState({ unassigned: 0, expiring: 0, active: 0 })
  useEffect(() => {
    supabase.from('orders').select('id,status,next_renewal,assigned_to').then(({ data }) => {
      if (!data) return
      const now = new Date()
      setStats({
        unassigned: data.filter(o => !o.assigned_to).length,
        active: data.filter(o => ['active','issued'].includes(o.status)).length,
        expiring: data.filter(o => {
          if (!o.next_renewal || o.next_renewal === '0000-00-00') return false
          const d = (new Date(o.next_renewal) - now) / 86400000
          return d > 0 && d < 30
        }).length,
      })
    })
  }, [])

  return (
    <DashShell>
      <div className="dash-topbar">
        <h2 style={{fontSize:'1.1rem'}}>Master admin dashboard</h2>
        <div style={{display:'flex',gap:10}}>
          <Link to="/admin/partners" className="btn btn-secondary btn-sm">Manage partners</Link>
          <Link to="/admin/orders" className="btn btn-primary btn-sm">View all orders</Link>
        </div>
      </div>
      <div className="dash-content">
        <div className="kpi-grid">
          <div className="kpi-card">
            <div className="kpi-label">Partners</div>
            <div className="kpi-value">{loading?'–':partnerCount}</div>
            <div className="kpi-sub">active accounts</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Total orders</div>
            <div className="kpi-value">{totalOrders||'–'}</div>
            <div className="kpi-sub">in database</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Active</div>
            <div className="kpi-value" style={{color: stats.active>0?'var(--green)':undefined}}>{stats.active}</div>
            <div className="kpi-sub">issued &amp; valid</div>
          </div>
          <div className="kpi-card" style={{borderColor:stats.unassigned>0?'var(--amber)':undefined}}>
            <div className="kpi-label">Unassigned</div>
            <div className="kpi-value" style={{color:stats.unassigned>0?'var(--amber)':undefined}}>{stats.unassigned}</div>
            <div className="kpi-sub">need assignment</div>
          </div>
          <div className="kpi-card" style={{borderColor:stats.expiring>0?'var(--red)':undefined}}>
            <div className="kpi-label">Expiring soon</div>
            <div className="kpi-value" style={{color:stats.expiring>0?'var(--red)':undefined}}>{stats.expiring}</div>
            <div className="kpi-sub">within 30 days</div>
          </div>
        </div>

        <div className="card">
          <div className="section-head" style={{marginBottom:14}}>
            <h3>Latest orders</h3>
            <Link to="/admin/orders" style={{fontSize:13,color:'var(--blue-accent)'}}>View all →</Link>
          </div>
          {loading?(
            <div style={{textAlign:'center',padding:32}}><div className="spinner" style={{margin:'0 auto'}}/></div>
          ):orders.length===0?(
            <div className="empty-state">
              <h3>No orders yet</h3>
              <p style={{fontSize:13}}>Go to All orders and click Sync to pull from GoGetSSL.</p>
              <Link to="/admin/orders" className="btn btn-primary btn-sm" style={{marginTop:12}}>Sync orders</Link>
            </div>
          ):(
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Order ID</th><th>Product</th><th>Domain</th><th>Status</th><th>Assigned to</th><th>Valid till</th><th></th></tr>
                </thead>
                <tbody>
                  {orders.map(o=>(
                    <tr key={o.id}>
                      <td><span className="mono" style={{fontSize:13,fontWeight:600}}>#{o.gogetssl_order_id||'—'}</span></td>
                      <td style={{fontSize:13,maxWidth:180}}>{resolveProduct(o)}</td>
                      <td><span className="mono" style={{fontSize:12}}>{o.domain||'—'}</span></td>
                      <td><span className={`pill pill-${SP[o.status]||'gray'}`} style={{fontSize:11}}>{o.status}</span></td>
                      <td style={{fontSize:13}}>
                        {o.partner?<span>{o.partner.full_name||o.partner.email}</span>
                          :<span style={{color:'var(--amber)',fontWeight:500,fontSize:12}}>Unassigned</span>}
                      </td>
                      <td style={{fontSize:12,color:'var(--ink-muted)',whiteSpace:'nowrap'}}>
                        {o.next_renewal&&o.next_renewal!=='0000-00-00'?new Date(o.next_renewal).toLocaleDateString('en-GB'):'—'}
                      </td>
                      <td><Link to="/admin/orders" style={{fontSize:12,color:'var(--blue-accent)'}}>Details →</Link></td>
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
