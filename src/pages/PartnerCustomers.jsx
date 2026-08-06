import { useState, useEffect } from 'react'
import DashShell from '../components/DashShell'
import { supabase } from '../supabase'
import { useAuth } from '../AuthContext'

export default function PartnerCustomers() {
  const { session } = useAuth()
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ full_name: '', email: '', company: '', password: '' })
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null)

  useEffect(() => { if (session) loadCustomers() }, [session])

  async function loadCustomers() {
    // Get orders assigned to this partner that have customers
    const { data: orders } = await supabase
      .from('orders')
      .select('customer_id')
      .eq('assigned_to', session.user.id)
      .not('customer_id', 'is', null)

    const ids = [...new Set((orders || []).map(o => o.customer_id))]
    if (!ids.length) { setCustomers([]); setLoading(false); return }

    const { data } = await supabase
      .from('profiles')
      .select('*, orders:orders(count)')
      .in('id', ids)

    setCustomers(data || [])
    setLoading(false)
  }

  async function createCustomer(e) {
    e.preventDefault(); setSaving(true); setMsg(null)
    const { data, error } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: { data: { full_name: form.full_name } }
    })
    if (error) { setMsg({ type: 'error', text: error.message }); setSaving(false); return }
    if (data?.user) {
      await supabase.from('profiles').update({ role: 'customer', company: form.company, full_name: form.full_name }).eq('id', data.user.id)
    }
    setMsg({ type: 'success', text: `Customer login created for ${form.email}` })
    setForm({ full_name: '', email: '', company: '', password: '' })
    setSaving(false)
    setShowModal(false)
    loadCustomers()
  }

  const initials = p => (p.full_name || p.email || '').slice(0, 2).toUpperCase()

  return (
    <DashShell>
      <div className="dash-topbar">
        <h2 style={{ fontSize: '1.1rem' }}>My customers</h2>
        <button className="btn btn-primary btn-sm" onClick={() => setShowModal(true)}>+ Add customer</button>
      </div>
      <div className="dash-content">
        {msg && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}

        {loading ? (
          <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
        ) : customers.length === 0 ? (
          <div className="empty-state card" style={{ padding: 48 }}>
            <h3>No customers yet</h3>
            <p style={{ fontSize: 13, marginBottom: 16 }}>Create customer logins and assign orders to them.</p>
            <button className="btn btn-primary btn-sm" onClick={() => setShowModal(true)}>Add first customer</button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 16 }}>
            {customers.map(c => (
              <div key={c.id} className="card">
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                  <div className="avatar" style={{ width: 40, height: 40, fontSize: 14 }}>{initials(c)}</div>
                  <div>
                    <div style={{ fontWeight: 600 }}>{c.full_name || '—'}</div>
                    <div style={{ fontSize: 12, color: 'var(--ink-muted)' }}>{c.email}</div>
                  </div>
                </div>
                {c.company && <div style={{ fontSize: 13, color: 'var(--ink-muted)', marginBottom: 8 }}>{c.company}</div>}
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, marginTop: 4, display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: 'var(--ink-muted)' }}>{c.orders?.[0]?.count ?? 0} orders</span>
                  <span style={{ fontSize: 12, color: 'var(--ink-faint)' }}>since {new Date(c.created_at).toLocaleDateString()}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showModal && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal">
            <div className="modal-header">
              <h3>Add customer login</h3>
              <button onClick={() => setShowModal(false)} style={{ fontSize: 20, color: 'var(--ink-muted)' }}>×</button>
            </div>
            <form onSubmit={createCustomer}>
              <div className="modal-body">
                {msg && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}
                <div className="form-group">
                  <label className="form-label">Full name</label>
                  <input className="form-input" value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} placeholder="John Smith" required />
                </div>
                <div className="form-group">
                  <label className="form-label">Email</label>
                  <input className="form-input" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="john@company.com" required />
                </div>
                <div className="form-group">
                  <label className="form-label">Company</label>
                  <input className="form-input" value={form.company} onChange={e => setForm({ ...form, company: e.target.value })} placeholder="Company Ltd" />
                </div>
                <div className="form-group">
                  <label className="form-label">Temporary password</label>
                  <input className="form-input" type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="Min. 8 characters" required minLength={8} />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? <span className="spinner" /> : 'Create customer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </DashShell>
  )
}
