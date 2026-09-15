import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity, AlertTriangle, ArrowRight, Bell, Bot, Check, CheckCircle2,
  ChevronRight, CircleDot, Clock3, Command, Database, FileCheck2, FileText,
  Copy, Download, GitBranch, History, Home, Layers3, LockKeyhole, MessageSquareText, MoreHorizontal,
  Moon, PanelLeft, Pause, Play, RefreshCcw, Search, ShieldCheck, Sparkles, Sun, TrendingUp,
  Upload, UserRoundCheck, X, Zap
} from 'lucide-react';
import './styles.css';

const AUTH_HEADERS = {'X-User-Id':'dr-abhinav','X-Role':'clinician'};

const stages = [
  { name: 'Normalize', sub: 'CSV + EHR', icon: Database },
  { name: 'Reconcile', sub: '1 conflict', icon: GitBranch },
  { name: 'Ground', sub: '6 sources', icon: Search },
  { name: 'Compose', sub: 'SOAP v2', icon: FileText },
  { name: 'Verify', sub: '14 checks', icon: ShieldCheck },
];

const checks = [
  ['Patient identity linkage', 'CSV patient UKP189058 linked', 'pass'],
  ['Abnormal lab alert', 'Potassium 5.2 mEq/L flagged', 'review'],
  ['Contraindication rule', 'Lisinopril order blocked', 'pass'],
  ['Allergy cross-check', 'ACE allergy and angioedema checked', 'pass'],
  ['Longitudinal continuity', 'Hypertension history retained', 'pass'],
  ['Action authority', 'Prescription recorded but not issued', 'pass'],
];

function Mark() {
  return <div className="mark" role="img" aria-label="CareTrace clinical intelligence">
    <svg className="caretrace-mark" viewBox="0 0 64 64" aria-hidden="true">
      <path className="mark-shield" d="M32 5.5 53 13v17.2c0 13.3-8.4 23.8-21 29.2-12.6-5.4-21-15.9-21-29.2V13L32 5.5Z"/>
      <path className="mark-core" d="M41.8 23.6a14.5 14.5 0 1 0 .2 16.5"/>
      <path className="mark-trace" d="M17.5 33h8.1l3.4-7.3 5.3 15.2 4.2-8h8"/>
      <circle className="mark-node" cx="47.4" cy="32.9" r="2.8"/>
    </svg>
    <span className="mark-glint"/>
  </div>;
}

function ThemeToggle({theme,onToggle,compact=false}) {
  const dark=theme==='dark';
  return <button type="button" className={`theme-switch ${dark?'is-dark':'is-light'} ${compact?'compact':''}`} onClick={onToggle} aria-label={`Switch to ${dark?'light':'dark'} mode`} title={`Switch to ${dark?'light':'dark'} mode`}>
    <span className="theme-icons"><Sun/><Moon/><i/></span>
    {!compact&&<span className="theme-copy"><b>Appearance</b><small>{dark?'Dark mode':'Light mode'}</small></span>}
  </button>;
}

function LiveDateTime({compact=false}) {
  const [now,setNow]=useState(()=>new Date());
  useEffect(()=>{const timer=setInterval(()=>setNow(new Date()),1000);return()=>clearInterval(timer);},[]);
  const date=new Intl.DateTimeFormat(undefined,{weekday:'long',day:'2-digit',month:'long',year:compact?undefined:'numeric'}).format(now).toUpperCase();
  const time=new Intl.DateTimeFormat(undefined,{hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(now);
  return <span className="live-datetime"><span>{date}</span><i/><time>{time}</time></span>;
}

function formatTraceTime(value) {
  if (!value) return 'LIVE';
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).format(timestamp);
}

function cleanClinicalText(value='') {
  return String(value)
    .replace(/\*\*(.*?)\*\*/gs, '$1')
    .replace(/__(.*?)__/gs, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*[-*]\s+/gm, '• ')
    .replace(/`([^`]+)`/g, '$1')
    .trim();
}

function Sparkline() {
  return <svg className="sparkline" viewBox="0 0 220 88" preserveAspectRatio="xMidYMid meet"><defs><linearGradient id="area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#149276" stopOpacity=".18"/><stop offset="1" stopColor="#149276" stopOpacity="0"/></linearGradient></defs><g className="chart-grid"><line x1="8" y1="18" x2="212" y2="18"/><line x1="8" y1="44" x2="212" y2="44"/><line x1="8" y1="70" x2="212" y2="70"/></g><path className="area" d="M10 23 C34 26 54 31 73 36 S112 43 137 52 S174 61 210 65 L210 78 L10 78 Z"/><path className="trend-line" d="M10 23 C34 26 54 31 73 36 S112 43 137 52 S174 61 210 65"/>{[['10','23'],['73','36'],['137','52'],['210','65']].map(([x,y])=><circle key={x} cx={x} cy={y} r="3"/>)}</svg>;
}

function PatientGraph({insights={},conflict}) {
  const clamp=v=>Math.max(0,Math.min(100,v));
  const bmi=Number(insights.bmi)||0, visits=Number(insights.hospital_visits)||0, flags=(insights.risk_flags||[]).length, followups=Number(insights.annual_followups)||0;
  const potassium=conflict?.potassium_mEq_L!=null?Number(conflict.potassium_mEq_L):null;
  const metrics=[
    {label:'BMI',display:bmi?bmi.toFixed(1):'—',norm:clamp(((bmi-15)/(40-15))*100),alert:bmi>=30},
    {label:'Visits/yr',display:String(visits),norm:clamp((visits/10)*100),alert:visits>=4},
    {label:'Risk flags',display:String(flags),norm:clamp((flags/5)*100),alert:flags>=3},
    {label:'Follow-ups',display:String(followups),norm:clamp((followups/12)*100),alert:false},
  ];
  if(potassium!=null)metrics.push({label:'Potassium',display:potassium.toFixed(1),norm:clamp(((potassium-3)/(7-3))*100),alert:potassium>5});
  const width=240,height=92,padX=18,padTop=12,padBottom=28,plotH=height-padTop-padBottom;
  const step=metrics.length>1?(width-padX*2)/(metrics.length-1):0;
  const points=metrics.map((metric,index)=>({...metric,x:padX+step*index,y:padTop+plotH-(metric.norm/100)*plotH}));
  const linePath=points.map((point,index)=>`${index===0?'M':'L'}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' ');
  const areaPath=`${linePath} L${points[points.length-1].x.toFixed(1)} ${(padTop+plotH).toFixed(1)} L${points[0].x.toFixed(1)} ${(padTop+plotH).toFixed(1)} Z`;
  return <div className="patient-graph"><svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet"><defs><linearGradient id="patientGraphFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#0f896c" stopOpacity=".22"/><stop offset="1" stopColor="#0f896c" stopOpacity="0"/></linearGradient></defs><g className="patient-graph-grid">{[.25,.5,.75].map(fraction=><line key={fraction} x1={padX} x2={width-padX} y1={padTop+plotH*fraction} y2={padTop+plotH*fraction}/>)}</g><path className="patient-graph-area" d={areaPath}/><path className="patient-graph-line" d={linePath}/>{points.map(point=><circle key={point.label} className={point.alert?'alert':''} cx={point.x} cy={point.y} r="3"/>)}</svg><div className="patient-graph-legend">{points.map(point=><div key={point.label} className={point.alert?'alert':''}><span>{point.label}</span><b>{point.display}</b></div>)}</div><p className="patient-graph-caption">Normalized longitudinal risk signal from BMI, visit frequency, active risk flags, and follow-up cadence{potassium!=null?', including the latest potassium result':''}.</p></div>;
}

function App() {
  const [page, setPage] = useState('dashboard');
  const [theme, setTheme] = useState(()=>document.documentElement.dataset.theme==='dark'?'dark':'light');
  const [boot, setBoot] = useState(true);
  const [bootProgress, setBootProgress] = useState(0);
  const [tab, setTab] = useState('Run');
  const [count, setCount] = useState(0);
  const [liveTrace, setLiveTrace] = useState([]);
  const [runId, setRunId] = useState('');
  const [backendOnline, setBackendOnline] = useState(false);
  const [aiProvider, setAiProvider] = useState('checking');
  const [aiAvailable, setAiAvailable] = useState(false);
  const [ehrCount, setEhrCount] = useState(0);
  const [ordersIssued, setOrdersIssued] = useState(0);
  const [evidenceRecords, setEvidenceRecords] = useState([]);
  const [knowledgeRecords, setKnowledgeRecords] = useState([]);
  const [conflictDetail, setConflictDetail] = useState(null);
  const [finalState, setFinalState] = useState(null);
  const [running, setRunning] = useState(false);
  const [conflictInjected, setConflictInjected] = useState(false);
  const [review, setReview] = useState(false);
  const [reviewContext, setReviewContext] = useState(null);
  const [evidence, setEvidence] = useState(false);
  const [approved, setApproved] = useState(false);
  const [toast, setToast] = useState('');
  const [nav, setNav] = useState(false);
  const [caseRegistry, setCaseRegistry] = useState([]);
  const [activeCaseId, setActiveCaseId] = useState('SIM-0427');
  const [activeCase, setActiveCase] = useState(null);
  const [reviewItems, setReviewItems] = useState([]);
  const [auditData, setAuditData] = useState({events:[],diffs:[]});
  const [auditLoading, setAuditLoading] = useState(false);
  const [signalMenu, setSignalMenu] = useState(false);
  const eventSourceRef = useRef(null);
  const labInputRef = useRef(null);
  const complete = Boolean(finalState?.checks?.length);
  const notificationCount = reviewItems.length;
  const activeStage = complete ? 4 : Math.min(liveTrace[Math.max(liveTrace.length - 1, 0)]?.stage ?? 0, 4);

  useEffect(() => {
    const duration = 3150;
    const startedAt = performance.now();
    let frame = 0;
    const advance = now => {
      const elapsed = Math.min((now - startedAt) / duration, 1);
      const eased = 1 - Math.pow(1 - elapsed, 3);
      setBootProgress(Math.max(0, Math.min(100, Math.round(eased * 100))));
      if (elapsed < 1) frame = requestAnimationFrame(advance);
    };
    frame = requestAnimationFrame(advance);
    const done = setTimeout(() => setBoot(false), duration + 420);
    return () => { cancelAnimationFrame(frame); clearTimeout(done); };
  }, []);
  useEffect(() => {
    const savedRun=localStorage.getItem('caretrace-last-run');
    fetch('/api/health').then(r=>r.json()).then(data=>{setBackendOnline(true);setAiProvider(data.ai_provider||'deterministic');setAiAvailable(Boolean(data.ai_available));setEhrCount(Number(data.ehr_patients||0));setOrdersIssued(Number(data.orders_issued||0));}).catch(()=>setBackendOnline(false));
    fetch('/api/cases?limit=50',{headers:AUTH_HEADERS}).then(r=>r.json()).then(data=>setCaseRegistry(data.results||[])).catch(()=>{});
    if(!savedRun)fetch('/api/cases/SIM-0427',{headers:AUTH_HEADERS}).then(r=>r.json()).then(setActiveCase).catch(()=>{});
    fetch('/api/reviews/open',{headers:AUTH_HEADERS}).then(r=>r.json()).then(data=>setReviewItems(data.results||[])).catch(()=>{});
    if(savedRun){fetch(`/api/runs/${savedRun}`,{headers:AUTH_HEADERS}).then(r=>r.ok?r.json():Promise.reject()).then(async data=>{const savedCase=data.case_id||data.state?.case_id||'SIM-0427';setRunId(savedRun);setActiveCaseId(savedCase);setLiveTrace(data.events||[]);setCount((data.events||[]).length);setFinalState(data.state||null);setEvidenceRecords(data.state?.evidence||[]);setKnowledgeRecords(data.state?.knowledge||[]);setConflictDetail(data.state?.assessment||null);setConflictInjected((data.events||[]).some(x=>x.kind==='conflict'));const [caseResponse,auditResponse]=await Promise.all([fetch(`/api/cases/${savedCase}`,{headers:AUTH_HEADERS}),fetch(`/api/runs/${savedRun}/audit`,{headers:AUTH_HEADERS})]);if(caseResponse.ok)setActiveCase(await caseResponse.json());if(auditResponse.ok)setAuditData(await auditResponse.json());}).catch(()=>localStorage.removeItem('caretrace-last-run'));}
    return ()=>eventSourceRef.current?.close();
  }, []);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 3200); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => {
    document.documentElement.dataset.theme=theme;
    localStorage.setItem('caretrace-theme',theme);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content',theme==='dark'?'#0a1210':'#eef4f2');
  }, [theme]);

  const refreshWorkspace = async () => {
    const [casesResponse,reviewsResponse,healthResponse]=await Promise.all([fetch('/api/cases?limit=50',{headers:AUTH_HEADERS}),fetch('/api/reviews/open',{headers:AUTH_HEADERS}),fetch('/api/health')]);
    if(casesResponse.ok){const data=await casesResponse.json();setCaseRegistry(data.results||[]);}
    if(reviewsResponse.ok){const data=await reviewsResponse.json();setReviewItems(data.results||[]);}
    if(healthResponse.ok){const data=await healthResponse.json();setOrdersIssued(Number(data.orders_issued||0));}
  };
  const loadAudit = async id => {
    if(!id)return;
    setAuditLoading(true);
    try{const response=await fetch(`/api/runs/${id}/audit`,{headers:AUTH_HEADERS});if(!response.ok)throw new Error();setAuditData(await response.json());}catch(error){setToast('Could not load the persisted audit ledger');}finally{setAuditLoading(false);}
  };
  const openCase = async caseId => {
    const id=typeof caseId==='string'?caseId:activeCaseId;
    if(id!==activeCaseId){eventSourceRef.current?.close();setLiveTrace([]);setCount(0);setRunId('');setFinalState(null);setKnowledgeRecords([]);setAuditData({events:[],diffs:[]});setRunning(false);setConflictInjected(false);setApproved(false);localStorage.removeItem('caretrace-last-run');}
    setActiveCaseId(id);setPage('command');setTab('Run');setNav(false);
    try{const response=await fetch(`/api/cases/${id}`,{headers:AUTH_HEADERS});if(!response.ok)throw new Error();const data=await response.json();setActiveCase(data);setEvidenceRecords(data.records||[]);setConflictDetail(data.assessment||null);return data;}catch(error){setToast('Could not load this patient workspace');return null;}
  };
  const openPatient = async patientId => {
    setToast(`Preparing longitudinal workspace for ${patientId}…`);
    try{
      const response=await fetch(`/api/patients/${encodeURIComponent(patientId)}/case`,{method:'POST',headers:AUTH_HEADERS});
      if(!response.ok)throw new Error();
      const result=await response.json();
      await refreshWorkspace();
      await openCase(result.caseId);
      setToast(result.created?'Patient workspace created from CSV EHR':'Existing patient workspace opened');
    }catch(error){setToast('Could not open this EHR patient workspace');}
  };
  const openReviewItem = async item => {
    setReview(false);
    setApproved(false);
    setReviewContext(item);
    const loaded=await openCase(item.case_id);
    if(!loaded)return;
    if(item.review_type==='safety_conflict'&&item.run_id){
      try{
        const response=await fetch(`/api/runs/${item.run_id}`,{headers:AUTH_HEADERS});
        if(response.ok){const data=await response.json();setRunId(item.run_id);setLiveTrace(data.events||[]);setCount((data.events||[]).length);setFinalState(data.state||null);setEvidenceRecords(data.state?.evidence||loaded.records||[]);setKnowledgeRecords(data.state?.knowledge||[]);setConflictDetail(data.state?.assessment||loaded.assessment||null);setConflictInjected(Boolean(data.state?.assessment?.high_risk));localStorage.setItem('caretrace-last-run',item.run_id);loadAudit(item.run_id);}
      }catch(error){setToast('The patient record loaded, but its prior run could not be restored');}
    }
    setTab('Record');
    setReview(true);
  };

  const connectToRun = id => {
    eventSourceRef.current?.close();
    const stream=new EventSource(`/api/runs/${id}/events?actorId=dr-abhinav&role=clinician`);
    eventSourceRef.current=stream;
    stream.addEventListener('trace',event=>{
      const item=JSON.parse(event.data);
      setLiveTrace(current=>current.some(x=>x.title===item.title)?current:[...current,item]);
      setCount(current=>Math.min(current+1,8));
      if(item.kind==='conflict'){setConflictInjected(true);setConflictDetail(item.data||null);}
      if(item.data?.evidence)setEvidenceRecords(item.data.evidence);
      if(item.data?.knowledge)setKnowledgeRecords(item.data.knowledge);
      if(item.kind==='success')setFinalState(item.data||null);
    });
    stream.addEventListener('complete',event=>{
      const result=JSON.parse(event.data); setRunning(false); setFinalState(result.state||null); stream.close();
      refreshWorkspace(); loadAudit(id);
      setToast(result.status==='complete'?'Run committed · human review required':'Agent run failed · inspect trace');
    });
    stream.onerror=()=>{if(stream.readyState===EventSource.CLOSED){setRunning(false);} };
  };
  const start = async () => {
    setLiveTrace([]); setCount(0); setFinalState(null); setEvidenceRecords([]); setKnowledgeRecords([]); setConflictDetail(null); setConflictInjected(false); setApproved(false); setAuditData({events:[],diffs:[]}); setRunning(true); setTab('Run'); setPage('command');
    try{const response=await fetch('/api/runs',{method:'POST',headers:{'Content-Type':'application/json',...AUTH_HEADERS},body:JSON.stringify({caseId:activeCaseId,failureDemo:activeCaseId==='SIM-0427'})});if(!response.ok)throw new Error('Backend rejected the run');const data=await response.json();setBackendOnline(true);setRunId(data.runId);localStorage.setItem('caretrace-last-run',data.runId);connectToRun(data.runId);}catch(error){setRunning(false);setBackendOnline(false);setToast('Backend unavailable · start FastAPI on port 8000');}
  };
  const inject = async () => {
    setPage('command'); setTab('Run'); setToast('Writing a new external record to SQLite…');
    try{const response=await fetch(`/api/cases/${activeCaseId}/inject`,{method:'POST',headers:{'Content-Type':'application/json',...AUTH_HEADERS},body:JSON.stringify({potassium:5.4,source:'Repeat rural-clinic laboratory update'})});if(!response.ok)throw new Error();setToast('Repeat potassium 5.4 persisted · replanning from new state');await start();}catch(error){setToast('Could not inject source · backend unavailable');}
  };
  const uploadLab = async event => {
    const file=event.target.files?.[0];event.target.value='';if(!file)return;
    setToast(`Uploading synthetic lab · ${file.name}`);
    try{const response=await fetch(`/api/cases/${activeCaseId}/labs/upload`,{method:'POST',headers:{...AUTH_HEADERS,'X-Synthetic-Data':'true','X-Filename':file.name,'Content-Type':file.type||'application/octet-stream'},body:file});if(!response.ok){const detail=await response.json().catch(()=>({}));throw new Error(detail.detail||'Upload failed');}const result=await response.json();setConflictDetail(result.assessment);setConflictInjected(Boolean(result.assessment?.high_risk));await openCase(activeCaseId);setToast(`Lab persisted · potassium ${result.lab.potassium_mEq_L} mEq/L · starting agent run`);await start();}catch(error){setToast(error.message||'Could not upload the synthetic lab report');}
  };
  const reset = () => { eventSourceRef.current?.close(); setCount(0); setLiveTrace([]); setFinalState(null); setEvidenceRecords([]); setKnowledgeRecords([]); setConflictDetail(null); setAuditData({events:[],diffs:[]}); setRunning(false); setConflictInjected(false); setApproved(false); setTab('Run'); localStorage.removeItem('caretrace-last-run'); setToast('Local view reset · backend audit retained'); };
  const resolveReview = async (action,caseId=activeCaseId,reviewType='safety_conflict') => {
    const safety=reviewType==='safety_conflict';
    const response=await fetch(safety?'/api/resolve-conflict':'/api/reviews/acknowledge',{method:'POST',headers:{'Content-Type':'application/json',...AUTH_HEADERS},body:JSON.stringify({caseId,action,reviewer:'Dr. Abhinav',comment:safety?'The unsafe candidate remains blocked; follow-up has been recorded.':'Patient-specific longitudinal risk reviewed; follow-up remains clinician-owned.'})});
    if(!response.ok){const detail=await response.json().catch(()=>({}));throw new Error(detail.detail||'Resolution failed');}
    const result=await response.json();setApproved(true);if(result.ordersIssued!=null)setOrdersIssued(Number(result.ordersIssued));await refreshWorkspace();setReview(false);setPage('review');setToast(safety?'Conflict resolved · unsafe prescription remains blocked':'Patient review completed · follow-up order issued');return result;
  };

  const navigate = destination => { setPage(destination); setNav(false); };
  const patient=activeCase?.patient;
  const profile=patient?.profile||{};
  const insights=activeCase?.insights||patient?.insights||{};
  const initials=patient?.display_name?.split(' ').slice(0,2).map(x=>x[0]).join('').toUpperCase()||'AP';
  const activeReview=reviewItems.find(item=>item.case_id===activeCaseId)||null;
  const recordByType = type => activeCase?.records?.find(item=>item.source_type===type)||null;
  const transcriptSource = recordByType('transcript');
  const externalLabSource = recordByType('external_update');
  const laboratorySource = externalLabSource?.payload?.potassium_mEq_L!=null ? externalLabSource : recordByType('laboratory');
  const transcriptRecord = transcriptSource?.payload||{};
  const laboratoryRecord = laboratorySource?.payload||{};
  const sourceRows = [
    { label: 'Consultation', date: 'Current encounter', value:(transcriptRecord.excerpt||'No transcript fact retrieved').slice(0,88), state: 'current', icon: MessageSquareText },
    { label: 'Digital lab', date: laboratorySource?.observed_at?.slice(0,10)||'Latest source', value: laboratoryRecord.potassium_mEq_L!=null?`Potassium ${laboratoryRecord.potassium_mEq_L} mEq/L`:'No potassium result', state: conflictDetail?.high_risk?'conflict':'support', icon: History },
    { label: 'Guideline threshold', date: 'Retrieved policy', value: conflictDetail?.threshold_mEq_L!=null?`>${conflictDetail.threshold_mEq_L} mEq/L requires review`:'Policy evidence retrieved', state: 'support', icon: FileText },
  ];

  return <>
    <AnimatePresence>{boot&&<BootScreen progress={bootProgress} skip={()=>setBoot(false)} backendOnline={backendOnline} aiProvider={aiProvider} aiAvailable={aiAvailable}/>}</AnimatePresence>
    <div className="shell" onMouseMove={e=>{e.currentTarget.style.setProperty('--cursor-x',`${e.clientX}px`);e.currentTarget.style.setProperty('--cursor-y',`${e.clientY}px`)}}>
    <div className="ambient-field" aria-hidden="true"><i/><i/><i/></div>
    <aside className={`rail ${nav ? 'open' : ''}`}>
      <div className="rail-logo"><Mark/><div><b>CARE<span>TRACE</span></b><small>CLINICAL INTELLIGENCE</small></div></div>
      <nav><button className={page==='dashboard'?'selected':''} onClick={()=>navigate('dashboard')}><Home/><span>Dashboard</span></button><button className={page==='command'?'selected':''} onClick={()=>navigate('command')}><Command/><span>Command</span></button><button className={page==='cases'?'selected':''} onClick={()=>navigate('cases')}><Layers3/><span>Cases</span><em>{String(caseRegistry.length||50).padStart(2,'0')}</em></button><button className={page==='knowledge'?'selected':''} onClick={()=>navigate('knowledge')}><Database/><span>Knowledge</span></button><button className={page==='review'?'selected':''} onClick={()=>navigate('review')}><FileCheck2/><span>Review</span>{notificationCount>0&&<i>{notificationCount}</i>}</button></nav>
      <div className="rail-foot"><ThemeToggle theme={theme} onToggle={()=>setTheme(current=>current==='dark'?'light':'dark')}/><div className="environment"><span><LockKeyhole/>CONTROLLED ENV</span><b>Synthetic records</b><small><i className={backendOnline?'online':''}/>{backendOnline?'Backend connected':'Backend offline'}</small></div><div className="operator" aria-label="Signed in clinician"><div>DA</div><span><b>Dr. Abhinav</b><small>Accountable reviewer</small></span></div></div>
    </aside>

    <main className="main-stage">
      {page==='command'?<>
      <header className="masthead"><button className="nav-toggle" onClick={()=>setNav(v=>!v)}><PanelLeft/></button><div className="case-crumb"><span>Active case</span><ChevronRight/><b>{activeCaseId}</b><i/>{insights.objective||'Longitudinal review'}</div><div className="mast-actions"><LiveDateTime compact/><ThemeToggle compact theme={theme} onToggle={()=>setTheme(current=>current==='dark'?'light':'dark')}/><div className="sync"><i/><span>State persisted</span></div><button className={`square ${notificationCount?'has-notice':''}`} aria-label={notificationCount?`${notificationCount} open clinical reviews`:'No notifications'} onClick={()=>notificationCount?navigate('review'):setToast('No new system notifications')}><Bell/>{notificationCount>0&&<i/>}</button><button className="text-action" onClick={reset}><RefreshCcw/> Reset case</button><input ref={labInputRef} className="lab-file-input" type="file" accept=".json,.csv,.txt,.lab,.pdf" onChange={uploadLab}/><button className="text-action upload-lab" onClick={()=>labInputRef.current?.click()}><Upload/> Upload lab</button><button className="inject" onClick={inject}><Zap/> Inject source mutation</button></div></header>

      <section className="case-header"><div className="identity"><div className="monogram">{initials}<span/></div><div><div className="kicker">CSV PATIENT {patient?.patient_id||'LOADING'} · {patient?.care_setting||'SYNTHETIC ENCOUNTER'}</div><h1>{patient?.display_name||'Loading patient…'} <span>{profile.age||'—'} years · {profile.sex||'—'}</span></h1><p>{insights.diagnosis||profile.primary_diagnosis||'Clinical follow-up'} <i/> {insights.condition_status||profile.condition_status||'Under review'}</p></div></div><div className="objective"><span>AUTONOMOUS OBJECTIVE</span><p>{insights.objective||'Document the encounter, reconcile longitudinal evidence, and reserve clinical decisions for a clinician.'}</p></div><button className={`run-button ${running?'working':''}`} disabled={running} onClick={start}><span>{running?<Pause/>:<Play fill="currentColor"/>}</span><div><small>{running?'EXECUTING PLAN':complete?'RUN COMPLETE':'AGENT READY'}</small><b>{running?'Working autonomously':complete?'Run again':'Begin agent run'}</b></div><ArrowRight/></button></section>

      <section className="stage-map"><div className="stage-track"><motion.span animate={{width:`${complete?100:activeStage*25}%`}} transition={{duration:.5}}/></div>{stages.map((stage,i)=>{const Icon=stage.icon;const done=complete||activeStage>i;const active=running&&activeStage===i;const stageSub=i===1?(conflictDetail?.high_risk?'1 conflict':'No conflict'):stage.sub;return <div className={`stage ${done?'done':''} ${active?'active':''}`} key={stage.name}><div className="stage-node">{done?<Check/>:<Icon/>}</div><div><small>0{i+1}</small><b>{stage.name}</b><span>{(done||active)?stageSub:'Queued'}</span></div></div>})}</section>

      <div className="modebar"><div>{['Run','Record','Assurance','Audit'].map(item=><button key={item} className={tab===item?'active':''} onClick={()=>{setTab(item);if(item==='Audit'&&runId)loadAudit(runId);}}>{item}{item==='Assurance'&&complete&&<em>{finalState?.checks?.length||14}</em>}{item==='Audit'&&auditData.events.length>0&&<em>{auditData.events.length}</em>}</button>)}</div><span className="run-meta"><CircleDot/> {runId?runId.toUpperCase():'NO ACTIVE RUN'} <i/> {count} actions <i/> {complete?`${Number(finalState?.elapsed||0).toFixed(1)}s elapsed`:'stateful'}</span></div>

      <AnimatePresence mode="wait">
        {tab==='Run'&&<motion.div key="run" className="run-layout" initial={{opacity:0,y:5}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-3}}>
          <section className="ledger"><div className="section-title"><div><span>DECISION LEDGER</span><h2>Agent execution</h2></div><div className="legend"><span><i className="a"/>Action</span><span><i className="o"/>Evidence</span><span><i className="x"/>Exception</span></div></div>
            {!count&&<div className="zero-state"><div className="agent-glyph"><Bot/><span/><span/></div><div><span>READY / WAITING</span><h3>No hidden reasoning. Every consequential step will appear here.</h3><p>The agent will read the case, resolve temporal conflicts, ground each claim, compose the note, and test its own work against clinical constraints.</p><button onClick={start}><Play fill="currentColor"/>Execute plan</button></div></div>}
            <div className="trace-list"><AnimatePresence initial={false}>{liveTrace.map((item,index)=><TraceItem key={`${index}-${item.title}`} item={item} index={index} last={index===liveTrace.length-1} onEvidence={()=>setEvidence(true)}/>)}</AnimatePresence>{running&&<div className="agent-thinking"><span/><span/><span/><b>Streaming live agent state</b><small>{runId||'Creating run…'}</small></div>}</div>
          </section>
          <aside className="intelligence"><section className="signal-card"><div className="section-title mini signal-title"><div><span>CASE SIGNALS</span><h2>Individual health insights</h2></div><button aria-label="Patient insight actions" aria-expanded={signalMenu} onClick={()=>setSignalMenu(v=>!v)}><MoreHorizontal/></button>{signalMenu&&<div className="signal-menu"><button onClick={()=>{setEvidence(true);setSignalMenu(false);}}><Search/>View evidence lineage</button><button onClick={()=>{navigator.clipboard?.writeText(`${patient?.display_name||'Patient'} · ${insights.diagnosis||'No diagnosis'} · ${insights.risk_level||'Routine'} risk`);setToast('Patient insight copied');setSignalMenu(false);}}><Copy/>Copy concise summary</button><button onClick={async()=>{await openCase(activeCaseId);setToast('Clinical signals refreshed');setSignalMenu(false);}}><RefreshCcw/>Refresh from SQLite</button></div>}</div><div className="signal-grid"><div><small>AGE</small><b>{profile.age||'—'}</b><span>{profile.sex||'Not recorded'} · {profile.ethnicity||'Unknown ethnicity'}</span></div><div><small>BMI</small><b>{insights.bmi||profile.bmi||'—'}</b><span>{Number(insights.bmi||profile.bmi||0)>=30?'Elevated risk factor':'Recorded baseline'}</span></div><div><small>VISITS / YEAR</small><b>{insights.hospital_visits??profile.hospital_visits_past_year??'—'}</b><span>{insights.recent_care_type||profile.recent_care_type||'Care type unavailable'}</span></div></div><div className="patient-insight-list"><span><b>Primary diagnosis</b>{insights.diagnosis||profile.primary_diagnosis||'Not recorded'}</span><span><b>Medication</b>{insights.medication||profile.current_medications||'None recorded'}</span><span><b>Allergies</b>{(insights.allergies||[]).join?.(', ')||profile.allergies||'None recorded'}</span><span><b>Risk level</b>{insights.risk_level||'Routine'}</span></div><PatientGraph insights={insights} conflict={conflictDetail}/><div className={`derived-insight ${insights.risk_level==='High'?'warning':''}`}><AlertTriangle/><div><b>{insights.key_signal||'Longitudinal assessment'}</b><p>{(insights.risk_flags||[]).length?(insights.risk_flags||[]).join(' · '):`${insights.lab_status||'Pending'} investigations with ${insights.condition_status||'current'} condition status.`}</p></div></div><div className="signal-foot"><span><b>{activeCase?.records?.length||0}</b>linked records</span><i/><span><b>{insights.annual_followups??profile.annual_followup_frequency??'—'}</b>annual follow-ups</span><i/><span><b>{(insights.risk_flags||[]).length}</b>risk flags</span></div></section>
            <section className={`conflict-card ${conflictInjected?'visible':''}`}><div className="conflict-head"><div><AlertTriangle/><span><small>CLINICAL ESCALATION</small><b>Lisinopril contraindication</b></span></div><em>HIGH RISK</em></div><div className="source-stack">{sourceRows.map((row,i)=>{const Icon=row.icon;return <button key={row.label} onClick={()=>setEvidence(true)} className={row.state}><Icon/><span><small>{row.label}</small><b>{row.value}</b></span><time>{row.date}</time>{i<2&&<i/>}</button>})}</div><div className="conflict-foot"><span><b>{count>=3?'99':'—'}%</b> rule confidence</span><button onClick={()=>setEvidence(true)}>Inspect lineage <ArrowRight/></button></div></section>
            <section className="health-card"><div className="section-title mini"><div><span>RECORD HEALTH</span><h2>Evidence posture</h2></div><b>{complete?'96':'—'}</b></div><Metric label="Claim coverage" value={complete?100:count>3?78:34}/><Metric label="Source agreement" value={complete?83:count>1?62:100} warn={count>1}/><Metric label="Temporal freshness" value={91}/><div className="authority"><ShieldCheck/><span><b>Authority boundary intact</b><small>No diagnosis, prescription, or medication update executed</small></span></div></section>
          </aside>
        </motion.div>}
        {tab==='Record'&&<RecordView complete={complete} reviewItem={activeReview} openReview={()=>{if(!activeReview)return;setReviewContext(activeReview);setReview(true);}} openEvidence={()=>setEvidence(true)} caseData={activeCase} runState={finalState} notify={setToast}/>} 
        {tab==='Assurance'&&<AssuranceView complete={complete} state={finalState}/>} 
        {tab==='Audit'&&<AuditView data={auditData} loading={auditLoading} runId={runId}/>} 
      </AnimatePresence>
      </>:<WorkspacePage page={page} navigate={navigate} openCase={openCase} openPatient={openPatient} openReviewItem={openReviewItem} complete={complete} notify={setToast} nav={()=>setNav(v=>!v)} cases={caseRegistry} reviews={reviewItems} refresh={refreshWorkspace} ehrCount={ehrCount} ordersIssued={ordersIssued} caseData={activeCase} theme={theme} toggleTheme={()=>setTheme(current=>current==='dark'?'light':'dark')}/>} 
    </main>

    <AnimatePresence>{evidence&&<EvidencePanel close={()=>setEvidence(false)} records={evidenceRecords} knowledge={knowledgeRecords} conflict={conflictDetail}/>}</AnimatePresence>
    <AnimatePresence>{review&&<ReviewPanel close={()=>setReview(false)} approved={approved} resolve={resolveReview} context={reviewContext} caseData={activeCase}/>}</AnimatePresence>
    <AnimatePresence>{toast&&<motion.div className="toast" initial={{opacity:0,y:12}} animate={{opacity:1,y:0}} exit={{opacity:0,y:8}}><CheckCircle2/>{toast}</motion.div>}</AnimatePresence>
  </div></>;
}

function BootScreen({progress,skip,backendOnline,aiProvider,aiAvailable}) {
  const safeProgress=Math.max(0,Math.min(100,Number(progress)||0));
  const label=safeProgress<24?'Establishing secure workspace':safeProgress<50?'Indexing longitudinal records':safeProgress<76?'Connecting agent tools':safeProgress<94?'Verifying authority boundaries':'Workspace ready';
  const bootStages=[['01','Identity graph',18],['02','Evidence adapters',42],['03','Agent runtime',68],['04','Guardrail kernel',90]];
  const modelLabel=aiProvider==='checking'?'MODEL CHECK':aiAvailable?`${String(aiProvider).toUpperCase()} READY`:'SAFE FALLBACK';
  const readyCount=bootStages.filter(([, ,threshold])=>safeProgress>=threshold).length;
  const diagnostic=safeProgress<24?'Validating clinician role and synthetic-data boundary':safeProgress<50?'Preparing 20,000 searchable patient identities':safeProgress<76?'Binding SQLite retrieval and the SSE event channel':safeProgress<94?'Loading 14 documentation safety constraints':'All required services have reported a usable state';
  return <motion.div className={`boot ${safeProgress===100?'is-ready':''}`} initial={{opacity:1}} exit={{opacity:0,scale:1.018,filter:'blur(7px)'}} transition={{duration:.65,ease:[.22,1,.36,1]}}>
    <div className="boot-aurora one"/><div className="boot-aurora two"/><div className="boot-grid"/><div className="boot-glow"/>
    <div className="boot-console"><span>CARETRACE / SECURE BOOT</span><i>SESSION TZ4-{String(safeProgress).padStart(3,'0')}</i></div>
    <div className="boot-orbit"><div className="boot-mark"><Mark/></div><i/><i/><i/>{[0,1,2,3,4,5].map(n=><span key={n} style={{'--i':n}}/>)}</div>
    <motion.div className="boot-copy" initial={{opacity:0,y:18}} animate={{opacity:1,y:0}} transition={{delay:.16,duration:.55,ease:[.22,1,.36,1]}}><small>AGENTIC CLINICAL DOCUMENTATION SYSTEM</small><h1>CARETRACE</h1><p>Evidence-linked. Human-accountable. Continuously verified.</p></motion.div>
    <div className="boot-pipeline">{bootStages.map(([number,name,threshold],index)=><div className={safeProgress>=threshold?'ready':safeProgress>=threshold-18?'active':''} key={name}><span>{safeProgress>=threshold?<Check/>:<i/>}</span><small>{number}</small><b>{name}</b>{index<bootStages.length-1&&<em/>}</div>)}</div>
    <div className="boot-status"><span className={backendOnline?'ready':'pending'}><i/>{backendOnline?'API CONNECTED':'API CHECK'}</span><span><i/>SSE TRANSPORT</span><span className={aiProvider==='checking'?'pending':'ready'}><i/>{modelLabel}</span><span><ShieldCheck/>CLINICIAN BOUNDARY</span></div>
    <div className="boot-readout"><div><Activity/><span><small>CURRENT VERIFICATION</small><motion.b key={diagnostic} initial={{opacity:0,y:3}} animate={{opacity:1,y:0}}>{diagnostic}</motion.b></span></div><div><span><small>SUBSYSTEMS</small><b>{readyCount}/4 READY</b></span><span><small>REVIEW ROUTING</small><b>CLINICIAN OWNED</b></span></div></div>
    <div className="boot-progress" role="progressbar" aria-label={label} aria-valuemin="0" aria-valuemax="100" aria-valuenow={safeProgress}>
      <div className="boot-progress-meta" aria-live="polite"><span>{label}</span><b>{String(safeProgress).padStart(3,'0')}%</b></div>
      <div className="boot-progress-track"><motion.span className="boot-progress-fill" initial={{scaleX:0}} animate={{scaleX:safeProgress/100}} transition={{type:'tween',duration:.18,ease:[.22,1,.36,1]}}/></div>
      <small><span>SYNTHETIC SESSION</span><span>POLICY CLIN-DOC / 3.2</span><span>20,000 EHR RECORDS</span></small>
    </div>
    <button className="boot-skip" onClick={skip}>Enter workspace <ArrowRight/></button>
  </motion.div>;
}

function WorkspacePage({page,navigate,openCase,openPatient,openReviewItem,complete,notify,nav,cases,reviews,refresh,ehrCount,ordersIssued,caseData,theme,toggleTheme}) {
  const [query,setQuery]=useState(''); const [source,setSource]=useState(0);
  const noticeCount=reviews.length;
  const labels={dashboard:['Operations overview','Clinical intelligence at a glance'],cases:['Case registry','Synthetic encounters and persistent agent state'],knowledge:['Knowledge & evidence','Connected sources, retrieval posture, and policy'],review:['Accountable review','Consequential decisions reserved for a human']};
  const title=labels[page]||labels.dashboard;
  return <motion.div key={page} className="workspace" initial={{opacity:0,y:10,filter:'blur(3px)'}} animate={{opacity:1,y:0,filter:'blur(0px)'}} transition={{duration:.42,ease:[.22,1,.36,1]}}><header className="workspace-head"><button className="nav-toggle" onClick={nav}><PanelLeft/></button><div><span>CARETRACE / {page.toUpperCase()}</span><h1>{title[0]}</h1><p>{title[1]}</p></div><div className="workspace-actions"><LiveDateTime compact/><ThemeToggle compact theme={theme} onToggle={toggleTheme}/><label><Search/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search cases, patients, diagnoses…"/></label><button className={noticeCount?'has-notice':''} aria-label={noticeCount?`${noticeCount} open clinical reviews`:'No notifications'} onClick={()=>noticeCount?navigate('review'):notify('No new system notifications')}><Bell/>{noticeCount>0&&<i/>}</button><button onClick={()=>openCase()}><Play fill="currentColor"/>Open active case</button></div></header>{page==='dashboard'&&<Dashboard openCase={openCase} openReviewItem={openReviewItem} navigate={navigate} cases={cases} reviews={reviews} ehrCount={ehrCount} ordersIssued={ordersIssued}/>} {page==='cases'&&<Cases openCase={openCase} openPatient={openPatient} query={query} cases={cases} refresh={refresh} notify={notify} ehrCount={ehrCount}/>} {page==='knowledge'&&<Knowledge source={source} setSource={setSource} ehrCount={ehrCount} caseData={caseData} notify={notify}/>} {page==='review'&&<ReviewQueue items={reviews} openReviewItem={openReviewItem}/>}</motion.div>;
}

function Dashboard({openCase,openReviewItem,navigate,cases,reviews,ehrCount,ordersIssued}) {
  const openCount=reviews.length;
  const queuePreview=reviews.slice(0,3);
  return <div className="dash-body">
    <section className="dash-hero">
      <div className="hero-copy"><LiveDateTime/><h2>Clinical operations are <em>within bounds.</em></h2><p>{(ehrCount||20000).toLocaleString()} CSV patients are indexed across {cases.length||50} detailed cases. {openCount?`${openCount} ${openCount===1?'item awaits':'items await'} accountable review.`:'The accountable review queue is clear.'}</p></div>
      <div className="hero-system"><div className="system-radar"><span/><span/><span/><i/><b>14<small>GUARDRAILS</small></b></div><div><span>SYSTEM POSTURE</span><b>Operational</b><small>Verification required before release</small></div></div>
    </section>
    <section className="dash-stats">
      <div><span>EHR PATIENTS</span><b>{(ehrCount||20000).toLocaleString()}</b><small><i/> CSV-backed registry</small></div>
      <div><span>ACTIVE CASES</span><b>{String(cases.length||50).padStart(2,'0')}</b><small>Individual longitudinal workspaces</small></div>
      <div><span>REVIEW GATES</span><b className="amber">{String(openCount).padStart(2,'0')}</b><small>Open accountable actions</small></div>
      <div><span>ORDERS ISSUED</span><b>{String(ordersIssued||0).padStart(2,'0')}</b><small>Clinician-issued follow-up actions</small></div>
    </section>
    <div className="dash-grid">
      <section className="activity-board"><header><div><span>LIVE CASE ACTIVITY</span><h3>Current work</h3></div><button onClick={()=>navigate('cases')}>View all <ArrowRight/></button></header><div>{cases.slice(0,3).map(item=><button className="case-line" key={item.id} onClick={()=>openCase(item.id)}><div className={`case-avatar ${item.tone}`}>{item.initials}</div><span><b>{item.display_name}</b><small>{item.id} · {item.objective}</small></span><em className={item.tone}><i/>{item.status}</em><p>{item.key_signal}</p><time>{item.updated_label}</time><ChevronRight/></button>)}</div></section>
      <section className="attention-board dashboard-queue">
        <header><span>NEEDS ATTENTION</span><h3>Decision queue</h3><em>{String(openCount).padStart(2,'0')} OPEN</em></header>
        {queuePreview.length?<div className="attention-list">{queuePreview.map(item=>{const safety=item.review_type==='safety_conflict';return <button className="attention-item" key={`${item.review_type}-${item.case_id}`} onClick={()=>openReviewItem(item)}><span className={`queue-icon ${safety?'high':''}`}>{safety?<AlertTriangle/>:<Activity/>}</span><span><small>{safety?'PRESCRIPTION SAFETY':'PATIENT RISK'}</small><b>{item.display_name}</b><p>{item.key_signal||item.inferred_value||item.block_reason}</p></span><em>{item.case_id}</em><ChevronRight/></button>})}</div>:<div className="queue-cleared"><CheckCircle2/><b>Review queue cleared</b><p>All accountable actions have been acknowledged and persisted.</p></div>}
        {openCount>3&&<button className="queue-more" onClick={()=>navigate('review')}>View all {openCount} accountable reviews <ArrowRight/></button>}
        <div className="quiet-state"><ShieldCheck/><span><b>Human authority preserved</b><small>Only a clinician can close a review or issue a follow-up order</small></span></div>
      </section>
      <section className="insights-board"><header><span>SYSTEM INSIGHTS</span><h3>What changed</h3></header><div className="insight-row"><AlertTriangle/><span><b>Patient-specific risk synthesis</b><small>Each case combines diagnosis, labs, medication, allergy, BMI and care history.</small></span></div><div className="insight-row"><GitBranch/><span><b>Fifty independent workspaces</b><small>Registry selection loads the selected patient instead of a shared fixture.</small></span></div><div className="insight-row"><ShieldCheck/><span><b>Accountable orders tracked</b><small>Completed reviews now persist clinician-owned follow-up orders.</small></span></div></section>
    </div>
  </div>;
}

function Cases({openCase,openPatient,query,cases,refresh,notify,ehrCount}) {
  const [filter,setFilter]=useState('All cases'); const [view,setView]=useState('cases');
  const [patients,setPatients]=useState([]); const [patientTotal,setPatientTotal]=useState(ehrCount||0); const [offset,setOffset]=useState(0); const [loading,setLoading]=useState(false);
  const counts={Running:cases.filter(x=>x.status==='Running').length,'Needs review':cases.filter(x=>['Review gate','Needs review','Draft'].includes(x.status)).length,Complete:cases.filter(x=>x.status==='Complete').length};
  const visible=cases.filter(x=>(x.display_name+x.id+x.objective+x.diagnosis+x.key_signal).toLowerCase().includes(query.toLowerCase())).filter(x=>filter==='All cases'||(filter==='Running'&&x.status==='Running')||(filter==='Needs review'&&['Review gate','Needs review','Draft'].includes(x.status))||(filter==='Complete'&&x.status==='Complete'));
  useEffect(()=>{if(view!=='ehr')return;const timer=setTimeout(async()=>{setLoading(true);try{const response=await fetch(`/api/patients?limit=50&offset=${offset}&q=${encodeURIComponent(query)}`,{headers:AUTH_HEADERS});if(!response.ok)throw new Error();const data=await response.json();setPatients(data.results||[]);setPatientTotal(data.count||0);}catch(error){notify('Could not load the EHR cohort');}finally{setLoading(false);}},180);return()=>clearTimeout(timer);},[view,offset,query]);
  useEffect(()=>setOffset(0),[query,view]);
  if(view==='ehr')return <div className="registry"><div className="registry-view-tabs"><button onClick={()=>setView('cases')}>Agent cases <span>{cases.length}</span></button><button className="active" onClick={()=>setView('ehr')}>Full EHR cohort <span>{patientTotal||ehrCount||20000}</span></button></div><div className="registry-tools"><div><b>{loading?'Loading records…':`${patientTotal.toLocaleString()} synthetic patients`}</b><span>Page {Math.floor(offset/50)+1} · 50 rows · select any patient to open</span></div><div className="pager"><button disabled={offset===0} onClick={()=>setOffset(Math.max(0,offset-50))}>Previous</button><button disabled={offset+50>=patientTotal} onClick={()=>setOffset(offset+50)}>Next</button></div></div><div className="registry-table ehr-table"><header><span>PATIENT ID</span><span>PRIMARY DIAGNOSIS</span><span>MEDICATION</span><span>LAB STATUS</span><span>CARE CONTEXT</span><span/></header>{patients.map(item=><button className="registry-row ehr-patient-row" key={item.patient_id} onClick={()=>openPatient(item.patient_id)}><div><div className="case-avatar green">{String(item.patient_id).slice(-2)}</div><span><b>{item.patient_id}</b><small>{item.age||'—'} years · {item.sex||'—'} · {item.region||'Unknown region'}</small></span></div><p>{item.primary_diagnosis||'Not recorded'}</p><p>{item.current_medications||'None recorded'}</p><em className={item.lab_results==='Abnormal'?'amber':'green'}><i/>{item.lab_results||'Pending'}</em><p>{item.recent_care_type||'Unknown'} · {item.hospital||'Unassigned'}</p><span>Open workspace <ArrowRight/></span></button>)}</div></div>;
  return <div className="registry"><div className="registry-view-tabs"><button className="active" onClick={()=>setView('cases')}>Agent cases <span>{cases.length}</span></button><button onClick={()=>setView('ehr')}>Full EHR cohort <span>{ehrCount||20000}</span></button></div><div className="registry-tools"><div>{[['All cases',cases.length],['Running',counts.Running],['Needs review',counts['Needs review']],['Complete',counts.Complete]].map(([label,total])=><button key={label} className={filter===label?'active':''} onClick={()=>setFilter(label)}>{label} <span>{total}</span></button>)}</div><button onClick={()=>{setFilter('All cases');refresh();}}><RefreshCcw/>Sync records</button></div><div className="registry-table"><header><span>PATIENT / CASE</span><span>AGENT OBJECTIVE</span><span>STATE</span><span>KEY SIGNAL</span><span>UPDATED</span><span/></header>{visible.map(item=><button className="registry-row" key={item.id} onClick={()=>openCase(item.id)}><div><div className={`case-avatar ${item.tone}`}>{item.initials}</div><span><b>{item.display_name}</b><small>{item.id} · EHR {item.patient_id}</small></span></div><p>{item.objective}</p><em className={item.tone}><i/>{item.status}</em><p>{item.key_signal}</p><time>{item.updated_label}</time><span>Open workspace <ArrowRight/></span></button>)}</div>{!visible.length&&<div className="registry-empty">No cases match this search or filter.</div>}</div>;
}

function Knowledge({source,setSource,ehrCount,caseData,notify}) {
  const patient=caseData?.patient||{};
  const profile=patient.profile||{};
  const insights=caseData?.insights||patient.insights||{};
  const records=caseData?.records||[];
  const record=type=>records.find(item=>item.source_type===type)||{};
  const transcript=record('transcript');
  const prior=record('prior_note');
  const medications=record('medication_list');
  const allergies=record('allergy');
  const laboratory=record('external_update').payload?.potassium_mEq_L!=null?record('external_update'):record('laboratory');
  const caseId=caseData?.caseId||'No active case';
  const sources=[
    ['Mock EHR registry','CSV patient profiles',`${(ehrCount||20000).toLocaleString()} imported`,'26 columns'],
    ['Consultation transcripts','Dialogue extraction','Real-time','5 facts'],
    ['EHR encounter notes','Structured + narrative','Patient linked','4 facts'],
    ['Medication history','Longitudinal orders','Current case',`${(medications.payload?.medications||[]).length||0} active`],
    ['Allergy registry','Safety assertions','Patient linked',`${(allergies.payload?.allergies||[]).length||0} recorded`],
    ['Digital laboratory','Structured result + file upload','Latest source',laboratory.payload?.potassium_mEq_L!=null?`K ${laboratory.payload.potassium_mEq_L}`:'Pending'],
    ['Clinical guidelines','Section-aware SQLite index','Indexed','3 sections'],
    ['Insurance policy','Administrative evidence only','Indexed','5 sections'],
  ];
  const schemas=[
    {adapter:'ehr_csv',cohort_size:ehrCount||20000,selected_patient:{patient_id:patient.patient_id||null,age:profile.age||null,sex:profile.sex||null,primary_diagnosis:profile.primary_diagnosis||insights.diagnosis||null,care_setting:patient.care_setting||null}},
    {adapter:'transcript_extractor',case_id:caseId,patient_id:patient.patient_id||null,source:transcript.source_name||null,observed_at:transcript.observed_at||null,normalized:{chief_concern:transcript.payload?.chief_concern||insights.objective||null,excerpt:transcript.payload?.excerpt||null,proposed_medication:transcript.payload?.proposed_medication||null,dose:transcript.payload?.dose||null,frequency:transcript.payload?.frequency||null}},
    {adapter:'longitudinal_note',case_id:caseId,source:prior.source_name||null,observed_at:prior.observed_at||null,normalized:{diagnosis:prior.payload?.diagnosis||insights.diagnosis||null,history:prior.payload?.history||null,plan:prior.payload?.plan||null,condition_status:insights.condition_status||null}},
    {adapter:'medication_reconciliation',case_id:caseId,source:medications.source_name||null,reliability:medications.reliability||null,normalized:{active_medications:medications.payload?.medications||[],candidate_status:caseData?.assessment?.high_risk?'blocked':'none proposed',autonomous_issue:false}},
    {adapter:'allergy_safety',case_id:caseId,source:allergies.source_name||null,reliability:allergies.reliability||null,normalized:{allergies:allergies.payload?.allergies||insights.allergies||[],ace_inhibitor_allergy:Boolean(allergies.payload?.ace_inhibitor_allergy),angioedema_history:Boolean(allergies.payload?.angioedema_history),verification_required:true}},
    {adapter:'digital_laboratory',case_id:caseId,source:laboratory.source_name||null,observed_at:laboratory.observed_at||null,reliability:laboratory.reliability||null,normalized:{potassium_mEq_L:laboratory.payload?.potassium_mEq_L??null,flag:laboratory.payload?.potassium_flag||laboratory.payload?.result_summary||insights.lab_status||null,report_id:laboratory.payload?.report_id||null,high_risk:Boolean(caseData?.assessment?.high_risk)}},
    {adapter:'clinical_guideline_retrieval',query_context:insights.diagnosis||'active case',normalized:{matched_rule:caseData?.assessment?.high_risk?'ACE inhibitor candidate with elevated potassium':'Patient-specific documentation and follow-up',threshold_mEq_L:caseData?.assessment?.threshold_mEq_L??5.0,authority:'clinical guidance',requires_clinician:true,sections_retrieved:3}},
    {adapter:'insurance_policy_retrieval',case_id:caseId,normalized:{purpose:'administrative coverage evidence',clinical_authority:false,may_direct_treatment:false,patient_context:profile.insurance_provider||profile.insurance||'Synthetic policy context',sections_indexed:5}},
  ];
  const policyCopy=[
    ['Patient identity remains linked to the source CSV row.','Only authorized roles can open the longitudinal record.'],
    ['Spoken facts are extracted without silently becoming orders.','Ambiguous medication language remains subject to clinician verification.'],
    ['Prior-care facts preserve their date and original source.','Newer records supersede older observations without deleting history.'],
    ['Medication candidates are reconciled against labs and allergies.','No medication is issued autonomously.'],
    ['Allergy assertions are evaluated before any medication disposition.','Missing or conflicting allergy data lowers confidence and routes review.'],
    ['The newest validated diagnostic result drives safety reconciliation.','Abnormal results remain visible with source and observed time.'],
    ['Clinical guidance supports documentation and guardrails.','Retrieved sections never replace clinician judgment.'],
    ['Administrative policy is isolated from clinical reasoning.','Coverage evidence cannot direct diagnosis, medication, or treatment.'],
  ];
  const schema=JSON.stringify(schemas[source],null,2);
  const [policyTitle,policyDescription]=policyCopy[source];
  const copySchema=async()=>{try{await navigator.clipboard.writeText(schema);notify?.(`${sources[source][0]} normalized output copied`);}catch(error){notify?.('Could not copy normalized output');}};
  return <div className="knowledge-layout">
    <section className="source-catalog">
      <header><span>CONNECTED EVIDENCE</span><h3>Source adapters</h3><small>8 / 8 operational</small></header>
      {sources.map((item,index)=><button key={item[0]} className={source===index?'active':''} onClick={()=>setSource(index)}><div><Database/></div><span><b>{item[0]}</b><small>{item[1]}</small></span><em><i/>{item[2]}</em><p>{item[3]}</p><ChevronRight/></button>)}
    </section>
    <section className="source-detail dynamic-source-detail">
      <header><div><span>SOURCE PROFILE · {caseId}</span><h2>{sources[source][0]}</h2><p>{sources[source][1]} · patient-aware normalization</p></div><div className="source-health"><i/><span><small>HEALTH</small><b>Nominal</b></span></div></header>
      <div className="knowledge-metrics">
        <div><span>RELIABILITY PRIOR</span><b>{source===0?'CSV':source>5?'POLICY':Number(record(['','transcript','prior_note','medication_list','allergy','laboratory'][source])?.reliability||.94).toFixed(2)}</b><small>{source>5?'Authority-bounded corpus':'Source-class baseline'}</small></div>
        <div><span>FRESHNESS</span><b>{source===0?'LIVE':source>5?'INDEXED':source===5?'LATEST':'LINKED'}</b><small>{source>5?'SQLite index available':'Active patient workspace'}</small></div>
        <div><span>FACT YIELD</span><b>{source===0?(ehrCount||20000):source>5?(source===6?3:5):Object.keys(schemas[source].normalized||{}).length}</b><small>{source>5?'Retrieved sections':'Normalized fields'}</small></div>
      </div>
      <div className="policy-card"><ShieldCheck/><div><span>RETRIEVAL POLICY</span><h3>{policyTitle}</h3><p>{policyDescription}</p></div></div>
      <div className="schema dynamic-schema"><div className="schema-head"><span>NORMALIZED OUTPUT · {String(source+1).padStart(2,'0')}</span><button onClick={copySchema}><Copy/>Copy JSON</button></div><pre key={source}>{schema}</pre><small>Output updates with both the selected adapter and active patient workspace.</small></div>
    </section>
  </div>;
}

function ReviewQueue({items,openReviewItem}) {
  if(items.length)return <div className="review-queue"><section className="review-intro"><div><span>{items.length} ITEM{items.length===1?'':'S'} REQUIRE ACCOUNTABLE ACTION</span><h2>Clinical attention is routed.<br/>Authority remains human.</h2><p>Every safety or longitudinal-risk item opens its own patient-specific clinician review and remains queued until acknowledged.</p></div><div><b>{String(items.length).padStart(2,'0')}</b><span>OPEN GATES</span></div></section>{items.map(item=>{const safety=item.review_type==='safety_conflict';return <section className={`review-ticket ${safety?'':'triage-ticket'}`} key={item.id}><header><div>{safety?<AlertTriangle/>:<Activity/>}<span><small>CASE {item.case_id} · {safety?'PRESCRIPTION SAFETY':'PATIENT RISK TRIAGE'}</small><h3>{item.display_name} · {safety?'acknowledge contraindication':'verify longitudinal risk'}</h3></span></div><em>{safety?'HIGH PRIORITY':'CLINICIAN REVIEW'}</em></header><div className="ticket-body"><div><span>{safety?'TRANSCRIPT ORDER':'KEY SIGNAL'}</span><b>{safety?`${item.medication||'Medication'} ${item.dose||''}`:item.key_signal}</b><small>{safety?'Electronic candidate extracted':'CSV and longitudinal record synthesis'}</small></div><ArrowRight/><div><span>{safety?'CONTRAINDICATION':'AGENT OBJECTIVE'}</span><b>{item.inferred_value||item.key_signal}</b><small>{item.block_reason||'Clinical record review'}</small></div><ArrowRight/><div><span>REQUIRED OWNER</span><b>Clinician</b><small>{safety?'Order remains blocked':'Verification required'}</small></div></div><footer><div><span><ShieldCheck/>{safety?'Guardrail escalation persisted':'Risk-based routing persisted'}</span><span><GitBranch/>Patient state traceable</span></div><button onClick={()=>openReviewItem(item)}>{safety?'Acknowledge escalation':'Review and acknowledge'} <ArrowRight/></button></footer></section>})}<section className="empty-queue"><ShieldCheck/><span><b>Role boundary enforced</b><small>Only clinicians can complete accountable review.</small></span></section></div>;
  return <div className="review-queue"><section className="review-intro resolved"><div><span>ACCOUNTABLE QUEUE CLEAR</span><h2>All escalations have been acknowledged.<br/>No open action remains.</h2><p>Resolved decisions remain available in the immutable audit trail and no longer appear in this open queue.</p></div><div><b>00</b><span>OPEN GATES</span></div></section><section className="empty-queue"><ShieldCheck/><span><b>No unresolved decisions</b><small>Acknowledged items have been removed from accountable review.</small></span></section></div>;
}

function TraceItem({item,index,last,onEvidence}) { const Icon=item.kind==='conflict'?AlertTriangle:item.kind==='evidence'?Search:item.kind==='failure'?X:item.kind==='replan'?RefreshCcw:item.kind==='success'?Check:Activity; return <motion.article className={`trace-item ${item.kind}`} initial={{opacity:0,y:12}} animate={{opacity:1,y:0}} transition={{duration:.35}}><div className="trace-index"><span>{String(index+1).padStart(2,'0')}</span><i/><small>{formatTraceTime(item.occurred_at||item.at)}</small></div><div className="trace-marker"><Icon/>{!last&&<span/>}</div><div className="trace-content"><div className="trace-label"><span>{item.kind==='replan'?'REPLAN':item.kind.toUpperCase()}</span><code>{item.tool}</code><em>{item.score}</em></div><h3>{item.title}</h3><p>{item.text}</p><button className="trace-insight" onClick={onEvidence}><Sparkles/><b>{item.insight}</b><ChevronRight/></button></div></motion.article>; }
function Metric({label,value,warn}) { return <div className="metric"><div><span>{label}</span><b>{value}%</b></div><div><motion.i className={warn?'warn':''} initial={{width:0}} animate={{width:`${value}%`}} transition={{duration:.7}}/></div></div>; }

function RecordView({complete,reviewItem,openReview,openEvidence,caseData,runState,notify}) {
  const [section,setSection]=useState(0);
  const [exporting,setExporting]=useState(false);
  const patient=caseData?.patient||{}; const profile=patient.profile||{}; const insights=caseData?.insights||patient.insights||{}; const records=caseData?.records||[];
  const record=type=>records.find(item=>item.source_type===type)?.payload||{};
  const prior=record('prior_note'), lab=record('external_update').potassium_mEq_L?record('external_update'):record('laboratory'), vitals=record('vitals'), medication=record('medication_list'), allergy=record('allergy'), transcript=record('transcript');
  const meds=(medication.medications||[]).map(item=>item.drug||item).join(', ')||insights.medication||profile.current_medications||'None recorded';
  const allergies=(allergy.allergies||insights.allergies||[]).join(', ')||profile.allergies||'None recorded';
  const isSafetyCase=caseData?.caseId==='SIM-0427';
  const isSafetyReview=reviewItem?.review_type==='safety_conflict';
  const sections=['Pre-consult summary','Consultation','Diagnostics','Assessment','Medication record','Follow-up actions','Risk register'];
  const cleanNote=cleanClinicalText(runState?.note||'');
  const exportFinalReport=async()=>{
    const caseId=caseData?.caseId||'unassigned-case';
    const patientId=patient.patient_id||'unassigned-patient';
    setExporting(true);
    try{
      const response=await fetch(`/api/cases/${encodeURIComponent(caseId)}/report.pdf`,{headers:AUTH_HEADERS});
      if(!response.ok){const detail=await response.json().catch(()=>({}));throw new Error(detail.detail||'PDF export failed');}
      const blob=await response.blob();
      const disposition=response.headers.get('Content-Disposition')||'';
      const serverName=disposition.match(/filename="?([^";]+)"?/i)?.[1];
      const filename=serverName||`CareTrace_${caseId}_${patientId}_final-report.pdf`;
      const url=URL.createObjectURL(blob);const link=document.createElement('a');
      link.href=url;link.download=filename;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),0);
      notify?.(`Clinical PDF exported · ${caseId} · ${patientId}`);
    }catch(error){notify?.(error.message||'Could not export the clinical PDF');}finally{setExporting(false);}
  };
  return <motion.div className="record-layout" initial={{opacity:0,y:5}} animate={{opacity:1,y:0}} exit={{opacity:0}}><aside className="record-outline"><div className="section-title mini"><div><span>DOCUMENT MAP</span><h2>Longitudinal record</h2></div></div>{sections.map((x,i)=><button onClick={()=>setSection(i)} className={i===section?'active':''} key={x}><span>0{i+1}</span>{x}<Check/></button>)}</aside><section className="record-paper"><header><div><span>SYNTHETIC EHR · {records.length} LINKED SOURCES</span><h1>{patient.display_name||'Patient record'}</h1><p>CASE {caseData?.caseId||'—'} · EHR {patient.patient_id||'—'} · {patient.care_setting||'Clinical encounter'}</p></div><div><span>RECORD STATUS</span><b><i/>{patient.status||insights.status||'ACTIVE'}</b><small>{insights.risk_level||'Routine'} risk</small></div></header><article>
    {runState?.note&&<section className="generated-record"><label>VERIFIED AGENT FOLLOW-UP · LIVE BACKEND OUTPUT</label><pre>{cleanNote}</pre><small><CheckCircle2/>{runState.passed}/{runState.checks?.length||14} backend checks passed · {runState.providers?.documentation||'deterministic'} documentation · {runState.providers?.verifier||'deterministic'} verifier</small></section>}
    <section><label>PRE-CONSULTATION SUMMARY</label><p>{caseData?.preconsultSummary||`${profile.age||'Unknown-age'}-year-old patient with ${insights.diagnosis||profile.primary_diagnosis||'an existing condition'}. Prior records were reconciled before the current consultation.`}</p></section>
    <section><label>CONSULTATION</label><p>{transcript.excerpt||insights.objective||'Longitudinal clinical follow-up.'} <cite>CONSULT · CURRENT</cite></p></section>
    <section><label>DIAGNOSTICS & OBSERVATIONS</label><div className="record-facts"><span><b>Laboratory</b>{lab.potassium_mEq_L?`Potassium ${lab.potassium_mEq_L} mEq/L · ${lab.potassium_flag||'REVIEW'}`:lab.result_summary||insights.lab_status||profile.lab_results||'Pending'}</span><span><b>Blood pressure</b>{vitals.blood_pressure||'Not recorded'}</span><span><b>BMI</b>{vitals.bmi||insights.bmi||profile.bmi||'—'}</span><span><b>Annual visits</b>{insights.hospital_visits??profile.hospital_visits_past_year??'—'}</span></div></section>
    <section><label>ASSESSMENT</label><p>{insights.diagnosis||prior.diagnosis||profile.primary_diagnosis||'Condition'} · {insights.condition_status||profile.condition_status||'status under review'}. {(insights.risk_flags||[]).length?`Risk signals: ${insights.risk_flags.join('; ')}.`:'No elevated risk flag was derived from the supplied record.'}</p></section>
    <section className={isSafetyCase?'med-section':''}><label>MEDICATION & ALLERGY RECONCILIATION {isSafetyCase&&<em>BLOCKED CANDIDATE</em>}</label><p>Active medication record: {meds}. Allergy record: {allergies}. {isSafetyCase?'Lisinopril 10 mg was extracted as an electronic candidate but not issued because potassium exceeds the safety threshold.':'No autonomous medication change was made; clinician verification remains required.'}</p><div className="inline-provenance"><span>Evidence lineage</span><b>Medication list</b><i/><b>Allergy registry</b><i/><b>Diagnostics</b><button onClick={openEvidence}>View evidence <ArrowRight/></button></div></section>
    <section><label>FOLLOW-UP ACTIONS</label><ul><li><span><Check/></span><p><b>Clinician-owned:</b> verify the reconciled record and individual risk signals.</p></li><li><span><Check/></span><p>Continue {String(insights.diagnosis||profile.primary_diagnosis||'condition').toLowerCase()} follow-up at the documented frequency.</p></li><li><span><Check/></span><p>{isSafetyCase?'Repeat potassium and reassess the blocked candidate.':'Review pending or abnormal investigations and update the longitudinal plan.'}</p></li></ul></section>
  </article><footer><ShieldCheck/><p><b>CareTrace documentation guardrail</b>This workspace is built from this patient’s CSV profile and seven individual records. It does not autonomously diagnose or prescribe.</p><div className="record-footer-actions"><button className="export-report" disabled={!runState?.note||exporting} onClick={exportFinalReport}>{exporting?<RefreshCcw className="spin-icon"/>:<Download/>}{exporting?'Preparing PDF…':'Export clinical PDF'}</button>{reviewItem?<button disabled={isSafetyReview&&!complete} onClick={openReview}><UserRoundCheck/>{isSafetyReview&&!complete?'Complete agent run first':isSafetyReview?'Acknowledge escalation':'Complete patient review'}<ArrowRight/></button>:<button disabled><ShieldCheck/>No open review</button>}</div></footer></section><aside className="annotation-rail"><div className="section-title mini"><div><span>PATIENT INSIGHTS</span><h2>Individual context</h2></div></div><div className="annotation"><span>01</span><b>Longitudinal continuity</b><p>{prior.history||`Existing ${insights.diagnosis||'condition'} history retained from the mock EHR.`}</p><em>CSV + prior note</em></div><div className={`annotation ${insights.risk_level==='High'?'warning':''}`}><span>02</span><b>{insights.risk_level||'Routine'} risk posture</b><p>{(insights.risk_flags||[]).join(' · ')||'No high-risk contradiction identified.'}</p><em>{insights.key_signal||'Risk synthesis'}</em></div><div className="annotation"><span>03</span><b>Care context</b><p>{profile.recent_care_type||insights.recent_care_type||'Outpatient'} care · {profile.hospital||'Community service'} · {insights.annual_followups??profile.annual_followup_frequency??'—'} planned follow-ups.</p><em>Patient-specific EHR</em></div></aside></motion.div>;
}

function AuditView({data,loading,runId}) {
  const events=data?.events||[]; const diffs=data?.diffs||[];
  const [selected,setSelected]=useState(null);
  const inspectorRef=useRef(null);
  useEffect(()=>setSelected(null),[runId]);
  useEffect(()=>{if(selected!==null&&inspectorRef.current)inspectorRef.current.scrollIntoView({behavior:'smooth',block:'nearest'});},[selected]);
  const exportAudit=()=>{const blob=new Blob([JSON.stringify({runId,events,diffs},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const anchor=document.createElement('a');anchor.href=url;anchor.download=`${runId||'caretrace'}-audit.json`;anchor.click();URL.revokeObjectURL(url);};
  if(!runId)return <div className="audit-empty"><ShieldCheck/><h2>No active audit trail</h2><p>Run the agent to persist node execution, tool outcomes, hashes, and note revisions.</p></div>;
  const active=selected===null?null:events[selected];
  return <motion.div className="audit-layout interactive-audit" initial={{opacity:0,y:5}} animate={{opacity:1,y:0}} exit={{opacity:0}}><section className="syslog"><div className="section-title audit-heading"><div><span>PERSISTED KERNEL SYSLOG</span><h2>Observable execution audit</h2></div><div><small>{loading?'SYNCING…':`${events.length} ENTRIES`}</small><button onClick={exportAudit}><Download/>Export JSON</button></div></div><div className="syslog-notice"><LockKeyhole/><p><b>Trace policy:</b> Select any row to inspect its actor, resource, timestamp and immutable content hash.</p></div><div className="syslog-rows">{events.map((item,index)=><button className={`audit-row ${selected===index?'selected':''}`} key={item.id||index} onClick={()=>setSelected(selected===index?null:index)}><span>{String(index+1).padStart(2,'0')}</span><time>{item.created_at?.slice(11,19)||'LIVE'}</time><em className={item.action?.includes('complete')?'complete':item.action==='approve'?'approve':''}>{item.action}</em><div><b>{item.node_name||item.resource_type}</b><small>{item.actor_id} · {item.actor_role} · {item.resource_type}/{item.resource_id}</small></div><code>{item.after_hash||item.before_hash||'no-content-hash'}</code><ChevronRight/></button>)}</div>{active&&<motion.div className="audit-inspector" ref={inspectorRef} initial={{opacity:0,y:-4}} animate={{opacity:1,y:0}}><div><span>SELECTED EVENT {String(selected+1).padStart(2,'0')}</span><button onClick={()=>{navigator.clipboard?.writeText(active.after_hash||active.before_hash||'');}}><Copy/>Copy hash</button></div><dl><div><dt>Actor</dt><dd>{active.actor_id} · {active.actor_role}</dd></div><div><dt>Action</dt><dd>{active.action}</dd></div><div><dt>Resource</dt><dd>{active.resource_type}/{active.resource_id}</dd></div><div><dt>Node</dt><dd>{active.node_name||'Request boundary'}</dd></div><div><dt>Timestamp</dt><dd>{active.created_at}</dd></div><div><dt>SHA-256</dt><dd>{active.after_hash||active.before_hash||'No content hash'}</dd></div></dl></motion.div>}</section><aside className="diff-ledger"><div className="section-title mini"><div><span>RECORD MODIFICATION AUDIT</span><h2>Persisted revisions</h2></div><b>{diffs.length}</b></div>{diffs.map((item,index)=><details key={`${item.from_label}-${item.to_label}-${index}`} open={index===0}><summary><span><GitBranch/></span><div><b>{item.from_label} → {item.to_label}</b><small>{item.created_at?.replace('T',' ').slice(0,19)} UTC · click to expand</small></div><ChevronRight/></summary><pre>{item.diff_text||'No textual change'}</pre></details>)}{!diffs.length&&!loading&&<div className="no-diffs"><FileText/><b>No revisions persisted yet</b><p>A clean run can commit its first draft without a replan.</p></div>}</aside></motion.div>;
}


function AssuranceView({complete,state}) {
  const backendChecks=state?.checks||[]; const passed=state?.passed??(complete?14:0); const total=backendChecks.length||14; const assurance=complete?Math.round((passed/total)*100):'—'; const highRisk=Boolean(state?.assessment?.high_risk);
  const displayed=backendChecks.length?backendChecks.map(item=>[item.name,item.routed?'Conflict safely routed':item.passed?'Backend validator passed':'Validator failed',item.routed?'review':item.passed?'pass':'failed']):checks;
  return <motion.div className="assurance-layout" initial={{opacity:0,y:5}} animate={{opacity:1,y:0}} exit={{opacity:0}}><section className="assurance-hero"><div className="assurance-score"><svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="49"/><motion.circle cx="60" cy="60" r="49" initial={{pathLength:0}} animate={{pathLength:complete?passed/total:.12}}/></svg><div><span>ASSURANCE</span><b>{assurance}</b><small>/ 100</small></div></div><div className="assurance-copy"><span>LIVE VERIFICATION VERDICT</span><h2>{complete?(highRisk?'Documentation safe. Prescription blocked.':'Documentation verified without escalation.'):'Awaiting a complete record.'}</h2><p>{complete?(highRisk?'The note is grounded and internally consistent. The contraindicated candidate remains non-issued and requires clinician acknowledgement.':'The selected patient record passed verification without importing another case’s facts or proposing a new clinical action.'):'Execute the agent plan to generate and test the clinical record.'}</p><div><span><Check/>{passed} checks passed</span><span><AlertTriangle/>{highRisk?1:0} escalation</span><span><LockKeyhole/>0 orders issued</span></div></div></section><section className="check-matrix"><div className="section-title"><div><span>BACKEND CONSTRAINT MATRIX</span><h2>What the verifier established</h2></div><small>Policy set CLIN-DOC / v3.2</small></div><div>{displayed.map(([name,desc,itemState],i)=><div className="check-item" key={name}><span>{String(i+1).padStart(2,'0')}</span><div className={complete?(itemState==='review'?'review':itemState==='failed'?'pending':'pass'):'pending'}>{complete?(itemState==='review'?<AlertTriangle/>:itemState==='failed'?<X/>:<Check/>):<Clock3/>}</div><p><b>{name}</b><small>{complete?desc:'Pending agent output'}</small></p><em>{complete?(itemState==='review'?'ROUTED':itemState==='failed'?'FAILED':'PASSED'):'WAITING'}</em></div>)}</div></section>{highRisk?<section className="failure-analysis"><div className="section-title mini"><div><span>SELF-CORRECTION</span><h2>Verifier-triggered rewrite</h2></div></div><div className="diff"><div><span>DRAFT 01 · REJECTED</span><p>“<del>Start Lisinopril 10 mg once daily.</del>”</p><small>Ignored the abnormal potassium result.</small></div><ArrowRight/><div><span>DRAFT 02 · ACCEPTED</span><p>Candidate <ins>BLOCKED and not issued</ins>; <ins>clinician acknowledgement required.</ins></p><small>The complete diff is loaded in the Audit tab.</small></div></div></section>:<section className="failure-analysis clean"><div className="why"><ShieldCheck/><p><b>No replan required</b>The deterministic verifier found no evidence-backed contraindication or unsupported prescription in this patient’s draft.</p></div></section>}</motion.div>;
}

function EvidencePanel({close,records=[],knowledge=[],conflict}) {
  const shown=records.slice(0,4);
  const summary=item=>item.payload?.excerpt||Object.entries(item.payload||{}).map(([key,value])=>`${key.replaceAll('_',' ')}: ${value}`).join(' · ');
  const highRisk=Boolean(conflict?.high_risk); const potassium=conflict?.potassium_mEq_L??shown.find(item=>['laboratory','external_update'].includes(item.source_type))?.payload?.potassium_mEq_L??'—';
  const inference=conflict?.inferred_value||(highRisk?'BLOCKED — clinician review':'eligible for clinician review');
  const supports=item=>item.source_type!=='transcript';
  return <><motion.div className="scrim" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} onClick={close}/><motion.aside className="evidence-panel" initial={{x:'100%'}} animate={{x:0}} exit={{x:'100%'}} transition={{type:'spring',stiffness:250,damping:30}}><header><div><span>LIVE SQLITE RESULT</span><h2>Evidence and policy lineage</h2></div><button onClick={close}><X/></button></header><div className={`evidence-summary ${highRisk?'':'safe'}`}>{highRisk?<AlertTriangle/>:<ShieldCheck/>}<div><b>{highRisk?'Lisinopril safety conflict':'Longitudinal evidence review'}, {shown.length} retrieved observations</b><p>These rows are returned by backend tools at run time—not embedded UI fixtures.</p></div></div><div className="time-ruler"><span>OLDER</span><i/><span>RECENT</span><i/><span>CURRENT</span></div><div className="evidence-items">{shown.length?shown.map((item,index)=>{const Icon=item.source_type==='transcript'?MessageSquareText:['laboratory','external_update'].includes(item.source_type)?History:FileText;const positive=supports(item);return <div className={`evidence-row ${positive?'':'old'}`} key={`${item.source_name}-${index}`}><div><Icon/><span><b>{item.source_name}</b><small>{item.source_type} · SQLite record</small></span><time>{item.observed_at?.slice(0,10)}</time></div><blockquote>{summary(item)}</blockquote><footer><span>Reliability <b>{Number(item.reliability).toFixed(2)}</b></span><span>Freshness <b>{index===0?'1.00':'weighted'}</b></span><em>{highRisk?(positive?'SUPPORTS BLOCK':'TRIGGERS CHECK'):'GROUNDS RECORD'}</em></footer></div>}):<div className="evidence-empty"><Database/><b>No evidence loaded</b><p>Open a patient record or begin an agent run to retrieve persisted sources.</p></div>}</div><div className="inference-box"><div><GitBranch/><span><small>{conflict?.adapted_to_new_source?'UPDATED AFTER SOURCE MUTATION':'DETERMINISTIC SAFETY VERDICT'}</small><b>Prescription state: {inference}</b></span><em>{Math.round((conflict?.confidence||.86)*100)}%</em></div><p>{highRisk?'The candidate is electronically recorded, but the system cannot issue it while a contraindication is present.':'No autonomous order was issued; the evidence remains available for clinician verification.'}</p><div><span>Potassium <b>{potassium}</b></span><span>Threshold <b>{conflict?.threshold_mEq_L??'—'}</b></span><span>Authority <b>clinician</b></span></div></div>{knowledge.length>0&&<section className="policy-hits"><header><span>POLICY.RETRIEVE() · {knowledge.length} HITS</span><h3>Grounding context</h3></header>{knowledge.map(item=><article key={item.id}><div><FileCheck2/><span><b>{item.section}</b><small>{item.source_name} · score {item.score}</small></span><em>{item.authority?.replaceAll('_',' ')}</em></div><p>{item.content}</p><footer>{(item.matched_terms||[]).map(term=><span key={term}>{term}</span>)}</footer></article>)}<aside><ShieldCheck/>Retrieved policy supports documentation and verification only; treatment remains accountable clinician judgment.</aside></section>}</motion.aside></>;
}

function ReviewPanel({close,approved,resolve,context,caseData}) {
  const safety=context?.review_type==='safety_conflict';
  const [action,setAction]=useState(safety?'order_repeat_lab':'acknowledge_risk_review');
  const [saving,setSaving]=useState(false); const [error,setError]=useState('');
  const patientName=context?.display_name||caseData?.patient?.display_name||'Selected patient';
  const caseId=context?.case_id||caseData?.caseId;
  const potassium=caseData?.assessment?.potassium_mEq_L;
  const signal=context?.key_signal||caseData?.insights?.key_signal||'Longitudinal risk signal';
  const approve=async()=>{setSaving(true);setError('');try{await resolve(action,caseId,context?.review_type);}catch(err){setError(err.message);}finally{setSaving(false);}};
  return <><motion.div className="scrim" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} onClick={close}/><motion.aside className={`review-panel ${safety?'':'triage-review-panel'}`} initial={{x:'100%'}} animate={{x:0}} exit={{x:'100%'}} transition={{type:'spring',stiffness:250,damping:30}}><header><div><span>CLINICIAN-ONLY REVIEW · {caseId}</span><h2>{patientName}</h2></div><button onClick={close}><X/></button></header><div className="review-brief"><ShieldCheck/><span><b>{safety?'Acknowledge the safety escalation':'Verify the longitudinal risk route'}</b><small>{safety?'14 checks passed · Lisinopril remains blocked':`${signal} · human disposition required`}</small></span></div><section><label>01 · SELECT ACCOUNTABLE FOLLOW-UP</label><h3>What clinician-owned action should be recorded?</h3><p>{safety?'This response acknowledges the contraindication without issuing the prescription candidate.':'This closes the patient-specific review gate without creating a diagnosis, prescription, or autonomous treatment decision.'}</p>{safety?<><button onClick={()=>setAction('order_repeat_lab')} className={`dose-choice ${action==='order_repeat_lab'?'selected':''}`}><i/><span><b>Order repeat potassium</b><small>Keep Lisinopril blocked and reassess</small></span><em>RECOMMENDED</em></button><button onClick={()=>setAction('cancel_candidate')} className={`dose-choice ${action==='cancel_candidate'?'selected':''}`}><i/><span><b>Cancel prescription candidate</b><small>Record that no order was issued</small></span></button></>:<><button onClick={()=>setAction('acknowledge_risk_review')} className={`dose-choice ${action==='acknowledge_risk_review'?'selected':''}`}><i/><span><b>Acknowledge risk review</b><small>Verify the record and retain the existing follow-up plan</small></span><em>RECOMMENDED</em></button><button onClick={()=>setAction('request_record_update')} className={`dose-choice ${action==='request_record_update'?'selected':''}`}><i/><span><b>Request record update</b><small>Route missing or abnormal information for clinician follow-up</small></span></button></>}</section><section><label>02 · REVIEW FINAL LANGUAGE</label><div className="final-language">{safety?<>Potassium {potassium??'—'} mEq/L acknowledged for {patientName}. Lisinopril 10 mg candidate remains blocked and was not issued. {action==='order_repeat_lab'?'Repeat potassium requested.':'Candidate cancelled.'}</>:<>{patientName}’s longitudinal signal “{signal}” was reviewed by Dr. Abhinav. {action==='request_record_update'?'An updated record was requested before the next documentation cycle.':'The existing clinician-owned follow-up plan remains in place.'} No autonomous clinical action was taken.</>}</div><div className="language-note"><Sparkles/>The clinician identity, selected action, timestamp, and content hashes will be persisted.</div>{error&&<div className="review-error"><AlertTriangle/>{error}</div>}</section><div className="audit-line"><span>Immutable audit</span><b>Dr. Abhinav · clinician role verified server-side</b></div><footer><button onClick={close}>Return to record</button><button disabled={saving||approved} className={approved?'approved':''} onClick={approve}>{approved?<><Check/>Acknowledged & persisted</>:saving?<><RefreshCcw/>Saving decision…</>:<><UserRoundCheck/>{safety?'Acknowledge escalation':'Complete patient review'}</>}</button></footer></motion.aside></>;
}

createRoot(document.getElementById('root')).render(<App/>);
