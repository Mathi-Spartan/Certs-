import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { PRODUCT_MAP, resolveProductName, resolveCAName } from '../productMap'

const SP = { active:'green', issued:'green', cancelled:'red', revoked:'red', expired:'red', pending:'amber', incomplete:'amber', processing:'blue' }

export function resolveProduct(o) { return resolveProductName(o) }
export function resolveCA(o) { return resolveCAName(o) }

function CopyBox({ label, value }) {
  const [copied, setCopied] = useState(false)
  return (
    <div style={{marginBottom:10}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}}>
        <span style={{fontSize:11,fontWeight:600,color:'var(--ink-muted)',letterSpacing:'.06em'}}>{label}</span>
        <button onClick={()=>{navigator.clipboard.writeText(value);setCopied(true);setTimeout(()=>setCopied(false),1800)}}
          className="btn btn-secondary btn-sm" style={{fontSize:11,padding:'2px 10px'}}>
          {copied?'✓ Copied':'Copy'}
        </button>
      </div>
      <div style={{background:'var(--canvas)',border:'1px solid var(--border)',borderRadius:6,padding:'8px 12px',fontFamily:'monospace',fontSize:12,wordBreak:'break-all',lineHeight:1.5,color:'var(--ink-mid)'}}>{value}</div>
    </div>
  )
}

function DcvBox({ dcvMethod, approverMethod, domain }) {
  const am = approverMethod || {}
  if (!dcvMethod) return null

  if (dcvMethod === 'http' || dcvMethod === 'https') {
    const info = am.http || am.https || {}
    return (
      <div style={{background:'#f0f9ff',border:'1px solid #bae6fd',borderRadius:10,padding:'16px 18px',marginBottom:16}}>
        <div style={{fontWeight:700,fontSize:14,color:'#0c4a6e',marginBottom:8}}>📁 {dcvMethod.toUpperCase()} File Validation — Action required</div>
        <p style={{fontSize:13,color:'#075985',marginBottom:14}}>Create a file at the exact path below on your web server.</p>
        {info.link && <CopyBox label="FILE URL — where to place the file" value={info.link} />}
        {info.filename && <CopyBox label="FILENAME" value={info.filename} />}
        {info.content && <CopyBox label="FILE CONTENT — paste exactly as shown" value={info.content} />}
        <div style={{fontSize:12,color:'#0369a1',background:'#e0f2fe',padding:'8px 12px',borderRadius:6,marginTop:4}}>
          <strong>Steps:</strong> 1. Create directory <code>.well-known/pki-validation/</code> in your web root &nbsp;·&nbsp;
          2. Create file named <code>{info.filename}</code> &nbsp;·&nbsp;
          3. Paste the content above inside (no extra spaces) &nbsp;·&nbsp;
          4. Verify URL is accessible &nbsp;·&nbsp; 5. CA verifies automatically within minutes.
        </div>
      </div>
    )
  }
  if (dcvMethod === 'dns') {
    const info = am.dns || {}
    const record = info.record || ''
    const parts = record.split(/\s+/)
    const recordName = parts[0] || domain || ''
    const recordValue = (parts[parts.length-1] || '').replace(/"/g,'')
    return (
      <div style={{background:'#f0fdf4',border:'1px solid #bbf7d0',borderRadius:10,padding:'16px 18px',marginBottom:16}}>
        <div style={{fontWeight:700,fontSize:14,color:'#14532d',marginBottom:8}}>🌐 DNS TXT Record — Action required</div>
        <p style={{fontSize:13,color:'#166534',marginBottom:14}}>Add this TXT record to your domain DNS. Takes up to 48h to propagate.</p>
        {record && <CopyBox label="FULL ZONE FILE RECORD" value={record} />}
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:8}}>
          <CopyBox label="RECORD TYPE" value="TXT" />
          <CopyBox label="HOST / NAME" value={recordName} />
        </div>
        {recordValue && <CopyBox label="TXT VALUE (token to paste)" value={recordValue} />}
        <div style={{fontSize:12,color:'#15803d',background:'#dcfce7',padding:'8px 12px',borderRadius:6,marginTop:4}}>
          <strong>Steps:</strong> 1. Open your DNS provider (Cloudflare / Route53 / cPanel) &nbsp;·&nbsp;
          2. Add TXT record with host <code>{recordName}</code> &nbsp;·&nbsp;
          3. Value = the token above &nbsp;·&nbsp; 4. Save. CA checks automatically.
        </div>
      </div>
    )
  }
  if (dcvMethod === 'email') {
    const base = (domain || '').replace(/^\*\./,'')
    const emailAddr = am.email || ''
    const stdEmails = ['admin','administrator','postmaster','hostmaster','webmaster'].map(p=>`${p}@${base}`)
    return (
      <div style={{background:'#fefce8',border:'1px solid #fde68a',borderRadius:10,padding:'16px 18px',marginBottom:16}}>
        <div style={{fontWeight:700,fontSize:14,color:'#78350f',marginBottom:8}}>✉️ Email Validation — Check your inbox</div>
        {emailAddr && <CopyBox label="APPROVAL EMAIL SENT TO" value={emailAddr} />}
        <div style={{fontSize:11,fontWeight:600,color:'var(--ink-muted)',letterSpacing:'.06em',marginBottom:6}}>STANDARD CA/B FORUM ADDRESSES FOR {base.toUpperCase()}</div>
        <div style={{display:'flex',flexDirection:'column',gap:4,marginBottom:10}}>
          {stdEmails.map(e=>(
            <div key={e} style={{display:'flex',justifyContent:'space-between',alignItems:'center',background:'var(--canvas)',padding:'6px 12px',borderRadius:5,border:'1px solid var(--border)'}}>
              <span style={{fontFamily:'monospace',fontSize:12}}>{e}</span>
              <button onClick={()=>navigator.clipboard.writeText(e)} className="btn btn-secondary btn-sm" style={{fontSize:10,padding:'2px 8px'}}>Copy</button>
            </div>
          ))}
        </div>
        <div style={{fontSize:12,color:'#92400e',background:'#fef3c7',padding:'8px 12px',borderRadius:6}}>
          Open the inbox above → find email from RapidSSL/DigiCert → click the approval link.
        </div>
      </div>
    )
  }
  return null
}

const STEPS_NEW = ['CSR', 'Contact', 'Validation', 'Confirm']
const STEPS_REISSUE = ['CSR', 'Validation', 'Confirm']

export default function OrderDrawer({ order, partners, onClose, onRefresh }) {
  const [ld, setLd] = useState(null)
  const [loading, setLoading] = useState(true)
  const [actionMsg, setActionMsg] = useState(null)
  const [cancelConfirm, setCancelConfirm] = useState(false)
  const [showGen, setShowGen] = useState(false)
  const [genMode, setGenMode] = useState('new') // 'new' or 'reissue'
  const [step, setStep] = useState(1)
  // Step 1: CSR
  const [csr, setCsr] = useState('')
  const [csrInfo, setCsrInfo] = useState(null)
  const [csrDecoding, setCsrDecoding] = useState(false)
  // Step 2: Contact
  const [contact, setContact] = useState({ first_name:'', last_name:'', email:'', phone:'', title:'Mr', city:'', country:'IN', address:'' })
  // Step 3: DCV
  const [dcvMethod, setDcvMethod] = useState('dns')
  const [approverEmail, setApproverEmail] = useState('')
  const [period, setPeriod] = useState(12)
  // Result
  const [showDcvChange, setShowDcvChange] = useState(false)
  const [newDcvMethod, setNewDcvMethod] = useState('')
  const [newApproverEmail, setNewApproverEmail] = useState('')
  const [dcvChanging, setDcvChanging] = useState(false)
  const [dcvChecking, setDcvChecking] = useState(false)
  const [dcvResult, setDcvResult] = useState(null)
  const [newOrderId, setNewOrderId] = useState(null)
  const [generating, setGenerating] = useState(false)

  useEffect(() => { fetchLive() }, [order?.gogetssl_order_id])

  async function fetchLive() {
    if (!order) return
    setLoading(true); setLd(null); setActionMsg(null); setCancelConfirm(false)
    setShowGen(false); setStep(1); setDcvResult(null); setNewOrderId(null); setGenMode('new')
    try {
      const res = await fetch('/api/order-action', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ action:'status', order_id: order.gogetssl_order_id })
      })
      const data = await res.json()
      if (data.result) {
        setLd(data.result)
        const am = data.result.approver_method
        const dcv = data.result.dcv_method
        if (dcv && am) {
          const hasData = Object.values(am).some(v => v && typeof v === 'object' && Object.keys(v).length > 0)
          if (hasData) setDcvResult({ dcv_method: dcv, approver_method: am, domain: data.result.domain })
        }
      }
    } catch(e) {}
    setLoading(false)
  }

  async function decodeCsr(text) {
    if (!text?.includes('BEGIN CERTIFICATE')) return
    setCsrDecoding(true); setCsrInfo(null)
    try {
      const res = await fetch('/api/order-action', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ action:'decode_csr', order_id: order.gogetssl_order_id, csr: text })
      })
      const data = await res.json()
      setCsrInfo(data.result || null)
    } catch(e) {}
    setCsrDecoding(false)
  }

  async function doGenerate() {
    setGenerating(true); setActionMsg(null)
    const domain = csrInfo?.cn || ld?.domain || ''
    const pid = ld?.product_id || order?.api_response?.product_id
    const validityPeriod = ld?.validity_period || period || 12

    try {
      const payload = {
        action: genMode === 'reissue' ? 'reissue' : 'generate',
        order_id: order.gogetssl_order_id,
        product_id: pid,
        period: validityPeriod,
        csr,
        dcv_method: dcvMethod,
        domain,
        contact,
        ...(dcvMethod === 'email' && approverEmail ? { approver_email: approverEmail } : {})
      }
      const res = await fetch('/api/order-action', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify(payload)
      })
      const data = await res.json()
      const r = data.result || {}
      if (r.error || r.success === false) {
        setActionMsg({ type:'error', text: r.message || JSON.stringify(r) })
        setGenerating(false); return
      }
      // Extract DCV from response
      // Use DCV data from the response directly — don't reload the old order
      const responseDomain = r.domain || domain
      const responseAM = r.approver_method || {}
      const responseDcv = r.dcv_method || dcvMethod

      // If response has no approver_method data, fetch the new order's status
      let finalAM = responseAM
      if (r.order_id && (!responseAM || Object.keys(responseAM).length === 0 || !Object.values(responseAM).some(v => v && typeof v === 'object' && Object.keys(v).length > 0))) {
        try {
          const statusRes = await fetch('/api/order-action', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'status', order_id: r.order_id })
          })
          const statusData = await statusRes.json()
          if (statusData.result?.approver_method) finalAM = statusData.result.approver_method
        } catch(e) {}
      }

      setDcvResult({ dcv_method: responseDcv, approver_method: finalAM, domain: responseDomain })
      if (r.order_id) setNewOrderId(r.order_id)
      setShowGen(false); setStep(1)
      setActionMsg({ type:'success', text: genMode==='reissue' ? `✓ Reissue submitted for order #${order.gogetssl_order_id}. Follow the ${responseDcv.toUpperCase()} validation instructions below.` : `✓ New certificate order #${r.order_id} placed and active. Follow the ${responseDcv.toUpperCase()} validation instructions below.` })
      onRefresh?.()
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
  const domain = ld?.domain || csrInfo?.cn || ''
  const stdEmails = ['admin','administrator','postmaster','hostmaster','webmaster'].map(p=>`${p}@${(domain||'').replace(/^\*\./,'')}`)

  const canNext1 = csr.includes('BEGIN CERTIFICATE') && csrInfo && !csrInfo?.error
  const canNext2 = genMode==='reissue' || (contact.first_name && contact.last_name && contact.email && contact.phone && contact.city && contact.country)
  const canNext3 = dcvMethod !== 'email' || approverEmail

  return (
    <>
      <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.4)',zIndex:200}} onClick={onClose}/>
      <div style={{position:'fixed',top:0,right:0,bottom:0,width:'min(660px,100vw)',background:'var(--white)',zIndex:201,display:'flex',flexDirection:'column',boxShadow:'-6px 0 32px rgba(0,0,0,.18)'}}>

        {/* Header */}
        <div style={{padding:'14px 20px',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',gap:12,flexShrink:0}}>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontWeight:700,fontSize:15,display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
              Order <span className="mono">#{order?.gogetssl_order_id}</span>
              {ld&&<span className={`pill pill-${SP[ld.status]||'gray'}`} style={{fontSize:11}}>{ld.status}</span>}
            </div>
            <div style={{fontSize:12,color:'var(--ink-muted)',marginTop:2}}>{resolveProduct(order)} · {resolveCA(order)}</div>
          </div>
          <a href={`https://my.gogetssl.com/en/certificates/${order?.gogetssl_order_id}`} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm" style={{fontSize:11,whiteSpace:'nowrap'}}>Open in GoGetSSL ↗</a>
          <button onClick={onClose} style={{fontSize:24,color:'var(--ink-muted)',lineHeight:1,padding:'0 4px'}}>×</button>
        </div>

        {/* Scrollable body */}
        <div style={{flex:1,overflow:'auto',padding:20}}>
          {loading&&<div style={{textAlign:'center',padding:40}}><div className="spinner" style={{margin:'0 auto 10px'}}/><p style={{fontSize:13,color:'var(--ink-muted)'}}>Loading from GoGetSSL…</p></div>}

          {actionMsg&&(
            <div className={`alert alert-${actionMsg.type==='success'?'success':actionMsg.type==='error'?'error':'info'}`}
              style={{marginBottom:14,display:'flex',justifyContent:'space-between',gap:8}}>
              <span style={{fontSize:13,flex:1,wordBreak:'break-word'}}>{actionMsg.text}</span>
              <button onClick={()=>setActionMsg(null)} style={{opacity:.5,fontSize:16,lineHeight:1}}>×</button>
            </div>
          )}

          {/* Incomplete — submit CSR via GoGetSSL portal */}
          {!loading&&ld&&isIncomplete&&!dcvResult&&(
            <div style={{background:'#fffbeb',border:'1px solid #f59e0b',borderRadius:10,padding:'18px 20px',marginBottom:18}}>
              <div style={{fontWeight:700,color:'#92400e',marginBottom:8,fontSize:14}}>⚙ Certificate not yet generated — CSR required</div>
              <p style={{fontSize:13,color:'#78350f',marginBottom:14,lineHeight:1.6}}>
                This order is awaiting CSR submission and domain validation. CSR submission for incomplete orders must be done through the GoGetSSL partner portal — it is not available via the partner API.
              </p>
              <div style={{background:'rgba(255,255,255,.7)',borderRadius:8,padding:'12px 16px',marginBottom:14}}>
                <div style={{fontSize:11,fontWeight:700,color:'#92400e',marginBottom:8,letterSpacing:'.05em'}}>STEPS</div>
                <ol style={{fontSize:13,color:'#78350f',paddingLeft:18,lineHeight:2,margin:0}}>
                  <li>Click <strong>"Open in GoGetSSL portal ↗"</strong> below</li>
                  <li>Click <strong>"Generate Certificate"</strong> on the order page</li>
                  <li>Paste your CSR, enter contact details, choose DNS / HTTP / Email validation</li>
                  <li>Submit — order status changes to <em>processing</em></li>
                  <li>Come back here → click <strong>"Sync from GoGetSSL"</strong> on the orders page to see DCV instructions</li>
                </ol>
              </div>
              <a href={`https://my.gogetssl.com/en/certificates/${order?.gogetssl_order_id}`} target="_blank" rel="noreferrer"
                className="btn btn-primary btn-sm" style={{background:'#d97706'}}>
                Open in GoGetSSL portal ↗
              </a>
            </div>
          )}


          {/* New order created banner */}
          {!loading&&newOrderId&&(
            <div style={{background:'var(--green-bg)',border:'1px solid rgba(22,163,74,.25)',borderRadius:10,padding:'14px 18px',marginBottom:14,display:'flex',gap:12,alignItems:'center',flexWrap:'wrap'}}>
              <div style={{flex:1}}>
                <div style={{fontWeight:600,color:'var(--green-text)',fontSize:14,marginBottom:3}}>✓ New order created: #{newOrderId}</div>
                <div style={{fontSize:13,color:'var(--green-text)'}}>This incomplete order stays as-is. Your certificate is being processed under the new order.</div>
              </div>
              <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                <a href={`https://my.gogetssl.com/en/certificates/${newOrderId}`} target="_blank" rel="noreferrer"
                  className="btn btn-secondary btn-sm" style={{fontSize:12}}>View new order in GoGetSSL ↗</a>
                <button className="btn btn-secondary btn-sm" style={{fontSize:12}} onClick={async()=>{
                  // Sync the new order to DB and refresh
                  onRefresh?.()
                }}>Sync orders</button>
              </div>
            </div>
          )}

          {/* DCV instructions */}
          {!loading&&dcvResult&&!showGen&&(
            <div style={{marginBottom:18}}>
              <div style={{fontWeight:600,fontSize:14,marginBottom:10}}>Domain Validation Instructions</div>
              <DcvBox dcvMethod={dcvResult.dcv_method} approverMethod={dcvResult.approver_method} domain={dcvResult.domain}/>
            </div>
          )}

          {/* Generate wizard */}
          {showGen&&(
            <div style={{border:'2px solid var(--blue-accent)',borderRadius:12,padding:20,marginBottom:18}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
                <h3 style={{fontSize:15}}>{genMode==='reissue' ? '↺ Reissue Certificate' : genMode==='reissue' ? '↺ Submit Reissue' : '⚙ Place Certificate Order'}</h3>
                <button onClick={()=>{setShowGen(false);setStep(1);setCsrInfo(null)}} style={{opacity:.5,fontSize:18}}>×</button>
              </div>

              {/* Mode context banner */}
              <div style={{
                background: genMode==='reissue' ? 'var(--blue-sky)' : '#fffbeb',
                border: `1px solid ${genMode==='reissue' ? 'rgba(51,117,177,.2)' : '#f59e0b'}`,
                borderRadius:8, padding:'10px 14px', marginBottom:16, fontSize:12,
                color: genMode==='reissue' ? 'var(--blue-accent)' : '#92400e'
              }}>
                {genMode==='reissue'
                  ? <><strong>↺ Reissue:</strong> Replaces the CSR on existing order #{order?.gogetssl_order_id}. No new charge. Certificate is re-issued within the same validity period. Unlimited reissues allowed on active orders.</>
                  : <><strong>⚙ Generate Certificate:</strong> Submits your CSR and places the certificate order. GoGetSSL will issue the certificate after domain validation completes. This uses one certificate slot.</>
                }
              </div>

              {/* Step tabs */}
              <div style={{display:'flex',borderBottom:'1px solid var(--border)',marginBottom:20,overflowX:'auto'}}>
                {(genMode==='reissue' ? STEPS_REISSUE : STEPS_NEW).map((s,i)=>(
                  <div key={s} style={{padding:'6px 16px',fontSize:12,fontWeight:500,whiteSpace:'nowrap',color:step===i+1?'var(--blue-accent)':'var(--ink-muted)',borderBottom:step===i+1?'2px solid var(--blue-accent)':'2px solid transparent',cursor:step>i+1?'pointer':'default'}}
                    onClick={()=>step>i+1&&setStep(i+1)}>
                    {i+1}. {s}
                  </div>
                ))}
              </div>

              {/* STEP 1: CSR */}
              {step===1&&(
                <div>
                  <div className="form-label" style={{marginBottom:6}}>Paste your Certificate Signing Request (CSR)</div>
                  <textarea className="form-input" value={csr}
                    onChange={e=>{setCsr(e.target.value);setCsrInfo(null)}}
                    onBlur={e=>decodeCsr(e.target.value)}
                    placeholder={'-----BEGIN CERTIFICATE REQUEST-----\n...\n-----END CERTIFICATE REQUEST-----'}
                    style={{height:160,fontFamily:'monospace',fontSize:11,resize:'vertical'}}/>
                  {csrDecoding&&<p style={{fontSize:12,color:'var(--ink-muted)',marginTop:6}}>Decoding CSR…</p>}
                  {csrInfo&&!csrInfo.error&&(
                    <div style={{marginTop:10,background:'var(--green-bg)',border:'1px solid rgba(22,163,74,.2)',borderRadius:8,padding:'10px 14px'}}>
                      <div style={{fontWeight:600,fontSize:13,color:'var(--green-text)',marginBottom:6}}>✓ Valid CSR decoded</div>
                      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:4,fontSize:12,color:'var(--ink-mid)'}}>
                        {csrInfo.cn&&<span><strong>Common Name (CN):</strong> {csrInfo.cn}</span>}
                        {csrInfo.o&&<span><strong>Organisation:</strong> {csrInfo.o}</span>}
                        {csrInfo.c&&<span><strong>Country:</strong> {csrInfo.c}</span>}
                        {csrInfo.st&&<span><strong>State:</strong> {csrInfo.st}</span>}
                        {csrInfo.l&&<span><strong>City:</strong> {csrInfo.l}</span>}
                        {csrInfo.key_size&&<span><strong>Key:</strong> {csrInfo.key_size}-bit RSA</span>}
                      </div>
                    </div>
                  )}
                  {csrInfo?.error&&<div className="alert alert-error" style={{marginTop:8,fontSize:12}}>Invalid CSR: {csrInfo.message}</div>}
                  {!csrInfo&&csr.includes('BEGIN')&&!csrDecoding&&(
                    <button className="btn btn-secondary btn-sm" style={{marginTop:8}} onClick={()=>decodeCsr(csr)}>Decode CSR</button>
                  )}
                  <div style={{marginTop:14,display:'flex',justifyContent:'flex-end'}}>
                    <button className="btn btn-primary btn-sm" disabled={!canNext1} onClick={()=>genMode==='reissue'?setStep(3):setStep(2)}>Next: {genMode==='reissue'?'Validation →':'Contact Details →'}</button>
                  </div>
                </div>
              )}

              {/* STEP 2: Contact */}
              {step===2&&genMode==='new'&&(
                <div>
                  <div style={{fontSize:13,color:'var(--ink-muted)',marginBottom:14}}>These details are sent to the Certificate Authority for administrative contact. Required for certificate issuance.</div>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                    {[
                      {k:'first_name',l:'First name',ph:'Mathivanan',req:true},
                      {k:'last_name',l:'Last name',ph:'K',req:true},
                      {k:'email',l:'Email address',ph:'admin@domain.com',req:true,type:'email'},
                      {k:'phone',l:'Phone (with country code)',ph:'+919876543210',req:true},
                      {k:'title',l:'Title',ph:'Mr',req:false},
                      {k:'city',l:'City',ph:'Chennai',req:true},
                      {k:'country',l:'Country code',ph:'IN',req:true},
                      {k:'address',l:'Address line 1',ph:'123 Main Street',req:false},
                    ].map(f=>(
                      <div key={f.k} className="form-group" style={{marginBottom:0}}>
                        <label className="form-label">{f.l}{f.req&&<span style={{color:'var(--red)'}}>*</span>}</label>
                        <input className="form-input" type={f.type||'text'} placeholder={f.ph} value={contact[f.k]||''}
                          onChange={e=>setContact(c=>({...c,[f.k]:e.target.value}))}/>
                      </div>
                    ))}
                  </div>
                  <div style={{marginTop:16,display:'flex',gap:8,justifyContent:'flex-end'}}>
                    <button className="btn btn-secondary btn-sm" onClick={()=>setStep(1)}>← Back</button>
                    <button className="btn btn-primary btn-sm" disabled={!canNext2} onClick={()=>setStep(3)}>Next: Validation Method →</button>
                  </div>
                </div>
              )}

              {/* STEP 3: DCV */}
              {step===3&&(
                <div>
                  <div className="form-label" style={{marginBottom:10}}>Domain Validation (DCV) method for <strong>{csrInfo?.cn||domain}</strong></div>
                  <div style={{display:'flex',flexDirection:'column',gap:10,marginBottom:16}}>
                    {[
                      {v:'dns',icon:'🌐',label:'DNS TXT record',desc:'Add a TXT record to your DNS. Works even if the site is offline. Recommended.'},
                      {v:'http',icon:'📁',label:'HTTP file validation',desc:'Create a small verification file on your web server at a specific URL.'},
                      {v:'https',icon:'🔒',label:'HTTPS file validation',desc:'Same as HTTP but over HTTPS. Requires an existing SSL certificate.'},
                      {v:'email',icon:'✉️',label:'Email validation',desc:'Receive an approval email at a standard domain address and click the link.'},
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
                  {dcvMethod==='email'&&(
                    <div className="form-group">
                      <label className="form-label">Approver email address <span style={{color:'var(--red)'}}>*</span></label>
                      <select className="form-input form-select" value={approverEmail} onChange={e=>setApproverEmail(e.target.value)}>
                        <option value="">— Select approver email —</option>
                        {stdEmails.map(e=><option key={e} value={e}>{e}</option>)}
                      </select>
                      <p style={{fontSize:12,color:'var(--ink-muted)',marginTop:4}}>You must have access to this mailbox to complete validation.</p>
                    </div>
                  )}
                  <div style={{marginTop:14,display:'flex',gap:8,justifyContent:'flex-end'}}>
                    <button className="btn btn-secondary btn-sm" onClick={()=>genMode==='reissue'?setStep(1):setStep(2)}>← Back</button>
                    <button className="btn btn-primary btn-sm" disabled={!canNext3} onClick={()=>setStep(4)}>Next: Confirm →</button>
                  </div>
                </div>
              )}

              {/* STEP 4: Confirm */}
              {step===4&&(
                <div>
                  <div style={{background:'var(--canvas)',borderRadius:8,padding:'14px 16px',marginBottom:14}}>
                    <div style={{fontWeight:600,fontSize:13,marginBottom:10}}>Submission summary</div>
                    <div style={{display:'grid',gridTemplateColumns:'140px 1fr',gap:'6px 12px',fontSize:13}}>
                      <span style={{color:'var(--ink-muted)'}}>Order</span><span className="mono">#{order?.gogetssl_order_id}</span>
                      <span style={{color:'var(--ink-muted)'}}>Domain (CN)</span><span className="mono">{csrInfo?.cn||'from CSR'}</span>
                      <span style={{color:'var(--ink-muted)'}}>Key</span><span>{csrInfo?.key_size||'?'}-bit RSA</span>
                      {genMode==='new'&&<><span style={{color:'var(--ink-muted)'}}>Admin contact</span><span>{contact.first_name} {contact.last_name} &lt;{contact.email}&gt;</span></>}
                      {genMode==='new'&&<><span style={{color:'var(--ink-muted)'}}>Phone</span><span>{contact.phone}</span></>}
                      {genMode==='new'&&<><span style={{color:'var(--ink-muted)'}}>City / Country</span><span>{contact.city}, {contact.country}</span></>}
                      <span style={{color:'var(--ink-muted)'}}>DCV method</span><span style={{fontWeight:600,textTransform:'uppercase'}}>{dcvMethod}</span>
                      {dcvMethod==='email'&&<><span style={{color:'var(--ink-muted)'}}>Approver email</span><span className="mono">{approverEmail}</span></>}
                    </div>
                  </div>
                  <div className="alert alert-info" style={{fontSize:13,marginBottom:14}}>
                    {dcvMethod==='dns'&&'After submitting: the TXT record details will appear. Add it to your DNS provider.'}
                    {(dcvMethod==='http'||dcvMethod==='https')&&'After submitting: the exact file URL and content will appear. Create that file on your server.'}
                    {dcvMethod==='email'&&`After submitting: check ${approverEmail} and click the CA's approval link.`}
                    {' '}The certificate will be issued automatically after validation.
                  </div>
                  <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
                    <button className="btn btn-secondary btn-sm" onClick={()=>setStep(3)}>← Back</button>
                    <button className="btn btn-primary btn-sm" onClick={doGenerate} disabled={generating} style={{minWidth:180,justifyContent:'center'}}>
                      {generating?<><span className="spinner" style={{width:14,height:14,borderWidth:2}}/>Submitting…</>:genMode==='reissue' ? '↺ Submit Reissue' : '⚙ Place Certificate Order'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* DCV Management panel — shown for processing/pending orders that have a dcv_method */}
          {!loading && ld && ['processing','pending'].includes(ld.status) && ld.dcv_method && (
            <div style={{border:'1px solid var(--border)',borderRadius:10,padding:'16px 18px',marginBottom:18}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12,flexWrap:'wrap',gap:8}}>
                <div>
                  <div style={{fontWeight:700,fontSize:14}}>Domain Validation</div>
                  <div style={{fontSize:12,color:'var(--ink-muted)',marginTop:2}}>
                    Current method: <strong style={{color:'var(--blue-accent)',textTransform:'uppercase'}}>{ld.dcv_method}</strong>
                    {' · '}DCV Status: <strong style={{color: ld.dcv_status===2?'var(--green)':'var(--amber)'}}>{ld.dcv_status===2?'✓ Verified':'Pending'}</strong>
                  </div>
                </div>
                <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                  {/* Check DCV / trigger issuance */}
                  <button
                    className="btn btn-primary btn-sm"
                    disabled={dcvChecking}
                    onClick={async () => {
                      setDcvChecking(true); setActionMsg(null)
                      try {
                        const res = await fetch('/api/order-action', {
                          method:'POST', headers:{'Content-Type':'application/json'},
                          body: JSON.stringify({ action:'revalidate', order_id: order.gogetssl_order_id, domain: ld.domain })
                        })
                        const data = await res.json()
                        const r = data.result || {}
                        if (r.error || r.success === false) {
                          setActionMsg({ type:'error', text: r.message || r.description || JSON.stringify(r) })
                        } else {
                          setActionMsg({ type:'success', text:'✓ DCV check triggered. Refreshing status…' })
                          setTimeout(()=>fetchLive(), 2000)
                        }
                      } catch(e) { setActionMsg({ type:'error', text: e.message }) }
                      setDcvChecking(false)
                    }}
                    style={{display:'flex',alignItems:'center',gap:6}}
                  >
                    {dcvChecking?<><span className="spinner" style={{width:13,height:13,borderWidth:2}}/>Checking…</>:'↻ Check DCV status'}
                  </button>
                  {/* Change DCV method */}
                  <button className="btn btn-secondary btn-sm" onClick={()=>{setShowDcvChange(v=>!v);setNewDcvMethod(ld.dcv_method);setNewApproverEmail('')}}>
                    {showDcvChange?'Cancel':'Change method'}
                  </button>
                </div>
              </div>

              {/* Change DCV method panel */}
              {showDcvChange && (
                <div style={{borderTop:'1px solid var(--border)',paddingTop:14}}>
                  <div style={{fontSize:13,fontWeight:500,marginBottom:10}}>Switch to a different validation method</div>
                  <div style={{display:'flex',flexDirection:'column',gap:8,marginBottom:12}}>
                    {[
                      {v:'dns', icon:'🌐', label:'DNS TXT record', desc:'Add a TXT record to DNS. Works even if the site is offline.'},
                      {v:'http', icon:'📁', label:'HTTP file validation', desc:'Create a file on your web server at a specific URL.'},
                      {v:'https', icon:'🔒', label:'HTTPS file validation', desc:'Same as HTTP but over HTTPS.'},
                      {v:'email', icon:'✉️', label:'Email validation', desc:'Approval email sent to a domain admin address.'},
                    ].map(opt=>(
                      <label key={opt.v} style={{display:'flex',gap:10,padding:'10px 12px',border:`1.5px solid ${newDcvMethod===opt.v?'var(--blue-accent)':'var(--border)'}`,borderRadius:7,cursor:'pointer',background:newDcvMethod===opt.v?'var(--blue-sky)':'var(--white)',opacity:opt.v===ld.dcv_method?0.65:1}}>
                        <input type="radio" name="new_dcv" value={opt.v} checked={newDcvMethod===opt.v} onChange={e=>setNewDcvMethod(e.target.value)} style={{marginTop:2,flexShrink:0}} disabled={opt.v===ld.dcv_method}/>
                        <div>
                          <div style={{fontWeight:600,fontSize:13}}>{opt.icon} {opt.label} {opt.v===ld.dcv_method&&<span style={{fontSize:11,color:'var(--ink-muted)'}}>(current)</span>}</div>
                          <div style={{fontSize:12,color:'var(--ink-muted)'}}>{opt.desc}</div>
                        </div>
                      </label>
                    ))}
                  </div>

                  {newDcvMethod==='email' && (
                    <div className="form-group" style={{marginBottom:12}}>
                      <label className="form-label">Approver email <span style={{color:'var(--red)'}}>*</span></label>
                      <select className="form-input form-select" value={newApproverEmail} onChange={e=>setNewApproverEmail(e.target.value)}>
                        <option value="">— Select email —</option>
                        {['admin','administrator','postmaster','hostmaster','webmaster'].map(p=>{
                          const e=`${p}@${(ld.domain||'').replace(/^\*\./,'')}`
                          return <option key={e} value={e}>{e}</option>
                        })}
                      </select>
                    </div>
                  )}

                  <button
                    className="btn btn-primary btn-sm"
                    disabled={dcvChanging || newDcvMethod===ld.dcv_method || (newDcvMethod==='email'&&!newApproverEmail)}
                    onClick={async()=>{
                      setDcvChanging(true); setActionMsg(null)
                      try {
                        const res = await fetch('/api/order-action', {
                          method:'POST', headers:{'Content-Type':'application/json'},
                          body: JSON.stringify({
                            action:'change_dcv',
                            order_id: order.gogetssl_order_id,
                            domain: ld.domain,
                            new_method: newDcvMethod,
                            approver_email: newDcvMethod==='email' ? newApproverEmail : undefined
                          })
                        })
                        const data = await res.json()
                        const r = data.result || {}
                        if (r.error || r.success === false) {
                          setActionMsg({ type:'error', text: r.message || r.description || JSON.stringify(r) })
                        } else {
                          setActionMsg({ type:'success', text:`✓ Validation method changed to ${newDcvMethod.toUpperCase()}. New instructions below.` })
                          setShowDcvChange(false)
                          // Refresh to get new DCV data
                          setTimeout(async()=>{
                            await fetchLive()
                          }, 1000)
                        }
                      } catch(e) { setActionMsg({ type:'error', text: e.message }) }
                      setDcvChanging(false)
                    }}
                    style={{display:'flex',alignItems:'center',gap:6}}
                  >
                    {dcvChanging?<><span className="spinner" style={{width:13,height:13,borderWidth:2}}/>Changing…</>:`Switch to ${newDcvMethod.toUpperCase()}`}
                  </button>
                </div>
              )}

              {/* Show current DCV instructions inline */}
              {ld.approver_method && (
                <div style={{marginTop:showDcvChange?12:0,paddingTop:showDcvChange?12:0,borderTop:showDcvChange?'1px solid var(--border)':'none'}}>
                  <DcvBox dcvMethod={ld.dcv_method} approverMethod={ld.approver_method} domain={ld.domain}/>
                </div>
              )}
            </div>
          )}
            {!loading&&ld&&(
            <>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:18}}>
                {[
                  ['GoGetSSL ID','#'+ld.order_id,true],
                  ['Internal ID',ld.internal_id||'—',true],
                  ['Status',ld.status||'—',false],
                  ['DCV Status',ld.dcv_status===2?'✓ Verified':ld.dcv_status===1?'Pending':'Not set',false],
                  ['Domain',ld.domain||'—',true],
                  ['Product',PRODUCT_MAP[ld.product_id]||`#${ld.product_id}`||'—',false],
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

              {ld.admin_msg&&<div className="alert alert-info" style={{marginBottom:14,fontSize:13}}><strong>CA:</strong> {ld.admin_msg}</div>}

              {/* Actions */}
              <div style={{borderTop:'1px solid var(--border)',paddingTop:14,marginBottom:16}}>
                <div style={{fontSize:11,fontWeight:600,color:'var(--ink-muted)',letterSpacing:'.07em',marginBottom:10}}>ACTIONS</div>
                <div style={{display:'flex',flexWrap:'wrap',gap:8}}>
                  {isIncomplete&&!showGen&&!dcvResult&&<button className="btn btn-primary btn-sm" onClick={()=>{setGenMode('new');setShowGen(true)}} style={{background:'#d97706'}}>⚙ Generate Certificate</button>}
                  {hasCert&&<>
                    <button className="btn btn-secondary btn-sm" onClick={()=>download(ld.crt_code,`cert_${ld.order_id}.crt`)}>↓ Certificate</button>
                    {hasCa&&<button className="btn btn-secondary btn-sm" onClick={()=>download(ld.ca_code,`ca_${ld.order_id}.crt`)}>↓ CA Bundle</button>}
                  </>}
                  {isPending&&<button className="btn btn-secondary btn-sm" onClick={()=>doAction('resend_email')}>✉ Resend Validation Email</button>}
                  {canReissue&&!isIncomplete&&<button className="btn btn-secondary btn-sm" onClick={()=>{setGenMode('reissue');setShowGen(true)}}>↺ Reissue Certificate</button>}
                  {canCancel&&!cancelConfirm&&<button className="btn btn-danger btn-sm" onClick={()=>setCancelConfirm(true)}>Cancel Order</button>}
                  <a href={`https://my.gogetssl.com/en/certificates/${order?.gogetssl_order_id}`} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm">GoGetSSL portal ↗</a>
                </div>
                {cancelConfirm&&(
                  <div style={{marginTop:10,background:'var(--red-bg)',padding:'12px 14px',borderRadius:8,border:'1px solid rgba(220,38,38,.2)'}}>
                    <div style={{fontSize:13,color:'var(--red-text)',marginBottom:10,fontWeight:500}}>Cancel order #{order?.gogetssl_order_id}?</div>
                    <div style={{fontSize:12,color:'var(--red-text)',marginBottom:12,opacity:.85}}>
                      This calls GoGetSSL's cancel API and updates the order status. Cannot be undone for active certificates.
                    </div>
                    <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                      <button className="btn btn-danger btn-sm" onClick={async()=>{
                        setCancelConfirm(false)
                        await doAction('cancel', { reason:'end' })
                        // Force reload to show updated status
                        setTimeout(()=>fetchLive(), 1000)
                      }}>Confirm — Cancel in GoGetSSL</button>
                      <button className="btn btn-secondary btn-sm" onClick={()=>setCancelConfirm(false)}>No, keep</button>
                    </div>
                  </div>
                )}
              </div>

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
                    setActionMsg({type:'success',text:'✓ Partner saved'})
                    onRefresh?.()
                  }}>Save</button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}
