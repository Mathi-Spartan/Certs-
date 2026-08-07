import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import DashShell from '../components/DashShell'
import { supabase } from '../supabase'

const V1_NAMES = {31:'RapidSSL DV',32:'RapidSSL Wildcard',33:'GeoTrust DV',34:'GeoTrust OV Wildcard',35:'GeoTrust EV',36:'GeoTrust OV',50:'Thawte SSL OV',51:'Thawte SSL EV',65:'DigiCert Secure Site OV',66:'DigiCert Secure Site EV',67:'DigiCert Secure Site Pro OV',68:'DigiCert Secure Site Pro EV',175:'DigiCert Basic EV',176:'DigiCert Basic OV'}

function resolveProduct(o) {
  const r = o?.api_response
  if (!r) return o?.product_name || '—'
  if (r.product_name) return r.product_name
  return V1_NAMES[r.product_id] || o?.product_name || (r.product_id ? `Product #${r.product_id}` : '—')
}

const SP = {
  active: 'green', issued: 'green',
  cancelled: 'red', revoked: 'red', expired: 'red',
  pending: 'amber', incomplete: 'amber', processing: 'blue'
}

function KpiCard({ label, value, sub, color, filter, total }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0
  return (
    <Link to={`/admin/orders?filter=${filter}`} style={{ textDecoration: 'none' }}>
      <div className="kpi-card" style={{
        borderLeft: `4px solid ${color}`,
        cursor: 'pointer',
        transition: 'box-shadow .15s, transform .1s',
        display: 'block'
      }}
        onMouseEnter={e => { e.currentTarget.style.boxShadow = 'var(--shadow-md)'; e.currentTarget.style.transform = 'translateY(-1px)' }}
        onMouseLeave={e => { e.currentTarget.style.boxShadow = ''; e.currentTarget.style.transform = '' }}
      >
        <div className="kpi-label">{label}</div>
        <div className="kpi-value" style={{ color }}>{value}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
          <div style={{ flex: 1, height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 2, transition: 'width .6s' }} />
          </div>
          <span style={{ fontSize: 11, color: 'var(--ink-muted)', whiteSpace: 'nowrap' }}>{sub || `${pct}% of total`}</span>
        </div>
      </div>
    </Link>
  )
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
        .select('id,gogetssl_order_id,product_name,ca,domain,status,is_automation,next_renewal,assigned_to,api_response,created_at')
        .order('gogetssl_order_id', { ascending: false }),
      supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'partner'),
    ])
    setOrders(ord || [])
    setPartnerCount(pCount || 0)
    setLoading(false)
  }

  const total = orders.length
  const now = new Date()

  const stats = {
    active:     orders.filter(o => ['active','issued'].includes(o.status)).length,
    pending:    orders.filter(o => ['pending','processing'].includes(o.status)).length,
    incomplete: orders.filter(o => o.status === 'incomplete').length,
    cancelled:  orders.filter(o => ['cancelled','revoked'].includes(o.status)).length,
    expired:    orders.filter(o => o.status === 'expired').length,
    automation: orders.filter(o => o.is_automation).length,
    expiring:   orders.filter(o => {
      if (!o.next_renewal || o.next_renewal === '0000-00-00') return false
      const d = (new Date(o.next_renewal) - now) / 86400000
      return d > 0 && d <= 30 && ['active','issued'].includes(o.status)
    }).length,
    unassigned: orders.filter(o => !o.assigned_to).length,
  }

  // Recent active + pending orders (most actionable)
  const recentActionable = orders
    .filter(o => !['cancelled','revoked','expired'].includes(o.status))
    .slice(0, 8)

  // Expiring soon list
  const expiringSoon = orders.filter(o => {
    if (!o.next_renewal || o.next_renewal === '0000-00-00') return false
    const d = (new Date(o.next_renewal) - now) / 86400000
    return d > 0 && d <= 30 && ['active','issued'].includes(o.status)
  }).sort((a,b) => new Date(a.next_renewal) - new Date(b.next_renewal)).slice(0,5)

  return (
    <DashShell>
      <div className="dash-topbar">
        <h2 style={{ fontSize: '1.1rem' }}>Master admin dashboard</h2>
        <div style={{ display: 'flex', gap: 10 }}>
          <Link to="/admin/partners" className="btn btn-secondary btn-sm">Manage partners</Link>
          <Link to="/admin/orders" className="btn btn-primary btn-sm">View all orders</Link>
        </div>
      </div>

      <div className="dash-content">
        {loading ? (
          <div style={{ textAlign: 'center', padding: 60 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
        ) : (
          <>
            {/* Summary row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, padding: '12px 16px', background: 'var(--white)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', flexWrap: 'wrap' }}>
              <div style={{ fontSize: 13, color: 'var(--ink-muted)' }}>
                <strong style={{ color: 'var(--ink)', fontSize: 15 }}>{total}</strong> total orders
              </div>
              <div style={{ width: 1, height: 20, background: 'var(--border)' }} />
              <div style={{ fontSize: 13, color: 'var(--ink-muted)' }}>
                <strong style={{ color: 'var(--ink)' }}>{partnerCount}</strong> partners
              </div>
              <div style={{ width: 1, height: 20, background: 'var(--border)' }} />
              <div style={{ fontSize: 13, color: 'var(--ink-muted)' }}>
                <strong style={{ color: 'var(--blue-accent)' }}>{stats.automation}</strong> automation plans
              </div>
              {stats.expiring > 0 && <>
                <div style={{ width: 1, height: 20, background: 'var(--border)' }} />
                <div style={{ fontSize: 13, color: 'var(--amber)', fontWeight: 600 }}>
                  ⚠ {stats.expiring} expiring within 30 days
                </div>
              </>}
              <div style={{ marginLeft: 'auto' }}>
                <Link to="/admin/orders" className="btn btn-secondary btn-sm">↻ Sync &amp; manage</Link>
              </div>
            </div>

            {/* KPI grid — 4 columns × 2 rows */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 14, marginBottom: 28 }}>
              <KpiCard label="Active / Issued" value={stats.active} color="var(--green)" filter="active" total={total} />
              <KpiCard label="Pending validation" value={stats.pending} color="var(--blue-accent)" filter="pending" total={total} />
              <KpiCard label="Incomplete (needs CSR)" value={stats.incomplete} color="#d97706" filter="incomplete" total={total} />
              <KpiCard label="Expiring soon" value={stats.expiring} color="#ea580c" filter="expiring" sub="within 30 days" total={total} />
              <KpiCard label="Cancelled / Revoked" value={stats.cancelled} color="var(--red)" filter="cancelled" total={total} />
              <KpiCard label="Expired" value={stats.expired} color="#9ca3af" filter="cancelled" total={total} />
              <KpiCard label="Automation orders" value={stats.automation} color="var(--blue-accent)" filter="automation" total={total} />
              <KpiCard label="Unassigned" value={stats.unassigned} color={stats.unassigned > 0 ? 'var(--amber)' : 'var(--ink-faint)'} filter="unassigned" total={total} />
            </div>

            {/* Stacked order tables */}
            <div style={{ display: 'grid', gridTemplateColumns: expiringSoon.length > 0 ? '1fr 360px' : '1fr', gap: 20, alignItems: 'start' }}>

              {/* Recent actionable orders */}
              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ padding: '14px 18px 12px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ fontSize: 14 }}>Recent active &amp; pending orders</h3>
                  <Link to="/admin/orders" style={{ fontSize: 12, color: 'var(--blue-accent)' }}>View all →</Link>
                </div>
                {recentActionable.length === 0 ? (
                  <div className="empty-state" style={{ padding: 32 }}>
                    <h3>No active orders</h3>
                    <p style={{ fontSize: 13 }}>Go to All orders and sync from GoGetSSL.</p>
                    <Link to="/admin/orders" className="btn btn-primary btn-sm" style={{ marginTop: 12 }}>Sync orders</Link>
                  </div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'left', fontSize: 11, fontWeight: 500, color: 'var(--ink-muted)', padding: '7px 16px', background: 'var(--canvas)', borderBottom: '1px solid var(--border)' }}>Order ID</th>
                        <th style={{ textAlign: 'left', fontSize: 11, fontWeight: 500, color: 'var(--ink-muted)', padding: '7px 12px', background: 'var(--canvas)', borderBottom: '1px solid var(--border)' }}>Product</th>
                        <th style={{ textAlign: 'left', fontSize: 11, fontWeight: 500, color: 'var(--ink-muted)', padding: '7px 12px', background: 'var(--canvas)', borderBottom: '1px solid var(--border)' }}>Domain</th>
                        <th style={{ textAlign: 'left', fontSize: 11, fontWeight: 500, color: 'var(--ink-muted)', padding: '7px 12px', background: 'var(--canvas)', borderBottom: '1px solid var(--border)' }}>Status</th>
                        <th style={{ textAlign: 'left', fontSize: 11, fontWeight: 500, color: 'var(--ink-muted)', padding: '7px 12px', background: 'var(--canvas)', borderBottom: '1px solid var(--border)' }}>Valid till</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentActionable.map(o => (
                        <tr key={o.id} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '9px 16px' }}>
                            <Link to="/admin/orders" style={{ color: 'var(--blue-accent)', fontFamily: 'monospace', fontWeight: 600 }}>#{o.gogetssl_order_id}</Link>
                          </td>
                          <td style={{ padding: '9px 12px', maxWidth: 160 }}>{resolveProduct(o)}</td>
                          <td style={{ padding: '9px 12px' }}><span style={{ fontFamily: 'monospace', fontSize: 12 }}>{o.domain || '—'}</span></td>
                          <td style={{ padding: '9px 12px' }}>
                            <span className={`pill pill-${SP[o.status] || 'gray'}`} style={{ fontSize: 11 }}>{o.status}</span>
                          </td>
                          <td style={{ padding: '9px 12px', fontSize: 12, color: 'var(--ink-muted)', whiteSpace: 'nowrap' }}>
                            {o.next_renewal && o.next_renewal !== '0000-00-00' ? new Date(o.next_renewal).toLocaleDateString('en-GB') : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Expiring soon panel */}
              {expiringSoon.length > 0 && (
                <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                  <div style={{ padding: '14px 18px 12px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ fontSize: 14, color: 'var(--amber)' }}>⚠ Expiring soon</h3>
                    <span style={{ fontSize: 11, color: 'var(--ink-muted)' }}>next 30 days</span>
                  </div>
                  <div style={{ padding: '8px 0' }}>
                    {expiringSoon.map(o => {
                      const days = Math.ceil((new Date(o.next_renewal) - now) / 86400000)
                      return (
                        <div key={o.id} style={{ padding: '10px 18px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 10, alignItems: 'center' }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 600, color: 'var(--blue-accent)' }}>#{o.gogetssl_order_id}</div>
                            <div style={{ fontSize: 12, color: 'var(--ink-mid)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {o.domain || resolveProduct(o)}
                            </div>
                          </div>
                          <div style={{ textAlign: 'right', flexShrink: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: days <= 7 ? 'var(--red)' : 'var(--amber)' }}>{days}d</div>
                            <div style={{ fontSize: 11, color: 'var(--ink-muted)' }}>{new Date(o.next_renewal).toLocaleDateString('en-GB')}</div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </DashShell>
  )
}
