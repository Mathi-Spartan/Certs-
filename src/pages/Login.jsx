import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../supabase'

export default function Login() {
  const nav = useNavigate()
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(''); setLoading(true)
    const { data, error: err } = await supabase.auth.signInWithPassword({ email, password: pass })
    setLoading(false)
    if (err) { setError(err.message); return }
    // Fetch profile to determine role
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', data.user.id).single()
    const role = profile?.role || 'customer'
    if (role === 'master_admin') nav('/admin')
    else if (role === 'partner') nav('/partner')
    else nav('/customer')
  }

  return (
    <div style={{minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--blue-hero)'}}>
      <div style={{width:'100%', maxWidth:400, padding:20}}>
        <div style={{textAlign:'center', marginBottom:32}}>
          <Link to="/" style={{display:'inline-flex', alignItems:'center', gap:8, color:'var(--white)', fontWeight:600, fontSize:16, marginBottom:24}}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
            SSL Distributor
          </Link>
          <h2 style={{color:'var(--white)', fontSize:'1.4rem'}}>Partner login</h2>
          <p style={{color:'rgba(255,255,255,.5)', fontSize:14, marginTop:6}}>Sign in to manage your orders and customers</p>
        </div>
        <div className="card">
          {error && <div className="alert alert-error">{error}</div>}
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">Email address</label>
              <input className="form-input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" required />
            </div>
            <div className="form-group">
              <label className="form-label">Password</label>
              <input className="form-input" type="password" value={pass} onChange={e => setPass(e.target.value)} placeholder="••••••••" required />
            </div>
            <button type="submit" className="btn btn-primary" style={{width:'100%', justifyContent:'center'}} disabled={loading}>
              {loading ? <span className="spinner" /> : 'Sign in'}
            </button>
          </form>
          <p style={{textAlign:'center', fontSize:13, color:'var(--ink-muted)', marginTop:16}}>
            No account? Accounts are provisioned by your SSL Distributor account manager.
          </p>
        </div>
        <p style={{textAlign:'center', marginTop:20, fontSize:13}}>
          <Link to="/" style={{color:'rgba(255,255,255,.5)'}}>← Back to site</Link>
        </p>
      </div>
    </div>
  )
}
