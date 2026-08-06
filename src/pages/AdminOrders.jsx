import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import DashShell from '../components/DashShell'
import { supabase } from '../supabase'
import { useAuth } from '../AuthContext'

const SP = { active:'green', issued:'green', cancelled:'red', revoked:'red', expired:'red', pending:'amber', incomplete:'amber', processing:'blue' }

const CA_DETECT = n => {
  if (!n) return 'GoGetSSL'
  const l = n.toLowerCase()
  if (l.includes('digicert') || l.includes('secure site')) return 'DigiCert'
  if (l.includes('thawte')) return 'Thawte'
  if (l.includes('geotrust')) return 'GeoTrust'
  if (l.includes('rapidssl')) return 'RapidSSL'
  if (l.includes('sectigo') || l.includes('comodo') || l.includes('positive')) return 'Sectigo'
  return 'GoGetSSL'
}

const PRODUCT_MAP = {31:'RapidSSL DV',32:'RapidSSL Wildcard',33:'GeoTrust DV',34:'GeoTrust Wildcard OV',35:'GeoTrust EV',36:'GeoTrust WC OV',175:'DigiCert Basic EV'}

function productName(api) {
  const r = api?.api_response
  return r?.product_name || PRODUCT_MAP[r?.product_id] || (r?.product_id ? `Product #${r.product_id}` : api?.product_name || '—')
}

function caName(api) {
  const r = api?.api_response
  if (r?.ca_name) return r.ca_name
  return CA_DETECT(r?.product_name || api?.product_name) || api?.ca || 'GoGetSSL'
}

export default function AdminOrders() {
  const { session } = useAuth()
  const [orders, setOrders] = useState([])
  const [partners, setPartners] = useState([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState(null)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [sortDir, setSortDir] = useState('desc')
  const [selected, setSelected] = useState(new Set())
  const [bulkPartner, setBulkPartner] = useState('')
  const [bulkSaving, setBulkSaving] = useState(false)
  const [bulkMsg, setBulkMsg] = useState(null)
  const [drawer, setDrawer] = useState(null) // order object
  const [drawerLoading, setDrawerLoading] = useState(false)
  const [actionMsg, setActionMsg] = useState(null)
  const [cancelConfirm, setCancelConfirm] = useState(false)
  const drawerRef = useRef(null)

  useEffect(() => { loadData() }, [])
  useEffect(() => {
    const fn = e => { if (drawerRef.current && !drawerRef.current.contains(e.target)) setDrawer(null) }
    if (drawer) document.addEventListener('mousedown', fn)
    return () => document.removeEventListener('mousedown', fn)
  }, [drawer])

  async function loadData() {
    setLoading(true)
    const [{ data: ord }, { data: par }] = await Promise.all([
      supabase.from('orders').select('*, partner:profiles!orders_assigned_to_fkey(full_name,email,company)').order('gogetssl_order_id', { ascending: false }),
      supabase.from('profiles').select('id,full_name,email,company').eq('role','partner').order('full_name')
    ])
    setOrders(ord || [])
    setPartners(par || [])
    setLoading(false)
  }

  async function syncFromAPI() {
    if (!session?.access_token) return
    setSyncing(true)
    setSyncMsg({ type:'info', text:'Syncing all orders from GoGetSSL…' })
    try {
      const res = await fetch('/api/sync-orders', { headers:{ Authorization:`Bearer ${session.access_token}` } })
      const data = await res.json()
      setSyncMsg(data.synced > 0
        ? { type:'success', text:`✓ Synced ${data.synced} orders` }
        : { type:'info', text: data.message || 'No new orders' })
      if (data.synced > 0) loadData()
    } catch(e) { setSyncMsg({ type:'error', text:e.message }) }
    setSyncing(false)
  }

  // Bulk assign
  async function bulkAssign() {
    if (!bulkPartner || selected.size === 0) return
    setBulkSaving(true); setBulkMsg(null)
    const ids = [...selected]
    const { error } = await supabase.from('orders')
      .update({ assigned_to: bulkPartner, assigned_at: new Date().toISOString() })
      .in('id', ids)
    if (error) { setBulkMsg({ type:'error', text:error.message }) }
    else {
      setBulkMsg({ type:'success', text:`✓ Assigned ${ids.length} order${ids.length>1?'s':''} to partner` })
      setSelected(new Set()); setBulkPartner('')
      loadData()
    }
    setBulkSaving(false)
  }

  // Open drawer and fetch fresh API data
  async function openDrawer(o) {
    setDrawer(o); setDrawerLoading(true); setActionMsg(null); setCancelConfirm(false)
    try {
      const res = await fetch('/api/order-action', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ action:'status', order_id: o.gogetssl_order_id })
      })
      const data = await res.json()
      if (data.result) setDrawer({ ...o, liveData: data.result })
    } catch(e) { console.error(e) }
    setDrawerLoading(false)
  }

  async function doAction(action, extra={}) {
    if (!drawer) return
    setActionMsg({ type:'info', text:`Running ${action}…` })
    try {
      const res = await fetch('/api/order-action', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ action, order_id: drawer.gogetssl_order_id, ...extra })
      })
      const data = await res.json()
      if (data.result?.error) setActionMsg({ type:'error', text: JSON.stringify(data.result.message || data.result) })
      else setActionMsg({ type:'success', text:`✓ ${action} completed` })
      // Refresh drawer data
      openDrawer(drawer)
      loadData()
    } catch(e) { setActionMsg({ type:'error', text:e.message }) }
  }

  function downloadCert(crt) {
    const blob = new Blob([crt], { type:'application/x-pem-file' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `certificate_${drawer?.gogetssl_order_id}.crt`
    a.click()
  }

  function downloadCA(ca) {
    const blob = new Blob([ca], { type:'application/x-pem-file' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `ca_bundle_${drawer?.gogetssl_order_id}.crt`
    a.click()
  }

  // Toggle select
  const toggleSelect = id => {
    const s = new Set(selected)
    s.has(id) ? s.delete(id) : s.add(id)
    setSelected(s)
  }
  const toggleAll = () => {
    if (selected.size === filtered.length) setSelected(new Set())
    else setSelected(new Set(filtered.map(o => o.id)))
  }

  const sortedOrders = [...orders].sort((a,b) => {
    const av = a.gogetssl_order_id || 0, bv = b.gogetssl_order_id || 0
    return sortDir === 'desc' ? bv - av : av - bv
  })

  const filtered = sortedOrders.filter(o => {
    if (filter === 'unassigned' && o.assigned_to) return false
    if (filter === 'active' && !['active','issued'].includes(o.status)) return false
    if (filter === 'cancelled' && !['cancelled','revoked','expired'].includes(o.status)) return false
    if (filter === 'automation' && !o.is_automation) return false
    if (filter === 'standard' && o.is_automation) return false
    if (search) {
      const q = search.toLowerCase()
      return o.domain?.toLowerCase().includes(q) || productName(o).toLowerCase().includes(q) ||
        String(o.gogetssl_order_id).includes(q) || o.partner?.email?.toLowerCase().includes(q) ||
        o.status?.toLowerCase().includes(q)
    }
    return true
  })

  const cats = [
    { k:'all', l:`All (${orders.length})` },
    { k:'standard', l:`Standard (${orders.filter(o=>!o.is_automation).length})` },
    { k:'automation', l:`Automation (${orders.filter(o=>o.is_automation).length})` },
    { k:'active', l:`Active (${orders.filter(o=>['active','issued'].includes(o.status)).length})` },
    { k:'unassigned', l:`Unassigned (${orders.filter(o=>!o.assigned_to).length})` },
    { k:'cancelled', l:`Cancelled/expired (${orders.filter(o=>['cancelled','revoked','expired'].includes(o.status)).length})` },
  ]

  const ld = drawer?.liveData
  const hasCert = ld?.crt_code
  const canCancel = ld && !['cancelled','revoked','expired'].includes(ld.status)
  const canReissue = ld?.reissue === 1 || ld?.reissue_now === 1
  const canResend = ld?.status === 'active' || ld?.status === 'issued'

  return (
    <DashShell>
      <div className="dash-topbar">
        <h2 style={{fontSize:'1.1rem'}}>All orders</h2>
        <div style={{display:'flex',gap:10,alignItems:'center'}}>
          <button className="btn btn-secondary btn-sm" onClick={syncFromAPI} disabled={syncing} style={{display:'flex',alignItems:'center',gap:6}}>
            {syncing ? <><span className="spinner" style={{width:14,height:14,borderWidth:2}} /> Syncing…</> : '↻ Sync'}
          </button>
        </div>
      </div>

      <div className="dash-content">
        {syncMsg && (
          <div className={`alert alert-${syncMsg.type==='success'?'success':syncMsg.type==='error'?'error':'info'}`}
            style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12}}>
            <span style={{fontSize:13}}>{syncMsg.text}</span>
            <button onClick={()=>setSyncMsg(null)} style={{opacity:.5,fontSize:18}}>×</button>
          </div>
        )}

        {/* Bulk assign bar */}
        {selected.size > 0 && (
          <div className="card" style={{marginBottom:16,background:'var(--blue-sky)',border:'1px solid rgba(51,117,177,.25)',padding:'12px 16px',display:'flex',gap:12,alignItems:'center',flexWrap:'wrap'}}>
            <span style={{fontWeight:500,fontSize:13,color:'var(--blue-accent)'}}>{selected.size} order{selected.size>1?'s':''} selected</span>
            <select className="form-input form-select" value={bulkPartner} onChange={e=>setBulkPartner(e.target.value)} style={{maxWidth:260,padding:'6px 32px 6px 10px',fontSize:13}}>
              <option value="">— Assign to partner —</option>
              {partners.map(p=><option key={p.id} value={p.id}>{p.full_name||p.email}{p.company?` (${p.company})`:''}</option>)}
            </select>
            <button className="btn btn-primary btn-sm" onClick={bulkAssign} disabled={!bulkPartner||bulkSaving}>
              {bulkSaving?<span className="spinner" style={{width:14,height:14,borderWidth:2}}/>:'Assign selected'}
            </button>
            <button className="btn btn-secondary btn-sm" onClick={()=>setSelected(new Set())}>Clear</button>
            {bulkMsg && <span className={`pill pill-${bulkMsg.type==='success'?'green':'red'}`} style={{fontSize:12}}>{bulkMsg.text}</span>}
          </div>
        )}

        {/* Filters */}
        <div style={{display:'flex',gap:12,marginBottom:12,flexWrap:'wrap',alignItems:'center'}}>
          <input className="form-input" placeholder="Search domain, product, order ID…"
            value={search} onChange={e=>setSearch(e.target.value)} style={{maxWidth:280}} />
          <div style={{display:'flex',gap:0,borderBottom:'1px solid var(--border)',flexWrap:'wrap'}}>
            {cats.map(c=>(
              <button key={c.k} onClick={()=>setFilter(c.k)}
                className={`cat-tab ${filter===c.k?'active':''}`} style={{padding:'6px 12px',fontSize:12}}>
                {c.l}
              </button>
            ))}
          </div>
        </div>

        <div className="card" style={{padding:0,overflow:'hidden'}}>
          {loading ? (
            <div style={{textAlign:'center',padding:40}}><div className="spinner" style={{margin:'0 auto'}}/></div>
          ) : filtered.length === 0 ? (
            <div className="empty-state" style={{padding:40}}>
              <h3>{orders.length===0?'No orders yet':'No matching orders'}</h3>
              <p style={{fontSize:13,marginBottom:16}}>{orders.length===0?'Click Sync to pull orders from GoGetSSL.':'Adjust filter or search.'}</p>
              {orders.length===0&&<button className="btn btn-primary btn-sm" onClick={syncFromAPI} disabled={syncing}>Sync now</button>}
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th style={{width:40,padding:'8px 8px 8px 16px'}}>
                      <input type="checkbox" checked={selected.size===filtered.length&&filtered.length>0}
                        onChange={toggleAll} style={{cursor:'pointer'}} />
                    </th>
                    <th style={{cursor:'pointer',userSelect:'none',whiteSpace:'nowrap'}} onClick={()=>setSortDir(d=>d==='desc'?'asc':'desc')}>
                      Order ID {sortDir==='desc'?'↓':'↑'}
                    </th>
                    <th>Product</th>
                    <th>Domain</th>
                    <th>CA</th>
                    <th>Status</th>
                    <th>Type</th>
                    <th>Assigned to</th>
                    <th>Valid till</th>
                    <th style={{width:60}}></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(o=>(
                    <tr key={o.id} style={{background:selected.has(o.id)?'var(--blue-sky)':undefined}}>
                      <td style={{padding:'10px 8px 10px 16px'}}>
                        <input type="checkbox" checked={selected.has(o.id)} onChange={()=>toggleSelect(o.id)} style={{cursor:'pointer'}}/>
                      </td>
                      <td>
                        <button onClick={()=>openDrawer(o)} style={{color:'var(--blue-accent)',fontFamily:'monospace',fontSize:13,fontWeight:600,cursor:'pointer'}}>
                          #{o.gogetssl_order_id||'—'}
                        </button>
                      </td>
                      <td style={{maxWidth:180,fontSize:13}}>{productName(o)}</td>
                      <td><span className="mono" style={{fontSize:12}}>{o.domain||'—'}</span></td>
                      <td style={{fontSize:12,color:'var(--ink-muted)'}}>{caName(o)}</td>
                      <td><span className={`pill pill-${SP[o.status]||'gray'}`}>{o.status}</span></td>
                      <td>
                        {o.is_automation
                          ?<span className="pill pill-blue" style={{fontSize:11}}>Automation</span>
                          :<span className="pill pill-gray" style={{fontSize:11}}>Standard</span>}
                      </td>
                      <td style={{fontSize:13}}>
                        {o.partner
                          ?<span>{o.partner.full_name||o.partner.email}</span>
                          :<span style={{color:'var(--amber)',fontWeight:500,fontSize:12}}>Unassigned</span>}
                      </td>
                      <td style={{fontSize:12,color:'var(--ink-muted)',whiteSpace:'nowrap'}}>
                        {o.next_renewal?new Date(o.next_renewal).toLocaleDateString('en-GB'):'—'}
                      </td>
                      <td>
                        <button onClick={()=>openDrawer(o)} className="btn btn-secondary btn-sm" style={{fontSize:11,padding:'4px 10px'}}>
                          Details
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

      {/* Order detail drawer */}
      {drawer && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.4)',zIndex:200,display:'flex',justifyContent:'flex-end'}}>
          <div ref={drawerRef} style={{width:'min(560px,100vw)',background:'var(--white)',height:'100%',overflow:'auto',boxShadow:'-4px 0 24px rgba(0,0,0,.15)'}}>
            {/* Drawer header */}
            <div style={{padding:'16px 20px',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',justifyContent:'space-between',position:'sticky',top:0,background:'var(--white)',zIndex:2}}>
              <div>
                <div style={{fontWeight:600,fontSize:15}}>Order <span className="mono">#{drawer.gogetssl_order_id}</span></div>
                <div style={{fontSize:12,color:'var(--ink-muted)',marginTop:2}}>{productName(drawer)} · {caName(drawer)}</div>
              </div>
              <button onClick={()=>setDrawer(null)} style={{fontSize:22,color:'var(--ink-muted)',lineHeight:1}}>×</button>
            </div>

            <div style={{padding:'20px'}}>
              {drawerLoading && <div style={{textAlign:'center',padding:24}}><div className="spinner" style={{margin:'0 auto'}}/><p style={{marginTop:8,fontSize:13,color:'var(--ink-muted)'}}>Loading live data…</p></div>}

              {actionMsg && (
                <div className={`alert alert-${actionMsg.type==='success'?'success':actionMsg.type==='error'?'error':'info'}`} style={{marginBottom:16}}>
                  <div style={{display:'flex',justifyContent:'space-between'}}>
                    <span style={{fontSize:13}}>{actionMsg.text}</span>
                    <button onClick={()=>setActionMsg(null)} style={{opacity:.5}}>×</button>
                  </div>
                </div>
              )}

              {/* Status & key info */}
              {ld && (
                <>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:20}}>
                    {[
                      ['GoGetSSL ID', `#${ld.order_id}`],
                      ['Internal ID', ld.internal_id||'—'],
                      ['Status', ld.status],
                      ['DCV Status', ld.dcv_status===1?'Verified':ld.dcv_status===2?'Pending':'Unknown'],
                      ['Domain', ld.domain||'—'],
                      ['Product ID', ld.product_id||'—'],
                      ['Valid from', ld.valid_from||ld.begin_date||'—'],
                      ['Valid till', ld.valid_till||ld.end_date||'—'],
                      ['DCV method', ld.dcv_method||'—'],
                      ['Server count', ld.server_count||'—'],
                    ].map(([k,v])=>(
                      <div key={k} style={{background:'var(--canvas)',borderRadius:7,padding:'10px 12px'}}>
                        <div style={{fontSize:11,color:'var(--ink-muted)',marginBottom:3}}>{k}</div>
                        <div style={{fontSize:13,fontWeight:500,wordBreak:'break-all'}} className={k==='Domain'||k.includes('ID')?'mono':''}>{v}</div>
                      </div>
                    ))}
                  </div>

                  {/* SAN domains */}
                  {ld.san && ld.san.length > 0 && (
                    <div style={{marginBottom:16}}>
                      <div style={{fontSize:12,fontWeight:500,color:'var(--ink-muted)',marginBottom:6}}>SAN DOMAINS</div>
                      <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
                        {ld.san.map((s,i)=><span key={i} className="mono" style={{background:'var(--canvas)',padding:'3px 8px',borderRadius:5,fontSize:12}}>{s}</span>)}
                      </div>
                    </div>
                  )}

                  {/* Admin message */}
                  {ld.admin_msg && (
                    <div className="alert alert-info" style={{marginBottom:16,fontSize:13}}>
                      <strong>CA message:</strong> {ld.admin_msg}
                    </div>
                  )}

                  {/* Actions */}
                  <div style={{borderTop:'1px solid var(--border)',paddingTop:16,marginBottom:16}}>
                    <div style={{fontSize:12,fontWeight:500,color:'var(--ink-muted)',marginBottom:10}}>ACTIONS</div>
                    <div style={{display:'flex',flexWrap:'wrap',gap:8}}>

                      {/* Download certificate */}
                      {hasCert && (
                        <>
                          <button className="btn btn-secondary btn-sm" onClick={()=>downloadCert(ld.crt_code)}>
                            ↓ Download Certificate
                          </button>
                          {ld.ca_code && (
                            <button className="btn btn-secondary btn-sm" onClick={()=>downloadCA(ld.ca_code)}>
                              ↓ Download CA Bundle
                            </button>
                          )}
                        </>
                      )}

                      {/* Resend validation email */}
                      {ld.status === 'pending' && (
                        <button className="btn btn-secondary btn-sm" onClick={()=>doAction('resend_email')}>
                          ✉ Resend Validation Email
                        </button>
                      )}

                      {/* Reissue */}
                      {canReissue && (
                        <button className="btn btn-secondary btn-sm" onClick={()=>{
                          const csr = prompt('Paste your new CSR:')
                          if (csr) doAction('reissue', { csr })
                        }}>
                          ↺ Reissue Certificate
                        </button>
                      )}

                      {/* Cancel */}
                      {canCancel && !cancelConfirm && (
                        <button className="btn btn-danger btn-sm" onClick={()=>setCancelConfirm(true)}>
                          Cancel Order
                        </button>
                      )}
                      {cancelConfirm && (
                        <div style={{display:'flex',gap:8,alignItems:'center',width:'100%',background:'var(--red-bg)',padding:'10px 12px',borderRadius:7,border:'1px solid rgba(220,38,38,.2)'}}>
                          <span style={{fontSize:13,color:'var(--red-text)',flex:1}}>Cancel order #{drawer.gogetssl_order_id}? This cannot be undone.</span>
                          <button className="btn btn-danger btn-sm" onClick={()=>doAction('cancel',{reason:'end'})}>Confirm</button>
                          <button className="btn btn-secondary btn-sm" onClick={()=>setCancelConfirm(false)}>No</button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Certificate text */}
                  {hasCert && (
                    <div style={{marginBottom:16}}>
                      <div style={{fontSize:12,fontWeight:500,color:'var(--ink-muted)',marginBottom:6}}>CERTIFICATE</div>
                      <textarea readOnly value={ld.crt_code} style={{width:'100%',height:120,fontFamily:'monospace',fontSize:11,padding:'8px',border:'1px solid var(--border)',borderRadius:7,background:'var(--canvas)',resize:'vertical'}} />
                      <button onClick={()=>navigator.clipboard.writeText(ld.crt_code)} className="btn btn-secondary btn-sm" style={{marginTop:6}}>Copy</button>
                    </div>
                  )}

                  {/* CA bundle */}
                  {ld.ca_code && (
                    <div style={{marginBottom:16}}>
                      <div style={{fontSize:12,fontWeight:500,color:'var(--ink-muted)',marginBottom:6}}>CA BUNDLE</div>
                      <textarea readOnly value={ld.ca_code} style={{width:'100%',height:100,fontFamily:'monospace',fontSize:11,padding:'8px',border:'1px solid var(--border)',borderRadius:7,background:'var(--canvas)',resize:'vertical'}} />
                      <button onClick={()=>navigator.clipboard.writeText(ld.ca_code)} className="btn btn-secondary btn-sm" style={{marginTop:6}}>Copy</button>
                    </div>
                  )}

                  {/* CSR */}
                  {ld.csr_code && (
                    <div style={{marginBottom:16}}>
                      <div style={{fontSize:12,fontWeight:500,color:'var(--ink-muted)',marginBottom:6}}>CSR ON FILE</div>
                      <textarea readOnly value={ld.csr_code} style={{width:'100%',height:100,fontFamily:'monospace',fontSize:11,padding:'8px',border:'1px solid var(--border)',borderRadius:7,background:'var(--canvas)',resize:'vertical'}} />
                      <button onClick={()=>navigator.clipboard.writeText(ld.csr_code)} className="btn btn-secondary btn-sm" style={{marginTop:6}}>Copy</button>
                    </div>
                  )}

                  {/* Assign to partner from drawer */}
                  <div style={{borderTop:'1px solid var(--border)',paddingTop:16}}>
                    <div style={{fontSize:12,fontWeight:500,color:'var(--ink-muted)',marginBottom:8}}>ASSIGN TO PARTNER</div>
                    <div style={{display:'flex',gap:8}}>
                      <select className="form-input form-select" defaultValue={drawer.assigned_to||''} id="drawer-partner"
                        style={{flex:1,fontSize:13,padding:'7px 32px 7px 10px'}}>
                        <option value="">— No partner —</option>
                        {partners.map(p=><option key={p.id} value={p.id}>{p.full_name||p.email}</option>)}
                      </select>
                      <button className="btn btn-primary btn-sm" onClick={async()=>{
                        const val = document.getElementById('drawer-partner').value
                        await supabase.from('orders').update({assigned_to:val||null,assigned_at:val?new Date().toISOString():null}).eq('id',drawer.id)
                        setActionMsg({type:'success',text:'Partner assignment saved'})
                        loadData()
                      }}>Save</button>
                    </div>
                  </div>
                </>
              )}

              {!drawerLoading && !ld && (
                <div className="empty-state">
                  <p style={{fontSize:13}}>Could not load live data for this order. Check that GoGetSSL API credentials are correct.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </DashShell>
  )
}
