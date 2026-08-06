import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../AuthContext'

const Icon = ({ d }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
)

export default function DashShell({ children }) {
  const { profile, signOut } = useAuth()
  const loc = useLocation()
  const role = profile?.role || 'partner'

  const adminNav = [
    { to: '/admin', label: 'Dashboard', icon: 'M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z' },
    { to: '/admin/partners', label: 'Partners', icon: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75' },
    { to: '/admin/orders', label: 'All orders', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
    { to: '/admin/assign', label: 'Assign orders', icon: 'M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4' },
  ]
  const partnerNav = [
    { to: '/partner', label: 'Dashboard', icon: 'M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z' },
    { to: '/partner/orders', label: 'My orders', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
    { to: '/partner/customers', label: 'My customers', icon: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 7a4 4 0 100 8 4 4 0 000-8z' },
    { to: '/partner/products', label: 'Products', icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4' },
  ]
  const customerNav = [
    { to: '/customer', label: 'My orders', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
    { to: '/customer/setup', label: 'Setup guide', icon: 'M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9zM13 2l5 7M13 2v7h5' },
  ]
  const nav = role === 'master_admin' ? adminNav : role === 'partner' ? partnerNav : customerNav
  const roleLabel = role === 'master_admin' ? 'Master Admin' : role === 'partner' ? 'Partner' : 'Customer'

  return (
    <div className="dash-shell">
      <aside className="dash-sidebar">
        <div className="sb-logo">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
          SSL Distributor
        </div>
        <div className="sb-section">
          <div className="sb-label">Navigation</div>
          {nav.map(item => (
            <Link
              key={item.to}
              to={item.to}
              className={`sb-item ${loc.pathname === item.to ? 'active' : ''}`}
            >
              <Icon d={item.icon} />
              {item.label}
            </Link>
          ))}
        </div>
        <div className="sb-bottom">
          <div className="sb-account">
            <span>{profile?.full_name || profile?.email}</span>
            {roleLabel}
          </div>
          <button onClick={signOut} className="sb-item" style={{width:'100%', marginTop:8, paddingLeft:0}}>
            <Icon d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            Sign out
          </button>
        </div>
      </aside>
      <main className="dash-main">{children}</main>
    </div>
  )
}
