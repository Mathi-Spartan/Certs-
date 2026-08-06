import { useState, useEffect } from 'react'
import DashShell from '../components/DashShell'
import { supabase } from '../supabase'
import { useAuth } from '../AuthContext'

const STATUS_PILL = { active: 'green', cancelled: 'red', pending: 'amber', processing: 'blue', expired: 'gray' }

export default function PartnerOrders() {
  const { session } = useAuth()
  const [orders, setOrders] = useState([])
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [assignModal, setAssignModal] = useState(null)
  const [targetCustomer, setTargetCustomer] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')

  useEffect(() => { if (session) loadData() }, [session])

  async function loadData() {
    const [{ data: ord }, { data: cust }] = await Promise.all([
      supabase.from('orders')
        .select('*, customer:profiles!orders_customer_id_fkey(full_name, email)')
        .eq('assigned_to', session.user.id)
        .order('created_at', { ascending: false }),
      supabase.from('profiles')
        .select('*')
        .eq('role', 'customer')
    ])
    setOrders(ord || [])
    setCustomers(cust || [])
    setLoading(false)
  }

  async function assignToCustomer() {
    if (!assignModal || !targetCustomer) return
    setSaving(true)
    const { error } = await supabase
      .from('orders')
      .update({ customer_id: targetCustomer })
      .eq('id', assignModal.id)
      .eq('assigned_to', session.user.id)
    if (error) { setMsg({ type: 'error', text: error.message }) }
    else { setMsg({ type: 'success', text: 'Order assigned to customer' }); setAssignModal(null); setTargetCustomer(''); loadData() }
    setSaving(false)
  }

  const filtered = orders.filter(o => {
    if (filter === 'unassigned' && o.customer_id) return false
    if (filter === 'active' && o.status !== 'active') return false
    if (search) {
      const q = search.toLowerCase()
      return o.domain?.toLowerCase().includes(q) || o.product_name?.toLowerCase().includes(q) || String(o.gogetssl_order_id).includes(q)
    }
    return true
  })

  return (
    <DashShell>
      <div className="dash-topbar">
        <h2 style={{ fontSize: '1.1rem' }}>My orders</h2>
      </div>
      <div className="dash-content">
        {msg && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}

        <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <input className="form-input" placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)} style={{ maxWidth: 260 }} />
          <div className="cat-tabs" style={{ margin: 0, border: 'none', gap: 4 }}>
            {[
              { k: 'all', l: `All (${orders.length})` },
              { k: 'unassigned', l: `No customer (${orders.filter(o => !o.customer_id).length})` },
              { k: 'active', l: `Active (${orders.filter(o => o.status === 'active').length})` },
            ].map(c => (
              <button key={c.k} onClick={() => setFilter(c.k)} className={`cat-tab ${filter === c.k ? 'active' : ''}`} style={{ padding: '6px 14px' }}>{c.l}</button>
            ))}
          </div>
        </div>

        <div className="card">
          {loading ? (
            <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
          ) : filtered.length === 0 ? (
            <div className="empty-state">
              <h3>{orders.length === 0 ? 'No orders yet' : 'No matching orders'}</h3>
              <p style={{ fontSize: 13 }}>{orders.length === 0 ? 'Orders assigned to you by your account manager appear here.' : 'Adjust your search or filter.'}</p>
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
                    <th>Customer</th>
                    <th>Renewal</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(o => (
                    <tr key={o.id}>
                      <td><span className="mono">#{o.gogetssl_order_id || '—'}</span></td>
                      <td style={{ fontSize: 13, maxWidth: 160 }}>{o.product_name}</td>
                      <td><span className="mono" style={{ fontSize: 12 }}>{o.domain || '—'}</span></td>
                      <td style={{ fontSize: 12, color: 'var(--ink-muted)' }}>{o.ca || '—'}</td>
                      <td><span className={`pill pill-${STATUS_PILL[o.status] || 'gray'}`}>{o.status}</span></td>
                      <td style={{ fontSize: 13 }}>
                        {o.customer
                          ? <span>{o.customer.full_name || o.customer.email}</span>
                          : <span style={{ color: 'var(--ink-faint)', fontStyle: 'italic' }}>None</span>}
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--ink-muted)' }}>{o.next_renewal ? new Date(o.next_renewal).toLocaleDateString() : '—'}</td>
                      <td>
                        <button
                          onClick={() => { setAssignModal(o); setTargetCustomer(o.customer_id || '') }}
                          style={{ fontSize: 12, color: 'var(--blue-accent)', cursor: 'pointer' }}
                        >
                          {o.customer_id ? 'Change' : 'Assign →'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {assignModal && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setAssignModal(null)}>
          <div className="modal">
            <div className="modal-header">
              <h3>Assign to customer</h3>
              <button onClick={() => setAssignModal(null)} style={{ fontSize: 20, color: 'var(--ink-muted)' }}>×</button>
            </div>
            <div className="modal-body">
              <div style={{ background: 'var(--canvas)', borderRadius: 8, padding: '12px 14px', marginBottom: 16 }}>
                <div style={{ fontWeight: 500 }}>{assignModal.product_name}</div>
                <div className="mono" style={{ fontSize: 12, color: 'var(--ink-muted)' }}>#{assignModal.gogetssl_order_id} · {assignModal.domain || 'no domain'}</div>
              </div>
              <div className="form-group">
                <label className="form-label">Customer</label>
                <select className="form-input form-select" value={targetCustomer} onChange={e => setTargetCustomer(e.target.value)}>
                  <option value="">— No customer (keep in inventory) —</option>
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>{c.full_name || c.email} {c.company ? `(${c.company})` : ''}</option>
                  ))}
                </select>
              </div>
              <p style={{ fontSize: 12, color: 'var(--ink-muted)' }}>The customer will see this order in their dashboard.</p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setAssignModal(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={assignToCustomer} disabled={saving}>
                {saving ? <span className="spinner" /> : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </DashShell>
  )
}
