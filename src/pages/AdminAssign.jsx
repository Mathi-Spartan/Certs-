import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import DashShell from '../components/DashShell'
import { supabase } from '../supabase'

export default function AdminAssign() {
  const [searchParams] = useSearchParams()
  const preselectedOrder = searchParams.get('order')

  const [orders, setOrders] = useState([])
  const [partners, setPartners] = useState([])
  const [selected, setSelected] = useState(preselectedOrder || null)
  const [targetPartner, setTargetPartner] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null)
  const [search, setSearch] = useState('')

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const [{ data: ord }, { data: par }] = await Promise.all([
      supabase.from('orders').select('*, partner:profiles!orders_assigned_to_fkey(full_name, email)').order('created_at', { ascending: false }),
      supabase.from('profiles').select('*').eq('role', 'partner').order('full_name'),
    ])
    setOrders(ord || [])
    setPartners(par || [])
    setLoading(false)
  }

  async function assignOrder() {
    if (!selected || !targetPartner) return
    setSaving(true); setMsg(null)
    const { error } = await supabase
      .from('orders')
      .update({ assigned_to: targetPartner, assigned_at: new Date().toISOString() })
      .eq('id', selected)
    if (error) {
      setMsg({ type: 'error', text: error.message })
    } else {
      setMsg({ type: 'success', text: 'Order assigned successfully' })
      setSelected(null); setTargetPartner('')
      loadData()
    }
    setSaving(false)
  }

  async function unassign(orderId) {
    await supabase.from('orders').update({ assigned_to: null, assigned_at: null }).eq('id', orderId)
    loadData()
  }

  const filtered = orders.filter(o => {
    if (!search) return true
    const q = search.toLowerCase()
    return o.domain?.toLowerCase().includes(q) || o.product_name?.toLowerCase().includes(q) || String(o.gogetssl_order_id).includes(q)
  })

  const selectedOrder = orders.find(o => o.id === selected)
  const partnerName = id => partners.find(p => p.id === id)?.full_name || partners.find(p => p.id === id)?.email || id

  return (
    <DashShell>
      <div className="dash-topbar">
        <h2 style={{ fontSize: '1.1rem' }}>Assign orders to partners</h2>
      </div>
      <div className="dash-content">
        {msg && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20, alignItems: 'start' }}>
          {/* Order list */}
          <div className="card">
            <div style={{ marginBottom: 14 }}>
              <input className="form-input" placeholder="Search orders…" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            {loading ? (
              <div style={{ textAlign: 'center', padding: 32 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th></th><th>Order ID</th><th>Product</th><th>Domain</th><th>Assigned to</th><th></th></tr>
                  </thead>
                  <tbody>
                    {filtered.map(o => (
                      <tr
                        key={o.id}
                        style={{ cursor: 'pointer', background: selected === o.id ? 'var(--blue-sky)' : undefined }}
                        onClick={() => setSelected(o.id === selected ? null : o.id)}
                      >
                        <td style={{ width: 32 }}>
                          <input type="radio" readOnly checked={selected === o.id} />
                        </td>
                        <td><span className="mono">#{o.gogetssl_order_id || o.id.slice(0, 8)}</span></td>
                        <td style={{ fontSize: 13, maxWidth: 160 }}>{o.product_name}</td>
                        <td><span className="mono" style={{ fontSize: 12 }}>{o.domain || '—'}</span></td>
                        <td style={{ fontSize: 13 }}>
                          {o.partner
                            ? <span className="pill pill-green" style={{ fontSize: 11 }}>{o.partner.full_name || o.partner.email}</span>
                            : <span style={{ color: 'var(--amber)', fontSize: 12 }}>Unassigned</span>}
                        </td>
                        <td>
                          {o.assigned_to && (
                            <button
                              onClick={e => { e.stopPropagation(); unassign(o.id) }}
                              style={{ fontSize: 11, color: 'var(--red-text)', cursor: 'pointer' }}
                            >Remove</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Assignment panel */}
          <div className="card" style={{ position: 'sticky', top: 80 }}>
            <h3 style={{ marginBottom: 16 }}>Assign to partner</h3>

            {!selectedOrder ? (
              <div className="empty-state" style={{ padding: '24px 0' }}>
                <p style={{ fontSize: 13 }}>Select an order from the table to assign it.</p>
              </div>
            ) : (
              <>
                <div style={{ background: 'var(--canvas)', borderRadius: 8, padding: '12px 14px', marginBottom: 16 }}>
                  <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginBottom: 4 }}>Selected order</div>
                  <div style={{ fontWeight: 500, fontSize: 14 }}>{selectedOrder.product_name}</div>
                  <div className="mono" style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 2 }}>
                    #{selectedOrder.gogetssl_order_id} · {selectedOrder.domain || 'no domain'}
                  </div>
                  {selectedOrder.assigned_to && (
                    <div style={{ marginTop: 6, fontSize: 12, color: 'var(--amber)' }}>
                      Currently: {partnerName(selectedOrder.assigned_to)}
                    </div>
                  )}
                </div>

                <div className="form-group">
                  <label className="form-label">Assign to partner</label>
                  <select className="form-input form-select" value={targetPartner} onChange={e => setTargetPartner(e.target.value)}>
                    <option value="">— Select partner —</option>
                    {partners.map(p => (
                      <option key={p.id} value={p.id}>{p.full_name || p.email} {p.company ? `(${p.company})` : ''}</option>
                    ))}
                  </select>
                </div>

                {targetPartner && (
                  <div className="alert alert-info">
                    This order will be visible in <strong>{partnerName(targetPartner)}</strong>'s dashboard immediately.
                  </div>
                )}

                <button
                  className="btn btn-primary"
                  style={{ width: '100%', justifyContent: 'center' }}
                  onClick={assignOrder}
                  disabled={!targetPartner || saving}
                >
                  {saving ? <span className="spinner" /> : 'Confirm assignment'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </DashShell>
  )
}
