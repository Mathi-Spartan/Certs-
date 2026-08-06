import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
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
  const { session, profile, loading } = useAuth()
  const loc = useLocation()
  if (loading) return <div style={{display:'flex',alignItems:'center',justifyContent:'center',minHeight:'100vh'}}><div className="spinner" /></div>
  if (!session) return <Navigate to="/login" state={{ from: loc }} replace />
  if (role && profile?.role !== role) {
    if (profile?.role === 'master_admin') return <Navigate to="/admin" replace />
    if (profile?.role === 'partner') return <Navigate to="/partner" replace />
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

      {/* Master admin */}
      <Route path="/admin" element={<RequireAuth role="master_admin"><AdminDash /></RequireAuth>} />
      <Route path="/admin/partners" element={<RequireAuth role="master_admin"><AdminPartners /></RequireAuth>} />
      <Route path="/admin/orders" element={<RequireAuth role="master_admin"><AdminOrders /></RequireAuth>} />
      <Route path="/admin/assign" element={<RequireAuth role="master_admin"><AdminAssign /></RequireAuth>} />

      {/* Partner */}
      <Route path="/partner" element={<RequireAuth role="partner"><PartnerDash /></RequireAuth>} />
      <Route path="/partner/orders" element={<RequireAuth role="partner"><PartnerOrders /></RequireAuth>} />
      <Route path="/partner/customers" element={<RequireAuth role="partner"><PartnerCustomers /></RequireAuth>} />
      <Route path="/partner/products" element={<RequireAuth role="partner"><PartnerProducts /></RequireAuth>} />

      {/* Customer */}
      <Route path="/customer" element={<RequireAuth role="customer"><CustomerDash /></RequireAuth>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  )
}
