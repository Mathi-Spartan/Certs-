import { Link } from 'react-router-dom'
import PubNav from '../components/PubNav'
import { PRODUCTS } from '../catalog'

export default function Home() {
  const featured = PRODUCTS.filter(p => p.featured).slice(0, 3)
  return (
    <>
      <PubNav />
      <div className="hero">
        <div className="container">
          <div className="hero-tag">Certified PKI Specialist · Authorised Reseller</div>
          <h1>Enterprise SSL certificates,<br />matched to your infrastructure.</h1>
          <p>DigiCert · Thawte · RapidSSL · GeoTrust · Sectigo<br />VMC / CMC · Automation products</p>
          <div className="hero-btns">
            <Link to="/products/digicert" className="btn btn-primary">Browse certificates</Link>
            <a href="mailto:mathivanan@gogetssl.com" className="btn btn-ghost">Talk to a specialist</a>
          </div>
        </div>
      </div>
      <div className="trust-bar">
        <div className="trust-bar-inner">
          {['Authorised DigiCert Partner', 'Sectigo Reseller', 'GeoTrust & RapidSSL', 'VMC Verified', '24h issuance', 'GoGetSSL API Partner'].map(t => (
            <div key={t} className="trust-item">{t}</div>
          ))}
        </div>
      </div>

      <div className="section" style={{background:'var(--white)'}}>
        <div className="container">
          <div style={{textAlign:'center', marginBottom:48}}>
            <h2>Featured certificates</h2>
            <p style={{color:'var(--ink-muted)', marginTop:8}}>Trusted by enterprises worldwide. Contact us for pricing tailored to your volume.</p>
          </div>
          <div className="prod-grid">
            {featured.map(p => (
              <div key={p.id} className={`prod-card ${p.featured ? 'featured' : ''}`}>
                {p.badge && <div className="prod-badge">{p.badge}</div>}
                <div className="prod-ca">{p.ca}</div>
                <div className="prod-name">{p.name}</div>
                <div className="prod-type">{p.type}</div>
                <ul className="prod-features">
                  {p.features.map((f, i) => (
                    <li key={i}>
                      <span className={f.check ? 'check' : 'dash'}>{f.check ? '✓' : '–'}</span>
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
          <div style={{textAlign:'center', marginTop:32}}>
            <Link to="/products/digicert" className="btn btn-secondary">View all certificates</Link>
          </div>
        </div>
      </div>

      <div className="section">
        <div className="container">
          <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(260px,1fr))', gap:24}}>
            {[
              { icon: '🔒', title: 'DigiCert & Thawte', desc: 'Premium OV and EV certificates with industry-leading warranty and priority validation.', link: '/products/digicert' },
              { icon: '⚡', title: 'Automation products', desc: 'Set once, automate forever. RapidSSL and GeoTrust plans with full lifecycle management.', link: '/products/automation' },
              { icon: '✉️', title: 'VMC / CMC', desc: 'Display your brand logo in email clients. BIMI standard compliant certificates.', link: '/products/vmc' },
              { icon: '🌐', title: 'RapidSSL & GeoTrust', desc: 'Fast DV and OV certificates for any domain at competitive pricing.', link: '/products/rapidssl' },
            ].map(c => (
              <Link key={c.link} to={c.link} className="card" style={{display:'block', transition:'box-shadow .2s', cursor:'pointer'}} onMouseEnter={e => e.currentTarget.style.boxShadow='var(--shadow-md)'} onMouseLeave={e => e.currentTarget.style.boxShadow=''}>
                <div style={{fontSize:28, marginBottom:10}}>{c.icon}</div>
                <h3 style={{marginBottom:8}}>{c.title}</h3>
                <p style={{fontSize:14, color:'var(--ink-muted)'}}>{c.desc}</p>
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div style={{background:'var(--blue-hero)', padding:'60px 0', textAlign:'center'}}>
        <div className="container">
          <h2 style={{color:'var(--white)', marginBottom:12}}>Need volume pricing or a custom arrangement?</h2>
          <p style={{color:'rgba(255,255,255,.55)', marginBottom:28}}>We work directly with Certificate Authorities. Get the right certificate at the right price.</p>
          <a href="mailto:mathivanan@gogetssl.com" className="btn btn-ghost">Contact us</a>
        </div>
      </div>

      <footer className="pub-footer">
        <div className="container">
          <p>SSL Distributor · Certified PKI Specialist · Powered by GoGetSSL</p>
        </div>
      </footer>
    </>
  )
}
