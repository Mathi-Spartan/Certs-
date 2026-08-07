import { resolveProductName, resolveCAName } from '../productMap'
import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import DashShell from '../components/DashShell'
import OrderDrawer, { resolveProduct, resolveCA } from '../components/OrderDrawer'
import { supabase } from '../supabase'

const SP = { active:'green', issued:'green', cancelled:'red', revoked:'red', expired:'gray', pending:'amber', incomplete:'amber', processing:'blue' }

const FILTERS = [
  { key:'all',        label:'All orders',         color:'#3375b1' },
  { key:'active',     label:'Active / Issued',    color:'#16a34a' },
  { key:'pending',    label:'Pending',            color:'#2563eb' },
  { key:'incomplete', label:'Incomplete',         color:'#d97706' },
  { key:'expiring',   label:'Expiring soon',      color:'#ea580c' },
  { key:'cancelled',  label:'Cancelled',          color:'#dc2626' },
  { key:'expired',    label:'Expired',            color:'#9ca3af' },
  { key:'automation', label:'Automation',         color:'#7c3aed' },
  { key:'unassigned', label:'Unassigned',         color:'#b45309' },
]

export default function AdminDash() {
  const [orders, setOrders] = useState([])
  const [partners, setPartners] = useState([])
  const [partnerCount, setPartnerCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [activeFilter, setActiveFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [drawer, setDrawer] = useState(null)
  const [sortDir, setSortDir] = useState('desc')

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    const [{ data: ord }, { data: par }, { count: pCount }] = await Promise.all([
      supabase.from('orders')
        .select('*, partner:profiles!orders_assigned_to_fkey(full_name,email)')
        .order('gogetssl_order_id', { ascending: false }),
      supabase.from('profiles').select('id,full_name,email,company').eq('role','partner').order('full_name'),
      supabase.from('profiles').select('*', { count:'exact', head:true }).eq('role','partner'),
    ])
    setOrders(ord || [])
    setPartners(par || [])
    setPartnerCount(pCount || 0)
    setLoading(false)
  }

  const total = orders.length
  const now = new Date()

  function getCount(key) {
    if (key === 'all') return total
    if (key === 'active') return orders.filter(o => ['active','issued'].includes(o.status)).length
    if (key === 'pending') return orders.filter(o => ['pending','processing'].includes(o.status)).length
    if (key === 'incomplete') return orders.filter(o => o.status === 'incomplete').length
    if (key === 'expiring') return orders.filter(o => {
      if (!o.next_renewal || o.next_renewal === '0000-00-00') return false
      const d = (new Date(o.next_renewal) - now) / 86400000
      return d > 0 && d <= 30 && ['active','issued'].includes(o.status)
    }).length
    if (key === 'cancelled') return orders.filter(o => ['cancelled','revoked'].includes(o.status)).length
    if (key === 'expired') return orders.filter(o => o.status === 'expired').length
    if (key === 'automation') return orders.filter(o => o.is_automation).length
    if (key === 'unassigned') return orders.filter(o => !o.assigned_to).length
    return 0
  }

  function applyFilter(list, key) {
    if (key === 'all') return list
    if (key === 'active') return list.filter(o => ['active','issued'].includes(o.status))
    if (key === 'pending') return list.filter(o => ['pending','processing'].includes(o.status))
    if (key === 'incomplete') return list.filter(o => o.status === 'incomplete')
    if (key === 'expiring') return list.filter(o => {
      if (!o.next_renewal || o.next_renewal === '0000-00-00') return false
      const d = (new Date(o.next_renewal) - now) / 86400000
      return d > 0 && d <= 30 && ['active','issued'].includes(o.status)
    })
    if (key === 'cancelled') return list.filter(o => ['cancelled','revoked'].includes(o.status))
    if (key === 'expired') return list.filter(o => o.status === 'expired')
    if (key === 'automation') return list.filter(o => o.is_automation)
    if (key === 'unassigned') return list.filter(o => !o.assigned_to)
    return list
  }

  const filtered = (() => {
    let list = applyFilter(orders, activeFilter)
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(o =>
        String(o.gogetssl_order_id).includes(q) ||
        o.domain?.toLowerCase().includes(q) ||
        resolveProductName(o).toLowerCase().includes(q) ||
        o.status?.toLowerCase().includes(q)
      )
    }
    list = [...list].sort((a,b) => {
      const av = a.gogetssl_order_id||0, bv = b.gogetssl_order_id||0
      return sortDir==='desc' ? bv-av : av-bv
    })
    return list
  })()

  const activeFilterMeta = FILTERS.find(f => f.key === activeFilter)

  return (
    <DashShell>
      <div className="dash-topbar">
        <div>
          <div style={{fontWeight:700,fontSize:'1.05rem'}}>Dashboard</div>
          <div style={{fontSize:12,color:'var(--ink-muted)',marginTop:1}}>
            {total} orders · {partnerCount} partners · {getCount('automation')} automation
          </div>
        </div>
        <div style={{display:'flex',gap:8}}>
          <Link to="/admin/partners" className="btn btn-secondary btn-sm">Partners</Link>
          <Link to="/admin/orders" className="btn btn-primary btn-sm">Full order view</Link>
        </div>
      </div>

      <div className="dash-content">

        {/* Compact filter pills row */}
        <div style={{
          display:'flex', gap:8, flexWrap:'wrap', marginBottom:20,
          padding:'14px 16px',
          background:'var(--white)',
          borderRadius:10,
          border:'1px solid var(--border)',
          boxShadow:'var(--shadow-sm)'
        }}>
          {FILTERS.map(f => {
            const count = getCount(f.key)
            const isActive = activeFilter === f.key
            return (
              <button
                key={f.key}
                onClick={() => { setActiveFilter(f.key); setSearch('') }}
                style={{
                  display:'flex', alignItems:'center', gap:6,
                  padding:'5px 12px',
                  borderRadius:20,
                  border: isActive ? `1.5px solid ${f.color}` : '1.5px solid var(--border)',
                  background: isActive ? f.color : 'var(--white)',
                  color: isActive ? '#fff' : count === 0 ? 'var(--ink-faint)' : 'var(--ink-mid)',
                  fontSize:12, fontWeight: isActive ? 600 : 400,
                  cursor:'pointer', transition:'all .12s',
                  whiteSpace:'nowrap'
                }}
              >
                <span>{f.label}</span>
                <span style={{
                  background: isActive ? 'rgba(255,255,255,.25)' : count === 0 ? 'var(--canvas)' : `${f.color}18`,
                  color: isActive ? '#fff' : f.color,
                  fontSize:11, fontWeight:700,
                  padding:'1px 6px', borderRadius:10,
                  minWidth:18, textAlign:'center'
                }}>{count}</span>
              </button>
            )
          })}

          {/* Search inline */}
          <div style={{marginLeft:'auto',display:'flex',alignItems:'center'}}>
            <input
              className="form-input"
              placeholder="Search…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{width:200,fontSize:12,padding:'5px 10px',height:32}}
            />
          </div>
        </div>

        {/* Results table */}
        <div className="card" style={{padding:0,overflow:'hidden'}}>
          <div style={{
            padding:'12px 20px',
            borderBottom:'1px solid var(--border)',
            display:'flex', alignItems:'center', justifyContent:'space-between',
            background:'var(--canvas)'
          }}>
            <div style={{fontSize:13,fontWeight:600}}>
              <span style={{color: activeFilterMeta?.color}}>{activeFilterMeta?.label}</span>
              <span style={{color:'var(--ink-muted)',fontWeight:400,marginLeft:6}}>{filtered.length} {filtered.length === 1 ? 'order' : 'orders'}</span>
            </div>
            <button
              onClick={() => setSortDir(d => d==='desc'?'asc':'desc')}
              style={{fontSize:12,color:'var(--ink-muted)',cursor:'pointer',display:'flex',alignItems:'center',gap:4,padding:'4px 8px',borderRadius:5,border:'1px solid var(--border)',background:'var(--white)'}}
            >
              Order ID {sortDir==='desc'?'↓':'↑'}
            </button>
          </div>

          {loading ? (
            <div style={{textAlign:'center',padding:48}}><div className="spinner" style={{margin:'0 auto'}}/></div>
          ) : filtered.length === 0 ? (
            <div style={{textAlign:'center',padding:'48px 20px',color:'var(--ink-muted)'}}>
              <div style={{fontSize:28,marginBottom:8}}>
                {activeFilter === 'active' ? '🎉' : activeFilter === 'expiring' ? '⏰' : '📋'}
              </div>
              <div style={{fontWeight:500,fontSize:14,color:'var(--ink-mid)',marginBottom:4}}>
                No {activeFilterMeta?.label.toLowerCase()} orders
              </div>
              <div style={{fontSize:13}}>
                {activeFilter === 'active' ? 'No active certificates in your account yet.' :
                 activeFilter === 'expiring' ? 'Great — no certificates expiring in the next 30 days.' :
                 'No orders match this filter.'}
              </div>
            </div>
          ) : (
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
              <thead>
                <tr style={{background:'var(--white)'}}>
                  {['Order ID','Product','Domain','CA','Status','Assigned to','Valid till',''].map(h => (
                    <th key={h} style={{
                      textAlign:'left', fontSize:11, fontWeight:600,
                      color:'var(--ink-muted)', padding:'8px 16px',
                      borderBottom:'1px solid var(--border)',
                      letterSpacing:'.04em', textTransform:'uppercase',
                      whiteSpace:'nowrap'
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((o, i) => {
                  const days = o.next_renewal && o.next_renewal !== '0000-00-00'
                    ? Math.ceil((new Date(o.next_renewal) - now) / 86400000) : null
                  const isExpiring = days !== null && days > 0 && days <= 30
                  return (
                    <tr
                      key={o.id}
                      style={{
                        borderBottom: i < filtered.length-1 ? '1px solid var(--border)' : 'none',
                        cursor:'pointer',
                        background: isExpiring ? '#fff9f5' : 'var(--white)'
                      }}
                      onClick={() => setDrawer(o)}
                      onMouseEnter={e => e.currentTarget.style.background='var(--blue-sky)'}
                      onMouseLeave={e => e.currentTarget.style.background = isExpiring ? '#fff9f5' : 'var(--white)'}
                    >
                      <td style={{padding:'10px 16px'}}>
                        <span style={{fontFamily:'monospace',fontWeight:700,color:'var(--blue-accent)',fontSize:13}}>
                          #{o.gogetssl_order_id||'—'}
                        </span>
                      </td>
                      <td style={{padding:'10px 16px',maxWidth:180,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                        {resolveProductName(o)}
                      </td>
                      <td style={{padding:'10px 16px'}}>
                        <span style={{fontFamily:'monospace',fontSize:12}}>{o.domain||'—'}</span>
                      </td>
                      <td style={{padding:'10px 16px',fontSize:12,color:'var(--ink-muted)'}}>{resolveCAName(o)}</td>
                      <td style={{padding:'10px 16px'}}>
                        <span className={`pill pill-${SP[o.status]||'gray'}`} style={{fontSize:11}}>{o.status}</span>
                        {isExpiring && <span style={{marginLeft:4,fontSize:10,color:'#ea580c',fontWeight:600}}>{days}d</span>}
                      </td>
                      <td style={{padding:'10px 16px',fontSize:12}}>
                        {o.partner
                          ? <span style={{color:'var(--ink-mid)'}}>{o.partner.full_name||o.partner.email}</span>
                          : <span style={{color:'var(--amber)',fontWeight:500}}>Unassigned</span>}
                      </td>
                      <td style={{padding:'10px 16px',fontSize:12,color:'var(--ink-muted)',whiteSpace:'nowrap'}}>
                        {o.next_renewal && o.next_renewal !== '0000-00-00'
                          ? new Date(o.next_renewal).toLocaleDateString('en-GB') : '—'}
                      </td>
                      <td style={{padding:'10px 16px'}}>
                        <button
                          onClick={e=>{e.stopPropagation();setDrawer(o)}}
                          className="btn btn-secondary btn-sm"
                          style={{fontSize:11,padding:'3px 10px'}}
                        >Details</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {drawer && (
        <OrderDrawer
          order={drawer}
          partners={partners}
          onClose={() => setDrawer(null)}
          onRefresh={loadData}
        />
      )}
    </DashShell>
  )
}
