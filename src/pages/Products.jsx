import { useParams, Link } from 'react-router-dom'
import PubNav from '../components/PubNav'
import { PRODUCTS, CATEGORIES } from '../catalog'

const SLUG_MAP = {
  digicert: 'DigiCert & Thawte',
  rapidssl: 'RapidSSL & GeoTrust',
  vmc: 'VMC / CMC',
  automation: 'Automation',
}

export default function Products() {
  const { cat } = useParams()
  const activeCat = SLUG_MAP[cat] || CATEGORIES[0]
  const products = PRODUCTS.filter(p => p.category === activeCat)

  const vmcInfo = activeCat === 'VMC / CMC'
  const autoInfo = activeCat === 'Automation'

  return (
    <>
      <PubNav />
      <div style={{background:'var(--blue-hero)', padding:'36px 0 28px'}}>
        <div className="container">
          <p style={{color:'rgba(255,255,255,.5)', fontSize:13, marginBottom:8}}>
            <Link to="/" style={{color:'rgba(255,255,255,.4)'}}>Home</Link> › Certificates
          </p>
          <h1 style={{color:'var(--white)', fontSize:'1.8rem'}}>{activeCat}</h1>
          <p style={{color:'rgba(255,255,255,.55)', marginTop:6, fontSize:14}}>
            {activeCat === 'DigiCert & Thawte' && 'Premium SSL certificates from the world\'s most trusted CAs. Contact us for enterprise pricing.'}
            {activeCat === 'RapidSSL & GeoTrust' && 'Fast, affordable SSL certificates for any domain. DV, OV and EV options available.'}
            {activeCat === 'VMC / CMC' && 'Display your brand logo in email clients via the BIMI standard.'}
            {activeCat === 'Automation' && 'Set up once, automate forever. Zero-touch certificate lifecycle management.'}
          </p>
        </div>
      </div>

      <div style={{background:'var(--white)', borderBottom:'1px solid var(--border)', padding:'0 0 0'}}>
        <div className="container">
          <div className="cat-tabs">
            {Object.entries(SLUG_MAP).map(([slug, label]) => (
              <Link key={slug} to={`/products/${slug}`} className={`cat-tab ${activeCat === label ? 'active' : ''}`}>
                {label}
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="section">
        <div className="container">
          {vmcInfo && (
            <div className="alert alert-info" style={{marginBottom:24}}>
              <strong>What is VMC?</strong> A Verified Mark Certificate lets your brand logo appear in supporting email clients (Gmail, Apple Mail, Yahoo). Requires BIMI DNS record and a trademark on your logo.
            </div>
          )}
          {autoInfo && (
            <div className="alert alert-info" style={{marginBottom:24}}>
              <strong>How automation works:</strong> Order once. Our platform handles every renewal automatically via AutoInstall agent or ACME protocol — no manual intervention after initial setup.
            </div>
          )}
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
                      <span className={f.check ? 'check' : 'dash'} style={{color: f.check ? 'var(--green)' : 'var(--ink-faint)'}}>{f.check ? '✓' : '–'}</span>
                      {f.text}
                    </li>
                  ))}
                </ul>
                <div className="prod-footer">
                  <div className="prod-price">{p.price}</div>
                  <a href="mailto:mathivanan@gogetssl.com" className="prod-cta">Get quote →</a>
                </div>
              </div>
            ))}
          </div>
          <div className="card" style={{marginTop:40, textAlign:'center', padding:'32px 24px', background:'var(--blue-sky)', border:'1px solid rgba(51,117,177,.2)'}}>
            <h3 style={{marginBottom:8}}>Need help choosing the right certificate?</h3>
            <p style={{color:'var(--ink-muted)', fontSize:14, marginBottom:20}}>Our team specialises in PKI. We'll match the right certificate to your use case and infrastructure.</p>
            <div style={{display:'flex', gap:12, justifyContent:'center', flexWrap:'wrap'}}>
              <a href="mailto:mathivanan@gogetssl.com" className="btn btn-primary">Email us</a>
              <Link to="/login" className="btn btn-secondary">Partner login</Link>
            </div>
          </div>
        </div>
      </div>
      <footer className="pub-footer"><div className="container"><p>SSL Distributor · Certified PKI Specialist</p></div></footer>
    </>
  )
}
