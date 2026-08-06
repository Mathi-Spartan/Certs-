import { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabase'

const SP = { active:'green', issued:'green', cancelled:'red', revoked:'red', expired:'red', pending:'amber', incomplete:'amber', processing:'blue' }
const V1_NAMES = {31:'RapidSSL DV',32:'RapidSSL Wildcard',33:'GeoTrust DV',34:'GeoTrust OV Wildcard',35:'GeoTrust EV',36:'GeoTrust OV',50:'Thawte SSL OV',51:'Thawte SSL EV',65:'DigiCert Secure Site OV',66:'DigiCert Secure Site EV',67:'DigiCert Secure Site Pro OV',68:'DigiCert Secure Site Pro EV',175:'DigiCert Basic EV',176:'DigiCert Basic OV'}

export function resolveProduct(o) {
  const r = o?.api_response
  if (!r) return o?.product_name || '—'
  if (r.product_name) return r.product_name
  return V1_NAMES[r.product_id] || o?.product_name || (r.product_id ? `Product #${r.product_id}` : '—')
}
export function resolveCA(o) {
  return o?.api_response?.ca_name || o?.ca || 'GoGetSSL'
}

export default function OrderDrawer({ order, partners, onClose, onRefresh }) {
  const [ld, setLd] = useState(null)
  const [loading, setLoading] = useState(true)
  const [actionMsg, setActionMsg] = useState(null)
  const [cancelConfirm, setCancelConfirm] = useState(false)
  // Generate certificate wizard
  const [showGenerate, setShowGenerate] = useState(false)
  const [genStep, setGenStep] = useState(1) // 1=CSR, 2=DCV, 3=confirm
  const [csr, setCsr] = useState('')
  const [csrInfo, setCsrInfo] = useState(null)
  const [csrDecoding, setCsrDecoding] = useState(false)
  const [dcvMethod, setDcvMethod] = useState('http')
  const [approverEmails, setApproverEmails] = useState([])
  const [approverEmail, setApproverEmail] = useState('')
  const [emailsLoading, setEmailsLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const panelRef = useRef(null)

  useEffect(() => { fetchLive() }, [order?.gogetssl_order_id])

  async function fetchLive() {
    if (!order) return
    setLoading(true); setLd(null); setActionMsg(null); setCancelConfirm(false); setShowGenerate(false); setGenStep(1)
    try {
      const res = await fetch('/api/order-action', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'status', order_id: order.gogetssl_order_id })
      })
      const data = await res.json()
      if (data.result) setLd(data.result)
    } catch(e) { console.error(e) }
    setLoading(false)
  }

  async function decodeCsr(text) {
    if (!text || text.length < 50) return
    setCsrDecoding(true)
    try {
      const res = await fetch('/api/order-action', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ action:'decode_csr', order_id: order.gogetssl_order_id, csr: text })
      })
      const data = await res.json()
      if (data.result && !data.result.error) setCsrInfo(data.result)
    } catch(e) {}
    setCsrDecoding(false)
  }

  async function loadEmails(domain) {
    if (!domain) return
    setEmailsLoading(true)
    try {
      const res = await fetch('/api/order-action', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ action:'domain_emails', order_id: order.gogetssl_order_id, domain })
      })
      const data = await res.json()
      const emails = data.result?.emails || []
      setApproverEmails(emails)
      if (emails.length) setApproverEmail(emails[0])
    } catch(e) {}
    setEmailsLoading(false)
  }

  async function doGenerate() {
    setGenerating(true); setActionMsg(null)
    try {
      const domain = csrInfo?.cn || ld?.domain || ''
      const res = await fetch('/api/order-action', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          action:'generate', order_id: order.gogetssl_order_id,
          csr, dcv_method: dcvMethod,
          approver_email: dcvMethod === 'email' ? approverEmail : undefined,
          domain, webserver_type: '2'
        })
      })
      const data = await res.json()
      const r = data.result || {}
      if (r.error || r.success === false) {
        setActionMsg({ type:'error', text: r.message || JSON.stringify(r) })
      } else {
        setActionMsg({ type:'success', text: '✓ Certificate generation submitted. Status will update shortly.' })
        setShowGenerate(false)
        fetchLive(); onRefresh?.()
      }
    } catch(e) { setActionMsg({ type:'error', text: e.message }) }
    setGenerating(false)
  }

  async function doAction(action, extra={}) {
    setActionMsg({ type:'info', text:`Running ${action}…` })
    try {
      const res = await fetch('/api/order-action', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ action, order_id: order.gogetssl_order_id, ...extra })
      })
      const data = await res.json()
      const r = data.result || {}
      if (r.error || r.success === false) setActionMsg({ type:'error', text: r.message || JSON.stringify(r) })
      else { setActionMsg({ type:'success', text:`✓ ${action} completed` }); fetchLive(); onRefresh?.() }
    } catch(e) { setActionMsg({ type:'error', text: e.message }) }
  }

  function download(text, filename) {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([text], { type:'application/x-pem-file' }))
    a.download = filename; a.click()
  }

  function copyText(text) {
    navigator.clipboard.writeText(text).catch(() => {})
  }

  const hasCert = ld?.crt_code && ld.crt_code.length > 10
  const hasCa = ld?.ca_code && ld.ca_code.length > 10
  const hasCSR = ld?.csr_code && ld.csr_code.length > 10
  const canCancel = ld && !['cancelled','revoked','expired'].includes(ld.status)
  const canReissue = ld?.reissue === 1 || ld?.reissue_now === 1
  const isIncomplete = ld?.status === 'incomplete'
  const isPending = ld?.status === 'pending'
  const isActive = ['active','issued'].includes(ld?.status)
  const gogetssId = order?.api_response?.partner_order_id || order?.api_response?.internal_id

  return (
    <>
      {/* Scrim */}
      <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.4)',zIndex:200}} onClick={onClose} />
      {/* Panel */}
      <div ref={panelRef} style={{position:'fixed',top:0,right:0,bottom:0,width:'min(620px,100vw)',background:'var(--white)',zIndex:201,display:'flex',flexDirection:'column',boxShadow:'-6px 0 32px rgba(0,0,0,.18)'}}>
        
        {/* Header */}
        <div style={{padding:'14px 20px',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',gap:12,flexShrink:0,background:'var(--white)'}}>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontWeight:700,fontSize:15,display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
              <span>Order <span className="mono">#{order?.gogetssl_order_id}</span></span>
              {ld && <span className={`pill pill-${SP[ld.status]||'gray'}`} style={{fontSize:11}}>{ld.status}</span>}
            </div>
            <div style={{fontSize:12,color:'var(--ink-muted)',marginTop:2}}>{resolveProduct(order)} · {resolveCA(order)}</div>
          </div>
          {/* GoGetSSL portal link */}
          <a href={`https://my.gogetssl.com/en/certificates/${order?.gogetssl_order_id}`} target="_blank" rel="noreferrer"
            className="btn btn-secondary btn-sm" style={{fontSize:11,whiteSpace:'nowrap'}}>
            Open in GoGetSSL ↗
          </a>
          <button onClick={onClose} style={{fontSize:24,color:'var(--ink-muted)',lineHeight:1,padding:'0 4px',flexShrink:0}}>×</button>
        </div>

        {/* Scrollable body */}
        <div style={{flex:1,overflow:'auto',padding:20}}>
          {loading && (
            <div style={{textAlign:'center',padding:40}}>
              <div className="spinner" style={{margin:'0 auto 10px'}}/>
              <p style={{fontSize:13,color:'var(--ink-muted)'}}>Loading live data from GoGetSSL…</p>
            </div>
          )}

          {actionMsg && (
            <div className={`alert alert-${actionMsg.type==='success'?'success':actionMsg.type==='error'?'error':'info'}`}
              style={{marginBottom:14,display:'flex',justifyContent:'space-between',gap:8}}>
              <span style={{fontSize:13,flex:1,wordBreak:'break-word'}}>{actionMsg.text}</span>
              <button onClick={()=>setActionMsg(null)} style={{opacity:.5,fontSize:16,lineHeight:1,flexShrink:0}}>×</button>
            </div>
          )}

          {/* INCOMPLETE — Generate certificate wizard */}
          {!loading && ld && isIncomplete && !showGenerate && (
            <div style={{background:'#fffbeb',border:'1px solid #f59e0b',borderRadius:10,padding:'16px 18px',marginBottom:18,display:'flex',gap:14,alignItems:'flex-start'}}>
              <div style={{fontSize:28,flexShrink:0}}>⚠️</div>
              <div>
                <div style={{fontWeight:600,color:'#92400e',marginBottom:4}}>Awaiting configuration — action needed</div>
                <p style={{fontSize:13,color:'#78350f',marginBottom:12}}>This order is incomplete. Submit your CSR, select a domain validation method, and the certificate will be issued after validation.</p>
                <button className="btn btn-primary btn-sm" onClick={()=>setShowGenerate(true)} style={{background:'#d97706',borderColor:'#d97706'}}>
                  ⚙ Generate Certificate
                </button>
              </div>
            </div>
          )}

          {/* Generate certificate wizard */}
          {showGenerate && (
            <div style={{border:'2px solid var(--blue-accent)',borderRadius:12,padding:20,marginBottom:18}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
                <h3 style={{fontSize:15}}>Generate Certificate</h3>
                <button onClick={()=>{setShowGenerate(false);setGenStep(1);setCsrInfo(null)}} style={{opacity:.5,fontSize:18}}>×</button>
              </div>

              {/* Step indicators */}
              <div style={{display:'flex',gap:0,marginBottom:20,borderBottom:'1px solid var(--border)'}}>
                {['CSR','Validation','Confirm'].map((s,i)=>(
                  <div key={s} style={{padding:'6px 16px',fontSize:12,fontWeight:500,color:genStep===i+1?'var(--blue-accent)':'var(--ink-muted)',borderBottom:genStep===i+1?'2px solid var(--blue-accent)':'2px solid transparent',cursor:'pointer'}} onClick={()=>genStep>i+1&&setGenStep(i+1)}>
                    {i+1}. {s}
                  </div>
                ))}
              </div>

              {/* Step 1: CSR */}
              {genStep === 1 && (
                <div>
                  <div className="form-label" style={{marginBottom:6}}>Paste your CSR (Certificate Signing Request)</div>
                  <textarea
                    className="form-input"
                    value={csr}
                    onChange={e => { setCsr(e.target.value); setCsrInfo(null) }}
                    onBlur={e => decodeCsr(e.target.value)}
                    placeholder="-----BEGIN CERTIFICATE REQUEST-----&#10;...&#10;-----END CERTIFICATE REQUEST-----"
                    style={{height:160,fontFamily:'monospace',fontSize:11,resize:'vertical'}}
                  />
                  {csrDecoding && <p style={{fontSize:12,color:'var(--ink-muted)',marginTop:6}}>Decoding CSR…</p>}
                  {csrInfo && !csrInfo.error && (
                    <div style={{marginTop:10,background:'var(--green-bg)',border:'1px solid rgba(22,163,74,.2)',borderRadius:8,padding:'10px 14px'}}>
                      <div style={{fontWeight:500,fontSize:13,color:'var(--green-text)',marginBottom:4}}>✓ Valid CSR</div>
                      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6,fontSize:12,color:'var(--ink-mid)'}}>
                        {csrInfo.cn&&<span><strong>CN:</strong> {csrInfo.cn}</span>}
                        {csrInfo.o&&<span><strong>Org:</strong> {csrInfo.o}</span>}
                        {csrInfo.c&&<span><strong>Country:</strong> {csrInfo.c}</span>}
                        {csrInfo.key_size&&<span><strong>Key:</strong> {csrInfo.key_size}-bit {csrInfo.key_type||'RSA'}</span>}
                      </div>
                    </div>
                  )}
                  {csrInfo?.error && (
                    <div className="alert alert-error" style={{marginTop:8,fontSize:12}}>Invalid CSR: {csrInfo.message||csrInfo.error}</div>
                  )}
                  <div style={{marginTop:14,display:'flex',justifyContent:'flex-end'}}>
                    <button className="btn btn-primary btn-sm" disabled={!csr.includes('BEGIN CERTIFICATE')}
                      onClick={()=>{ setGenStep(2); const domain = csrInfo?.cn||ld?.domain; if(domain) loadEmails(domain) }}>
                      Next: Choose Validation →
                    </button>
                  </div>
                </div>
              )}

              {/* Step 2: DCV method */}
              {genStep === 2 && (
                <div>
                  <div className="form-label" style={{marginBottom:10}}>Domain Validation (DCV) method</div>
                  <div style={{display:'flex',flexDirection:'column',gap:10,marginBottom:16}}>
                    {[
                      { v:'http', label:'HTTP file validation', desc:'Place a verification file on your web server at a specific URL. Fastest method.' },
                      { v:'https', label:'HTTPS file validation', desc:'Same as HTTP but uses HTTPS. Requires a working SSL/TLS certificate already.' },
                      { v:'dns', label:'DNS CNAME validation', desc:'Add a CNAME record to your DNS. Works even if the site is not live.' },
                      { v:'email', label:'Email validation', desc:'An approval email is sent to a domain admin address. You click a link to approve.' },
                    ].map(opt=>(
                      <label key={opt.v} style={{display:'flex',gap:10,padding:'12px 14px',border:`1.5px solid ${dcvMethod===opt.v?'var(--blue-accent)':'var(--border)'}`,borderRadius:8,cursor:'pointer',background:dcvMethod===opt.v?'var(--blue-sky)':'var(--white)'}}>
                        <input type="radio" name="dcv" value={opt.v} checked={dcvMethod===opt.v} onChange={e=>{setDcvMethod(e.target.value);if(e.target.value==='email'){const domain=csrInfo?.cn||ld?.domain;if(domain)loadEmails(domain)}}} style={{marginTop:2,flexShrink:0}}/>
                        <div>
                          <div style={{fontWeight:600,fontSize:13}}>{opt.label}</div>
                          <div style={{fontSize:12,color:'var(--ink-muted)',marginTop:2}}>{opt.desc}</div>
                        </div>
                      </label>
                    ))}
                  </div>

                  {/* Email picker */}
                  {dcvMethod === 'email' && (
                    <div className="form-group">
                      <label className="form-label">Approver email address</label>
                      {emailsLoading ? <p style={{fontSize:13,color:'var(--ink-muted)'}}>Loading available emails…</p> : (
                        <select className="form-input form-select" value={approverEmail} onChange={e=>setApproverEmail(e.target.value)}>
                          {approverEmails.length===0 && <option>No emails found for domain</option>}
                          {approverEmails.map(e=><option key={e} value={e}>{e}</option>)}
                        </select>
                      )}
                    </div>
                  )}

                  <div style={{marginTop:14,display:'flex',gap:8,justifyContent:'flex-end'}}>
                    <button className="btn btn-secondary btn-sm" onClick={()=>setGenStep(1)}>← Back</button>
                    <button className="btn btn-primary btn-sm" onClick={()=>setGenStep(3)}>Next: Confirm →</button>
                  </div>
                </div>
              )}

              {/* Step 3: Confirm */}
              {genStep === 3 && (
                <div>
                  <div style={{background:'var(--canvas)',borderRadius:8,padding:'14px 16px',marginBottom:16}}>
                    <div style={{fontWeight:600,fontSize:13,marginBottom:10}}>Summary</div>
                    <div style={{display:'grid',gridTemplateColumns:'120px 1fr',gap:'6px 12px',fontSize:13}}>
                      <span style={{color:'var(--ink-muted)'}}>Order</span><span className="mono">#{order?.gogetssl_order_id}</span>
                      <span style={{color:'var(--ink-muted)'}}>Domain</span><span className="mono">{csrInfo?.cn||ld?.domain||'—'}</span>
                      <span style={{color:'var(--ink-muted)'}}>CSR key</span><span>{csrInfo?.key_size||'?'}-bit {csrInfo?.key_type||'RSA'}</span>
                      <span style={{color:'var(--ink-muted)'}}>DCV method</span><span style={{textTransform:'uppercase',fontWeight:600}}>{dcvMethod}</span>
                      {dcvMethod==='email'&&<><span style={{color:'var(--ink-muted)'}}>Approver email</span><span className="mono">{approverEmail}</span></>}
                    </div>
                  </div>

                  {dcvMethod==='http'&&<div className="alert alert-info" style={{fontSize:13,marginBottom:14}}>After submitting, GoGetSSL will check for a file at <strong>http://{csrInfo?.cn||'yourdomain.com'}/.well-known/pki-validation/...</strong>. The exact filename and content will be visible in the order status.</div>}
                  {dcvMethod==='dns'&&<div className="alert alert-info" style={{fontSize:13,marginBottom:14}}>After submitting, add the CNAME record shown in the order status to your DNS. Changes may take up to 48 hours to propagate.</div>}
                  {dcvMethod==='email'&&<div className="alert alert-info" style={{fontSize:13,marginBottom:14}}>An approval email will be sent to <strong>{approverEmail}</strong>. Check your inbox and click the approval link.</div>}

                  <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
                    <button className="btn btn-secondary btn-sm" onClick={()=>setGenStep(2)}>← Back</button>
                    <button className="btn btn-primary btn-sm" onClick={doGenerate} disabled={generating}
                      style={{minWidth:140,justifyContent:'center'}}>
                      {generating?<><span className="spinner" style={{width:14,height:14,borderWidth:2}}/>Submitting…</>:'⚙ Generate Certificate'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Order detail info grid */}
          {!loading && ld && (
            <>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:18}}>
                {[
                  ['GoGetSSL ID', '#'+ld.order_id, true],
                  ['Internal ID', ld.internal_id||'—', true],
                  ['Status', ld.status||'—', false],
                  ['DCV Status', ld.dcv_status===2?'✓ Verified':ld.dcv_status===1?'Pending':ld.dcv_status===0?'Not set':'—', false],
                  ['Domain', ld.domain||'—', true],
                  ['Product ID', ld.product_id?`${ld.product_id} — ${V1_NAMES[ld.product_id]||''}`:' —', false],
                  ['Valid from', ld.valid_from&&ld.valid_from!=='0000-00-00'?ld.valid_from:'—', false],
                  ['Valid till', ld.valid_till&&ld.valid_till!=='0000-00-00'?ld.valid_till:'—', false],
                  ['DCV method', ld.dcv_method||'—', false],
                  ['Server count', ld.server_count??'—', false],
                  ['Validity period', ld.validity_period?`${ld.validity_period} months`:'—', false],
                  ['Webserver type', ld.webserver_type||'—', false],
                ].map(([k,v,mono])=>(
                  <div key={k} style={{background:'var(--canvas)',borderRadius:7,padding:'10px 12px'}}>
                    <div style={{fontSize:11,color:'var(--ink-muted)',marginBottom:3}}>{k}</div>
                    <div style={{fontSize:13,fontWeight:500,wordBreak:'break-all'}} className={mono?'mono':''}>{String(v||'—')}</div>
                  </div>
                ))}
              </div>

              {/* SAN */}
              {ld.san?.length>0&&(
                <div style={{marginBottom:14}}>
                  <div style={{fontSize:11,fontWeight:600,color:'var(--ink-muted)',letterSpacing:'.07em',marginBottom:6}}>SAN DOMAINS</div>
                  <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
                    {ld.san.map((s,i)=><span key={i} className="mono" style={{background:'var(--canvas)',padding:'3px 8px',borderRadius:5,fontSize:12}}>{s}</span>)}
                  </div>
                </div>
              )}

              {/* Validation info for pending orders */}
              {isPending && ld.validation_description && (
                <div style={{background:'#fffbeb',border:'1px solid #f59e0b',borderRadius:10,padding:'14px 16px',marginBottom:14}}>
                  <div style={{fontWeight:600,color:'#92400e',marginBottom:6}}>Validation in progress</div>
                  <p style={{fontSize:13,color:'#78350f'}}>{ld.validation_description}</p>
                  <div style={{marginTop:10,display:'flex',gap:8,flexWrap:'wrap'}}>
                    <button className="btn btn-secondary btn-sm" onClick={()=>doAction('resend_email')}>✉ Resend validation email</button>
                    <button className="btn btn-secondary btn-sm" onClick={()=>doAction('recheck_caa')}>↻ Recheck CAA</button>
                  </div>
                </div>
              )}

              {/* CA message */}
              {ld.admin_msg&&<div className="alert alert-info" style={{marginBottom:14,fontSize:13}}><strong>CA message:</strong> {ld.admin_msg}</div>}

              {/* Actions bar */}
              <div style={{borderTop:'1px solid var(--border)',paddingTop:14,marginBottom:16}}>
                <div style={{fontSize:11,fontWeight:600,color:'var(--ink-muted)',letterSpacing:'.07em',marginBottom:10}}>ACTIONS</div>
                <div style={{display:'flex',flexWrap:'wrap',gap:8}}>
                  {/* Generate (incomplete) */}
                  {isIncomplete&&!showGenerate&&(
                    <button className="btn btn-primary btn-sm" onClick={()=>setShowGenerate(true)} style={{background:'#d97706'}}>⚙ Generate Certificate</button>
                  )}
                  {/* Download cert */}
                  {hasCert&&<>
                    <button className="btn btn-secondary btn-sm" onClick={()=>download(ld.crt_code,`cert_${ld.order_id}.crt`)}>↓ Download Certificate</button>
                    {hasCa&&<button className="btn btn-secondary btn-sm" onClick={()=>download(ld.ca_code,`ca_${ld.order_id}.crt`)}>↓ Download CA Bundle</button>}
                  </>}
                  {/* Resend validation */}
                  {isPending&&<button className="btn btn-secondary btn-sm" onClick={()=>doAction('resend_email')}>✉ Resend Validation Email</button>}
                  {/* Reissue */}
                  {canReissue&&!isIncomplete&&(
                    <button className="btn btn-secondary btn-sm" onClick={()=>setShowGenerate(true)}>↺ Reissue Certificate</button>
                  )}
                  {/* Cancel */}
                  {canCancel&&!cancelConfirm&&(
                    <button className="btn btn-danger btn-sm" onClick={()=>setCancelConfirm(true)}>Cancel Order</button>
                  )}
                  {/* GoGetSSL portal fallback */}
                  <a href={`https://my.gogetssl.com/en/certificates/${order?.gogetssl_order_id}`} target="_blank" rel="noreferrer"
                    className="btn btn-secondary btn-sm">Open in GoGetSSL portal ↗</a>
                </div>

                {cancelConfirm&&(
                  <div style={{marginTop:10,background:'var(--red-bg)',padding:'12px 14px',borderRadius:8,border:'1px solid rgba(220,38,38,.2)',display:'flex',gap:10,alignItems:'center',flexWrap:'wrap'}}>
                    <span style={{fontSize:13,color:'var(--red-text)',flex:1}}>Cancel order #{order?.gogetssl_order_id}? This cannot be undone.</span>
                    <button className="btn btn-danger btn-sm" onClick={()=>doAction('cancel',{reason:'end'})}>Confirm cancel</button>
                    <button className="btn btn-secondary btn-sm" onClick={()=>setCancelConfirm(false)}>No, keep</button>
                  </div>
                )}
              </div>

              {/* Certificate / CSR text */}
              {hasCert&&(
                <div style={{marginBottom:14}}>
                  <div style={{fontSize:11,fontWeight:600,color:'var(--ink-muted)',letterSpacing:'.07em',marginBottom:6}}>CERTIFICATE</div>
                  <textarea readOnly value={ld.crt_code} style={{width:'100%',height:110,fontFamily:'monospace',fontSize:11,padding:8,border:'1px solid var(--border)',borderRadius:7,background:'var(--canvas)',resize:'vertical'}}/>
                  <div style={{display:'flex',gap:6,marginTop:6}}>
                    <button onClick={()=>copyText(ld.crt_code)} className="btn btn-secondary btn-sm">Copy</button>
                    <button onClick={()=>download(ld.crt_code,`cert_${ld.order_id}.crt`)} className="btn btn-secondary btn-sm">Download</button>
                  </div>
                </div>
              )}
              {hasCa&&(
                <div style={{marginBottom:14}}>
                  <div style={{fontSize:11,fontWeight:600,color:'var(--ink-muted)',letterSpacing:'.07em',marginBottom:6}}>CA BUNDLE</div>
                  <textarea readOnly value={ld.ca_code} style={{width:'100%',height:90,fontFamily:'monospace',fontSize:11,padding:8,border:'1px solid var(--border)',borderRadius:7,background:'var(--canvas)',resize:'vertical'}}/>
                  <div style={{display:'flex',gap:6,marginTop:6}}>
                    <button onClick={()=>copyText(ld.ca_code)} className="btn btn-secondary btn-sm">Copy</button>
                    <button onClick={()=>download(ld.ca_code,`ca_${ld.order_id}.crt`)} className="btn btn-secondary btn-sm">Download</button>
                  </div>
                </div>
              )}
              {hasCSR&&(
                <div style={{marginBottom:14}}>
                  <div style={{fontSize:11,fontWeight:600,color:'var(--ink-muted)',letterSpacing:'.07em',marginBottom:6}}>CSR ON FILE</div>
                  <textarea readOnly value={ld.csr_code} style={{width:'100%',height:90,fontFamily:'monospace',fontSize:11,padding:8,border:'1px solid var(--border)',borderRadius:7,background:'var(--canvas)',resize:'vertical'}}/>
                  <button onClick={()=>copyText(ld.csr_code)} className="btn btn-secondary btn-sm" style={{marginTop:6}}>Copy</button>
                </div>
              )}

              {/* Assign to partner */}
              <div style={{borderTop:'1px solid var(--border)',paddingTop:14}}>
                <div style={{fontSize:11,fontWeight:600,color:'var(--ink-muted)',letterSpacing:'.07em',marginBottom:8}}>ASSIGN TO PARTNER</div>
                <div style={{display:'flex',gap:8}}>
                  <select className="form-input form-select" id="dp-partner" defaultValue={order?.assigned_to||''} style={{flex:1,fontSize:13,padding:'7px 32px 7px 10px'}}>
                    <option value="">— No partner —</option>
                    {partners.map(p=><option key={p.id} value={p.id}>{p.full_name||p.email}{p.company?` · ${p.company}`:''}</option>)}
                  </select>
                  <button className="btn btn-primary btn-sm" onClick={async()=>{
                    const val=document.getElementById('dp-partner').value
                    await supabase.from('orders').update({assigned_to:val||null,assigned_at:val?new Date().toISOString():null}).eq('id',order?.id)
                    setActionMsg({type:'success',text:'✓ Partner assignment saved'})
                    onRefresh?.()
                  }}>Save</button>
                </div>
              </div>
            </>
          )}

          {!loading && !ld && (
            <div className="empty-state" style={{paddingTop:20}}>
              <p style={{fontSize:13}}>Could not load live data. <a href={`https://my.gogetssl.com/en/certificates/${order?.gogetssl_order_id}`} target="_blank" rel="noreferrer" style={{color:'var(--blue-accent)'}}>View in GoGetSSL portal →</a></p>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
