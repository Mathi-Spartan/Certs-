import { Link, useLocation } from 'react-router-dom'

export default function PubNav() {
  const loc = useLocation()
  const links = [
    { to: '/products/digicert', label: 'DigiCert & Thawte' },
    { to: '/products/rapidssl', label: 'RapidSSL & GeoTrust' },
    { to: '/products/vmc', label: 'VMC / CMC' },
    { to: '/products/automation', label: 'Automation' },
  ]
  return (
    <nav className="pub-nav">
      <div className="pub-nav-inner">
        <Link to="/" className="pub-nav-logo">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
          SSL Distributor
        </Link>
        <div className="pub-nav-links">
          {links.map(l => (
            <Link key={l.to} to={l.to} style={loc.pathname.startsWith(l.to) ? {color:'#b4dffc'} : {}}>
              {l.label}
            </Link>
          ))}
        </div>
        <Link to="/login" className="btn btn-primary btn-sm">Partner login</Link>
      </div>
    </nav>
  )
}
