import { useState, useEffect, useRef, useCallback } from 'react'
import DashShell from '../components/DashShell'
import { supabase } from '../supabase'
import { useAuth } from '../AuthContext'

const SP = { active:'green', issued:'green', cancelled:'red', revoked:'red', expired:'red', pending:'amber', incomplete:'amber', processing:'blue' }

const V1_NAMES = {31:'RapidSSL DV',32:'RapidSSL Wildcard',33:'GeoTrust DV',34:'GeoTrust OV Wildcard',35:'GeoTrust EV',36:'GeoTrust OV',50:'Thawte SSL Web OV',51:'Thawte SSL Web EV',65:'DigiCert Secure Site OV',66:'DigiCert Secure Site EV',67:'DigiCert Secure Site Pro OV',68:'DigiCert Secure Site Pro EV',175:'DigiCert Basic EV',176:'DigiCert Basic OV'}

function resolveProduct(o) {
  const r = o?.api_response
  if (!r) return o?.product_name || '—'
  if (r.product_name) return r.product_name
  return V1_NAMES[r.product_id] || o?.product_name || (r.product_id ? `Product #${r.product_id}` : '—')
}

function resolveCA(o) {
  const r = o?.api_response
  if (r?.ca_name) return r.ca_name
  return o?.ca || 'GoGetSSL'
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
  // Bulk: Set of DB row ids (uuid strings)
  const [selected, setSelected] = useState(new Set())
  const [bulkPartner, setBulkPartner] = useState('')
  const [bulkSaving, setBulkSaving] = useState(false)
  const [bulkMsg, setBulkMsg] = useState(null)
  const [drawer, setDrawer] = useState(null)
  const [drawerLoading, setDrawerLoading] = useState(false)
  const [actionMsg, setActionMsg] = useState(null)
  const [cancelConfirm, setCancelConfirm] = useState(false)
  const drawerRef = useRef(null)

  useEffect(() => { loadData() }, [])

  useEffect(() => {
    if (!drawer) return
    const fn = e => { if (drawerRef.current && !drawerRef.current.contains(e.target)) setDrawer(null) }
    document.addEventListener('mousedown', fn)
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
    setSelected(new Set()) // clear selection on reload
    setLoading(false)
  }

  async function syncFromAPI() {
    if (!session?.access_token) return
    setSyncing(true)
    setSyncMsg({ type:'info', text:'Syncing all orders from GoGetSSL (v1 + automation)…' })
    try {
      const res = await fetch('/api/sync-orders', { headers:{ Authorization:`Bearer ${session.access_token}` } })
      const data = await res.json()
      if (data.errors?.length) console.warn('Sync errors:', data.errors)
      setSyncMsg(data.synced > 0
        ? { type:'success', text:`✓ Synced ${data.synced} orders${data.errors?.length ? ` (${data.errors.length} errors — check console)` : ''}` }
        : { type:'info', text: data.message || 'No new orders found' })
      await loadData()
    } catch(e) { setSyncMsg({ type:'error', text:e.message }) }
    setSyncing(false)
  }

  // Derived filtered list — stable reference so selection doesn't reset
  const filtered = (() => {
    let list = [...orders]
    if (filter === 'unassigned') list = list.filter(o => !o.assigned_to)
    else if (filter === 'active') list = list.filter(o => ['active','issued'].includes(o.status))
    else if (filter === 'cancelled') list = list.filter(o => ['cancelled','revoked','expired'].includes(o.status))
    else if (filter === 'automation') list = list.filter(o => o.is_automation)
    else if (filter === 'standard') list = list.filter(o => !o.is_automation)
    else if (filter === 'incomplete') list = list.filter(o => o.status === 'incomplete')
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(o =>
        o.domain?.toLowerCase().includes(q) ||
        resolveProduct(o).toLowerCase().includes(q) ||
        String(o.gogetssl_order_id).includes(q) ||
        o.partner?.email?.toLowerCase().includes(q) ||
        o.status?.toLowerCase().includes(q)
      )
    }
    list.sort((a,b) => {
      const av = a.gogetssl_order_id || 0, bv = b.gogetssl_order_id || 0
      return sortDir === 'desc' ? bv - av : av - bv
    })
    return list
  })()

  // Checkbox toggle — use DB uuid id, not gogetssl_order_id
  const toggleOne = useCallback((dbId, e) => {
    e.stopPropagation()
    setSelected(prev => {
      const next = new Set(prev)
      next.has(dbId) ? next.delete(dbId) : next.add(dbId)
      return next
    })
  }, [])

  const allChecked = filtered.length > 0 && filtered.every(o => selected.has(o.id))
  const someChecked = filtered.some(o => selected.has(o.id))

  const toggleAll = useCallback(e => {
    e.stopPropagation()
    if (allChecked) {
      setSelected(prev => { const n = new Set(prev); filtered.forEach(o => n.delete(o.id)); return n })
    } else {
      setSelected(prev => { const n = new Set(prev); filtered.forEach(o => n.add(o.id)); return n })
    }
  }, [allChecked, filtered])

  async function bulkAssign() {
    if (!bulkPartner || selected.size === 0) return
    setBulkSaving(true); setBulkMsg(null)
    const ids = [...selected]
    const { error } = await supabase.from('orders')
      .update({ assigned_to: bulkPartner, assigned_at: new Date().toISOString() })
      .in('id', ids)
    setBulkMsg(error
      ? { type:'error', text: error.message }
      : { type:'success', text:`✓ Assigned ${ids.length} order${ids.length>1?'s':''} to partner` })
    if (!error) { setSelected(new Set()); setBulkPartner(''); loadData() }
    setBulkSaving(false)
  }

  async function openDrawer(o) {
    setDrawer({ ...o, liveData: null }); setDrawerLoading(true)
    setActionMsg(null); setCancelConfirm(false)
    try {
      const res = await fetch('/api/order-action', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ action:'status', order_id: o.gogetssl_order_id, is_automation: o.is_automation })
      })
      const data = await res.json()
      if (data.result) setDrawer(prev => ({ ...prev, liveData: data.result }))
    } catch(e) { console.error(e) }
    setDrawerLoading(false)
  }

  async function doAction(action, extra={}) {
    if (!drawer) return
    setActionMsg({ type:'info', text:`Running ${action}…` })
    try {
      const res = await fetch('/api/order-action', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ action, order_id: drawer.gogetssl_order_id, is_automation: drawer.is_automation, ...extra })
      })
      const data = await res.json()
      const r = data.result || {}
      if (r.error || r.success === false) setActionMsg({ type:'error', text: r.message || JSON.stringify(r) })
      else { setActionMsg({ type:'success', text:`✓ ${action} completed` }); openDrawer(drawer); loadData() }
    } catch(e) { setActionMsg({ type:'error', text:e.message }) }
  }

  function download(text, filename) {
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([text],{type:'application/x-pem-file'})), download: filename })
    a.click()
  }

  const cats = [
    { k:'all', l:`All (${orders.length})` },
    { k:'standard', l:`Standard (${orders.filter(o=>!o.is_automation).length})` },
    { k:'automation', l:`Automation (${orders.filter(o=>o.is_automation).length})` },
    { k:'active', l:`Active (${orders.filter(o=>['active','issued'].includes(o.status)).length})` },
    { k:'incomplete', l:`Incomplete (${orders.filter(o=>o.status==='incomplete').length})` },
    { k:'unassigned', l:`Unassigned (${orders.filter(o=>!o.assigned_to).length})` },
    { k:'cancelled', l:`Cancelled (${orders.filter(o=>['cancelled','revoked','expired'].includes(o.status)).length})` },
  ]

  const ld = drawer?.liveData
  const hasCert = ld?.crt_code && ld.crt_code.length > 10
  const canCancel = ld && !['cancelled','revoked','expired'].includes(ld.status)
  const canReissue = ld?.reissue === 1 || ld?.reissue_now === 1
  const selectedCount = [...selected].filter(id => filtered.some(o => o.id === id)).length

  return (
    <DashShell>
      <div className="dash-topbar">
        <h2 style={{fontSize:'1.1rem'}}>All orders <span style={{fontSize:13,fontWeight:400,color:'var(--ink-muted)',marginLeft:6}}>{orders.length} total</span></h2>
        <button className="btn btn-secondary btn-sm" onClick={syncFromAPI} disabled={syncing} style={{display:'flex',alignItems:'center',gap:6}}>
          {syncing?<><span className="spinner" style={{width:14,height:14,borderWidth:2}}/>Syncing…</>:'↻ Sync from GoGetSSL'}
        </button>
      </div>

      <div className="dash-content">
        {syncMsg && (
          <div className={`alert alert-${syncMsg.type==='success'?'success':syncMsg.type==='error'?'error':'info'}`}
            style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,marginBottom:12}}>
            <span style={{fontSize:13}}>{syncMsg.text}</span>
            <button onClick={()=>setSyncMsg(null)} style={{opacity:.5,fontSize:18,lineHeight:1}}>×</button>
          </div>
        )}

        {/* Bulk assign bar — only when something selected */}
        {selected.size > 0 && (
          <div style={{background:'var(--blue-sky)',border:'1px solid rgba(51,117,177,.25)',borderRadius:10,padding:'12px 16px',marginBottom:14,display:'flex',gap:12,alignItems:'center',flexWrap:'wrap'}}>
            <span style={{fontWeight:600,fontSize:13,color:'var(--blue-accent)',whiteSpace:'nowrap'}}>{selected.size} selected</span>
            <select className="form-input form-select" value={bulkPartner} onChange={e=>setBulkPartner(e.target.value)} style={{maxWidth:280,fontSize:13,padding:'6px 32px 6px 10px'}}>
              <option value="">— Assign to partner —</option>
              {partners.map(p=><option key={p.id} value={p.id}>{p.full_name||p.email}{p.company?` · ${p.company}`:''}</option>)}
            </select>
            <button className="btn btn-primary btn-sm" onClick={bulkAssign} disabled={!bulkPartner||bulkSaving} style={{whiteSpace:'nowrap'}}>
              {bulkSaving?<span className="spinner" style={{width:14,height:14,borderWidth:2}}/>:`Assign ${selected.size} order${selected.size>1?'s':''}`}
            </button>
            <button className="btn btn-secondary btn-sm" onClick={()=>setSelected(new Set())}>Clear</button>
            {bulkMsg && <span className={`pill pill-${bulkMsg.type==='success'?'green':'red'}`} style={{fontSize:12}}>{bulkMsg.text}</span>}
          </div>
        )}

        {/* Filter tabs + search */}
        <div style={{display:'flex',gap:12,marginBottom:10,flexWrap:'wrap',alignItems:'center'}}>
          <input className="form-input" placeholder="Search domain, product, order ID…"
            value={search} onChange={e=>setSearch(e.target.value)} style={{maxWidth:280}} />
        </div>
        <div style={{display:'flex',gap:0,borderBottom:'1px solid var(--border)',marginBottom:14,overflowX:'auto'}}>
          {cats.map(c=>(
            <button key={c.k} onClick={()=>setFilter(c.k)}
              className={`cat-tab ${filter===c.k?'active':''}`} style={{padding:'6px 12px',fontSize:12,whiteSpace:'nowrap'}}>
              {c.l}
            </button>
          ))}
        </div>

        <div className="card" style={{padding:0,overflow:'hidden'}}>
          {loading ? (
            <div style={{textAlign:'center',padding:40}}><div className="spinner" style={{margin:'0 auto'}}/></div>
          ) : filtered.length === 0 ? (
            <div className="empty-state" style={{padding:40}}>
              <h3>{orders.length===0?'No orders yet':'No matching orders'}</h3>
              <p style={{fontSize:13,marginBottom:16}}>{orders.length===0?'Click Sync to pull from GoGetSSL.':'Try a different filter or search.'}</p>
              {orders.length===0&&<button className="btn btn-primary btn-sm" onClick={syncFromAPI}>↻ Sync now</button>}
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th style={{width:44,padding:'8px 4px 8px 16px'}}>
                      <input type="checkbox"
                        checked={allChecked}
                        ref={el => { if (el) el.indeterminate = someChecked && !allChecked }}
                        onChange={toggleAll}
                        style={{cursor:'pointer',width:15,height:15}}
                      />
                    </th>
                    <th style={{cursor:'pointer',userSelect:'none',whiteSpace:'nowrap',minWidth:110}}
                      onClick={()=>setSortDir(d=>d==='desc'?'asc':'desc')}>
                      Order ID {sortDir==='desc'?'↓':'↑'}
                    </th>
                    <th style={{minWidth:160}}>Product</th>
                    <th style={{minWidth:140}}>Domain</th>
                    <th style={{minWidth:80}}>CA</th>
                    <th style={{minWidth:90}}>Status</th>
                    <th style={{minWidth:90}}>Type</th>
                    <th style={{minWidth:130}}>Assigned to</th>
                    <th style={{minWidth:90,whiteSpace:'nowrap'}}>Valid till</th>
                    <th style={{width:70}}></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(o => {
                    const isSelected = selected.has(o.id)
                    return (
                      <tr key={o.id} style={{background:isSelected?'var(--blue-sky)':undefined,cursor:'pointer'}}
                        onClick={()=>openDrawer(o)}>
                        <td style={{padding:'10px 4px 10px 16px'}} onClick={e=>e.stopPropagation()}>
                          <input type="checkbox"
                            checked={isSelected}
                            onChange={e=>toggleOne(o.id, e)}
                            onClick={e=>e.stopPropagation()}
                            style={{cursor:'pointer',width:15,height:15}}
                          />
                        </td>
                        <td onClick={e=>{e.stopPropagation();openDrawer(o)}}>
                          <span style={{color:'var(--blue-accent)',fontFamily:'monospace',fontSize:13,fontWeight:600,cursor:'pointer'}}>
                            #{o.gogetssl_order_id||'—'}
                          </span>
                        </td>
                        <td style={{fontSize:13,maxWidth:200}}>{resolveProduct(o)}</td>
                        <td><span className="mono" style={{fontSize:12}}>{o.domain||'—'}</span></td>
                        <td style={{fontSize:12,color:'var(--ink-muted)'}}>{resolveCA(o)}</td>
                        <td><span className={`pill pill-${SP[o.status]||'gray'}`} style={{fontSize:11}}>{o.status}</span></td>
                        <td>
                          {o.is_automation
                            ?<span className="pill pill-blue" style={{fontSize:11}}>Automation</span>
                            :<span className="pill pill-gray" style={{fontSize:11}}>Standard</span>}
                        </td>
                        <td style={{fontSize:13}}>
                          {o.partner
                            ?<span style={{color:'var(--ink-mid)'}}>{o.partner.full_name||o.partner.email}</span>
                            :<span style={{color:'var(--amber)',fontWeight:500,fontSize:12}}>Unassigned</span>}
                        </td>
                        <td style={{fontSize:12,color:'var(--ink-muted)',whiteSpace:'nowrap'}}>
                          {o.next_renewal&&o.next_renewal!=='0000-00-00'?new Date(o.next_renewal).toLocaleDateString('en-GB'):'—'}
                        </td>
                        <td onClick={e=>e.stopPropagation()}>
                          <button onClick={()=>openDrawer(o)} className="btn btn-secondary btn-sm" style={{fontSize:11,padding:'4px 10px'}}>Details</button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Order detail drawer — proper slide-in panel, not an overlay */}
      {drawer && (
        <>
          {/* Scrim */}
          <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.35)',zIndex:200}} onClick={()=>setDrawer(null)} />
          {/* Panel */}
          <div ref={drawerRef} style={{position:'fixed',top:0,right:0,bottom:0,width:'min(580px,100vw)',background:'var(--white)',zIndex:201,display:'flex',flexDirection:'column',boxShadow:'-6px 0 32px rgba(0,0,0,.18)'}}>
            {/* Sticky header */}
            <div style={{padding:'16px 20px',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0,background:'var(--white)'}}>
              <div>
                <div style={{fontWeight:700,fontSize:15}}>Order <span className="mono">#{drawer.gogetssl_order_id}</span></div>
                <div style={{fontSize:12,color:'var(--ink-muted)',marginTop:2}}>{resolveProduct(drawer)} · {resolveCA(drawer)}</div>
              </div>
              <div style={{display:'flex',gap:8,alignItems:'center'}}>
                <span className={`pill pill-${SP[drawer.status]||'gray'}`}>{drawer.status}</span>
                <button onClick={()=>setDrawer(null)} style={{fontSize:24,color:'var(--ink-muted)',lineHeight:1,padding:'0 4px'}}>×</button>
              </div>
            </div>

            {/* Scrollable body */}
            <div style={{flex:1,overflow:'auto',padding:20}}>
              {drawerLoading && (
                <div style={{textAlign:'center',padding:32}}>
                  <div className="spinner" style={{margin:'0 auto 10px'}}/>
                  <p style={{fontSize:13,color:'var(--ink-muted)'}}>Loading live data from GoGetSSL…</p>
                </div>
              )}

              {actionMsg && (
                <div className={`alert alert-${actionMsg.type==='success'?'success':actionMsg.type==='error'?'error':'info'}`} style={{marginBottom:14,display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:8}}>
                  <span style={{fontSize:13,flex:1,wordBreak:'break-word'}}>{actionMsg.text}</span>
                  <button onClick={()=>setActionMsg(null)} style={{opacity:.5,fontSize:16,lineHeight:1,flexShrink:0}}>×</button>
                </div>
              )}

              {ld && !drawerLoading && (
                <>
                  {/* Info grid */}
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:18}}>
                    {[
                      ['GoGetSSL ID','#'+ld.order_id, true],
                      ['Internal ID', ld.internal_id||'—', true],
                      ['Status', ld.status||'—', false],
                      ['DCV Status', ld.dcv_status===2?'✓ Verified':ld.dcv_status===1?'Pending':'—', false],
                      ['Domain', ld.domain||'—', true],
                      ['Product ID', ld.product_id||'—', false],
                      ['Valid from', ld.valid_from&&ld.valid_from!=='0000-00-00'?ld.valid_from:'—', false],
                      ['Valid till', ld.valid_till&&ld.valid_till!=='0000-00-00'?ld.valid_till:'—', false],
                      ['DCV method', ld.dcv_method||'—', false],
                      ['Server count', ld.server_count??'—', false],
                    ].map(([k,v,mono])=>(
                      <div key={k} style={{background:'var(--canvas)',borderRadius:7,padding:'10px 12px'}}>
                        <div style={{fontSize:11,color:'var(--ink-muted)',marginBottom:3}}>{k}</div>
                        <div style={{fontSize:13,fontWeight:500,wordBreak:'break-all'}} className={mono?'mono':''}>{String(v)}</div>
                      </div>
                    ))}
                  </div>

                  {/* CA message */}
                  {ld.admin_msg && <div className="alert alert-info" style={{marginBottom:14,fontSize:13}}><strong>CA:</strong> {ld.admin_msg}</div>}

                  {/* Actions */}
                  <div style={{borderTop:'1px solid var(--border)',paddingTop:14,marginBottom:16}}>
                    <div style={{fontSize:11,fontWeight:600,color:'var(--ink-muted)',letterSpacing:'.07em',marginBottom:10}}>ACTIONS</div>
                    <div style={{display:'flex',flexWrap:'wrap',gap:8}}>
                      {hasCert && <>
                        <button className="btn btn-secondary btn-sm" onClick={()=>download(ld.crt_code,`cert_${ld.order_id}.crt`)}>↓ Certificate</button>
                        {ld.ca_code&&<button className="btn btn-secondary btn-sm" onClick={()=>download(ld.ca_code,`ca_${ld.order_id}.crt`)}>↓ CA Bundle</button>}
                      </>}
                      {ld.status==='pending'&&<button className="btn btn-secondary btn-sm" onClick={()=>doAction('resend_email')}>✉ Resend Validation Email</button>}
                      {canReissue&&<button className="btn btn-secondary btn-sm" onClick={()=>{const csr=prompt('Paste new CSR:');if(csr)doAction('reissue',{csr})}}>↺ Reissue</button>}
                      {canCancel&&!cancelConfirm&&<button className="btn btn-danger btn-sm" onClick={()=>setCancelConfirm(true)}>Cancel Order</button>}
                    </div>
                    {cancelConfirm&&(
                      <div style={{marginTop:10,background:'var(--red-bg)',padding:'10px 14px',borderRadius:7,border:'1px solid rgba(220,38,38,.2)',display:'flex',gap:10,alignItems:'center',flexWrap:'wrap'}}>
                        <span style={{fontSize:13,color:'var(--red-text)',flex:1}}>Cancel order #{drawer.gogetssl_order_id}? Cannot be undone.</span>
                        <button className="btn btn-danger btn-sm" onClick={()=>doAction('cancel',{reason:'end'})}>Confirm cancel</button>
                        <button className="btn btn-secondary btn-sm" onClick={()=>setCancelConfirm(false)}>No</button>
                      </div>
                    )}
                  </div>

                  {/* Cert text boxes */}
                  {hasCert&&(
                    <div style={{marginBottom:14}}>
                      <div style={{fontSize:11,fontWeight:600,color:'var(--ink-muted)',letterSpacing:'.07em',marginBottom:6}}>CERTIFICATE</div>
                      <textarea readOnly value={ld.crt_code} style={{width:'100%',height:110,fontFamily:'monospace',fontSize:11,padding:8,border:'1px solid var(--border)',borderRadius:7,background:'var(--canvas)',resize:'vertical'}}/>
                      <button onClick={()=>navigator.clipboard.writeText(ld.crt_code)} className="btn btn-secondary btn-sm" style={{marginTop:6}}>Copy</button>
                    </div>
                  )}
                  {ld.ca_code&&ld.ca_code.length>10&&(
                    <div style={{marginBottom:14}}>
                      <div style={{fontSize:11,fontWeight:600,color:'var(--ink-muted)',letterSpacing:'.07em',marginBottom:6}}>CA BUNDLE</div>
                      <textarea readOnly value={ld.ca_code} style={{width:'100%',height:90,fontFamily:'monospace',fontSize:11,padding:8,border:'1px solid var(--border)',borderRadius:7,background:'var(--canvas)',resize:'vertical'}}/>
                      <button onClick={()=>navigator.clipboard.writeText(ld.ca_code)} className="btn btn-secondary btn-sm" style={{marginTop:6}}>Copy</button>
                    </div>
                  )}
                  {ld.csr_code&&ld.csr_code.length>10&&(
                    <div style={{marginBottom:14}}>
                      <div style={{fontSize:11,fontWeight:600,color:'var(--ink-muted)',letterSpacing:'.07em',marginBottom:6}}>CSR ON FILE</div>
                      <textarea readOnly value={ld.csr_code} style={{width:'100%',height:90,fontFamily:'monospace',fontSize:11,padding:8,border:'1px solid var(--border)',borderRadius:7,background:'var(--canvas)',resize:'vertical'}}/>
                      <button onClick={()=>navigator.clipboard.writeText(ld.csr_code)} className="btn btn-secondary btn-sm" style={{marginTop:6}}>Copy</button>
                    </div>
                  )}

                  {/* Assign to partner */}
                  <div style={{borderTop:'1px solid var(--border)',paddingTop:14}}>
                    <div style={{fontSize:11,fontWeight:600,color:'var(--ink-muted)',letterSpacing:'.07em',marginBottom:8}}>ASSIGN TO PARTNER</div>
                    <div style={{display:'flex',gap:8}}>
                      <select className="form-input form-select" id="dp-sel" defaultValue={drawer.assigned_to||''} style={{flex:1,fontSize:13,padding:'7px 32px 7px 10px'}}>
                        <option value="">— No partner —</option>
                        {partners.map(p=><option key={p.id} value={p.id}>{p.full_name||p.email}{p.company?` · ${p.company}`:''}</option>)}
                      </select>
                      <button className="btn btn-primary btn-sm" onClick={async()=>{
                        const val=document.getElementById('dp-sel').value
                        await supabase.from('orders').update({assigned_to:val||null,assigned_at:val?new Date().toISOString():null}).eq('id',drawer.id)
                        setActionMsg({type:'success',text:'Partner saved'})
                        loadData()
                      }}>Save</button>
                    </div>
                  </div>
                </>
              )}

              {!drawerLoading && !ld && (
                <div className="empty-state" style={{paddingTop:24}}>
                  <p style={{fontSize:13}}>No live data loaded. The GoGetSSL API may not have details for this order.</p>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </DashShell>
  )
}
