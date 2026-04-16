import { useState, useEffect, useRef, useCallback } from "react";
import * as THREE from 'three';

const COL = { W:0x5B8FD8, D:0x7E68CC, LID:0xC8943A, DUST:0xAA4444, BOT:0xA08830 };
const PSVG = {
  W:    {fill:"rgba(59,130,246,0.16)", stroke:"#60A5FA"},
  D:    {fill:"rgba(139,92,246,0.16)", stroke:"#A78BFA"},
  TUCK: {fill:"rgba(234,179,8,0.18)",  stroke:"#FBBF24"},
  DUST: {fill:"rgba(239,68,68,0.12)",  stroke:"#F87171"},
  GLUE: {fill:"rgba(34,197,94,0.20)",  stroke:"#4ADE80"},
  CROSS:{fill:"rgba(249,115,22,0.16)", stroke:"#FB923C"},
};

function calcDims(W,D){ return { tf:D<=15?D/2+50:D/2+20, bf:D<=15?D/2+55:D/2+15, df:Math.max(4,Math.min(D*0.28,15)) }; }
function disposeGroup(g){ g.traverse(o=>{ o.geometry?.dispose(); if(o.material)(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>m.dispose()); }); }

const INIT_ROT = { x:0.38, y:0.60 };

// ── 단일 3D 박스 (타입 무관, 민무늬) ───────────────────────────
function buildBox3D(W, D, H) {
  const grp = new THREE.Group();
  const {tf, df} = calcDims(W,D);
  const hw=W/2, hd=D/2, hh=H/2;
  const EMAT = new THREE.LineBasicMaterial({color:0x040404, transparent:true, opacity:0.60});

  function mat(color, op=1.0){
    return new THREE.MeshPhongMaterial({color, side:THREE.DoubleSide, transparent:op<1, opacity:op, shininess:28});
  }
  function face(pts, color, op=1.0){
    const [a,b,c,d]=pts;
    const pos=new Float32Array([...a,...b,...c,...a,...c,...d]);
    const geo=new THREE.BufferGeometry(); geo.setAttribute('position',new THREE.BufferAttribute(pos,3)); geo.computeVertexNormals();
    const mesh=new THREE.Mesh(geo,mat(color,op));
    const ev=new Float32Array([...a,...b,...b,...c,...c,...d,...d,...a]);
    const eg=new THREE.BufferGeometry(); eg.setAttribute('position',new THREE.BufferAttribute(ev,3));
    mesh.add(new THREE.LineSegments(eg,EMAT)); grp.add(mesh);
  }

  // ── 4면 측벽 ─────────────────────────────────────────────
  face([[-hw,-hh,hd],[hw,-hh,hd],[hw,hh,hd],[-hw,hh,hd]], COL.W);           // 전면 W
  face([[hw,-hh,-hd],[-hw,-hh,-hd],[-hw,hh,-hd],[hw,hh,-hd]], COL.W);       // 후면 W
  face([[-hw,-hh,-hd],[-hw,-hh,hd],[-hw,hh,hd],[-hw,hh,-hd]], COL.D);       // 좌측 D
  face([[hw,-hh,hd],[hw,-hh,-hd],[hw,hh,-hd],[hw,hh,hd]], COL.D);            // 우측 D

  // ── 바닥: 민무늬 평면 ─────────────────────────────────────
  face([[-hw,-hh,-hd],[hw,-hh,-hd],[hw,-hh,hd],[-hw,-hh,hd]], COL.BOT);

  // ── 상단 먼지 플랩: 좌우 D면에서 안쪽으로 ────────────────
  face([[-hw,hh,-hd],[-hw+df,hh,-hd],[-hw+df,hh,hd],[-hw,hh,hd]], COL.DUST, 0.88);
  face([[hw-df,hh,-hd],[hw,hh,-hd],[hw,hh,hd],[hw-df,hh,hd]], COL.DUST, 0.88);

  // ── 마개: 전면(z=+hd)에서만 열림 (~62°) ──────────────────
  const θ = 1.08;
  face([
    [-hw, hh, hd],
    [ hw, hh, hd],
    [ hw, hh + tf*Math.sin(θ), hd - tf*Math.cos(θ)],
    [-hw, hh + tf*Math.sin(θ), hd - tf*Math.cos(θ)],
  ], COL.LID, 0.95);
  // 후면(z=-hd)에는 마개 없음 — 벽만 존재

  return grp;
}

// ── SVG 헬퍼 ───────────────────────────────────────────────────
function Panel({x,y,w,h,type,label,fs=11,dashed}){
  const st=PSVG[type]||PSVG.W, sw=Math.max(w,0), sh=Math.max(h,0);
  return(<g>
    <rect x={x} y={y} width={sw} height={sh} fill={st.fill} stroke={st.stroke} strokeWidth={1.8} strokeDasharray={dashed?"5,3":undefined} rx={2}/>
    {label&&sw>22&&sh>12&&<text x={x+sw/2} y={y+sh/2} textAnchor="middle" dominantBaseline="central" fontSize={fs} fill="#F1F5F9" fontFamily="monospace" fontWeight="700">{label}</text>}
  </g>);
}
function Fold({x1,y1,x2,y2}){ return <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#334155" strokeWidth={1.4} strokeDasharray="7,4"/>; }
const VW=780, VH=468, PAD=52;
function layout(nW,nH){ const sc=Math.min((VW-PAD*2)/nW,(VH-PAD*2)/nH); return {sc,ox:PAD+((VW-PAD*2)-nW*sc)/2,oy:PAD+((VH-PAD*2)-nH*sc)/2}; }

// ── 맞뚜껑 전개도 ─────────────────────────────────────────────
// 마개: 전면 W(X[2]-X[3]) 위에만 / 후면 W(X[0]-X[1])는 마개 없음
function TuckNet({W,D,H}){
  const {tf,bf,df}=calcDims(W,D);
  const {sc,ox,oy}=layout(W+D+W+D+10, tf+H+bf);
  const X=[0,W,W+D,W+D+W,W+D+W+D,W+D+W+D+10].map(v=>ox+v*sc);
  const Y=[0,tf,tf+H,tf+H+bf].map(v=>oy+v*sc);
  const dp=df*sc, fs=Math.max(9,Math.min(13,sc*Math.min(W,D,28)/2.8));
  return(<g>
    {/* 본체 4면 + 날개 */}
    <Panel x={X[0]} y={Y[1]} w={X[1]-X[0]} h={Y[2]-Y[1]} type="W" label={`후면 W=${W}`} fs={fs}/>
    <Panel x={X[1]} y={Y[1]} w={X[2]-X[1]} h={Y[2]-Y[1]} type="D" label={`D=${D}`} fs={fs}/>
    <Panel x={X[2]} y={Y[1]} w={X[3]-X[2]} h={Y[2]-Y[1]} type="W" label={`전면 W=${W}`} fs={fs}/>
    <Panel x={X[3]} y={Y[1]} w={X[4]-X[3]} h={Y[2]-Y[1]} type="D" label={`D=${D}`} fs={fs}/>
    <Panel x={X[4]} y={Y[1]} w={X[5]-X[4]} h={Y[2]-Y[1]} type="GLUE" label="날개" fs={9} dashed/>
    {/* 상단: 전면 W에만 마개 / 후면 W는 없음 */}
    <Panel x={X[2]} y={Y[0]} w={X[3]-X[2]} h={Y[1]-Y[0]} type="TUCK" label={`마개 ${Math.round(tf)}`} fs={fs-1}/>
    <Panel x={X[1]} y={Y[1]-dp} w={X[2]-X[1]} h={dp} type="DUST"/>
    <Panel x={X[3]} y={Y[1]-dp} w={X[4]-X[3]} h={dp} type="DUST"/>
    {/* 하단 */}
    <Panel x={X[0]} y={Y[2]} w={X[1]-X[0]} h={Y[3]-Y[2]} type="TUCK" label={`${Math.round(bf)}`} fs={fs-1}/>
    <Panel x={X[2]} y={Y[2]} w={X[3]-X[2]} h={Y[3]-Y[2]} type="TUCK" label={`${Math.round(bf)}`} fs={fs-1}/>
    <Panel x={X[1]} y={Y[2]} w={X[2]-X[1]} h={dp} type="DUST"/>
    <Panel x={X[3]} y={Y[2]} w={X[4]-X[3]} h={dp} type="DUST"/>
    {/* 접힘선 */}
    <Fold x1={X[1]} y1={Y[1]-dp} x2={X[1]} y2={Y[2]+dp}/>
    <Fold x1={X[2]} y1={Y[0]}    x2={X[2]} y2={Y[3]}/>
    <Fold x1={X[3]} y1={Y[1]-dp} x2={X[3]} y2={Y[2]+dp}/>
    <Fold x1={X[4]} y1={Y[1]}    x2={X[4]} y2={Y[2]}/>
    <Fold x1={X[0]} y1={Y[1]}    x2={X[5]} y2={Y[1]}/>
    <Fold x1={X[0]} y1={Y[2]}    x2={X[5]} y2={Y[2]}/>
    <text x={X[0]-13} y={(Y[1]+Y[2])/2} textAnchor="middle" dominantBaseline="central"
      fontSize={10} fill="#60A5FA" fontFamily="monospace"
      transform={`rotate(-90,${X[0]-13},${(Y[1]+Y[2])/2})`}>H={H}</text>
    <text x={(X[0]+X[5])/2} y={Y[3]+18} textAnchor="middle" fontSize={9} fill="#475569" fontFamily="monospace">
      {W+D+W+D} × {Math.round(tf+H+bf)} mm
    </text>
  </g>);
}

// ── 십자조립 전개도 ───────────────────────────────────────────
function CrossNet({W,D,H}){
  const {tf,bf,df}=calcDims(W,D);
  const {sc,ox,oy}=layout(W+D+W+D+10, tf+H+bf);
  const X=[0,W,W+D,W+D+W,W+D+W+D,W+D+W+D+10].map(v=>ox+v*sc);
  const Y=[0,tf,tf+H,tf+H+bf].map(v=>oy+v*sc);
  const dp=df*sc, bH=Y[3]-Y[2], dW=X[2]-X[1];
  const ins=Math.min(dW*0.2,bH*0.32,18);
  const fs=Math.max(9,Math.min(13,sc*Math.min(W,D,28)/2.8));
  return(<g>
    <Panel x={X[0]} y={Y[1]} w={X[1]-X[0]} h={Y[2]-Y[1]} type="W" label={`후면 W=${W}`} fs={fs}/>
    <Panel x={X[1]} y={Y[1]} w={X[2]-X[1]} h={Y[2]-Y[1]} type="D" label={`D=${D}`} fs={fs}/>
    <Panel x={X[2]} y={Y[1]} w={X[3]-X[2]} h={Y[2]-Y[1]} type="W" label={`전면 W=${W}`} fs={fs}/>
    <Panel x={X[3]} y={Y[1]} w={X[4]-X[3]} h={Y[2]-Y[1]} type="D" label={`D=${D}`} fs={fs}/>
    <Panel x={X[4]} y={Y[1]} w={X[5]-X[4]} h={Y[2]-Y[1]} type="GLUE" label="날개" fs={9} dashed/>
    {/* 상단: 전면 W에만 마개 */}
    <Panel x={X[2]} y={Y[0]} w={X[3]-X[2]} h={Y[1]-Y[0]} type="TUCK" label={`마개 ${Math.round(tf)}`} fs={fs-1}/>
    <Panel x={X[1]} y={Y[1]-dp} w={X[2]-X[1]} h={dp} type="DUST"/>
    <Panel x={X[3]} y={Y[1]-dp} w={X[4]-X[3]} h={dp} type="DUST"/>
    {/* 하단 W 플랩 (십자 대각선 표시) */}
    {[0,2].map(i=>{
      const fx=X[i],fw=X[i+1]-X[i],fy=Y[2],fh=bH,cx=fx+fw/2,cy=fy+fh/2;
      return(<g key={i}>
        <Panel x={fx} y={fy} w={fw} h={fh} type="CROSS" fs={fs-1}/>
        {fh>8&&<>
          <line x1={fx}    y1={fy}    x2={cx} y2={cy} stroke="#c45e10" strokeWidth={1.0} opacity={0.7}/>
          <line x1={fx+fw} y1={fy}    x2={cx} y2={cy} stroke="#c45e10" strokeWidth={1.0} opacity={0.7}/>
          <line x1={fx}    y1={fy+fh} x2={cx} y2={cy} stroke="#c45e10" strokeWidth={1.0} opacity={0.7}/>
          <line x1={fx+fw} y1={fy+fh} x2={cx} y2={cy} stroke="#c45e10" strokeWidth={1.0} opacity={0.7}/>
        </>}
      </g>);
    })}
    <polygon points={`${X[1]},${Y[2]} ${X[2]},${Y[2]} ${X[2]-ins},${Y[3]} ${X[1]+ins},${Y[3]}`}
      fill={PSVG.CROSS.fill} stroke={PSVG.CROSS.stroke} strokeWidth={1.8}/>
    <polygon points={`${X[3]},${Y[2]} ${X[4]},${Y[2]} ${X[4]-ins},${Y[3]} ${X[3]+ins},${Y[3]}`}
      fill={PSVG.CROSS.fill} stroke={PSVG.CROSS.stroke} strokeWidth={1.8}/>
    <Fold x1={X[1]} y1={Y[1]-dp} x2={X[1]} y2={Y[3]}/>
    <Fold x1={X[2]} y1={Y[0]}    x2={X[2]} y2={Y[3]}/>
    <Fold x1={X[3]} y1={Y[1]-dp} x2={X[3]} y2={Y[3]}/>
    <Fold x1={X[4]} y1={Y[1]}    x2={X[4]} y2={Y[2]}/>
    <Fold x1={X[0]} y1={Y[1]}    x2={X[5]} y2={Y[1]}/>
    <Fold x1={X[0]} y1={Y[2]}    x2={X[5]} y2={Y[2]}/>
    <text x={X[0]-13} y={(Y[1]+Y[2])/2} textAnchor="middle" dominantBaseline="central"
      fontSize={10} fill="#60A5FA" fontFamily="monospace"
      transform={`rotate(-90,${X[0]-13},${(Y[1]+Y[2])/2})`}>H={H}</text>
    <text x={(X[0]+X[5])/2} y={Y[3]+18} textAnchor="middle" fontSize={9} fill="#475569" fontFamily="monospace">
      {W+D+W+D} × {Math.round(tf+H+bf)} mm
    </text>
  </g>);
}

// ── 삼면접착 전개도 ───────────────────────────────────────────
function GlueNet({W,D,H}){
  const {tf,bf,df}=calcDims(W,D);
  const {sc,ox,oy}=layout(W+D+W+D+10, tf+H+bf);
  const X=[0,W,W+D,W+D+W,W+D+W+D,W+D+W+D+10].map(v=>ox+v*sc);
  const Y=[0,tf,tf+H,tf+H+bf].map(v=>oy+v*sc);
  const dp=df*sc, bH=Y[3]-Y[2];
  const fs=Math.max(9,Math.min(13,sc*Math.min(W,D,28)/2.8));
  return(<g>
    <Panel x={X[0]} y={Y[1]} w={X[1]-X[0]} h={Y[2]-Y[1]} type="W" label={`후면 W=${W}`} fs={fs}/>
    <Panel x={X[1]} y={Y[1]} w={X[2]-X[1]} h={Y[2]-Y[1]} type="D" label={`D=${D}`} fs={fs}/>
    <Panel x={X[2]} y={Y[1]} w={X[3]-X[2]} h={Y[2]-Y[1]} type="W" label={`전면 W=${W}`} fs={fs}/>
    <Panel x={X[3]} y={Y[1]} w={X[4]-X[3]} h={Y[2]-Y[1]} type="D" label={`D=${D}`} fs={fs}/>
    <Panel x={X[4]} y={Y[1]} w={X[5]-X[4]} h={Y[2]-Y[1]} type="GLUE" label="날개" fs={9} dashed/>
    {/* 상단: 전면 W에만 마개 */}
    <Panel x={X[2]} y={Y[0]} w={X[3]-X[2]} h={Y[1]-Y[0]} type="TUCK" label={`마개 ${Math.round(tf)}`} fs={fs-1}/>
    <Panel x={X[1]} y={Y[1]-dp} w={X[2]-X[1]} h={dp} type="DUST"/>
    <Panel x={X[3]} y={Y[1]-dp} w={X[4]-X[3]} h={dp} type="DUST"/>
    {/* 하단: 받침 1 + 접착 3 */}
    <Panel x={X[0]} y={Y[2]} w={X[1]-X[0]} h={bH} type="TUCK" label="받침" fs={fs-1}/>
    <Panel x={X[1]} y={Y[2]} w={X[2]-X[1]} h={bH} type="GLUE" label="접착①" fs={fs-1}/>
    <Panel x={X[2]} y={Y[2]} w={X[3]-X[2]} h={bH} type="GLUE" label="접착②" fs={fs-1}/>
    <Panel x={X[3]} y={Y[2]} w={X[4]-X[3]} h={bH} type="GLUE" label="접착③" fs={fs-1}/>
    {[1,2,3].map(i=><rect key={i} x={X[i]} y={Y[2]} width={Math.max(0,X[i+1]-X[i])} height={Math.max(0,bH)}
      fill="url(#gluehatch)" opacity={0.45}/>)}
    <Fold x1={X[1]} y1={Y[1]-dp} x2={X[1]} y2={Y[3]}/>
    <Fold x1={X[2]} y1={Y[0]}    x2={X[2]} y2={Y[3]}/>
    <Fold x1={X[3]} y1={Y[1]-dp} x2={X[3]} y2={Y[3]}/>
    <Fold x1={X[4]} y1={Y[1]}    x2={X[4]} y2={Y[2]}/>
    <Fold x1={X[0]} y1={Y[1]}    x2={X[5]} y2={Y[1]}/>
    <Fold x1={X[0]} y1={Y[2]}    x2={X[5]} y2={Y[2]}/>
    <text x={X[0]-13} y={(Y[1]+Y[2])/2} textAnchor="middle" dominantBaseline="central"
      fontSize={10} fill="#60A5FA" fontFamily="monospace"
      transform={`rotate(-90,${X[0]-13},${(Y[1]+Y[2])/2})`}>H={H}</text>
    <text x={(X[0]+X[5])/2} y={Y[3]+18} textAnchor="middle" fontSize={9} fill="#475569" fontFamily="monospace">
      {W+D+W+D} × {Math.round(tf+H+bf)} mm
    </text>
  </g>);
}

// ── Main ──────────────────────────────────────────────────────
const TABS=["맞뚜껑","십자조립","삼면접착"];
const NETS=[TuckNet,CrossNet,GlueNet];

export default function BoxViewer(){
  const [W,setW]=useState(100);
  const [D,setD]=useState(50);
  const [H,setH]=useState(150);
  const [tab,setTab]=useState(0);
  const [view,setView]=useState('net');
  const canvasRef=useRef(null);
  const three=useRef({renderer:null,scene:null,camera:null,group:null,grid:null});
  const drag=useRef({active:false,px:0,py:0,rotX:INIT_ROT.x,rotY:INIT_ROT.y});

  useEffect(()=>{
    const canvas=canvasRef.current; if(!canvas)return;
    const renderer=new THREE.WebGLRenderer({canvas,antialias:true});
    renderer.setSize(780,520,false);
    renderer.setPixelRatio(Math.min(devicePixelRatio,2));
    renderer.setClearColor(0x07101e);
    const scene=new THREE.Scene();
    scene.fog=new THREE.Fog(0x07101e,900,2600);
    const camera=new THREE.PerspectiveCamera(38,780/520,1,5000);
    scene.add(new THREE.AmbientLight(0xffffff,0.44));
    const dl1=new THREE.DirectionalLight(0xffffff,1.05); dl1.position.set(1.5,3,2); scene.add(dl1);
    const dl2=new THREE.DirectionalLight(0x99aaff,0.28); dl2.position.set(-2,-1,-1.5); scene.add(dl2);
    const dl3=new THREE.DirectionalLight(0xffffff,0.18); dl3.position.set(0,-3,0); scene.add(dl3);
    const grid=new THREE.GridHelper(1600,36,0x0c1e38,0x0c1e38); scene.add(grid);
    three.current={renderer,scene,camera,group:null,grid};
    let raf;
    const animate=()=>{
      raf=requestAnimationFrame(animate);
      if(!drag.current.active&&three.current.group){ three.current.group.rotation.y+=0.003; drag.current.rotY+=0.003; }
      renderer.render(scene,camera);
    };
    animate();
    return()=>{cancelAnimationFrame(raf);renderer.dispose();};
  },[]);

  // 3D는 W,D,H 변경 시만 재생성 (탭 무관)
  useEffect(()=>{
    const {scene,camera,grid}=three.current; if(!scene)return;
    if(three.current.group){disposeGroup(three.current.group);scene.remove(three.current.group);}
    const grp=buildBox3D(W,D,H);
    grp.rotation.x=drag.current.rotX; grp.rotation.y=drag.current.rotY;
    scene.add(grp); three.current.group=grp;
    const md=Math.max(W,D,H);
    if(camera){camera.position.set(0,md*0.32,md*2.55);camera.lookAt(0,0,0);}
    if(grid) grid.position.y=-H/2-5;
  },[W,D,H]);

  // 탭 전환 시 회전 초기화
  const handleTab=useCallback((i)=>{
    drag.current.rotX=INIT_ROT.x; drag.current.rotY=INIT_ROT.y;
    if(three.current.group){ three.current.group.rotation.x=INIT_ROT.x; three.current.group.rotation.y=INIT_ROT.y; }
    setTab(i);
  },[]);

  const onDown=useCallback((cx,cy)=>{drag.current={...drag.current,active:true,px:cx,py:cy}},[]);
  const onMove=useCallback((cx,cy)=>{
    if(!drag.current.active)return;
    drag.current.rotX+=(cy-drag.current.py)*0.011; drag.current.rotY+=(cx-drag.current.px)*0.011;
    drag.current.px=cx; drag.current.py=cy;
    const g=three.current.group;
    if(g){g.rotation.x=drag.current.rotX;g.rotation.y=drag.current.rotY;}
  },[]);
  const onUp=useCallback(()=>{drag.current.active=false;},[]);
  const mh={
    onMouseDown:e=>onDown(e.clientX,e.clientY), onMouseMove:e=>onMove(e.clientX,e.clientY),
    onMouseUp:onUp, onMouseLeave:onUp,
    onTouchStart:e=>{e.preventDefault();onDown(e.touches[0].clientX,e.touches[0].clientY);},
    onTouchMove:e=>{e.preventDefault();onMove(e.touches[0].clientX,e.touches[0].clientY);},
    onTouchEnd:onUp,
  };

  const Net=NETS[tab];
  const {tf,bf}=calcDims(W,D);

  const inp=(lbl,val,set)=>(
    <label key={lbl} style={{display:'flex',flexDirection:'column',gap:4}}>
      <span style={{fontSize:10.5,color:'#475569',fontWeight:700,letterSpacing:.5}}>{lbl} (mm)</span>
      <input type="number" value={val} min={10} onChange={e=>set(Math.max(10,Number(e.target.value)||10))}
        style={{width:76,padding:'7px 0',borderRadius:8,border:'1px solid #1e3050',background:'#0c1a2e',
          color:'#f1f5f9',fontSize:19,textAlign:'center',fontFamily:'monospace',outline:'none'}}
        onFocus={e=>e.target.style.borderColor='#3B82F6'}
        onBlur={e=>e.target.style.borderColor='#1e3050'}/>
    </label>
  );

  return(
    <div style={{minHeight:'100vh',background:'#07101e',color:'#cbd5e1',padding:'18px 20px',fontFamily:'system-ui,sans-serif'}}>
      <div style={{maxWidth:860,margin:'0 auto'}}>
        <h1 style={{margin:'0 0 3px',fontSize:17,fontWeight:700,color:'#f1f5f9',letterSpacing:-.5}}>박스 전개도 &amp; 3D 뷰어</h1>
        <p style={{margin:'0 0 15px',fontSize:11,color:'#334155'}}>장(가로) · 폭(세로) · 고(높이) 입력 → 맞뚜껑 / 십자조립 / 삼면접착 전개도 | 3D는 단일 박스</p>

        {/* 치수 입력 */}
        <div style={{display:'flex',flexWrap:'wrap',gap:14,alignItems:'flex-end',marginBottom:13}}>
          {inp('장(가로) W',W,setW)}{inp('폭(세로) D',D,setD)}{inp('고(높이) H',H,setH)}
          <div style={{display:'flex',gap:6,flexWrap:'wrap',paddingBottom:2}}>
            {[[`마개 ${Math.round(tf)}mm`,'#FBBF24'],[`바닥 ${Math.round(bf)}mm`,'#FBBF24'],
              [`전개폭 ${W+D+W+D}mm`,'#60A5FA'],[`전개고 ${Math.round(tf+H+bf)}mm`,'#60A5FA']
            ].map(([t,c])=>(
              <span key={t} style={{fontSize:11,padding:'3px 9px',borderRadius:20,fontFamily:'monospace',
                color:c,background:c+'18',border:`1px solid ${c}30`,whiteSpace:'nowrap'}}>{t}</span>
            ))}
          </div>
        </div>

        {/* 탭 + 뷰 토글 */}
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:9,flexWrap:'wrap',gap:7}}>
          <div style={{display:'flex',gap:5}}>
            {TABS.map((n,i)=>(
              <button key={i} onClick={()=>handleTab(i)} style={{padding:'6px 13px',borderRadius:8,border:'none',cursor:'pointer',
                fontSize:12,fontWeight:tab===i?700:400,background:tab===i?'#1d4ed8':'#0c1a2e',
                color:tab===i?'#fff':'#4a6080',transition:'background .12s'}}>{n}단상자</button>
            ))}
          </div>
          <div style={{display:'flex',background:'#0c1a2e',borderRadius:10,padding:3,border:'1px solid #1a2e4a'}}>
            {[['📐 전개도','net'],['🧊 3D 보기','3d']].map(([lbl,v])=>(
              <button key={v} onClick={()=>setView(v)} style={{padding:'5px 16px',borderRadius:8,border:'none',cursor:'pointer',
                fontSize:12,fontWeight:view===v?700:400,background:view===v?'#1d4ed8':'transparent',
                color:view===v?'#fff':'#4a6080',transition:'background .15s'}}>{lbl}</button>
            ))}
          </div>
        </div>

        {/* 전개도 SVG */}
        <div style={{display:view==='net'?'block':'none',background:'#08131f',borderRadius:12,border:'1px solid #1a2e4a',overflow:'hidden'}}>
          <svg viewBox={`0 0 ${VW} ${VH}`} style={{display:'block',width:'100%'}}>
            <defs>
              <pattern id="gluehatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <line x1="0" y1="0" x2="0" y2="8" stroke="rgba(74,222,128,0.55)" strokeWidth="1.5"/>
              </pattern>
            </defs>
            <Net W={W} D={D} H={H}/>
          </svg>
        </div>

        {/* 3D canvas */}
        <div style={{display:view==='3d'?'block':'none',background:'#07101e',borderRadius:12,
          border:'1px solid #1a2e4a',overflow:'hidden',cursor:'grab',position:'relative'}} {...mh}>
          <canvas ref={canvasRef} style={{display:'block',width:'100%',height:'auto',userSelect:'none'}}/>
          <div style={{position:'absolute',top:12,left:14,display:'flex',gap:7,alignItems:'center'}}>
            <div style={{fontSize:12,fontWeight:700,color:'#f1f5f9',background:'rgba(0,0,0,0.52)',
              padding:'4px 12px',borderRadius:20,border:'1px solid rgba(255,255,255,0.10)'}}>
              단상자 3D
            </div>
            <div style={{fontSize:11,color:'rgba(255,255,255,0.4)',background:'rgba(0,0,0,0.38)',
              padding:'3px 9px',borderRadius:20}}>
              {W} × {D} × {H} mm
            </div>
          </div>
          <div style={{position:'absolute',bottom:12,right:14,fontSize:10.5,color:'#1a3050',pointerEvents:'none'}}>
            드래그 회전 · 자동 회전
          </div>
        </div>

        {/* 범례 */}
        <div style={{display:'flex',flexWrap:'wrap',gap:10,marginTop:10}}>
          {view==='net'?(
            <>{[['W','전면/후면 (W)'],['D','측면 (D)'],['TUCK','마개/바닥 플랩'],
               ['DUST','먼지 플랩'],['GLUE','접착·날개'],['CROSS','십자 바닥']].map(([k,lbl])=>(
              <div key={k} style={{display:'flex',alignItems:'center',gap:5,fontSize:11,color:'#475569'}}>
                <div style={{width:12,height:12,borderRadius:3,background:PSVG[k].fill,border:`2px solid ${PSVG[k].stroke}`}}/>{lbl}
              </div>
            ))}
            <div style={{display:'flex',alignItems:'center',gap:5,fontSize:11,color:'#475569'}}>
              <svg width="22" height="10"><line x1="0" y1="5" x2="22" y2="5" stroke="#334155" strokeWidth="1.5" strokeDasharray="6,3.5"/></svg>접힘선
            </div></>
          ):(
            <>{[['#5B8FD8','전면/후면 (W)'],['#7E68CC','측면 (D)'],['#C8943A','마개 (전면만)'],
               ['#AA4444','먼지 플랩'],['#A08830','바닥 (민무늬)']].map(([c,lbl])=>(
              <div key={lbl} style={{display:'flex',alignItems:'center',gap:5,fontSize:11,color:'#475569'}}>
                <div style={{width:12,height:12,borderRadius:3,background:c}}/>{lbl}
              </div>
            ))}</>
          )}
        </div>
        <p style={{fontSize:11,color:'#1a2e4a',marginTop:12,fontFamily:'monospace'}}>
          * 마개: 전면 W 한쪽만 | 먼지플랩 ≈ D×0.28 | 날개 10mm | D≤15 → 마개 D/2+50, 바닥 D/2+55
        </p>
      </div>
    </div>
  );
}