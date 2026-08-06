import { useState } from 'react'
import DashShell from '../components/DashShell'
import { PRODUCTS, CATEGORIES } from '../catalog'

export default function PartnerProducts() {
  const [cat, setCat] = useState(CATEGORIES[0])
  const products = PRODUCTS.filter(p => p.category === cat)

  return (
    <DashShell>
      <div className="dash-topbar">
        <h2 style={{ fontSize: '1.1rem' }}>Product catalogue</h2>
        <a href="mailto:mathivanan@gogetssl.com" className="btn btn-primary btn-sm">Request order</a>
      </div>
      <div className="dash-content">
        <div className="alert alert-info">
          Products are ordered through your account manager. Contact us with the product name and domain to place an order.
        </div>

        <div className="cat-tabs">
          {CATEGORIES.map(c => (
            <button key={c} className={`cat-tab ${cat === c ? 'active' : ''}`} onClick={() => setCat(c)}>{c}</button>
          ))}
        </div>

        <div className="prod-grid">
          {products.map(p => (
            <div key={p.id} className={`prod-card ${p.featured ? 'featured' : ''}`}>
              {p.badge && <div className="prod-badge">{p.badge}</div>}
              <div className="prod-ca">{p.ca}</div>
              <div className="prod-name">{p.name}</div>
              <div className="prod-type">{p.type}</div>
              <ul className="prod-features">
                {p.features.map((f, i) => (
                  <li key={i}>
                    <span style={{ color: f.check ? 'var(--green)' : 'var(--ink-faint)' }}>{f.check ? '✓' : '–'}</span>
                    {f.text}
                  </li>
                ))}
              </ul>
              <div className="prod-footer">
                <div className="prod-price">{p.price}</div>
                <a href={`mailto:mathivanan@gogetssl.com?subject=Order request: ${p.name}`} className="prod-cta">Request →</a>
              </div>
            </div>
          ))}
        </div>
      </div>
    </DashShell>
  )
}
