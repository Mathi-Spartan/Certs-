import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import DashShell from '../components/DashShell'
import { supabase } from '../supabase'

const V1_NAMES = {31:'RapidSSL DV',32:'RapidSSL Wildcard',33:'GeoTrust DV',34:'GeoTrust OV Wildcard',35:'GeoTrust EV',36:'GeoTrust OV',50:'Thawte SSL OV',51:'Thawte SSL EV',65:'DigiCert Secure Site OV',66:'DigiCert Secure Site EV',67:'DigiCert Secure Site Pro OV',68:'DigiCert Secure Site Pro EV',175:'DigiCert Basic EV',176:'DigiCert Basic OV'}
function resolveProduct(o) {
  const r = o?.api_response
  if (!r) return o?.product_name || '—'
  if (r.product_name) return r.product_name
  return V1_NAMES[r.product_id] || o?.product_name || (r.product_id ? `Product #${r.product_id}` : '—')
}

const STATUS_META = {
  active:      { label:'Active / Issued',       color:'#16a34a', bg:'#f0fdf4', icon:'✓' },
  pending:     { label:'Pending validation',     color:'#3375b1', bg:'#eef5fc', icon:'⏳' },
  incomplete:  { label:'Incomplete',             color:'#d97706', bg:'#fffbeb', icon:'!' },
  expiring:    { label:'Expiring within 30 days',color:'#ea580c', bg:'#fff7ed', icon:'⏰' },
  cancelled:   { label:'Cancelled / Revoked',    color:'#dc2626', bg:'#fef2f2', icon:'✕' },
  expired:     { label:'Expired',                color:'#9ca3af', bg:'#f9fafb', icon:'—' },
  automation:  { label:'Automation orders',      color:'#7c3aed', bg:'#f5f3ff', icon:'⚡' },
  unassigned:  { label:'Unassigned to partner',  color:'#b45309', bg:'#fffbeb', icon:'?' },
}

export default function AdminDash() {
  const nav = useNavigate()
  const [orders, setOrders] = useState([])
  const [partnerCount, setPartnerCount] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    const [{ data: ord }, { count: pCount }] = await Promise.all([
      supabase.from('orders')
        .select('id,gogetssl_order_id,product_name,ca,domain,status,is_automation,next_renewal,assigned_to,api_response')
        .order('gogetssl_order_id', { ascending: false }),
      supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'partner'),
    ])
    setOrders(ord || [])
    setPartnerCount(pCount || 0)
    setLoading(false)
  }

  const total = orders.length
  const now = new Date()

  const counts = {
    active:     orders.filter(o => ['active','issued'].includes(o.status)).length,
    pending:    orders.filter(o => ['pending','processing'].includes(o.status)).length,
    incomplete: orders.filter(o => o.status === 'incomplete').length,
    expiring:   orders.filter(o => {
      if (!o.next_renewal || o.next_renewal === '0000-00-00') return false
      const d = (new Date(o.next_renewal) - now) / 86400000
      return d > 0 && d <= 30 && ['active','issued'].includes(o.status)
    }).length,
    cancelled:  orders.filter(o => ['cancelled','revoked'].includes(o.status)).length,
    expired:    orders.filter(o => o.status === 'expired').length,
    automation: orders.filter(o => o.is_automation).length,
    unassigned: orders.filter(o => !o.assigned_to).length,
  }

  const expiringSoon = orders.filter(o => {
    if (!o.next_renewal || o.next_renewal === '0000-00-00') return false
    const d = (new Date(o.next_renewal) - now) / 86400000
    return d > 0 && d <= 30 && ['active','issued'].includes(o.status)
  }).sort((a,b) => new Date(a.next_renewal) - new Date(b.next_renewal)).slice(0,6)

  const recentOrders = orders
    .filter(o => !['cancelled','revoked','expired'].includes(o.status))
    .slice(0, 6)

  if (loading) return (
    <DashShell>
      <div style={{display:'flex',alignItems:'center',justifyContent:'center',minHeight:'60vh'}}>
        <div className="spinner"/>
      </div>
    </DashShell>
  )

  return (
    <DashShell>
      <div className="dash-topbar">
        <div>
          <div style={{fontWeight:700,fontSize:'1.05rem'}}>Master admin dashboard</div>
          <div style={{fontSize:12,color:'var(--ink-muted)',marginTop:2}}>
            {total} orders · {partnerCount} partners · {counts.automation} automation plans
          </div>
        </div>
        <div style={{display:'flex',gap:10}}>
          <Link to="/admin/partners" className="btn btn-secondary btn-sm">Partners</Link>
          <Link to="/admin/orders" className="btn btn-primary btn-sm">All orders</Link>
        </div>
      </div>

      <div className="dash-content">

        {/* Status grid — clean tiles */}
        <div style={{
          display:'grid',
          gridTemplateColumns:'repeat(4,1fr)',
          gap:1,
          background:'var(--border)',
          border:'1px solid var(--border)',
          borderRadius:12,
          overflow:'hidden',
          marginBottom:24,
          boxShadow:'var(--shadow-sm)'
        }}>
          {Object.entries(counts).map(([key, count]) => {
            const m = STATUS_META[key]
            const isAlert = count > 0 && ['expiring','unassigned'].includes(key)
            const isZero = count === 0
            return (
              <button
                key={key}
                onClick={() => nav(`/admin/orders?filter=${key}`)}
                style={{
                  background: isZero ? 'var(--white)' : m.bg,
                  border:'none',
                  padding:'20px 22px',
                  textAlign:'left',
                  cursor:'pointer',
                  transition:'filter .12s',
                  display:'flex',
                  flexDirection:'column',
                  gap:8,
                  position:'relative',
                  outline:'none',
                }}
                onMouseEnter={e=>e.currentTarget.style.filter='brightness(.97)'}
                onMouseLeave={e=>e.currentTarget.style.filter=''}
              >
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                  <span style={{fontSize:11,fontWeight:600,color: isZero ? 'var(--ink-muted)' : m.color, textTransform:'uppercase',letterSpacing:'.07em'}}>
                    {m.label}
                  </span>
                  <span style={{fontSize:16, opacity: isZero ? .3 : .7}}>{m.icon}</span>
                </div>
                <div style={{
                  fontSize:36,
                  fontWeight:700,
                  lineHeight:1,
                  color: isZero ? 'var(--ink-faint)' : isAlert ? m.color : 'var(--ink)',
                  letterSpacing:'-.02em'
                }}>{count}</div>
                {total > 0 && (
                  <div style={{display:'flex',alignItems:'center',gap:6}}>
                    <div style={{flex:1,height:3,background:'rgba(0,0,0,.06)',borderRadius:2}}>
                      <div style={{width:`${Math.round((count/total)*100)}%`,height:'100%',background: isZero ? 'transparent' : m.color,borderRadius:2,transition:'width .5s ease'}}/>
                    </div>
                    <span style={{fontSize:10,color:'var(--ink-muted)',whiteSpace:'nowrap'}}>{Math.round((count/total)*100)}%</span>
                  </div>
                )}
              </button>
            )
          })}
        </div>

        {/* Bottom two panels */}
        <div style={{display:'grid',gridTemplateColumns: expiringSoon.length > 0 ? '1fr 340px' : '1fr',gap:20}}>

          {/* Recent orders */}
          <div className="card" style={{padding:0,overflow:'hidden'}}>
            <div style={{padding:'16px 20px',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
              <div>
                <div style={{fontWeight:600,fontSize:14}}>Recent orders</div>
                <div style={{fontSize:12,color:'var(--ink-muted)',marginTop:2}}>Active, pending and incomplete orders</div>
              </div>
              <Link to="/admin/orders" style={{fontSize:12,color:'var(--blue-accent)',fontWeight:500}}>View all →</Link>
            </div>

            {recentOrders.length === 0 ? (
              <div style={{padding:'40px 20px',textAlign:'center'}}>
                <div style={{fontSize:32,marginBottom:10}}>📋</div>
                <div style={{fontWeight:500,fontSize:14,marginBottom:6}}>No active orders</div>
                <div style={{fontSize:13,color:'var(--ink-muted)',marginBottom:16}}>Sync from GoGetSSL to pull your latest orders.</div>
                <Link to="/admin/orders" className="btn btn-primary btn-sm">Go to orders & sync</Link>
              </div>
            ) : (
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
                <thead>
                  <tr style={{background:'var(--canvas)'}}>
                    {['Order ID','Product','Domain','Status','Valid till'].map(h=>(
                      <th key={h} style={{textAlign:'left',fontSize:11,fontWeight:600,color:'var(--ink-muted)',padding:'8px 20px',borderBottom:'1px solid var(--border)',letterSpacing:'.05em',textTransform:'uppercase'}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {recentOrders.map((o,i) => {
                    const sp = {active:'green',issued:'green',pending:'amber',processing:'blue',incomplete:'amber'}
                    return (
                      <tr key={o.id} style={{borderBottom: i < recentOrders.length-1 ? '1px solid var(--border)' : 'none'}}
                        onMouseEnter={e=>e.currentTarget.style.background='var(--blue-sky)'}
                        onMouseLeave={e=>e.currentTarget.style.background=''}>
                        <td style={{padding:'11px 20px'}}>
                          <Link to="/admin/orders" style={{fontFamily:'monospace',fontWeight:700,color:'var(--blue-accent)',fontSize:13}}>
                            #{o.gogetssl_order_id}
                          </Link>
                        </td>
                        <td style={{padding:'11px 20px',maxWidth:180,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                          {resolveProduct(o)}
                        </td>
                        <td style={{padding:'11px 20px'}}>
                          <span style={{fontFamily:'monospace',fontSize:12}}>{o.domain || '—'}</span>
                        </td>
                        <td style={{padding:'11px 20px'}}>
                          <span className={`pill pill-${sp[o.status]||'gray'}`} style={{fontSize:11}}>{o.status}</span>
                        </td>
                        <td style={{padding:'11px 20px',color:'var(--ink-muted)',fontSize:12,whiteSpace:'nowrap'}}>
                          {o.next_renewal && o.next_renewal !== '0000-00-00' ? new Date(o.next_renewal).toLocaleDateString('en-GB') : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Expiring soon */}
          {expiringSoon.length > 0 && (
            <div className="card" style={{padding:0,overflow:'hidden'}}>
              <div style={{padding:'16px 20px',borderBottom:'1px solid var(--border)',background:'#fff7ed'}}>
                <div style={{fontWeight:600,fontSize:14,color:'#c2410c'}}>⏰ Expiring soon</div>
                <div style={{fontSize:12,color:'#9a3412',marginTop:2}}>Act before these renew manually</div>
              </div>
              <div>
                {expiringSoon.map((o,i) => {
                  const days = Math.ceil((new Date(o.next_renewal) - now) / 86400000)
                  const urgent = days <= 7
                  return (
                    <div key={o.id} style={{
                      padding:'12px 20px',
                      borderBottom: i < expiringSoon.length-1 ? '1px solid var(--border)' : 'none',
                      display:'flex',alignItems:'center',gap:12
                    }}>
                      <div style={{
                        width:44,height:44,borderRadius:8,flexShrink:0,
                        background: urgent ? '#fef2f2' : '#fff7ed',
                        display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center'
                      }}>
                        <div style={{fontSize:16,fontWeight:800,color: urgent ? '#dc2626' : '#ea580c',lineHeight:1}}>{days}</div>
                        <div style={{fontSize:9,color: urgent ? '#dc2626' : '#ea580c',fontWeight:600}}>DAYS</div>
                      </div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontFamily:'monospace',fontSize:12,fontWeight:700,color:'var(--blue-accent)'}}>#{o.gogetssl_order_id}</div>
                        <div style={{fontSize:12,color:'var(--ink-mid)',marginTop:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                          {o.domain || resolveProduct(o)}
                        </div>
                        <div style={{fontSize:11,color:'var(--ink-muted)',marginTop:1}}>
                          {new Date(o.next_renewal).toLocaleDateString('en-GB')}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </DashShell>
  )
}
