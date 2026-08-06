import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { Component } from 'react'
import { AuthProvider, useAuth } from './AuthContext'

import Home from './pages/Home'
import Products from './pages/Products'
import Login from './pages/Login'
import AdminDash from './pages/AdminDash'
import AdminPartners from './pages/AdminPartners'
import AdminOrders from './pages/AdminOrders'
import AdminAssign from './pages/AdminAssign'
import PartnerDash from './pages/PartnerDash'
import PartnerOrders from './pages/PartnerOrders'
import PartnerCustomers from './pages/PartnerCustomers'
import PartnerProducts from './pages/PartnerProducts'
import CustomerDash from './pages/CustomerDash'

function RequireAuth({ children, role }) {
  const { session, profile, profileError, loading, signOut } = useAuth()
  const loc = useLocation()

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#0a1628' }}>
      <div className="spinner" style={{ borderColor: 'rgba(255,255,255,.2)', borderTopColor: '#fff' }} />
    </div>
  )

  if (!session) return <Navigate to="/login" state={{ from: loc }} replace />

  // Profile fetch failed (RLS error, table missing, etc.)
  if (profileError) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', gap: 16, padding: 24, background: '#f1f4fa' }}>
      <div style={{ fontSize: 32 }}>⚠️</div>
      <h2 style={{ fontSize: '1.1rem' }}>Account setup incomplete</h2>
      <p style={{ color: '#64748b', fontSize: 14, textAlign: 'center', maxWidth: 420 }}>
        Your profile could not be loaded. This usually means the database schema needs to be applied or there is an RLS policy issue.
      </p>
      <code style={{ fontSize: 12, background: '#fee2e2', color: '#991b1b', padding: '8px 12px', borderRadius: 6, maxWidth: 500, wordBreak: 'break-all' }}>
        {profileError}
      </code>
      <button className="btn btn-secondary btn-sm" onClick={signOut}>Sign out and try again</button>
    </div>
  )

  // Profile row doesn't exist yet (trigger may not have fired)
  if (!profile) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', gap: 16, padding: 24, background: '#f1f4fa' }}>
      <div style={{ fontSize: 32 }}>👤</div>
      <h2 style={{ fontSize: '1.1rem' }}>Profile not found</h2>
      <p style={{ color: '#64748b', fontSize: 14, textAlign: 'center', maxWidth: 400 }}>
        You are logged in but your profile row doesn't exist yet. Run the schema SQL and set your role in the Supabase dashboard.
      </p>
      <button className="btn btn-secondary btn-sm" onClick={signOut}>Sign out</button>
    </div>
  )

  // Wrong role → redirect to correct dashboard
  if (role && profile.role !== role) {
    if (profile.role === 'master_admin') return <Navigate to="/admin" replace />
    if (profile.role === 'partner') return <Navigate to="/partner" replace />
    return <Navigate to="/customer" replace />
  }

  return children
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/products/:cat" element={<Products />} />
      <Route path="/login" element={<Login />} />
      <Route path="/admin" element={<RequireAuth role="master_admin"><AdminDash /></RequireAuth>} />
      <Route path="/admin/partners" element={<RequireAuth role="master_admin"><AdminPartners /></RequireAuth>} />
      <Route path="/admin/orders" element={<RequireAuth role="master_admin"><AdminOrders /></RequireAuth>} />
      <Route path="/admin/assign" element={<RequireAuth role="master_admin"><AdminAssign /></RequireAuth>} />
      <Route path="/partner" element={<RequireAuth role="partner"><PartnerDash /></RequireAuth>} />
      <Route path="/partner/orders" element={<RequireAuth role="partner"><PartnerOrders /></RequireAuth>} />
      <Route path="/partner/customers" element={<RequireAuth role="partner"><PartnerCustomers /></RequireAuth>} />
      <Route path="/partner/products" element={<RequireAuth role="partner"><PartnerProducts /></RequireAuth>} />
      <Route path="/customer" element={<RequireAuth role="customer"><CustomerDash /></RequireAuth>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null } }
  static getDerivedStateFromError(e) { return { error: e } }
  render() {
    if (this.state.error) return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', gap: 12, padding: 24 }}>
        <div style={{ fontSize: 32 }}>⚠️</div>
        <h2 style={{ fontSize: '1.1rem' }}>Something went wrong</h2>
        <p style={{ color: '#64748b', fontSize: 14, textAlign: 'center', maxWidth: 400 }}>{this.state.error?.message}</p>
        <button className="btn btn-primary btn-sm" onClick={() => window.location.href = '/'}>Go to homepage</button>
      </div>
    )
    return this.props.children
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </ErrorBoundary>
  )
}
