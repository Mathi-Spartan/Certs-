import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import DashShell from '../components/DashShell'
import { supabase } from '../supabase'
import { useAuth } from '../AuthContext'

const STATUS_PILL = { active: 'green', cancelled: 'red', pending: 'amber', processing: 'blue', expired: 'gray', revoked: 'red', issued: 'green' }

export default function AdminOrders() {
  const { session } = useAuth()
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState(null)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')

  useEffect(() => { loadOrders() }, [])

  async function loadOrders() {
    setLoading(true)
    const { data, error } = await supabase
      .from('orders')
      .select('*, partner:profiles!orders_assigned_to_fkey(full_name, email, company)')
      .order('created_at', { ascending: false })
    if (error) console.error('orders load:', error)
    setOrders(data || [])
    setLoading(false)
  }

  async function syncFromAPI() {
    if (!session?.access_token) { setSyncMsg({ type: 'error', text: 'Not authenticated' }); return }
    setSyncing(true)
    setSyncMsg({ type: 'info', text: 'Scanning GoGetSSL API — scanning 280 candidates in parallel…' })
    try {
      const res = await fetch('/api/sync-orders', {
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      })
      const data = await res.json()
      if (data.error && !data.synced) {
        setSyncMsg({ type: 'error', text: `Error: ${data.error}` })
      } else if (data.synced === 0) {
        const errHint = data.errors?.length ? ` (first error: ${data.errors[0]})` : ''
        setSyncMsg({ type: 'info', text: `${data.message}${errHint}` })
      } else {
        setSyncMsg({ type: 'success', text: `✓ Synced ${data.synced} order${data.synced !== 1 ? 's' : ''}: #${data.order_ids?.join(', #')}` })
        loadOrders()
      }
      if (data.errors?.length) console.warn('Sync errors:', data.errors)
    } catch (e) {
      setSyncMsg({ type: 'error', text: `Network error: ${e.message}` })
    }
    setSyncing(false)
  }

  const filtered = orders.filter(o => {
    if (filter === 'unassigned' && o.assigned_to) return false
    if (filter === 'active' && !['active', 'issued'].includes(o.status)) return false
    if (filter === 'automation' && !o.is_automation) return false
    if (filter === 'cancelled' && !['cancelled', 'revoked', 'expired'].includes(o.status)) return false
    if (search) {
      const q = search.toLowerCase()
      return (
        o.domain?.toLowerCase().includes(q) ||
        o.product_name?.toLowerCase().includes(q) ||
        String(o.gogetssl_order_id).includes(q) ||
        o.partner?.email?.toLowerCase().includes(q) ||
        o.status?.toLowerCase().includes(q)
      )
    }
    return true
  })

  const cats = [
    { k: 'all', l: `All (${orders.length})` },
    { k: 'unassigned', l: `Unassigned (${orders.filter(o => !o.assigned_to).length})` },
    { k: 'active', l: `Active (${orders.filter(o => ['active','issued'].includes(o.status)).length})` },
    { k: 'cancelled', l: `Cancelled (${orders.filter(o => ['cancelled','revoked','expired'].includes(o.status)).length})` },
    { k: 'automation', l: `Automation (${orders.filter(o => o.is_automation).length})` },
  ]

  return (
    <DashShell>
      <div className="dash-topbar">
        <h2 style={{ fontSize: '1.1rem' }}>All orders</h2>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button className="btn btn-secondary btn-sm" onClick={syncFromAPI} disabled={syncing}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {syncing
              ? <><span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> Syncing…</>
              : '↻ Sync from GoGetSSL'}
          </button>
          <Link to="/admin/assign" className="btn btn-primary btn-sm">Assign orders</Link>
        </div>
      </div>

      <div className="dash-content">
        {syncMsg && (
          <div className={`alert alert-${syncMsg.type === 'success' ? 'success' : syncMsg.type === 'error' ? 'error' : 'info'}`}
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 13 }}>{syncMsg.text}</span>
            <button onClick={() => setSyncMsg(null)} style={{ color: 'inherit', opacity: .5, fontSize: 18, lineHeight: 1 }}>×</button>
          </div>
        )}

        <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <input className="form-input" placeholder="Search domain, product, order ID, status…"
            value={search} onChange={e => setSearch(e.target.value)} style={{ maxWidth: 300 }} />
          <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)' }}>
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
                  ? 'Sync from GoGetSSL to pull all your orders — cancelled, active, expired, revoked and issued.'
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
