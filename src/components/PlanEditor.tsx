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
  const [tool, setTool] = useState<'select'|'wall'|'add'>('select')
  const [selectedId, setSelectedId] = useState<string|null>(null)
  const [wallPoints, setWallPoints] = useState<Point[]>([])
  const [scaleInput, setScaleInput] = useState<string>(String(project.scaleRef?.realCm || 180))
  const svgRef = useRef<SVGSVGElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [dragId, setDragId] = useState<string|null>(null)
  const [showNoteFor, setShowNoteFor] = useState<VenueObject|null>(null)
  const [memo, setMemo] = useState(project.memo)

  // 保持 pxPerCm 與背景一致
  const pxPerCm = project.pxPerCm

  function svgPoint(e: React.PointerEvent){
    const svg = svgRef.current!
    const rect = svg.getBoundingClientRect()
    const vw = 1000, vh = 700
    const x = (e.clientX - rect.left) / rect.width * vw
    const y = (e.clientY - rect.top) / rect.height * vh
    return {x,y}
  }

  function handleSvgClick(e: React.PointerEvent){
    if(tool!=='wall') return
    const p = svgPoint(e)
    // 磁吸網格 10px
    const snap = 10
    p.x = Math.round(p.x/snap)*snap
    p.y = Math.round(p.y/snap)*snap
    setWallPoints(prev=> [...prev, p])
  }

  function finishWall(){
    if(wallPoints.length<2) { setWallPoints([]); return }
    const w: Wall = { id: uid(), points: wallPoints }
    onUpdate({ walls: [...project.walls, w] })
    setWallPoints([])
  }

  function addObject(key:string){
    const t = OBJECT_TEMPLATES[key]
    const obj: VenueObject = {
      id: uid(),
      type: t.type,
      x: 400 + Math.random()*120,
      y: 300 + Math.random()*120,
      w: t.w * pxPerCm,
      h: t.h * pxPerCm,
      rotation:0,
      label: t.label,
      note: key==='備註' ? '需注意：' : undefined
    }
    onUpdate({ objects: [...project.objects, obj]})
    setTool('select')
    setSelectedId(obj.id)
  }

  function updateObject(id:string, patch: Partial<VenueObject>){
    onUpdate({ objects: project.objects.map(o=> o.id===id ? {...o, ...patch}:o )})
  }
  function deleteSelected(){
    if(!selectedId) return
    onUpdate({ 
      objects: project.objects.filter(o=>o.id!==selectedId),
      walls: project.walls.filter(w=>w.id!==selectedId)
    })
    setSelectedId(null)
  }

  function handleBackgroundUpload(e: React.ChangeEvent<HTMLInputElement>){
    const f = e.target.files?.[0]
    if(!f) return
    const reader = new FileReader()
    reader.onload = ()=> onUpdate({ backgroundImage: reader.result as string })
    reader.readAsDataURL(f)
  }
  function handlePhotoAdd(e: React.ChangeEvent<HTMLInputElement>){
    const files = e.target.files
    if(!files) return
    Array.from(files).forEach(file=>{
      const r = new FileReader()
      r.onload = ()=> onUpdate({ photos: [...project.photos, r.result as string] })
      r.readAsDataURL(file)
    })
  }

  function applyScale(){
    const realCm = Number(scaleInput)
    if(!realCm || project.walls.length===0) { alert('請先拉一段牆，再輸入該牆的實際長度(cm)'); return }
    // 以最後一段牆為參考
    const last = project.walls[project.walls.length-1]
    let pxLen = 0
    for(let i=1;i<last.points.length;i++){
      const dx = last.points[i].x - last.points[i-1].x
      const dy = last.points[i].y - last.points[i-1].y
      pxLen += Math.hypot(dx,dy)
    }
    if(pxLen<10) return
    const newPxPerCm = pxLen / realCm
    // 需要把所有物件的 px 尺寸依比例重算
    const ratio = newPxPerCm / pxPerCm
    const newObjects = project.objects.map(o=> ({...o, w:o.w*ratio, h:o.h*ratio }))
    onUpdate({ pxPerCm: newPxPerCm, scaleRef:{ pxLength:pxLen, realCm }, objects: newObjects })
    alert(`已校正：1cm = ${newPxPerCm.toFixed(2)}px，之後排桌椅即為公分級尺寸`)
  }

  // 拖曳物件
  function onPointerDownObj(e: React.PointerEvent, id:string){
    e.stopPropagation()
    setSelectedId(id)
    setDragId(id)
    ;(e.target as Element).setPointerCapture(e.pointerId)
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
    if(!wrapRef.current) return
    const canvas = await html2canvas(wrapRef.current, { scale:2, useCORS:true, backgroundColor:'#ffffff' })
    const img = canvas.toDataURL('image/png')
    const pdf = new jsPDF({ orientation: canvas.width>canvas.height ? 'landscape':'portrait', unit:'mm', format:'a4' })
    const pageW = pdf.internal.pageSize.getWidth()
    const pageH = pdf.internal.pageSize.getHeight()
    const ratio = Math.min(pageW / (canvas.width*0.264583/2), pageH / (canvas.height*0.264583/2))
    const w = canvas.width*0.264583/2 * ratio
    const h = canvas.height*0.264583/2 * ratio
    const x = (pageW - w)/2
    pdf.addImage(img, 'PNG', x, 10, w, h)
    pdf.setFontSize(10)
    pdf.text(`${project.name} | ${project.venue} | ${project.date} | 比例 1cm=${pxPerCm.toFixed(1)}px`, 10, 8)
    if(memo) pdf.text(`備註: ${memo.slice(0,120)}`, 10, pageH-8)
    pdf.save(`${project.name}.pdf`)
  }
  async function exportJPG(){
    if(!wrapRef.current) return
    const canvas = await html2canvas(wrapRef.current, {scale:2, useCORS:true, backgroundColor:'#ffffff'})
    const a = document.createElement('a')
    a.href = canvas.toDataURL('image/jpeg', 0.92)
    a.download = `${project.name}.jpg`
    a.click()
  }

  // 計算尺寸文字
  function wallLength(w:Wall){
    let len=0
    for(let i=1;i<w.points.length;i++) len+= Math.hypot(w.points[i].x - w.points[i-1].x, w.points[i].y - w.points[i-1].y)
    return len / pxPerCm
  }

  return (
    <div style={{flex:1, display:'flex', flexDirection:'column', minHeight:0}}>
      {/* 工具列 */}
      <div style={{background:'#fff', borderBottom:'1px solid #e2e8f0', padding:'8px 10px', display:'flex', flexWrap:'wrap', gap:8, alignItems:'center'}}>
        <button onClick={onBack} style={btnGhost}>← 返回</button>
        <div style={{width:1, height:24, background:'#e2e8f0'}} />
        <span style={{fontSize:12, background:'#0f172a', color:'#fff', padding:'4px 8px', borderRadius:99}}>Android 拍照+手拉</span>
        <button onClick={()=>setTool('select')} style={tool==='select'?btnActive:btn}>👆 選取/拖拉</button>
        <button onClick={()=>setTool('wall')} style={tool==='wall'?btnActive:btn}>🧱 拉牆</button>
        <label style={{...btn, display:'inline-flex', alignItems:'center', gap:6}}>📷 上傳底圖<input type="file" accept="image/*" capture="environment" onChange={handleBackgroundUpload} style={{display:'none'}} /></label>
        <label style={{...btn, display:'inline-flex', alignItems:'center', gap:6}}>🖼️ 現場照片<input type="file" accept="image/*" multiple onChange={handlePhotoAdd} style={{display:'none'}} /></label>
        <button onClick={exportPDF} style={{...btn, background:'#0ea5e9', color:'#fff', borderColor:'#0ea5e9'}}>📄 匯出PDF</button>
        <button onClick={exportJPG} style={{...btn, background:'#fff'}}>🖼️ 匯出JPG</button>
        {selectedId && <button onClick={deleteSelected} style={{...btn, background:'#fef2f2', color:'#dc2626'}}>🗑️ 刪除選取</button>}
      </div>

      {/* 第二工具列：校正與物件 */}
      <div style={{background:'#f8fafc', borderBottom:'1px solid #e2e8f0', padding:8, display:'flex', flexWrap:'wrap', gap:8, alignItems:'center'}}>
        <div style={{display:'flex', gap:6, alignItems:'center', background:'#fff', padding:'6px 8px', borderRadius:8, border:'1px solid #e2e8f0'}}>
          <span style={{fontSize:12, fontWeight:700}}>比例校正：</span>
          <span style={{fontSize:12}}>最後一段牆 =</span>
          <input value={scaleInput} onChange={e=>setScaleInput(e.target.value)} style={{width:70, padding:'4px 6px', borderRadius:6, border:'1px solid #cbd5e1'}} />
          <span style={{fontSize:12}}>cm</span>
          <button onClick={applyScale} style={{...btn, padding:'4px 8px', fontSize:12, background:'#0f172a', color:'#fff'}}>套用校正</button>
          <span style={{fontSize:11, color:'#64748b'}}>目前 1cm={pxPerCm.toFixed(2)}px</span>
        </div>
        <div style={{display:'flex', gap:6, flexWrap:'wrap'}}>
          {Object.keys(OBJECT_TEMPLATES).map(k=>(
            <button key={k} onClick={()=>addObject(k)} style={{...btn, fontSize:12, padding:'6px 8px'}}>+ {k}</button>
          ))}
        </div>
      </div>

      {tool==='wall' && (
        <div style={{background:'#fef9c3', padding:'6px 12px', fontSize:12, display:'flex', gap:8, alignItems:'center', justifyContent:'space-between'}}>
          <span>👉 在下方白色畫布點擊拉牆，點兩下完成一段。已點 {wallPoints.length} 個點</span>
          <span style={{display:'flex', gap:6}}>
            <button onClick={finishWall} style={{...btn, padding:'4px 8px', background:'#0f172a', color:'#fff'}}>完成此段牆</button>
            <button onClick={()=>setWallPoints([])} style={{...btn, padding:'4px 8px'}}>清除</button>
          </span>
        </div>
      )}

      <div style={{display:'flex', flex:1, minHeight:0, flexWrap:'wrap'}}>
        {/* 畫布區 */}
        <div style={{flex:'1 1 560px', minHeight:520, background:'#e2e8f0', padding:10, display:'flex', flexDirection:'column', gap:8}}>
          <div ref={wrapRef} style={{background:'#fff', borderRadius:12, overflow:'hidden', boxShadow:'0 4px 12px rgba(0,0,0,0.08)', position:'relative'}}>
            {/* 標題列 */}
            <div style={{padding:'8px 12px', borderBottom:'1px solid #f1f5f9', display:'flex', justifyContent:'space-between', fontSize:12, color:'#64748b'}}>
              <span>{project.name} · {project.venue} · {project.date}</span>
              <span>1格=50cm · 誤差±3-5cm 活動場佈用</span>
            </div>
            <div style={{position:'relative', width:'100%', aspectRatio:'1000/700', background:'#fff', overflow:'hidden', touchAction:'none'}} onPointerMove={onPointerMove} onPointerUp={onPointerUp}>
              {/* 背景底圖 */}
              {project.backgroundImage && <img src={project.backgroundImage} alt="bg" style={{position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'contain', opacity:0.35, pointerEvents:'none'}} />}
              {/* 網格 */}
              <svg width="100%" height="100%" viewBox="0 0 1000 700" style={{position:'absolute', inset:0}}>
                <defs>
                  <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
                    <path d="M 50 0 L 0 0 0 50" fill="none" stroke="#f1f5f9" strokeWidth="1"/>
                  </pattern>
                </defs>
                <rect width="1000" height="700" fill="url(#grid)" />
              </svg>

              <svg ref={svgRef} viewBox="0 0 1000 700" width="100%" height="100%" style={{position:'absolute', inset:0, cursor: tool==='wall'?'crosshair':'default'}} onClick={handleSvgClick as any}>
                {/* 已完成牆 */}
                {project.walls.map(w=>{
                  const d = w.points.map((p,i)=> `${i===0?'M':'L'} ${p.x} ${p.y}`).join(' ')
                  const lenCm = wallLength(w)
                  const mid = w.points[Math.floor(w.points.length/2)]
                  return (
                    <g key={w.id} onClick={e=>{e.stopPropagation(); setSelectedId(w.id)}} style={{cursor:'pointer'}}>
                      <path d={d} fill="none" stroke={selectedId===w.id?'#0ea5e9':'#0f172a'} strokeWidth={selectedId===w.id?6:4} strokeLinecap="round" strokeLinejoin="round" opacity={0.95} />
                      {mid && <g>
                        <rect x={mid.x-28} y={mid.y-16} width={56} height={16} rx={8} fill="#0f172a" />
                        <text x={mid.x} y={mid.y-5} textAnchor="middle" fontSize={10} fill="#fff">{Math.round(lenCm)}cm</text>
                      </g>}
                    </g>
                  )
                })}
                {/* 正在拉的牆 */}
                {wallPoints.length>0 && (
                  <>
                    <path d={wallPoints.map((p,i)=>`${i===0?'M':'L'} ${p.x} ${p.y}`).join(' ')} fill="none" stroke="#f59e0b" strokeWidth={3} strokeDasharray="8 6" />
                    {wallPoints.map((p,i)=><circle key={i} cx={p.x} cy={p.y} r={5} fill="#f59e0b" stroke="#fff" strokeWidth={2} />)}
                  </>
                )}

                {/* 物件 */}
                {project.objects.map(o=>{
                  const isSel = selectedId===o.id
                  const isRound = o.type==='round_table' || o.w===o.h && o.type==='chair'
                  if(o.type==='round_table'){
                    return (
                      <g key={o.id} onPointerDown={e=>onPointerDownObj(e,o.id)} transform={`rotate(${o.rotation} ${o.x+o.w/2} ${o.y+o.h/2})`} style={{cursor:'grab'}}>
                        <ellipse cx={o.x+o.w/2} cy={o.y+o.h/2} rx={o.w/2} ry={o.h/2} fill={isSel?'#e0f2fe':'#fff'} stroke={isSel?'#0ea5e9':'#334155'} strokeWidth={isSel?3:2} />
                        <text x={o.x+o.w/2} y={o.y+o.h/2} textAnchor="middle" dominantBaseline="middle" fontSize={11} fontWeight={700} fill="#0f172a">{o.label}</text>
                        {(o.type as string)==='power_socket' && <text x={o.x+o.w/2} y={o.y+o.h/2+14} textAnchor="middle" fontSize={10}>⚡</text>}
                      </g>
                    )
                  }
                  // 矩形物件
                  const fill = o.type==='power_socket' ? '#fef9c3' : o.type==='power_box' ? '#fee2e2' : o.type==='note_pin' ? '#fde68a' : isSel ? '#e0f2fe' : '#ffffff'
                  const stroke = o.type==='note_pin' ? '#f59e0b' : isSel ? '#0ea5e9' : '#334155'
                  return (
                    <g key={o.id} onPointerDown={e=>onPointerDownObj(e,o.id)} style={{cursor:'grab'}}>
                      <g transform={`rotate(${o.rotation} ${o.x+o.w/2} ${o.y+o.h/2})`}>
                        <rect x={o.x} y={o.y} width={o.w} height={o.h} rx={o.type==='chair'?6:4} fill={fill} stroke={stroke} strokeWidth={isSel?3:1.5} />
                        <text x={o.x+o.w/2} y={o.y+o.h/2} textAnchor="middle" dominantBaseline="middle" fontSize={10} fontWeight={700} fill="#0f172a">{o.label}</text>
                        {o.type==='power_socket' && <text x={o.x+o.w/2} y={o.y+4} textAnchor="middle" fontSize={9}>⚡插座</text>}
                        {o.type==='note_pin' && <text x={o.x+o.w/2} y={o.y+o.h/2} textAnchor="middle" fontSize={14}>📍</text>}
                      </g>
                      {isSel && <rect x={o.x-2} y={o.y-2} width={o.w+4} height={o.h+4} fill="none" stroke="#0ea5e9" strokeDasharray="6 4" />}
                    </g>
                  )
                })}
              </svg>
            </div>
            <div style={{padding:'6px 10px', fontSize:11, color:'#94a3b8', display:'flex', justifyContent:'space-between', background:'#f8fafc'}}>
              <span>💡 提示：先上傳現場照片作底圖 → 拉牆 → 校正比例 → 拖拉桌椅/電源</span>
              <span>物件：{project.objects.length} · 牆段：{project.walls.length}</span>
            </div>
          </div>

          {/* 備註 */}
          <div style={{background:'#fff', borderRadius:12, padding:10, display:'flex', flexDirection:'column', gap:6}}>
            <div style={{fontWeight:700, fontSize:13}}>現場備註 / 注意事項</div>
            <textarea value={memo} onChange={e=>setMemo(e.target.value)} onBlur={()=>onUpdate({memo})} placeholder="例如：梁下高度210cm、靠近廁所插座不足需延長線、逃生門不可擋、冷氣口滴水..." rows={3} style={{width:'100%', padding:8, borderRadius:8, border:'1px solid #e2e8f0', fontSize:13, resize:'vertical'}} />
            <div style={{display:'flex', gap:6, flexWrap:'wrap'}}>
              {['梁下210cm','需延長線10m','逃生通道勿擋','插座2孔','地面不平','不可釘牆'].map(t=>(
                <button key={t} onClick={()=>{ const v = memo ? memo+'、'+t : t; setMemo(v); onUpdate({memo:v}) }} style={{fontSize:11, padding:'4px 8px', borderRadius:99, border:'1px solid #e2e8f0', background:'#fff'}}>+ {t}</button>
              ))}
            </div>
          </div>
        </div>

        {/* 右側屬性 */}
        <div style={{flex:'0 0 320px', background:'#fff', borderLeft:'1px solid #e2e8f0', padding:12, display:'flex', flexDirection:'column', gap:12, maxHeight:'85vh', overflowY:'auto'}}>
          <div>
            <div style={{fontWeight:800}}>專案資訊</div>
            <input value={project.name} onChange={e=>onUpdate({name:e.target.value})} style={inp} placeholder="專案名稱" />
            <input value={project.venue} onChange={e=>onUpdate({venue:e.target.value})} style={{...inp, marginTop:6}} placeholder="場地/地址" />
            <div style={{display:'flex', gap:6, marginTop:6}}>
              <input type="date" value={project.date} onChange={e=>onUpdate({date:e.target.value})} style={{...inp, flex:1}} />
              <input value={project.client} onChange={e=>onUpdate({client:e.target.value})} style={{...inp, flex:1}} placeholder="客戶" />
            </div>
          </div>

          <div>
            <div style={{fontWeight:700, fontSize:13, marginBottom:6}}>選取物件屬性</div>
            {!selectedId ? <div style={{fontSize:12, color:'#94a3b8', background:'#f8fafc', padding:10, borderRadius:8}}>點選牆壁或桌椅可編輯。拖拉可移動位置。</div> : (()=> {
              const obj = project.objects.find(o=>o.id===selectedId)
              if(obj){
                return (
                  <div style={{background:'#f8fafc', padding:10, borderRadius:8, display:'flex', flexDirection:'column', gap:6}}>
                    <div style={{fontWeight:700, fontSize:13}}>{obj.label} · {Math.round(obj.w/pxPerCm)} x {Math.round(obj.h/pxPerCm)} cm</div>
                    <input value={obj.label} onChange={e=> updateObject(obj.id, {label:e.target.value})} style={inp} placeholder="標籤" />
                    <textarea value={obj.note||''} onChange={e=> updateObject(obj.id, {note:e.target.value})} placeholder="注意事項（例如：此處需電源/勿擋走道）" rows={2} style={{...inp, resize:'vertical'}} />
                    <div style={{display:'flex', gap:6}}>
                      <label style={{...btn, flex:1, textAlign:'center'}}>📷 附照片<input type="file" accept="image/*" capture="environment" style={{display:'none'}} onChange={e=>{
                        const f=e.target.files?.[0]; if(!f) return; const r=new FileReader(); r.onload=()=>updateObject(obj.id, {photo: r.result as string}); r.readAsDataURL(f)
                      }} /></label>
                      <button onClick={()=>updateObject(obj.id,{rotation:(obj.rotation+90)%360})} style={{...btn, flex:1}}>↻ 旋轉90°</button>
                    </div>
                    {obj.photo && <img src={obj.photo} style={{width:'100%', borderRadius:8, border:'1px solid #e2e8f0'}} />}
                    <button onClick={()=>setShowNoteFor(obj)} style={{...btn, background:'#0f172a', color:'#fff'}}>儲存備註</button>
                  </div>
                )
              }
              const w = project.walls.find(w=>w.id===selectedId)
              if(w){
                return (
                  <div style={{background:'#f8fafc', padding:10, borderRadius:8}}>
                    <div style={{fontWeight:700}}>牆段 · {Math.round(wallLength(w))}cm</div>
                    <div style={{fontSize:12, color:'#64748b', marginTop:4}}>由 {w.points.length} 個點組成</div>
                    <button onClick={deleteSelected} style={{...btn, marginTop:8, background:'#fef2f2', color:'#dc2626', width:'100%'}}>刪除此段牆</button>
                  </div>
                )
              }
              return null
            })()}
          </div>

          <div>
            <div style={{fontWeight:700, fontSize:13, marginBottom:6}}>現場照片（{project.photos.length}）</div>
            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:6}}>
              {project.photos.map((p,i)=>(
                <div key={i} style={{position:'relative'}}>
                  <img src={p} style={{width:'100%', height:90, objectFit:'cover', borderRadius:8, border:'1px solid #e2e8f0'}} />
                  <button onClick={()=> onUpdate({photos: project.photos.filter((_,idx)=>idx!==i)})} style={{position:'absolute', top:4, right:4, background:'rgba(0,0,0,0.6)', color:'#fff', border:'none', borderRadius:99, width:22, height:22, fontSize:12}}>×</button>
                </div>
              ))}
            </div>
            {project.photos.length===0 && <div style={{fontSize:12, color:'#94a3b8'}}>尚未加入現場照片，建議每個電源/死角都拍一張。</div>}
          </div>

          <div style={{background:'#eff6ff', border:'1px solid #bfdbfe', borderRadius:10, padding:10, fontSize:12, lineHeight:1.6}}>
            <b>排桌椅檢核：</b><br/>
            • 走道至少 120cm（本圖 1格=50cm，2格半為走道）<br/>
            • 圓桌間距 150cm 以上才好走動<br/>
            • 電源圖示請對應現場照片編號
          </div>
        </div>
      </div>

      {showNoteFor && (
        <div style={{position:'fixed', inset:0, background:'rgba(15,23,42,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:50, padding:16}} onClick={()=>setShowNoteFor(null)}>
          <div onClick={e=>e.stopPropagation()} style={{background:'#fff', borderRadius:16, padding:16, maxWidth:420, width:'100%'}}>
            <h3>已更新備註</h3>
            <p style={{fontSize:13, color:'#64748b', marginTop:6}}>備註已儲存至平面圖物件上，匯出PDF時會一併呈現。</p>
            <button onClick={()=>setShowNoteFor(null)} style={{marginTop:12, width:'100%', padding:10, borderRadius:10, border:'none', background:'#0f172a', color:'#fff', fontWeight:700}}>確定</button>
          </div>
        </div>
      )}
    </div>
  )
}
const btn: React.CSSProperties = { padding:'7px 10px', borderRadius:8, border:'1px solid #e2e8f0', background:'#fff', fontSize:13, fontWeight:600 }
const btnActive: React.CSSProperties = { ...btn, background:'#0f172a', color:'#fff', borderColor:'#0f172a' }
const btnGhost: React.CSSProperties = { ...btn, background:'#f1f5f9' }
const inp: React.CSSProperties = { width:'100%', padding:'8px 10px', borderRadius:8, border:'1px solid #e2e8f0', background:'#fff', fontSize:13 }
