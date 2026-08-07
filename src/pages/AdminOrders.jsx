import { useState, useEffect, useCallback } from 'react'
import DashShell from '../components/DashShell'
import OrderDrawer, { resolveProduct, resolveCA } from '../components/OrderDrawer'
import { supabase } from '../supabase'
import { useAuth } from '../AuthContext'

const SP = { active:'green', issued:'green', cancelled:'red', revoked:'red', expired:'red', pending:'amber', incomplete:'amber', processing:'blue' }

export default function AdminOrders() {
  const { session } = useAuth()
  const [orders, setOrders] = useState([])
  const [partners, setPartners] = useState([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState(null)
  const [filter, setFilter] = useState(() => new URLSearchParams(window.location.search).get('filter') || 'all')
  const [search, setSearch] = useState('')
  const [sortDir, setSortDir] = useState('desc')
  const [selected, setSelected] = useState(new Set())
  const [bulkPartner, setBulkPartner] = useState('')
  const [bulkSaving, setBulkSaving] = useState(false)
  const [bulkMsg, setBulkMsg] = useState(null)
  const [drawer, setDrawer] = useState(null)

  useEffect(() => { loadData() }, [])

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
      if (data.errors?.length) console.warn('Sync errors:', data.errors)
      setSyncMsg(data.synced > 0
        ? { type:'success', text:`✓ Synced ${data.synced} orders` }
        : { type:'info', text: data.message || 'No new orders' })
      await loadData()
    } catch(e) { setSyncMsg({ type:'error', text: e.message }) }
    setSyncing(false)
  }

  const filtered = (() => {
    let list = [...orders]
    if (filter === 'unassigned') list = list.filter(o => !o.assigned_to)
    else if (filter === 'active') list = list.filter(o => ['active','issued'].includes(o.status))
    else if (filter === 'incomplete') list = list.filter(o => o.status === 'incomplete')
    else if (filter === 'pending') list = list.filter(o => ['pending','processing'].includes(o.status))
    else if (filter === 'expiring') list = list.filter(o => {
      if (!o.next_renewal || o.next_renewal === '0000-00-00') return false
      const d = (new Date(o.next_renewal) - new Date()) / 86400000
      return d > 0 && d <= 30 && ['active','issued'].includes(o.status)
    })
    else if (filter === 'cancelled') list = list.filter(o => ['cancelled','revoked','expired'].includes(o.status))
    else if (filter === 'automation') list = list.filter(o => o.is_automation)
    else if (filter === 'standard') list = list.filter(o => !o.is_automation)
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
      const av = a.gogetssl_order_id||0, bv = b.gogetssl_order_id||0
      return sortDir==='desc' ? bv-av : av-bv
    })
    return list
  })()

  const toggleOne = useCallback((dbId, e) => {
    e.stopPropagation()
    setSelected(prev => { const n = new Set(prev); n.has(dbId)?n.delete(dbId):n.add(dbId); return n })
  }, [])

  const allChecked = filtered.length > 0 && filtered.every(o => selected.has(o.id))
  const someChecked = !allChecked && filtered.some(o => selected.has(o.id))

  const toggleAll = useCallback(e => {
    e.stopPropagation()
    if (allChecked) setSelected(prev => { const n=new Set(prev); filtered.forEach(o=>n.delete(o.id)); return n })
    else setSelected(prev => { const n=new Set(prev); filtered.forEach(o=>n.add(o.id)); return n })
  }, [allChecked, filtered])

  async function bulkAssign() {
    if (!bulkPartner || selected.size===0) return
    setBulkSaving(true); setBulkMsg(null)
    const ids = [...selected]
    const { error } = await supabase.from('orders').update({ assigned_to:bulkPartner, assigned_at:new Date().toISOString() }).in('id',ids)
    setBulkMsg(error ? { type:'error', text:error.message } : { type:'success', text:`✓ Assigned ${ids.length} orders` })
    if (!error) { setSelected(new Set()); setBulkPartner(''); loadData() }
    setBulkSaving(false)
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

  return (
    <DashShell>
      <div className="dash-topbar">
        <h2 style={{fontSize:'1.1rem'}}>All orders <span style={{fontSize:13,fontWeight:400,color:'var(--ink-muted)',marginLeft:6}}>{orders.length} total</span></h2>
        <button className="btn btn-secondary btn-sm" onClick={syncFromAPI} disabled={syncing} style={{display:'flex',alignItems:'center',gap:6}}>
          {syncing?<><span className="spinner" style={{width:14,height:14,borderWidth:2}}/>Syncing…</>:'↻ Sync from GoGetSSL'}
        </button>
      </div>

      <div className="dash-content">
        {syncMsg&&(
          <div className={`alert alert-${syncMsg.type==='success'?'success':syncMsg.type==='error'?'error':'info'}`}
            style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,marginBottom:12}}>
            <span style={{fontSize:13}}>{syncMsg.text}</span>
            <button onClick={()=>setSyncMsg(null)} style={{opacity:.5,fontSize:18,lineHeight:1}}>×</button>
          </div>
        )}

        {/* Bulk assign */}
        {selected.size>0&&(
          <div style={{background:'var(--blue-sky)',border:'1px solid rgba(51,117,177,.25)',borderRadius:10,padding:'12px 16px',marginBottom:14,display:'flex',gap:12,alignItems:'center',flexWrap:'wrap'}}>
            <span style={{fontWeight:600,fontSize:13,color:'var(--blue-accent)',whiteSpace:'nowrap'}}>{selected.size} selected</span>
            <select className="form-input form-select" value={bulkPartner} onChange={e=>setBulkPartner(e.target.value)} style={{maxWidth:280,fontSize:13,padding:'6px 32px 6px 10px'}}>
              <option value="">— Assign to partner —</option>
              {partners.map(p=><option key={p.id} value={p.id}>{p.full_name||p.email}{p.company?` · ${p.company}`:''}</option>)}
            </select>
            <button className="btn btn-primary btn-sm" onClick={bulkAssign} disabled={!bulkPartner||bulkSaving} style={{whiteSpace:'nowrap'}}>
              {bulkSaving?<span className="spinner" style={{width:14,height:14,borderWidth:2}}/>:`Assign ${selected.size} order${selected.size>1?'s':''}`}
            </button>
            <button className="btn btn-secondary btn-sm" onClick={()=>{setSelected(new Set());setBulkMsg(null)}}>Clear</button>
            {bulkMsg&&<span className={`pill pill-${bulkMsg.type==='success'?'green':'red'}`} style={{fontSize:12}}>{bulkMsg.text}</span>}
          </div>
        )}

        {/* Filters */}
        <div style={{display:'flex',gap:12,marginBottom:8,flexWrap:'wrap',alignItems:'center'}}>
          <input className="form-input" placeholder="Search domain, product, order ID…" value={search} onChange={e=>setSearch(e.target.value)} style={{maxWidth:280}}/>
        </div>
        <div style={{display:'flex',gap:0,borderBottom:'1px solid var(--border)',marginBottom:14,overflowX:'auto'}}>
          {cats.map(c=>(
            <button key={c.k} onClick={()=>setFilter(c.k)} className={`cat-tab ${filter===c.k?'active':''}`} style={{padding:'6px 12px',fontSize:12,whiteSpace:'nowrap'}}>{c.l}</button>
          ))}
        </div>

        <div className="card" style={{padding:0,overflow:'hidden'}}>
          {loading?(
            <div style={{textAlign:'center',padding:40}}><div className="spinner" style={{margin:'0 auto'}}/></div>
          ):filtered.length===0?(
            <div className="empty-state" style={{padding:40}}>
              <h3>{orders.length===0?'No orders yet':'No matching orders'}</h3>
              <p style={{fontSize:13,marginBottom:16}}>{orders.length===0?'Click Sync to pull from GoGetSSL.':'Try a different filter or search.'}</p>
              {orders.length===0&&<button className="btn btn-primary btn-sm" onClick={syncFromAPI}>↻ Sync now</button>}
            </div>
          ):(
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th style={{width:44,padding:'8px 4px 8px 16px'}}>
                      <input type="checkbox" checked={allChecked}
                        ref={el=>{if(el)el.indeterminate=someChecked}}
                        onChange={toggleAll} style={{cursor:'pointer',width:15,height:15}}/>
                    </th>
                    <th style={{cursor:'pointer',userSelect:'none',whiteSpace:'nowrap',minWidth:110}} onClick={()=>setSortDir(d=>d==='desc'?'asc':'desc')}>
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
                  {filtered.map(o=>{
                    const isSelected = selected.has(o.id)
                    return (
                      <tr key={o.id} style={{background:isSelected?'var(--blue-sky)':undefined,cursor:'pointer'}} onClick={()=>setDrawer(o)}>
                        <td style={{padding:'10px 4px 10px 16px'}} onClick={e=>e.stopPropagation()}>
                          <input type="checkbox" checked={isSelected} onChange={e=>toggleOne(o.id,e)} onClick={e=>e.stopPropagation()} style={{cursor:'pointer',width:15,height:15}}/>
                        </td>
                        <td onClick={e=>{e.stopPropagation();setDrawer(o)}}>
                          <span style={{color:'var(--blue-accent)',fontFamily:'monospace',fontSize:13,fontWeight:600,cursor:'pointer'}}>#{o.gogetssl_order_id||'—'}</span>
                        </td>
                        <td style={{fontSize:13,maxWidth:200}}>{resolveProduct(o)}</td>
                        <td><span className="mono" style={{fontSize:12}}>{o.domain||'—'}</span></td>
                        <td style={{fontSize:12,color:'var(--ink-muted)'}}>{resolveCA(o)}</td>
                        <td><span className={`pill pill-${SP[o.status]||'gray'}`} style={{fontSize:11}}>{o.status}</span></td>
                        <td>
                          {o.is_automation?<span className="pill pill-blue" style={{fontSize:11}}>Automation</span>
                            :<span className="pill pill-gray" style={{fontSize:11}}>Standard</span>}
                        </td>
                        <td style={{fontSize:13}}>
                          {o.partner?<span style={{color:'var(--ink-mid)'}}>{o.partner.full_name||o.partner.email}</span>
                            :<span style={{color:'var(--amber)',fontWeight:500,fontSize:12}}>Unassigned</span>}
                        </td>
                        <td style={{fontSize:12,color:'var(--ink-muted)',whiteSpace:'nowrap'}}>
                          {o.next_renewal&&o.next_renewal!=='0000-00-00'?new Date(o.next_renewal).toLocaleDateString('en-GB'):'—'}
                        </td>
                        <td onClick={e=>e.stopPropagation()}>
                          <button onClick={()=>setDrawer(o)} className="btn btn-secondary btn-sm" style={{fontSize:11,padding:'4px 10px'}}>Details</button>
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

      {drawer && (
        <OrderDrawer
          order={drawer}
          partners={partners}
          onClose={()=>setDrawer(null)}
          onRefresh={loadData}
        />
      )}
    </DashShell>
  )
}
