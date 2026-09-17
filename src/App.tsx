import { useEffect, useState } from 'react'
import { Project } from './types'
import { loadProjects, saveProjects, uid } from './store'
import PlanEditor from './components/PlanEditor'

export default function App(){
  const [projects, setProjects] = useState<Project[]>(()=> loadProjects())
  const [activeId, setActiveId] = useState<string|null>(null)
  const [tab, setTab] = useState<'list'|'edit'>('list')
  const [draft, setDraft] = useState<Partial<Project>>({})

  useEffect(()=>{ saveProjects(projects) }, [projects])

  const active = projects.find(p=>p.id===activeId) || null

  function createProject(){
    const now = Date.now()
    const p: Project = {
      id: uid(),
      name: draft.name || `場地 ${new Date().toLocaleDateString()}`,
      venue: draft.venue || '',
      date: draft.date || new Date().toISOString().slice(0,10),
      client: draft.client || '',
      createdAt: now,
      updatedAt: now,
      walls: [],
      objects: [],
      pxPerCm: 2, // 預設 1cm =2px，約 1000px = 5m
      photos: [],
      memo: ''
    }
    setProjects([p, ...projects])
    setActiveId(p.id)
    setTab('edit')
    setDraft({})
  }

  function updateProject(id:string, patch: Partial<Project>){
    setProjects(prev=> prev.map(p=> p.id===id ? {...p, ...patch, updatedAt: Date.now()} : p))
  }
  function deleteProject(id:string){
    if(!confirm('確定刪除此專案？此動作無法復原（單機儲存）')) return
    setProjects(prev=> prev.filter(p=>p.id!==id))
    if(activeId===id){ setActiveId(null); setTab('list') }
  }

  return (
    <div style={{minHeight:'100vh', display:'flex', flexDirection:'column'}}>
      <header style={{background:'#0f172a', color:'#fff', padding:'12px 16px', display:'flex', alignItems:'center', justifyContent:'space-between', position:'sticky', top:0, zIndex:10}}>
        <div style={{fontWeight:800, letterSpacing:0.5}}>📐 場勘平面圖 <span style={{fontWeight:400, opacity:0.7, fontSize:13, marginLeft:8}}>Venue Planner for Android</span></div>
        <div style={{display:'flex', gap:8}}>
          <button onClick={()=>setTab('list')} style={{padding:'6px 12px', borderRadius:8, border:'none', background: tab==='list'?'#38bdf8':'#1e293b', color:'#fff'}}>專案</button>
          {active && <button onClick={()=>setTab('edit')} style={{padding:'6px 12px', borderRadius:8, border:'none', background: tab==='edit'?'#38bdf8':'#1e293b', color:'#fff'}}>編輯：{active.name}</button>}
        </div>
      </header>

      {tab==='list' && (
        <div style={{maxWidth:960, width:'100%', margin:'0 auto', padding:16}}>
          <div style={{background:'#fff', borderRadius:16, padding:16, boxShadow:'0 4px 16px rgba(0,0,0,0.06)', marginBottom:16}}>
            <h3 style={{marginBottom:12}}>＋ 新建場勘專案</h3>
            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:10}}>
              <input placeholder="專案/活動名稱 *" value={draft.name||''} onChange={e=>setDraft({...draft, name:e.target.value})} style={inputStyle} />
              <input placeholder="場地名稱/地址" value={draft.venue||''} onChange={e=>setDraft({...draft, venue:e.target.value})} style={inputStyle} />
              <input type="date" value={draft.date||''} onChange={e=>setDraft({...draft, date:e.target.value})} style={inputStyle} />
              <input placeholder="客戶/主辦單位" value={draft.client||''} onChange={e=>setDraft({...draft, client:e.target.value})} style={inputStyle} />
            </div>
            <button onClick={createProject} style={{marginTop:12, width:'100%', padding:'12px', borderRadius:10, border:'none', background:'#0f172a', color:'#fff', fontWeight:700, fontSize:16}}>建立專案並開始場勘</button>
            <div style={{fontSize:12, color:'#64748b', marginTop:8}}>＊ Android 拍照建圖：先拍場地照片作為底圖，再用手指拉牆排桌椅。所有資料僅存於本機。</div>
          </div>

          <h3 style={{margin:'8px 4px'}}>我的專案（{projects.length}）· 單機儲存</h3>
          {projects.length===0 && <div style={{textAlign:'center', color:'#94a3b8', padding:40}}>尚未有專案，請先建立一個</div>}
          <div style={{display:'grid', gap:10}}>
            {projects.map(p=>(
              <div key={p.id} style={{background:'#fff', borderRadius:12, padding:14, display:'flex', justifyContent:'space-between', alignItems:'center', boxShadow:'0 2px 8px rgba(0,0,0,0.04)'}}>
                <div onClick={()=>{ setActiveId(p.id); setTab('edit') }} style={{cursor:'pointer', flex:1}}>
                  <div style={{fontWeight:700}}>{p.name} <span style={{fontWeight:400, fontSize:12, color:'#64748b'}}>· {p.venue || '未填場地'}</span></div>
                  <div style={{fontSize:12, color:'#64748b', marginTop:4}}>{p.date} ｜ {p.walls.length} 段牆 · {p.objects.length} 物件 · {p.photos.length} 張現場照</div>
                  <div style={{fontSize:11, color:'#94a3b8'}}>更新：{new Date(p.updatedAt).toLocaleString()}</div>
                </div>
                <div style={{display:'flex', gap:8, marginLeft:12}}>
                  <button onClick={()=>{ setActiveId(p.id); setTab('edit') }} style={smallBtn}>編輯</button>
                  <button onClick={()=>deleteProject(p.id)} style={{...smallBtn, background:'#fef2f2', color:'#dc2626', border:'1px solid #fecaca'}}>刪除</button>
                </div>
              </div>
            ))}
          </div>

          <div style={{marginTop:24, background:'#fffbeb', border:'1px solid #fde68a', borderRadius:12, padding:14}}>
            <b>排桌椅公分級說明：</b>
            <div style={{fontSize:13, color:'#92400e', marginTop:6, lineHeight:1.6}}>
              本APP為活動場佈等級，非施工圖。1. 請先用已知尺寸（如一張長桌180cm）校正比例尺。<br/>
              2. 拍照後手動拉牆，誤差約±3-5cm，足夠判斷桌椅是否放得下、走道是否足夠（建議走道留120cm以上）。<br/>
              3. 電源圖層請務必現場拍照佐證。
            </div>
          </div>
        </div>
      )}

      {tab==='edit' && active && (
        <PlanEditor project={active} onUpdate={(patch)=> updateProject(active.id, patch)} onBack={()=> setTab('list')} />
      )}
    </div>
  )
}
const inputStyle: React.CSSProperties = { padding:'10px 12px', borderRadius:8, border:'1px solid #e2e8f0', background:'#f8fafc', width:'100%' }
const smallBtn: React.CSSProperties = { padding:'8px 14px', borderRadius:8, border:'1px solid #e2e8f0', background:'#fff', fontWeight:600 }
