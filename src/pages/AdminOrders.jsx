import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import DashShell from '../components/DashShell'
import { supabase } from '../supabase'

const STATUS_PILL = { active: 'green', cancelled: 'red', pending: 'amber', processing: 'blue', expired: 'gray' }

export default function AdminOrders() {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState(null)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')

  useEffect(() => { loadOrders() }, [])

  async function loadOrders() {
    setLoading(true)
    const { data } = await supabase
      .from('orders')
      .select('*, partner:profiles!orders_assigned_to_fkey(full_name, email, company)')
      .order('created_at', { ascending: false })
    setOrders(data || [])
    setLoading(false)
  }

  async function syncFromAPI() {
    setSyncing(true)
    setSyncMsg({ type: 'info', text: 'Scanning GoGetSSL API… (~15 seconds)' })
    try {
      const res = await fetch('/api/sync-orders')
      const data = await res.json()
      if (data.error) {
        setSyncMsg({ type: 'error', text: `Sync error: ${data.error}` })
      } else if (data.synced === 0) {
        setSyncMsg({ type: 'info', text: data.message || 'No new orders found' })
      } else {
        setSyncMsg({ type: 'success', text: `✓ Synced ${data.synced} order${data.synced > 1 ? 's' : ''}: ${data.order_ids?.join(', ')}` })
        loadOrders()
      }
    } catch (e) {
      setSyncMsg({ type: 'error', text: `Network error: ${e.message}` })
    }
    setSyncing(false)
  }

  const filtered = orders.filter(o => {
    if (filter === 'unassigned' && o.assigned_to) return false
    if (filter === 'active' && o.status !== 'active') return false
    if (filter === 'automation' && !o.is_automation) return false
    if (search) {
      const q = search.toLowerCase()
      return (
        o.domain?.toLowerCase().includes(q) ||
        o.product_name?.toLowerCase().includes(q) ||
        String(o.gogetssl_order_id).includes(q) ||
        o.partner?.email?.toLowerCase().includes(q)
      )
    }
    return true
  })

  const cats = [
    { k: 'all', l: `All (${orders.length})` },
    { k: 'unassigned', l: `Unassigned (${orders.filter(o => !o.assigned_to).length})` },
    { k: 'active', l: `Active (${orders.filter(o => o.status === 'active').length})` },
    { k: 'automation', l: `Automation (${orders.filter(o => o.is_automation).length})` },
  ]

  return (
    <DashShell>
      <div className="dash-topbar">
        <h2 style={{ fontSize: '1.1rem' }}>All orders</h2>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn-secondary btn-sm" onClick={syncFromAPI} disabled={syncing}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {syncing ? <><span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> Syncing…</> : '↻ Sync from GoGetSSL'}
          </button>
          <Link to="/admin/assign" className="btn btn-primary btn-sm">Assign orders</Link>
        </div>
      </div>

      <div className="dash-content">
        {syncMsg && (
          <div className={`alert alert-${syncMsg.type === 'success' ? 'success' : syncMsg.type === 'error' ? 'error' : 'info'}`}
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>{syncMsg.text}</span>
            <button onClick={() => setSyncMsg(null)} style={{ color: 'inherit', opacity: .6, fontSize: 16 }}>×</button>
          </div>
        )}

        <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <input className="form-input" placeholder="Search domain, product, order ID…"
            value={search} onChange={e => setSearch(e.target.value)} style={{ maxWidth: 300 }} />
          <div style={{ display: 'flex', gap: 2 }}>
            {cats.map(c => (
              <button key={c.k} onClick={() => setFilter(c.k)}
                className={`cat-tab ${filter === c.k ? 'active' : ''}`} style={{ padding: '6px 14px' }}>
                {c.l}
              </button>
            ))}
          </div>
        </div>

        <div className="card">
          {loading ? (
            <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
          ) : filtered.length === 0 ? (
            <div className="empty-state">
              <h3>{orders.length === 0 ? 'No orders yet' : 'No matching orders'}</h3>
              <p style={{ fontSize: 13, marginBottom: 16 }}>
                {orders.length === 0
                  ? 'Click Sync to pull your live GoGetSSL orders. Scans automation items 980–1050.'
                  : 'Adjust your search or filter.'}
              </p>
              {orders.length === 0 && (
                <button className="btn btn-primary btn-sm" onClick={syncFromAPI} disabled={syncing}>
                  {syncing ? <><span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> Syncing…</> : '↻ Sync now'}
                </button>
              )}
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>GoGetSSL ID</th>
                    <th>Product</th>
                    <th>Domain</th>
                    <th>CA</th>
                    <th>Status</th>
                    <th>Type</th>
                    <th>Assigned to</th>
                    <th>Renewal</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(o => (
                    <tr key={o.id}>
                      <td><span className="mono">#{o.gogetssl_order_id || '—'}</span></td>
                      <td style={{ maxWidth: 160, fontSize: 13 }}>{o.product_name}</td>
                      <td><span className="mono" style={{ fontSize: 12 }}>{o.domain || '—'}</span></td>
                      <td style={{ fontSize: 12, color: 'var(--ink-muted)' }}>{o.ca || '—'}</td>
                      <td><span className={`pill pill-${STATUS_PILL[o.status] || 'gray'}`}>{o.status}</span></td>
                      <td>
                        {o.is_automation
                          ? <span className="pill pill-blue">Automation</span>
                          : <span className="pill pill-gray">Standard</span>}
                      </td>
                      <td style={{ fontSize: 13 }}>
                        {o.partner
                          ? o.partner.full_name || o.partner.email
                          : <span style={{ color: 'var(--amber)', fontWeight: 500 }}>Unassigned</span>}
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--ink-muted)' }}>
                        {o.next_renewal ? new Date(o.next_renewal).toLocaleDateString() : '—'}
                      </td>
                      <td>
                        <Link to={`/admin/assign?order=${o.id}`}
                          style={{ fontSize: 12, color: 'var(--blue-accent)' }}>
                          {o.assigned_to ? 'Reassign' : 'Assign →'}
                        </Link>
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
