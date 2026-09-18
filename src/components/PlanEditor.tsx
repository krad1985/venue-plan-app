import { useRef, useState, useEffect } from 'react'
import { Project, VenueObject, Wall, Point } from '../types'
import { uid } from '../store'
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'

type Props = { project: Project, onUpdate:(p:Partial<Project>)=>void, onBack:()=>void }

const OBJECT_TEMPLATES: Record<string, {w:number,h:number,label:string,type:VenueObject['type']}> = {
  '圓桌6人': {w:180,h:180,label:'圓桌φ180', type:'round_table'},
  '圓桌10人': {w:220,h:220,label:'圓桌φ220', type:'round_table'},
  '長桌180': {w:180,h:80,label:'長桌180', type:'rect_table'},
  '長桌120': {w:120,h:60,label:'長桌120', type:'rect_table'},
  '椅子': {w:50,h:50,label:'椅', type:'chair'},
  '舞台': {w:300,h:200,label:'舞台', type:'stage'},
  '講台': {w:80,h:60,label:'講台', type:'stage'},
  '插座': {w:30,h:30,label:'插座', type:'power_socket'},
  '總電源箱': {w:60,h:40,label:'電源箱', type:'power_box'},
  '門': {w:90,h:15,label:'門', type:'door'},
  '柱子': {w:60,h:60,label:'柱', type:'pillar'},
  '備註': {w:30,h:30,label:'!', type:'note_pin'},
}

export default function PlanEditor({project, onUpdate, onBack}:Props){
  const [tab, setTab] = useState<'camera'|'plan'|'furniture'|'export'>('camera')
  const [selectedId, setSelectedId] = useState<string|null>(null)
  const [wallPoints, setWallPoints] = useState<Point[]>([])
  const [cameraPoints, setCameraPoints] = useState<Point[]>([]) // 在相機畫面上的點
  const [scaleInput, setScaleInput] = useState<string>(String(project.scaleRef?.realCm || 300))
  const svgRef = useRef<SVGSVGElement>(null)
  const planWrapRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [dragId, setDragId] = useState<string|null>(null)
  const [memo, setMemo] = useState(project.memo)
  const [cameraActive, setCameraActive] = useState(false)
  const [frozenImage, setFrozenImage] = useState<string|null>(null)
  const [showFurnitureSheet, setShowFurnitureSheet] = useState(true)
  const [showHelp, setShowHelp] = useState(true)

  const pxPerCm = project.pxPerCm

  // 啟動相機
  useEffect(()=>{
    if(tab!=='camera' || frozenImage) return
    let stream: MediaStream | null = null
    async function start(){
      try{
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio:false })
        if(videoRef.current){ videoRef.current.srcObject = stream; await videoRef.current.play(); setCameraActive(true) }
      }catch(e){ console.log('camera fail',e); setCameraActive(false) }
    }
    start()
    return ()=>{ stream?.getTracks().forEach(t=>t.stop()); setCameraActive(false) }
  }, [tab, frozenImage])

  function captureFreeze(){
    const v = videoRef.current
    if(!v) return
    const c = document.createElement('canvas')
    c.width = v.videoWidth; c.height = v.videoHeight
    c.getContext('2d')!.drawImage(v,0,0)
    const data = c.toDataURL('image/jpeg',0.85)
    setFrozenImage(data)
    // 同步設為專案底圖
    onUpdate({ backgroundImage: data })
  }

  // 相機畫面點選（3D 轉 2D 的核心）
  function handleCameraTap(e: React.PointerEvent){
    const target = e.currentTarget as HTMLElement
    const rect = target.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width * 1000
    const y = (e.clientY - rect.top) / rect.height * 700
    const snap = 8
    const p = { x: Math.round(x/snap)*snap, y: Math.round(y/snap)*snap }
    setCameraPoints(prev=> [...prev, p])
    setWallPoints(prev=> [...prev, p]) // 同步到平面用
  }

  function svgPoint(e: React.PointerEvent){
    const svg = svgRef.current!
    const rect = svg.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width * 1000
    const y = (e.clientY - rect.top) / rect.height * 700
    return {x,y}
  }
  function handlePlanClick(e: React.PointerEvent){
    // 在平面頁也可微調：點擊新增牆點（僅在無選取時）
    if(selectedId) return
    const p = svgPoint(e)
    const snap = 10
    p.x = Math.round(p.x/snap)*snap; p.y = Math.round(p.y/snap)*snap
    // 如果是 plan tab 的補點，直接加到最後一段牆的編輯？簡化：加到暫存 wallPoints
    setWallPoints(prev=> [...prev, p])
  }

  function finishWalls(){
    if(wallPoints.length<2 && cameraPoints.length<2){ alert('請至少點 2 個牆角'); return }
    // 將目前暫存點轉為一段牆（新手流程：繞場一圈就是一個多邊形）
    const pts = wallPoints.length>=2 ? wallPoints : cameraPoints
    const w: Wall = { id: uid(), points: pts }
    onUpdate({ walls: [...project.walls, w] })
    setWallPoints([]); setCameraPoints([])
    setTab('plan')
    setShowHelp(false)
  }

  function applyCameraToPlan(){
    // 將相機點直接轉為 2D 平面（透視→俯視的簡化版：直接映射，靠後續比例校正）
    if(cameraPoints.length<2) return
    finishWalls()
  }

  function clearCamera(){ setCameraPoints([]); setWallPoints([]); setFrozenImage(null) }

  function addObject(key:string){
    const t = OBJECT_TEMPLATES[key]
    const obj: VenueObject = {
      id: uid(), type: t.type, x: 400, y: 340, w: t.w * pxPerCm, h: t.h * pxPerCm, rotation:0, label: t.label,
      note: key==='備註' ? '注意：' : undefined
    }
    onUpdate({ objects: [...project.objects, obj]})
    setSelectedId(obj.id)
  }
  function updateObject(id:string, patch: Partial<VenueObject>){
    onUpdate({ objects: project.objects.map(o=> o.id===id ? {...o, ...patch}:o )})
  }
  function deleteSelected(){
    if(!selectedId) return
    onUpdate({ objects: project.objects.filter(o=>o.id!==selectedId), walls: project.walls.filter(w=>w.id!==selectedId) })
    setSelectedId(null)
  }
  function handlePhotoAdd(e: React.ChangeEvent<HTMLInputElement>){
    const files = e.target.files; if(!files) return
    Array.from(files).forEach(file=>{
      const r = new FileReader(); r.onload = ()=> onUpdate({ photos: [...project.photos, r.result as string] }); r.readAsDataURL(file)
    })
  }
  function applyScale(){
    const realCm = Number(scaleInput)
    if(!realCm || project.walls.length===0){ alert('請先完成描牆，再輸入該牆的真實長度'); return }
    const last = project.walls[project.walls.length-1]
    let pxLen=0; for(let i=1;i<last.points.length;i++) pxLen+= Math.hypot(last.points[i].x-last.points[i-1].x, last.points[i].y-last.points[i-1].y)
    if(pxLen<10) return
    const newPxPerCm = pxLen / realCm
    const ratio = newPxPerCm / pxPerCm
    const newObjects = project.objects.map(o=> ({...o, w:o.w*ratio, h:o.h*ratio }))
    onUpdate({ pxPerCm: newPxPerCm, scaleRef:{ pxLength:pxLen, realCm }, objects: newObjects })
    alert(`已校正：之後 1cm = ${newPxPerCm.toFixed(2)}px，桌椅已自動縮放`)
  }
  function onPointerDownObj(e: React.PointerEvent, id:string){
    e.stopPropagation(); setSelectedId(id); setDragId(id); (e.target as Element).setPointerCapture(e.pointerId)
  }
  function onPointerMove(e: React.PointerEvent){
    if(!dragId) return
    const p = svgPoint(e)
    const obj = project.objects.find(o=>o.id===dragId)
    if(!obj) return
    updateObject(dragId, { x: p.x - obj.w/2, y: p.y - obj.h/2 })
  }
  function onPointerUp(){ setDragId(null) }
  async function exportPDF(){
    if(!planWrapRef.current) return
    const canvas = await html2canvas(planWrapRef.current, { scale:2, useCORS:true, backgroundColor:'#ffffff' })
    const img = canvas.toDataURL('image/png')
    const pdf = new jsPDF({ orientation: canvas.width>canvas.height ? 'landscape':'portrait', unit:'mm', format:'a4' })
    const pageW = pdf.internal.pageSize.getWidth(), pageH = pdf.internal.pageSize.getHeight()
    const ratio = Math.min(pageW / (canvas.width*0.264583/2), pageH / (canvas.height*0.264583/2))
    const w = canvas.width*0.264583/2 * ratio, h = canvas.height*0.264583/2 * ratio
    pdf.addImage(img, 'PNG', (pageW-w)/2, 10, w, h)
    pdf.setFontSize(9); pdf.text(`${project.name} | ${project.venue} | ${project.date}`, 10, 8)
    if(memo) pdf.text(`備註: ${memo.slice(0,150)}`, 10, pageH-8)
    pdf.save(`${project.name}.pdf`)
  }
  async function exportJPG(){
    if(!planWrapRef.current) return
    const canvas = await html2canvas(planWrapRef.current, {scale:2, useCORS:true, backgroundColor:'#ffffff'})
    const a = document.createElement('a'); a.href = canvas.toDataURL('image/jpeg',0.92); a.download = `${project.name}.jpg`; a.click()
  }
  function wallLength(w:Wall){ let len=0; for(let i=1;i<w.points.length;i++) len+= Math.hypot(w.points[i].x-w.points[i-1].x, w.points[i].y-w.points[i-1].y); return len/pxPerCm }

  return (
    <div style={{flex:1, display:'flex', flexDirection:'column', minHeight:0, background:'#f1f5f9'}}>
      {/* 頂欄 */}
      <div style={{background:'#0f172a', color:'#fff', padding:'10px 12px', display:'flex', alignItems:'center', justifyContent:'space-between', position:'sticky', top:0, zIndex:20}}>
        <div style={{display:'flex', gap:8, alignItems:'center'}}>
          <button onClick={onBack} style={{background:'rgba(255,255,255,0.15)', border:'none', color:'#fff', padding:'6px 10px', borderRadius:8}}>←</button>
          <div style={{fontWeight:800, fontSize:14, lineHeight:1.1}}>{project.name}<div style={{fontWeight:400, fontSize:11, opacity:0.7}}>{project.venue || '未填場地'} · {project.date}</div></div>
        </div>
        <div style={{display:'flex', gap:6, alignItems:'center'}}>
          <span style={{fontSize:11, background:'#38bdf8', color:'#0f172a', padding:'3px 7px', borderRadius:99, fontWeight:700}}>新手模式</span>
          <button onClick={()=>setShowHelp(!showHelp)} style={{background:'#1e293b', border:'none', color:'#fff', width:28, height:28, borderRadius:99}}>?</button>
        </div>
      </div>

      {showHelp && (
        <div style={{background:'#fffbeb', borderBottom:'1px solid #fde68a', padding:'10px 12px', fontSize:12, lineHeight:1.6}}>
          <b>📷 新手 3 步完成平面圖：</b><br/>
          ① <b>相機描牆</b>：站在場地中央，鏡頭與地面平行，對著牆面依序點擊每個 <b>牆角轉折</b>（有樑柱也要點）<br/>
          ② <b>轉 2D 平面</b>：按「完成轉平面圖」，系統自動把 3D 透視轉為俯視平面圖<br/>
          ③ <b>誤差修正</b>：到「平面」頁輸入一面已知長度的牆（例如門寬90cm）校正比例，再拖拉微調
          <button onClick={()=>setShowHelp(false)} style={{float:'right', background:'#0f172a', color:'#fff', border:'none', padding:'4px 8px', borderRadius:6, fontSize:11}}>知道了</button>
        </div>
      )}

      {/* 內容區 */}
      <div style={{flex:1, minHeight:0, overflow:'auto', paddingBottom:70}}>
        {tab==='camera' && (
          <div style={{padding:10}}>
            <div style={{background:'#000', borderRadius:16, overflow:'hidden', position:'relative', aspectRatio:'3/4', maxHeight:'68vh', margin:'0 auto', maxWidth:480}}>
              {/* 視訊或定格圖 */}
              {!frozenImage ? (
                <video ref={videoRef} autoPlay playsInline muted style={{width:'100%', height:'100%', objectFit:'cover'}} />
              ) : (
                <img src={frozenImage} style={{width:'100%', height:'100%', objectFit:'cover'}} />
              )}
              {/* 半透明網格輔助 */}
              <div style={{position:'absolute', inset:0, background:'linear-gradient(to bottom, transparent 60%, rgba(0,0,0,0.25))', pointerEvents:'none'}} />
              <svg width="100%" height="100%" viewBox="0 0 1000 700" style={{position:'absolute', inset:0}} preserveAspectRatio="none">
                <rect width={1000} height={700} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth={1} />
                <line x1={500} y1={0} x2={500} y2={700} stroke="rgba(255,255,255,0.18)" strokeDasharray="8 8" />
                <line x1={0} y1={350} x2={1000} y2={350} stroke="rgba(255,255,255,0.18)" strokeDasharray="8 8" />
              </svg>
              {/* 可點選層 */}
              <div onPointerDown={handleCameraTap} style={{position:'absolute', inset:0, touchAction:'none', cursor:'crosshair'}}>
                <svg viewBox="0 0 1000 700" width="100%" height="100%" style={{width:'100%', height:'100%'}}>
                  {cameraPoints.length>0 && (
                    <>
                      <path d={cameraPoints.map((p,i)=> `${i===0?'M':'L'} ${p.x} ${p.y}`).join(' ') + (cameraPoints.length>2 ? ' Z' : '')} fill="rgba(56,189,248,0.18)" stroke="#38bdf8" strokeWidth={4} />
                      {cameraPoints.map((p,i)=>(
                        <g key={i}>
                          <circle cx={p.x} cy={p.y} r={14} fill="#38bdf8" stroke="#fff" strokeWidth={3} />
                          <text x={p.x} y={p.y-20} textAnchor="middle" fontSize={18} fontWeight={800} fill="#fff" stroke="#0f172a" strokeWidth={3}>{i+1}</text>
                        </g>
                      ))}
                    </>
                  )}
                  {/* 3D 透視輔助線：從底部往上 */}
                  {cameraPoints.length>=1 && cameraPoints.map((p,i)=> i>0 && <line key={'l'+i} x1={cameraPoints[i-1].x} y1={cameraPoints[i-1].y} x2={p.x} y2={p.y} stroke="#fde68a" strokeWidth={3} strokeDasharray="6 6" />)}
                </svg>
              </div>
              {/* 頂部提示 */}
              <div style={{position:'absolute', top:10, left:10, right:10, display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                <div style={{background:'rgba(15,23,42,0.85)', color:'#fff', padding:'6px 10px', borderRadius:99, fontSize:12}}>已點 {cameraPoints.length} 個轉折 {cameraPoints.length>=3 && '· 可閉合'}</div>
                <div style={{background: frozenImage ? '#f59e0b' : '#22c55e', color:'#fff', padding:'4px 8px', borderRadius:99, fontSize:11, fontWeight:700}}>{frozenImage ? '已定格·可精點' : cameraActive ? '● 鏡頭即時' : '需相機權限'}</div>
              </div>
              {/* 底部操作 */}
              <div style={{position:'absolute', bottom:10, left:10, right:10, display:'flex', gap:8}}>
                {!frozenImage ? (
                  <>
                    <button onClick={captureFreeze} style={camBtnPrimary}>📸 定格精點</button>
                    <button onClick={clearCamera} style={camBtn}>↺ 重點</button>
                  </>
                ) : (
                  <>
                    <button onClick={()=>setFrozenImage(null)} style={camBtn}>🎥 回到即時</button>
                    <button onClick={clearCamera} style={camBtn}>↺ 清除</button>
                  </>
                )}
                <button onClick={applyCameraToPlan} disabled={cameraPoints.length<2} style={{...camBtnPrimary, opacity: cameraPoints.length<2?0.5:1, flex:1.2, background:'#38bdf8', color:'#0f172a'}}>✓ 完成轉平面圖</button>
              </div>
            </div>

            <div style={{maxWidth:480, margin:'10px auto 0', background:'#fff', borderRadius:12, padding:10, display:'flex', gap:8, alignItems:'center'}}>
              <div style={{flex:1, fontSize:12, color:'#475569', lineHeight:1.5}}>
                <b>小技巧：</b>先點最遠的牆角，再順時針繞一圈，最後點回起點附近會自動閉合。點錯可按「重點」或點「清除最後一點」。<br/>
                <span style={{color:'#0ea5e9'}}>→ 完成後自動跳到「平面」頁做誤差修正</span>
              </div>
              <button onClick={()=> cameraPoints.length>0 && setCameraPoints(p=>p.slice(0,-1))} style={{background:'#fef2f2', border:'1px solid #fecaca', color:'#dc2626', padding:'8px 10px', borderRadius:8, fontSize:12, whiteSpace:'nowrap'}}>刪除最後一點</button>
            </div>

            {/* 已轉的牆列表 */}
            {project.walls.length>0 && (
              <div style={{maxWidth:480, margin:'10px auto', background:'#fff', borderRadius:12, padding:10}}>
                <div style={{fontSize:12, fontWeight:700}}>已建立 {project.walls.length} 段牆</div>
                <div style={{fontSize:11, color:'#64748b'}}>可在「平面」頁拖拉修正或刪除</div>
              </div>
            )}
          </div>
        )}

        {tab==='plan' && (
          <div style={{padding:10, maxWidth:820, margin:'0 auto'}}>
            {/* 比例校正卡（收合式） */}
            <details open style={{background:'#fff', borderRadius:12, padding:10, marginBottom:10, border:'1px solid #e2e8f0'}}>
              <summary style={{fontWeight:800, fontSize:13, cursor:'pointer'}}>📏 誤差修正：輸入已知長度校正比例 <span style={{fontWeight:400, color:'#64748b', fontSize:11}}>（必做，否則桌椅尺寸不準）</span></summary>
              <div style={{display:'flex', gap:8, alignItems:'center', marginTop:10, flexWrap:'wrap'}}>
                <span style={{fontSize:12}}>最後一段牆 =</span>
                <input inputMode="numeric" value={scaleInput} onChange={e=>setScaleInput(e.target.value)} style={{width:90, padding:'8px', borderRadius:8, border:'1px solid #cbd5e1'}} />
                <span style={{fontSize:12}}>cm</span>
                <button onClick={applyScale} style={{background:'#0f172a', color:'#fff', border:'none', padding:'8px 14px', borderRadius:8, fontWeight:700}}>套用校正</button>
                <span style={{fontSize:11, color:'#64748b'}}>目前 1cm={pxPerCm.toFixed(2)}px</span>
              </div>
              <div style={{fontSize:11, color:'#64748b', marginTop:6}}>建議量門寬90cm或一張長桌180cm，輸入後全圖桌椅自動等比縮放，誤差可壓到 ±2cm</div>
            </details>

            {/* 2D 平面圖 */}
            <div ref={planWrapRef} style={{background:'#fff', borderRadius:16, overflow:'hidden', boxShadow:'0 4px 16px rgba(0,0,0,0.08)'}}>
              <div style={{padding:'8px 12px', display:'flex', justifyContent:'space-between', fontSize:11, color:'#64748b', borderBottom:'1px solid #f1f5f9'}}>
                <span>{project.name} · 俯視平面圖</span>
                <span>{cameraPoints.length>0 ? `${cameraPoints.length}點` : `${project.walls.length}段牆`} · 可拖拉修正</span>
              </div>
              <div style={{position:'relative', width:'100%', aspectRatio:'1000/700', background:'#fff', overflow:'hidden', touchAction:'none'}} onPointerMove={onPointerMove} onPointerUp={onPointerUp}>
                {project.backgroundImage && <img src={project.backgroundImage} alt="bg" style={{position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'contain', opacity:0.22, pointerEvents:'none'}} />}
                <svg width="100%" height="100%" viewBox="0 0 1000 700" style={{position:'absolute', inset:0}}>
                  <defs><pattern id="grid2" width="50" height="50" patternUnits="userSpaceOnUse"><path d="M 50 0 L 0 0 0 50" fill="none" stroke="#f1f5f9" strokeWidth="1"/></pattern></defs>
                  <rect width={1000} height={700} fill="url(#grid2)" />
                </svg>
                <svg ref={svgRef} viewBox="0 0 1000 700" width="100%" height="100%" style={{position:'absolute', inset:0}} onClick={handlePlanClick as any}>
                  {project.walls.map(w=>{
                    const d = w.points.map((p,i)=> `${i===0?'M':'L'} ${p.x} ${p.y}`).join(' ') + (w.points.length>2 ? ' Z' : '')
                    const mid = w.points[Math.floor(w.points.length/2)]
                    const len = wallLength(w)
                    return (
                      <g key={w.id} onClick={e=>{e.stopPropagation(); setSelectedId(w.id)}}>
                        <path d={d} fill={w.id===selectedId ? 'rgba(56,189,248,0.12)' : 'rgba(15,23,42,0.04)'} stroke={selectedId===w.id?'#0ea5e9':'#0f172a'} strokeWidth={selectedId===w.id?5:3.5} strokeLinejoin="round" />
                        {w.points.map((p,i)=> <circle key={i} cx={p.x} cy={p.y} r={6} fill={selectedId===w.id?'#0ea5e9':'#334155'} stroke="#fff" strokeWidth={2} />)}
                        {mid && <g><rect x={mid.x-30} y={mid.y-18} width={60} height={16} rx={8} fill="#0f172a"/><text x={mid.x} y={mid.y-7} textAnchor="middle" fontSize={10} fill="#fff">{Math.round(len)}cm</text></g>}
                      </g>
                    )
                  })}
                  {wallPoints.length>0 && <path d={wallPoints.map((p,i)=>`${i===0?'M':'L'} ${p.x} ${p.y}`).join(' ')} fill="none" stroke="#f59e0b" strokeWidth={3} strokeDasharray="8 6" />}
                  {project.objects.map(o=>{
                    const isSel = selectedId===o.id
                    if(o.type==='round_table'){
                      return <g key={o.id} onPointerDown={e=>onPointerDownObj(e,o.id)} style={{cursor:'grab'}}><ellipse cx={o.x+o.w/2} cy={o.y+o.h/2} rx={o.w/2} ry={o.h/2} fill={isSel?'#e0f2fe':'#fff'} stroke={isSel?'#0ea5e9':'#334155'} strokeWidth={isSel?3:1.8}/><text x={o.x+o.w/2} y={o.y+o.h/2} textAnchor="middle" dominantBaseline="middle" fontSize={11} fontWeight={700}>{o.label}</text></g>
                    }
                    const fill = o.type==='power_socket' ? '#fef9c3' : o.type==='power_box' ? '#fee2e2' : o.type==='note_pin' ? '#fde68a' : isSel?'#e0f2fe':'#fff'
                    return <g key={o.id} onPointerDown={e=>onPointerDownObj(e,o.id)}><g transform={`rotate(${o.rotation} ${o.x+o.w/2} ${o.y+o.h/2})`}><rect x={o.x} y={o.y} width={o.w} height={o.h} rx={o.type==='chair'?6:4} fill={fill} stroke={isSel?'#0ea5e9':'#334155'} strokeWidth={isSel?3:1.5}/><text x={o.x+o.w/2} y={o.y+o.h/2} textAnchor="middle" dominantBaseline="middle" fontSize={10} fontWeight={700}>{o.label}</text></g>{isSel && <rect x={o.x-2} y={o.y-2} width={o.w+4} height={o.h+4} fill="none" stroke="#0ea5e9" strokeDasharray="6 4"/>}</g>
                  })}
                </svg>
              </div>
              <div style={{padding:'8px 10px', background:'#f8fafc', display:'flex', gap:8, flexWrap:'wrap', alignItems:'center'}}>
                <span style={{fontSize:11, color:'#64748b'}}>💡 點選牆壁可刪除 · 拖拉桌椅可移動 · 牆上數字為公分</span>
                <button onClick={deleteSelected} disabled={!selectedId} style={{marginLeft:'auto', background: selectedId?'#fef2f2':'#f1f5f9', color: selectedId?'#dc2626':'#94a3b8', border:'1px solid #e2e8f0', padding:'6px 10px', borderRadius:8, fontSize:12}}>刪除選取</button>
                <button onClick={()=>{ setWallPoints([]); setCameraPoints([])}} style={{background:'#fff', border:'1px solid #e2e8f0', padding:'6px 10px', borderRadius:8, fontSize:12}}>清除暫存點</button>
                {wallPoints.length>=2 && <button onClick={finishWalls} style={{background:'#0f172a', color:'#fff', border:'none', padding:'6px 10px', borderRadius:8, fontSize:12}}>完成此段牆</button>}
              </div>
            </div>

            <div style={{marginTop:10, background:'#eff6ff', border:'1px solid #bfdbfe', borderRadius:12, padding:10, fontSize:12}}>
              <b>如何修正透視誤差？</b><br/>
              ① 相機描牆後一定有透視變形，請務必做「比例校正」<br/>
              ② 在平面圖上直接拖拉牆角圓點微調形狀<br/>
              ③ 走道建議 120cm，圓桌間距 150cm 以上
            </div>
          </div>
        )}

        {tab==='furniture' && (
          <div style={{padding:10, maxWidth:820, margin:'0 auto'}}>
            <div style={{background:'#fff', borderRadius:12, padding:10, marginBottom:10}}>
              <div style={{fontWeight:800, fontSize:13, marginBottom:8}}>🪑 桌椅 / 電源 / 備註（一鍵加入後到平面圖拖拉）</div>
              <div style={{display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8}}>
                {Object.keys(OBJECT_TEMPLATES).map(k=>(
                  <button key={k} onClick={()=>addObject(k)} style={{padding:'14px 6px', borderRadius:12, border:'1px solid #e2e8f0', background:'#f8fafc', fontWeight:700, fontSize:13}}>+ {k}</button>
                ))}
              </div>
              <div style={{marginTop:10, display:'flex', gap:8}}>
                <button onClick={()=> setShowFurnitureSheet(!showFurnitureSheet)} style={{flex:1, background:'#0f172a', color:'#fff', border:'none', padding:'10px', borderRadius:10, fontWeight:700}}>{showFurnitureSheet?'收合平面預覽':'展開平面預覽'}</button>
                <button onClick={()=> setTab('plan')} style={{flex:1, background:'#fff', border:'1px solid #e2e8f0', padding:'10px', borderRadius:10, fontWeight:700}}>去平面圖調整位置 →</button>
              </div>
            </div>
            {showFurnitureSheet && (
              <div style={{background:'#fff', borderRadius:16, overflow:'hidden', boxShadow:'0 4px 16px rgba(0,0,0,0.08)'}}>
                <div style={{height:360, position:'relative', background:'#fff'}} onPointerMove={onPointerMove} onPointerUp={onPointerUp}>
                  <svg width="100%" height="100%" viewBox="0 0 1000 700"><rect width={1000} height={700} fill="#fff"/><rect width={1000} height={700} fill="url(#grid2)" /></svg>
                  <svg ref={svgRef} viewBox="0 0 1000 700" width="100%" height="100%" style={{position:'absolute', inset:0}}>
                    {project.walls.map(w=> <path key={w.id} d={w.points.map((p,i)=>`${i===0?'M':'L'} ${p.x} ${p.y}`).join(' ')} fill="none" stroke="#0f172a" strokeWidth={3} opacity={0.6} />)}
                    {project.objects.map(o=> <g key={o.id} onPointerDown={e=>onPointerDownObj(e,o.id)}><rect x={o.x} y={o.y} width={o.w} height={o.h} rx={4} fill={selectedId===o.id?'#e0f2fe':'#fff'} stroke={selectedId===o.id?'#0ea5e9':'#334155'} strokeWidth={1.5}/><text x={o.x+o.w/2} y={o.y+o.h/2} textAnchor="middle" fontSize={10} fontWeight={700}>{o.label}</text></g>)}
                  </svg>
                </div>
                <div style={{padding:8, fontSize:11, color:'#64748b', background:'#f8fafc'}}>提示：點上方按鈕加入物件後，直接在此預覽圖拖拉定位</div>
              </div>
            )}
            {selectedId && (()=>{ const o=project.objects.find(x=>x.id===selectedId); if(!o) return null; return (
              <div style={{marginTop:10, background:'#fff', borderRadius:12, padding:10}}>
                <div style={{fontWeight:700}}>{o.label} · {Math.round(o.w/pxPerCm)}×{Math.round(o.h/pxPerCm)}cm</div>
                <input value={o.label} onChange={e=>updateObject(o.id,{label:e.target.value})} style={inp} placeholder="標籤" />
                <textarea value={o.note||''} onChange={e=>updateObject(o.id,{note:e.target.value})} placeholder="備註：例如需電源、勿擋走道" rows={2} style={{...inp, marginTop:6}} />
                <div style={{display:'flex', gap:6, marginTop:6}}>
                  <button onClick={()=>updateObject(o.id,{rotation:(o.rotation+90)%360})} style={btn}>↻ 旋轉</button>
                  <button onClick={deleteSelected} style={{...btn, background:'#fef2f2', color:'#dc2626'}}>刪除</button>
                </div>
              </div>
            )})()}
          </div>
        )}

        {tab==='export' && (
          <div style={{padding:10, maxWidth:820, margin:'0 auto', display:'flex', flexDirection:'column', gap:10}}>
            <div style={{background:'#fff', borderRadius:12, padding:12}}>
              <div style={{fontWeight:800}}>專案資訊</div>
              <input value={project.name} onChange={e=>onUpdate({name:e.target.value})} style={inp} placeholder="專案名稱" />
              <input value={project.venue} onChange={e=>onUpdate({venue:e.target.value})} style={{...inp, marginTop:6}} placeholder="場地/地址" />
              <div style={{display:'flex', gap:6, marginTop:6}}>
                <input type="date" value={project.date} onChange={e=>onUpdate({date:e.target.value})} style={{...inp, flex:1}} />
                <input value={project.client} onChange={e=>onUpdate({client:e.target.value})} style={{...inp, flex:1}} placeholder="客戶" />
              </div>
            </div>
            <div style={{background:'#fff', borderRadius:12, padding:12}}>
              <div style={{fontWeight:700, fontSize:13}}>現場備註</div>
              <textarea value={memo} onChange={e=>setMemo(e.target.value)} onBlur={()=>onUpdate({memo})} placeholder="梁下210cm、需延長線、逃生門勿擋..." rows={3} style={{...inp, marginTop:6}} />
              <div style={{display:'flex', gap:6, flexWrap:'wrap', marginTop:6}}>
                {['梁下210cm','需延長線10m','逃生通道勿擋','插座不足','地面不平','不可釘牆'].map(t=> <button key={t} onClick={()=>{ const v=memo?memo+'、'+t:t; setMemo(v); onUpdate({memo:v})}} style={{fontSize:11, padding:'5px 8px', borderRadius:99, border:'1px solid #e2e8f0', background:'#fff'}}>+ {t}</button>)}
              </div>
            </div>
            <div style={{background:'#fff', borderRadius:12, padding:12}}>
              <div style={{fontWeight:700, fontSize:13}}>現場照片（{project.photos.length}） <label style={{fontWeight:600, fontSize:12, background:'#0f172a', color:'#fff', padding:'4px 8px', borderRadius:6, marginLeft:8}}>＋ 拍照<input type="file" accept="image/*" multiple capture="environment" onChange={handlePhotoAdd} style={{display:'none'}} /></label></div>
              <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:6, marginTop:8}}>
                {project.photos.map((p,i)=> <div key={i} style={{position:'relative'}}><img src={p} style={{width:'100%', height:100, objectFit:'cover', borderRadius:8}} /><button onClick={()=>onUpdate({photos: project.photos.filter((_,idx)=>idx!==i)})} style={{position:'absolute', top:4, right:4, background:'rgba(0,0,0,0.6)', color:'#fff', border:'none', borderRadius:99, width:22, height:22}}>×</button></div>)}
              </div>
              {project.photos.length===0 && <div style={{fontSize:12, color:'#94a3b8', marginTop:6}}>建議每個電源與死角都拍一張，匯出時可對照</div>}
            </div>
            <div style={{background:'#0f172a', borderRadius:12, padding:12, display:'flex', gap:8}}>
              <button onClick={exportPDF} style={{flex:1, background:'#38bdf8', color:'#0f172a', border:'none', padding:'14px', borderRadius:10, fontWeight:800}}>📄 匯出 PDF</button>
              <button onClick={exportJPG} style={{flex:1, background:'#fff', border:'none', padding:'14px', borderRadius:10, fontWeight:800}}>🖼️ 匯出 JPG</button>
            </div>
            <div style={{fontSize:11, color:'#64748b', textAlign:'center'}}>匯出內容為「平面」頁的俯視圖，含比例與備註，單機儲存</div>
          </div>
        )}
      </div>

      {/* 底部頁籤 */}
      <div style={{position:'fixed', bottom:0, left:0, right:0, background:'#fff', borderTop:'1px solid #e2e8f0', display:'flex', zIndex:20, paddingBottom:'env(safe-area-inset-bottom)'}}>
        {[
          {k:'camera', label:'相機描牆', icon:'📷'},
          {k:'plan', label:'平面', icon:'🗺️'},
          {k:'furniture', label:'擺設', icon:'🪑'},
          {k:'export', label:'備註匯出', icon:'📄'},
        ].map(t=>(
          <button key={t.k} onClick={()=>setTab(t.k as any)} style={{flex:1, padding:'8px 0', border:'none', background: tab===t.k ? '#0f172a' : '#fff', color: tab===t.k ? '#fff' : '#64748b', display:'flex', flexDirection:'column', alignItems:'center', gap:2}}>
            <span style={{fontSize:18}}>{t.icon}</span><span style={{fontSize:11, fontWeight:700}}>{t.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
const camBtn: React.CSSProperties = { flex:1, background:'rgba(15,23,42,0.85)', color:'#fff', border:'1px solid rgba(255,255,255,0.3)', padding:'10px', borderRadius:10, fontWeight:700, fontSize:13 }
const camBtnPrimary: React.CSSProperties = { ...camBtn, background:'#fff', color:'#0f172a' }
const btn: React.CSSProperties = { padding:'8px 10px', borderRadius:8, border:'1px solid #e2e8f0', background:'#fff', fontSize:13, fontWeight:600 }
const inp: React.CSSProperties = { width:'100%', padding:'10px', borderRadius:8, border:'1px solid #e2e8f0', background:'#fff', fontSize:13 }
