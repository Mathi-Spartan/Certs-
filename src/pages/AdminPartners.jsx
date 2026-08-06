import { useState, useEffect } from 'react'
import DashShell from '../components/DashShell'
import { supabase } from '../supabase'

export default function AdminPartners() {
  const [partners, setPartners] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ full_name: '', email: '', company: '', password: '' })
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null)
  const [search, setSearch] = useState('')

  useEffect(() => { loadPartners() }, [])

  async function loadPartners() {
    setLoading(true)
    const { data } = await supabase
      .from('profiles')
      .select('*, orders:orders(count)')
      .in('role', ['partner', 'customer'])
      .order('created_at', { ascending: false })
    setPartners(data || [])
    setLoading(false)
  }

  async function createPartner(e) {
    e.preventDefault()
    setSaving(true); setMsg(null)
    const { data: authData, error: authErr } = await supabase.auth.admin
      ? await supabase.auth.signUp({ email: form.email, password: form.password, options: { data: { full_name: form.full_name } } })
      : { data: null, error: { message: 'Need service role key for user creation' } }

    if (authErr) { setMsg({ type: 'error', text: authErr.message }); setSaving(false); return }

    // Profile is created by trigger; update role and company
    if (authData?.user) {
      await supabase.from('profiles').update({ role: 'partner', company: form.company, full_name: form.full_name }).eq('id', authData.user.id)
    }
    setMsg({ type: 'success', text: `Partner login created for ${form.email}` })
    setForm({ full_name: '', email: '', company: '', password: '' })
    setSaving(false)
    loadPartners()
  }

  async function toggleRole(p) {
    const newRole = p.role === 'partner' ? 'customer' : 'partner'
    await supabase.from('profiles').update({ role: newRole }).eq('id', p.id)
    loadPartners()
  }

  const filtered = partners.filter(p =>
    !search || p.email?.toLowerCase().includes(search.toLowerCase()) ||
    p.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    p.company?.toLowerCase().includes(search.toLowerCase())
  )

  const initials = p => {
    const n = p.full_name || p.email || ''
    return n.slice(0, 2).toUpperCase()
  }

  return (
    <DashShell>
      <div className="dash-topbar">
        <h2 style={{ fontSize: '1.1rem' }}>Partners & customers</h2>
        <button className="btn btn-primary btn-sm" onClick={() => setShowModal(true)}>+ Create partner login</button>
      </div>
      <div className="dash-content">
        {msg && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}

        <div className="card" style={{ marginBottom: 20 }}>
          <input
            className="form-input"
            placeholder="Search by name, email or company…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ maxWidth: 360 }}
          />
        </div>

        <div className="card">
          {loading ? (
            <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
          ) : filtered.length === 0 ? (
            <div className="empty-state">
              <h3>No partners yet</h3>
              <p style={{ fontSize: 13 }}>Create partner logins using the button above.</p>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Partner</th><th>Company</th><th>Role</th><th>Orders</th><th>Created</th><th></th></tr>
                </thead>
                <tbody>
                  {filtered.map(p => (
                    <tr key={p.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div className="avatar">{initials(p)}</div>
                          <div>
                            <div style={{ fontWeight: 500, fontSize: 13 }}>{p.full_name || '—'}</div>
                            <div style={{ fontSize: 12, color: 'var(--ink-muted)' }}>{p.email}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ fontSize: 13, color: 'var(--ink-muted)' }}>{p.company || '—'}</td>
                      <td>
                        <span className={`pill pill-${p.role === 'partner' ? 'blue' : 'gray'}`}>{p.role}</span>
                      </td>
                      <td style={{ fontSize: 13 }}>{p.orders?.[0]?.count ?? 0}</td>
                      <td style={{ fontSize: 12, color: 'var(--ink-muted)' }}>{new Date(p.created_at).toLocaleDateString()}</td>
                      <td>
                        <button onClick={() => toggleRole(p)} className="btn btn-secondary btn-sm" style={{ fontSize: 11 }}>
                          {p.role === 'partner' ? 'Set customer' : 'Set partner'}
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

      {showModal && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal">
            <div className="modal-header">
              <h3>Create partner login</h3>
              <button onClick={() => setShowModal(false)} style={{ color: 'var(--ink-muted)', fontSize: 20 }}>×</button>
            </div>
            <form onSubmit={createPartner}>
              <div className="modal-body">
                {msg && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}
                <div className="form-group">
                  <label className="form-label">Full name</label>
                  <input className="form-input" value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} placeholder="Ravi Kumar" required />
                </div>
                <div className="form-group">
                  <label className="form-label">Email address</label>
                  <input className="form-input" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="partner@company.com" required />
                </div>
                <div className="form-group">
                  <label className="form-label">Company name</label>
                  <input className="form-input" value={form.company} onChange={e => setForm({ ...form, company: e.target.value })} placeholder="Hostplan Inc" />
                </div>
                <div className="form-group">
                  <label className="form-label">Temporary password</label>
                  <input className="form-input" type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="Min. 8 characters" required minLength={8} />
                </div>
                <div className="alert alert-info" style={{ marginBottom: 0 }}>
                  The partner can change their password after first login. Their role will be set to <strong>Partner</strong>.
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? <span className="spinner" /> : 'Create login'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </DashShell>
  )
}
