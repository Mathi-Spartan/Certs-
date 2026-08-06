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
export function resolveCA(o) { return o?.api_response?.ca_name || o?.ca || 'GoGetSSL' }

function CopyBox({ label, value, mono = true }) {
  const [copied, setCopied] = useState(false)
  return (
    <div style={{marginBottom:12}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}}>
        <span style={{fontSize:11,fontWeight:600,color:'var(--ink-muted)',letterSpacing:'.06em'}}>{label}</span>
        <button onClick={()=>{navigator.clipboard.writeText(value);setCopied(true);setTimeout(()=>setCopied(false),1800)}}
          className="btn btn-secondary btn-sm" style={{fontSize:11,padding:'2px 10px'}}>
          {copied?'✓ Copied':'Copy'}
        </button>
      </div>
      <div style={{background:'var(--canvas)',border:'1px solid var(--border)',borderRadius:6,padding:'8px 12px',fontFamily:mono?'monospace':'inherit',fontSize:12,wordBreak:'break-all',lineHeight:1.5,color:'var(--ink-mid)'}}>
        {value}
      </div>
    </div>
  )
}

function DcvInstructions({ dcvMethod, approverMethod, domain }) {
  const am = approverMethod || {}

  if (dcvMethod === 'http' || dcvMethod === 'https') {
    const info = am.http || am.https || {}
    const link = info.link || ''
    const filename = info.filename || ''
    const content = info.content || ''
    const protocol = dcvMethod === 'https' ? 'https' : 'http'
    return (
      <div style={{background:'#f0f9ff',border:'1px solid #bae6fd',borderRadius:10,padding:'16px 18px'}}>
        <div style={{fontWeight:700,fontSize:14,color:'#0c4a6e',marginBottom:12}}>📁 {dcvMethod.toUpperCase()} File Validation — Instructions</div>
        <div style={{fontSize:13,color:'#075985',marginBottom:14}}>
          Create a text file on your web server at the exact path below. The CA will check this file to verify domain ownership.
        </div>
        <CopyBox label="FILE URL — place your file here" value={link || `${protocol}://${domain}/.well-known/pki-validation/${filename}`} />
        <CopyBox label="FILENAME" value={filename} />
        <CopyBox label="FILE CONTENT — exact text to put inside the file" value={content} />
        <div style={{fontSize:12,color:'#0369a1',background:'#e0f2fe',padding:'8px 12px',borderRadius:6,marginTop:4}}>
          <strong>Steps:</strong> 1. Create the directory <code>.well-known/pki-validation/</code> on your web root &nbsp;·&nbsp; 2. Create a file named <code>{filename}</code> &nbsp;·&nbsp; 3. Put the content above inside the file (no extra spaces or newlines) &nbsp;·&nbsp; 4. Verify it's reachable at the URL above &nbsp;·&nbsp; 5. The CA will check automatically within minutes.
        </div>
      </div>
    )
  }

  if (dcvMethod === 'dns') {
    const info = am.dns || {}
    const record = info.record || ''
    // Parse: "domain.   IN   TXT   "_token""
    const parts = record.split(/\s+/)
    const recordName = parts[0] || domain
    const recordValue = parts[parts.length - 1]?.replace(/"/g,'') || ''
    return (
      <div style={{background:'#f0fdf4',border:'1px solid #bbf7d0',borderRadius:10,padding:'16px 18px'}}>
        <div style={{fontWeight:700,fontSize:14,color:'#14532d',marginBottom:12}}>🌐 DNS TXT Record Validation — Instructions</div>
        <div style={{fontSize:13,color:'#166534',marginBottom:14}}>
          Add the TXT record below to your domain's DNS. It's a TXT record (not CNAME). Changes may take up to 48 hours to propagate.
        </div>
        <CopyBox label="DNS RECORD (full zone file format)" value={record} />
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:10}}>
          <CopyBox label="RECORD TYPE" value="TXT" />
          <CopyBox label="RECORD NAME (Host)" value={recordName} />
        </div>
        <CopyBox label="RECORD VALUE (paste this as the TXT value)" value={recordValue} />
        <div style={{fontSize:12,color:'#15803d',background:'#dcfce7',padding:'8px 12px',borderRadius:6,marginTop:4}}>
          <strong>Steps:</strong> 1. Go to your DNS provider (Cloudflare, Route53, cPanel DNS, etc.) &nbsp;·&nbsp; 2. Add a new TXT record with name <code>{recordName}</code> &nbsp;·&nbsp; 3. Set the value to the token above &nbsp;·&nbsp; 4. Save and wait for propagation &nbsp;·&nbsp; 5. The CA checks automatically.
        </div>
      </div>
    )
  }

  if (dcvMethod === 'email') {
    const emailAddr = am.email || ''
    const defaultEmails = ['admin','administrator','postmaster','hostmaster','webmaster'].map(p=>`${p}@${domain}`)
    return (
      <div style={{background:'#fefce8',border:'1px solid #fde68a',borderRadius:10,padding:'16px 18px'}}>
        <div style={{fontWeight:700,fontSize:14,color:'#78350f',marginBottom:12}}>✉️ Email Validation — Instructions</div>
        <div style={{fontSize:13,color:'#92400e',marginBottom:14}}>
          A validation email has been sent to the address below. Open it and click the approval link.
        </div>
        {emailAddr && <CopyBox label="APPROVAL EMAIL SENT TO" value={emailAddr} />}
        <div style={{marginBottom:10}}>
          <div style={{fontSize:11,fontWeight:600,color:'var(--ink-muted)',letterSpacing:'.06em',marginBottom:6}}>STANDARD APPROVAL EMAIL ADDRESSES FOR {domain?.toUpperCase()}</div>
          <div style={{display:'flex',flexDirection:'column',gap:4}}>
            {defaultEmails.map(e=>(
              <div key={e} style={{display:'flex',justifyContent:'space-between',alignItems:'center',background:'var(--canvas)',padding:'6px 12px',borderRadius:5,border:'1px solid var(--border)'}}>
                <span style={{fontFamily:'monospace',fontSize:12}}>{e}</span>
                <button onClick={()=>navigator.clipboard.writeText(e)} className="btn btn-secondary btn-sm" style={{fontSize:10,padding:'2px 8px'}}>Copy</button>
              </div>
            ))}
          </div>
        </div>
        <div style={{fontSize:12,color:'#92400e',background:'#fef3c7',padding:'8px 12px',borderRadius:6}}>
          <strong>Steps:</strong> 1. Check the inbox of the email address above &nbsp;·&nbsp; 2. Open the email from the CA (RapidSSL / DigiCert) &nbsp;·&nbsp; 3. Click the approval link &nbsp;·&nbsp; 4. Certificate will be issued automatically.
        </div>
      </div>
    )
  }

  return null
}

export default function OrderDrawer({ order, partners, onClose, onRefresh }) {
  const [ld, setLd] = useState(null)
  const [loading, setLoading] = useState(true)
  const [actionMsg, setActionMsg] = useState(null)
  const [cancelConfirm, setCancelConfirm] = useState(false)
  const [showGenerate, setShowGenerate] = useState(false)
  const [genStep, setGenStep] = useState(1)
  const [csr, setCsr] = useState('')
  const [csrInfo, setCsrInfo] = useState(null)
  const [csrDecoding, setCsrDecoding] = useState(false)
  const [dcvMethod, setDcvMethod] = useState('dns')
  const [approverEmail, setApproverEmail] = useState('')
  const [generating, setGenerating] = useState(false)
  const [dcvResult, setDcvResult] = useState(null) // holds approver_method after generate

  useEffect(() => { fetchLive() }, [order?.gogetssl_order_id])

  async function fetchLive() {
    if (!order) return
    setLoading(true); setLd(null); setActionMsg(null); setCancelConfirm(false)
    setShowGenerate(false); setGenStep(1); setDcvResult(null)
    try {
      const res = await fetch('/api/order-action', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ action:'status', order_id: order.gogetssl_order_id })
      })
      const data = await res.json()
      if (data.result) {
        setLd(data.result)
        // If order already has DCV data, show it
        const am = data.result.approver_method
        const dcv = data.result.dcv_method
        if (dcv && am && Object.keys(am).some(k => am[k] && (typeof am[k] === 'object' ? Object.keys(am[k]).length > 0 : am[k]))) {
          setDcvResult({ dcv_method: dcv, approver_method: am, domain: data.result.domain })
        }
      }
    } catch(e) { console.error(e) }
    setLoading(false)
  }

  async function decodeCsr(text) {
    if (!text || !text.includes('BEGIN CERTIFICATE')) return
    setCsrDecoding(true)
    try {
      const res = await fetch('/api/order-action', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ action:'decode_csr', order_id: order.gogetssl_order_id, csr: text })
      })
      const data = await res.json()
      if (data.result && !data.result.error) setCsrInfo(data.result)
      else if (data.result?.error) setCsrInfo({ error: true, message: data.result.message || 'Invalid CSR' })
    } catch(e) {}
    setCsrDecoding(false)
  }

  function getDefaultEmails(domain) {
    if (!domain) return []
    const base = domain.replace(/^\*\./, '')
    return ['admin','administrator','postmaster','hostmaster','webmaster'].map(p=>`${p}@${base}`)
  }

  async function doGenerate() {
    setGenerating(true); setActionMsg(null)
    const domain = csrInfo?.cn || ld?.domain || ''
    try {
      const body = {
        action: 'generate',
        order_id: order.gogetssl_order_id,
        csr,
        dcv_method: dcvMethod,
        domain,
        webserver_type: '2',
        ...(dcvMethod === 'email' && approverEmail ? { approver_email: approverEmail } : {})
      }
      const res = await fetch('/api/order-action', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify(body)
      })
      const data = await res.json()
      const r = data.result || {}

      if (r.error || r.success === false) {
        setActionMsg({ type:'error', text: r.message || JSON.stringify(r) })
        setGenerating(false)
        return
      }

      // Success — extract DCV info from response
      // Response can have: approver_method, dcv_method, domain
      const newDcv = {
        dcv_method: r.dcv_method || dcvMethod,
        approver_method: r.approver_method || {},
        domain: r.domain || domain
      }
      setDcvResult(newDcv)
      setShowGenerate(false)
      setGenStep(1)
      setActionMsg({ type:'success', text:'✓ Certificate generation submitted successfully.' })
      fetchLive()
      onRefresh?.()
    } catch(e) {
      setActionMsg({ type:'error', text: e.message })
    }
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
    a.href = URL.createObjectURL(new Blob([text],{type:'application/x-pem-file'}))
    a.download = filename; a.click()
  }

  const hasCert = ld?.crt_code?.length > 10
  const hasCa = ld?.ca_code?.length > 10
  const hasCSR = ld?.csr_code?.length > 10
  const canCancel = ld && !['cancelled','revoked','expired'].includes(ld.status)
  const canReissue = ld?.reissue===1 || ld?.reissue_now===1
  const isIncomplete = ld?.status === 'incomplete'
  const isPending = ld?.status === 'pending'

  const currentDomain = ld?.domain || csrInfo?.cn || ''
  const defaultEmails = getDefaultEmails(currentDomain)

  return (
    <>
      <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.4)',zIndex:200}} onClick={onClose}/>
      <div style={{position:'fixed',top:0,right:0,bottom:0,width:'min(640px,100vw)',background:'var(--white)',zIndex:201,display:'flex',flexDirection:'column',boxShadow:'-6px 0 32px rgba(0,0,0,.18)'}}>

        {/* Header */}
        <div style={{padding:'14px 20px',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',gap:12,flexShrink:0}}>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontWeight:700,fontSize:15,display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
              <span>Order <span className="mono">#{order?.gogetssl_order_id}</span></span>
              {ld&&<span className={`pill pill-${SP[ld.status]||'gray'}`} style={{fontSize:11}}>{ld.status}</span>}
            </div>
            <div style={{fontSize:12,color:'var(--ink-muted)',marginTop:2}}>{resolveProduct(order)} · {resolveCA(order)}</div>
          </div>
          <a href={`https://my.gogetssl.com/en/certificates/${order?.gogetssl_order_id}`} target="_blank" rel="noreferrer"
            className="btn btn-secondary btn-sm" style={{fontSize:11,whiteSpace:'nowrap'}}>Open in GoGetSSL ↗</a>
          <button onClick={onClose} style={{fontSize:24,color:'var(--ink-muted)',lineHeight:1,padding:'0 4px',flexShrink:0}}>×</button>
        </div>

        {/* Body */}
        <div style={{flex:1,overflow:'auto',padding:20}}>
          {loading&&<div style={{textAlign:'center',padding:40}}><div className="spinner" style={{margin:'0 auto 10px'}}/><p style={{fontSize:13,color:'var(--ink-muted)'}}>Loading from GoGetSSL…</p></div>}

          {actionMsg&&(
            <div className={`alert alert-${actionMsg.type==='success'?'success':actionMsg.type==='error'?'error':'info'}`}
              style={{marginBottom:14,display:'flex',justifyContent:'space-between',gap:8}}>
              <span style={{fontSize:13,flex:1,wordBreak:'break-word'}}>{actionMsg.text}</span>
              <button onClick={()=>setActionMsg(null)} style={{opacity:.5,fontSize:16,lineHeight:1,flexShrink:0}}>×</button>
            </div>
          )}

          {/* Incomplete warning banner */}
          {!loading&&ld&&isIncomplete&&!showGenerate&&(
            <div style={{background:'#fffbeb',border:'1px solid #f59e0b',borderRadius:10,padding:'16px 18px',marginBottom:18,display:'flex',gap:14,alignItems:'flex-start'}}>
              <div style={{fontSize:28,flexShrink:0}}>⚠️</div>
              <div>
                <div style={{fontWeight:600,color:'#92400e',marginBottom:4}}>Awaiting configuration — action needed</div>
                <p style={{fontSize:13,color:'#78350f',marginBottom:12}}>Submit your CSR and choose a domain validation method to generate this certificate.</p>
                <button className="btn btn-primary btn-sm" onClick={()=>setShowGenerate(true)} style={{background:'#d97706',borderColor:'#d97706'}}>⚙ Generate Certificate</button>
              </div>
            </div>
          )}

          {/* DCV instructions (shown after generate OR if order already has them) */}
          {!loading&&dcvResult&&!showGenerate&&(
            <div style={{marginBottom:18}}>
              <div style={{fontWeight:600,fontSize:14,marginBottom:12,color:'var(--ink)'}}>
                {dcvResult.dcv_method==='http'||dcvResult.dcv_method==='https'?'📁':''}
                {dcvResult.dcv_method==='dns'?'🌐':''}
                {dcvResult.dcv_method==='email'?'✉️':''}
                {' '}Domain Validation Instructions
              </div>
              <DcvInstructions
                dcvMethod={dcvResult.dcv_method}
                approverMethod={dcvResult.approver_method}
                domain={dcvResult.domain}
              />
            </div>
          )}

          {/* Generate wizard */}
          {showGenerate&&(
            <div style={{border:'2px solid var(--blue-accent)',borderRadius:12,padding:20,marginBottom:18}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
                <h3 style={{fontSize:15}}>Generate Certificate</h3>
                <button onClick={()=>{setShowGenerate(false);setGenStep(1);setCsrInfo(null)}} style={{opacity:.5,fontSize:18}}>×</button>
              </div>

              {/* Steps */}
              <div style={{display:'flex',borderBottom:'1px solid var(--border)',marginBottom:20}}>
                {['CSR','Validation','Confirm'].map((s,i)=>(
                  <div key={s} style={{padding:'6px 16px',fontSize:12,fontWeight:500,color:genStep===i+1?'var(--blue-accent)':'var(--ink-muted)',borderBottom:genStep===i+1?'2px solid var(--blue-accent)':'2px solid transparent',cursor:genStep>i+1?'pointer':'default'}} onClick={()=>genStep>i+1&&setGenStep(i+1)}>
                    {i+1}. {s}
                  </div>
                ))}
              </div>

              {/* Step 1: CSR */}
              {genStep===1&&(
                <div>
                  <div className="form-label" style={{marginBottom:6}}>Paste your CSR (Certificate Signing Request)</div>
                  <textarea className="form-input" value={csr}
                    onChange={e=>{setCsr(e.target.value);setCsrInfo(null)}}
                    onBlur={e=>decodeCsr(e.target.value)}
                    placeholder={'-----BEGIN CERTIFICATE REQUEST-----\n...\n-----END CERTIFICATE REQUEST-----'}
                    style={{height:160,fontFamily:'monospace',fontSize:11,resize:'vertical'}}/>
                  {csrDecoding&&<p style={{fontSize:12,color:'var(--ink-muted)',marginTop:6}}>Decoding CSR…</p>}
                  {csrInfo&&!csrInfo.error&&(
                    <div style={{marginTop:10,background:'var(--green-bg)',border:'1px solid rgba(22,163,74,.2)',borderRadius:8,padding:'10px 14px'}}>
                      <div style={{fontWeight:600,fontSize:13,color:'var(--green-text)',marginBottom:6}}>✓ Valid CSR</div>
                      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:4,fontSize:12,color:'var(--ink-mid)'}}>
                        {csrInfo.cn&&<span><strong>Common Name:</strong> {csrInfo.cn}</span>}
                        {csrInfo.o&&<span><strong>Organisation:</strong> {csrInfo.o}</span>}
                        {csrInfo.c&&<span><strong>Country:</strong> {csrInfo.c}</span>}
                        {csrInfo.key_size&&<span><strong>Key:</strong> {csrInfo.key_size}-bit {csrInfo.key_type||'RSA'}</span>}
                      </div>
                    </div>
                  )}
                  {csrInfo?.error&&<div className="alert alert-error" style={{marginTop:8,fontSize:12}}>Invalid CSR: {csrInfo.message}</div>}
                  <div style={{marginTop:14,display:'flex',justifyContent:'flex-end'}}>
                    <button className="btn btn-primary btn-sm" disabled={!csr.includes('BEGIN CERTIFICATE')} onClick={()=>setGenStep(2)}>
                      Next: Choose Validation →
                    </button>
                  </div>
                </div>
              )}

              {/* Step 2: DCV */}
              {genStep===2&&(
                <div>
                  <div className="form-label" style={{marginBottom:10}}>Domain Validation (DCV) method</div>
                  <div style={{display:'flex',flexDirection:'column',gap:10,marginBottom:16}}>
                    {[
                      {v:'dns', icon:'🌐', label:'DNS TXT record', desc:'Add a TXT record to your domain DNS. Works even if the site is not live. Recommended.'},
                      {v:'http', icon:'📁', label:'HTTP file validation', desc:'Create a small verification file at a specific URL on your web server.'},
                      {v:'https', icon:'🔒', label:'HTTPS file validation', desc:'Same as HTTP but over HTTPS. Requires an existing SSL certificate.'},
                      {v:'email', icon:'✉️', label:'Email validation', desc:'Receive an approval email at a standard domain address and click the link.'},
                    ].map(opt=>(
                      <label key={opt.v} style={{display:'flex',gap:12,padding:'12px 14px',border:`1.5px solid ${dcvMethod===opt.v?'var(--blue-accent)':'var(--border)'}`,borderRadius:8,cursor:'pointer',background:dcvMethod===opt.v?'var(--blue-sky)':'var(--white)',transition:'all .1s'}}>
                        <input type="radio" name="dcv" value={opt.v} checked={dcvMethod===opt.v} onChange={e=>setDcvMethod(e.target.value)} style={{marginTop:3,flexShrink:0}}/>
                        <div>
                          <div style={{fontWeight:600,fontSize:13}}>{opt.icon} {opt.label}</div>
                          <div style={{fontSize:12,color:'var(--ink-muted)',marginTop:2}}>{opt.desc}</div>
                        </div>
                      </label>
                    ))}
                  </div>

                  {/* Email address picker */}
                  {dcvMethod==='email'&&(
                    <div className="form-group">
                      <label className="form-label">Approval email address</label>
                      <select className="form-input form-select" value={approverEmail} onChange={e=>setApproverEmail(e.target.value)}>
                        <option value="">— Select approver email —</option>
                        {defaultEmails.map(e=><option key={e} value={e}>{e}</option>)}
                      </select>
                      <p style={{fontSize:12,color:'var(--ink-muted)',marginTop:4}}>These are the standard CA/B Forum approved addresses for <strong>{currentDomain}</strong>. You must have access to this mailbox.</p>
                    </div>
                  )}

                  <div style={{marginTop:14,display:'flex',gap:8,justifyContent:'flex-end'}}>
                    <button className="btn btn-secondary btn-sm" onClick={()=>setGenStep(1)}>← Back</button>
                    <button className="btn btn-primary btn-sm" disabled={dcvMethod==='email'&&!approverEmail} onClick={()=>setGenStep(3)}>Next: Confirm →</button>
                  </div>
                </div>
              )}

              {/* Step 3: Confirm */}
              {genStep===3&&(
                <div>
                  <div style={{background:'var(--canvas)',borderRadius:8,padding:'14px 16px',marginBottom:16}}>
                    <div style={{fontWeight:600,fontSize:13,marginBottom:10}}>Submission summary</div>
                    <div style={{display:'grid',gridTemplateColumns:'130px 1fr',gap:'6px 12px',fontSize:13}}>
                      <span style={{color:'var(--ink-muted)'}}>Order</span><span className="mono">#{order?.gogetssl_order_id}</span>
                      <span style={{color:'var(--ink-muted)'}}>Domain (CN)</span><span className="mono">{csrInfo?.cn||'from CSR'}</span>
                      <span style={{color:'var(--ink-muted)'}}>CSR key</span><span>{csrInfo?.key_size||'?'}-bit {csrInfo?.key_type||'RSA'}</span>
                      <span style={{color:'var(--ink-muted)'}}>DCV method</span><span style={{fontWeight:600,textTransform:'uppercase'}}>{dcvMethod}</span>
                      {dcvMethod==='email'&&<><span style={{color:'var(--ink-muted)'}}>Approver email</span><span className="mono">{approverEmail}</span></>}
                    </div>
                  </div>

                  <div className="alert alert-info" style={{fontSize:13,marginBottom:14}}>
                    {dcvMethod==='dns'&&'After submitting: add the TXT record shown to your DNS. The CA will automatically verify it.'}
                    {(dcvMethod==='http'||dcvMethod==='https')&&'After submitting: create the verification file at the shown URL path. The CA checks within minutes.'}
                    {dcvMethod==='email'&&`After submitting: check the inbox of ${approverEmail} and click the approval link from the CA.`}
                  </div>

                  <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
                    <button className="btn btn-secondary btn-sm" onClick={()=>setGenStep(2)}>← Back</button>
                    <button className="btn btn-primary btn-sm" onClick={doGenerate} disabled={generating} style={{minWidth:160,justifyContent:'center'}}>
                      {generating?<><span className="spinner" style={{width:14,height:14,borderWidth:2}}/>Submitting…</>:'⚙ Generate Certificate'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Order info grid */}
          {!loading&&ld&&(
            <>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:18}}>
                {[
                  ['GoGetSSL ID','#'+ld.order_id,true],
                  ['Internal ID',ld.internal_id||'—',true],
                  ['Status',ld.status||'—',false],
                  ['DCV Status',ld.dcv_status===2?'✓ Verified':ld.dcv_status===1?'Pending':'Not set',false],
                  ['Domain',ld.domain||'—',true],
                  ['Product',V1_NAMES[ld.product_id]||`#${ld.product_id}`||'—',false],
                  ['Valid from',ld.valid_from&&ld.valid_from!=='0000-00-00'?ld.valid_from:'—',false],
                  ['Valid till',ld.valid_till&&ld.valid_till!=='0000-00-00'?ld.valid_till:'—',false],
                  ['DCV method',ld.dcv_method||'—',false],
                  ['Server count',ld.server_count??'—',false],
                ].map(([k,v,mono])=>(
                  <div key={k} style={{background:'var(--canvas)',borderRadius:7,padding:'10px 12px'}}>
                    <div style={{fontSize:11,color:'var(--ink-muted)',marginBottom:3}}>{k}</div>
                    <div style={{fontSize:13,fontWeight:500,wordBreak:'break-all'}} className={mono?'mono':''}>{String(v||'—')}</div>
                  </div>
                ))}
              </div>

              {ld.admin_msg&&<div className="alert alert-info" style={{marginBottom:14,fontSize:13}}><strong>CA message:</strong> {ld.admin_msg}</div>}

              {/* Actions */}
              <div style={{borderTop:'1px solid var(--border)',paddingTop:14,marginBottom:16}}>
                <div style={{fontSize:11,fontWeight:600,color:'var(--ink-muted)',letterSpacing:'.07em',marginBottom:10}}>ACTIONS</div>
                <div style={{display:'flex',flexWrap:'wrap',gap:8}}>
                  {isIncomplete&&!showGenerate&&<button className="btn btn-primary btn-sm" onClick={()=>setShowGenerate(true)} style={{background:'#d97706'}}>⚙ Generate Certificate</button>}
                  {hasCert&&<>
                    <button className="btn btn-secondary btn-sm" onClick={()=>download(ld.crt_code,`cert_${ld.order_id}.crt`)}>↓ Download Certificate</button>
                    {hasCa&&<button className="btn btn-secondary btn-sm" onClick={()=>download(ld.ca_code,`ca_${ld.order_id}.crt`)}>↓ Download CA Bundle</button>}
                  </>}
                  {isPending&&<button className="btn btn-secondary btn-sm" onClick={()=>doAction('resend_email')}>✉ Resend Validation Email</button>}
                  {canReissue&&!isIncomplete&&<button className="btn btn-secondary btn-sm" onClick={()=>setShowGenerate(true)}>↺ Reissue Certificate</button>}
                  {canCancel&&!cancelConfirm&&<button className="btn btn-danger btn-sm" onClick={()=>setCancelConfirm(true)}>Cancel Order</button>}
                  <a href={`https://my.gogetssl.com/en/certificates/${order?.gogetssl_order_id}`} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm">Open in GoGetSSL ↗</a>
                </div>
                {cancelConfirm&&(
                  <div style={{marginTop:10,background:'var(--red-bg)',padding:'12px 14px',borderRadius:8,border:'1px solid rgba(220,38,38,.2)',display:'flex',gap:10,alignItems:'center',flexWrap:'wrap'}}>
                    <span style={{fontSize:13,color:'var(--red-text)',flex:1}}>Cancel order #{order?.gogetssl_order_id}? Cannot be undone.</span>
                    <button className="btn btn-danger btn-sm" onClick={()=>doAction('cancel',{reason:'end'})}>Confirm cancel</button>
                    <button className="btn btn-secondary btn-sm" onClick={()=>setCancelConfirm(false)}>No, keep</button>
                  </div>
                )}
              </div>

              {/* Cert / CSR text */}
              {hasCert&&(
                <div style={{marginBottom:14}}>
                  <div style={{fontSize:11,fontWeight:600,color:'var(--ink-muted)',letterSpacing:'.07em',marginBottom:6}}>CERTIFICATE</div>
                  <textarea readOnly value={ld.crt_code} style={{width:'100%',height:110,fontFamily:'monospace',fontSize:11,padding:8,border:'1px solid var(--border)',borderRadius:7,background:'var(--canvas)',resize:'vertical'}}/>
                  <div style={{display:'flex',gap:6,marginTop:6}}>
                    <button onClick={()=>navigator.clipboard.writeText(ld.crt_code)} className="btn btn-secondary btn-sm">Copy</button>
                    <button onClick={()=>download(ld.crt_code,`cert_${ld.order_id}.crt`)} className="btn btn-secondary btn-sm">Download</button>
                  </div>
                </div>
              )}
              {hasCa&&(
                <div style={{marginBottom:14}}>
                  <div style={{fontSize:11,fontWeight:600,color:'var(--ink-muted)',letterSpacing:'.07em',marginBottom:6}}>CA BUNDLE</div>
                  <textarea readOnly value={ld.ca_code} style={{width:'100%',height:90,fontFamily:'monospace',fontSize:11,padding:8,border:'1px solid var(--border)',borderRadius:7,background:'var(--canvas)',resize:'vertical'}}/>
                  <div style={{display:'flex',gap:6,marginTop:6}}>
                    <button onClick={()=>navigator.clipboard.writeText(ld.ca_code)} className="btn btn-secondary btn-sm">Copy</button>
                    <button onClick={()=>download(ld.ca_code,`ca_${ld.order_id}.crt`)} className="btn btn-secondary btn-sm">Download</button>
                  </div>
                </div>
              )}
              {hasCSR&&(
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

          {!loading&&!ld&&(
            <div className="empty-state" style={{paddingTop:20}}>
              <p style={{fontSize:13}}>No data loaded. <a href={`https://my.gogetssl.com/en/certificates/${order?.gogetssl_order_id}`} target="_blank" rel="noreferrer" style={{color:'var(--blue-accent)'}}>Open in GoGetSSL portal →</a></p>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
