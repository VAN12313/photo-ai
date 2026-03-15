/* ============================================================
   AI Photo Studio - app.js (완전 재작성)
   ============================================================ */

/* ── API 설정 (Netlify 환경변수로 관리) ── */
const PROXY = '/.netlify/functions/replicate';

/* ── State ── */
const S = {
  original: null,       // 원본 Image 객체
  aiResult: null,       // AI 처리 결과 Image 객체
  compPos: 0.5,
  rendering: false,
  settings: {
    yaw: 0, pitch: 0, roll: 0,
    cameraAngle: 'eye-level',
    angleStrength: 2,
    brightness: 0, contrast: 0, saturation: 0, sharpness: 0,
    highlights: 0, shadows: 0, temperature: 0, tint: 0,
    vignette: 0, grain: 0,
    filter: 'none', filterIntensity: 80,
    gfpgan: 80,
  }
};

/* ── Offscreen Canvases ── */
const origCanvas = document.createElement('canvas');
const editCanvas = document.createElement('canvas');

/* ── DOM ── */
const $upload   = document.getElementById('uploadScreen');
const $editor   = document.getElementById('editorScreen');
const $zone     = document.getElementById('uploadZone');
const $file     = document.getElementById('fileInput');
const $comp     = document.getElementById('compCanvas');
const $preview  = document.getElementById('previewPanel');
const $download = document.getElementById('btnDownload');
const $reset    = document.getElementById('btnReset');
const $aiOver   = document.getElementById('aiOverlay');
const $aiText   = document.getElementById('aiStatusText');
const $meta     = document.getElementById('imgMeta');
const $toast    = document.getElementById('toast');
let toastTimer;

/* ── Boot ── */
document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  initUpload();
  initSliders();
  initCameraAngles();
  initFilters();
  initCompSlider();
  initButtons();
});

/* ═══════════════════════════════════════════
   TABS
═══════════════════════════════════════════ */
function initTabs() {
  document.querySelectorAll('.tab').forEach(t => {
    t.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
      document.querySelectorAll('.pane').forEach(x => x.classList.remove('active'));
      t.classList.add('active');
      const pane = document.getElementById('pane-' + t.dataset.tab);
      if (pane) pane.classList.add('active');
    });
  });
}

/* ═══════════════════════════════════════════
   UPLOAD
═══════════════════════════════════════════ */
function initUpload() {
  $zone.addEventListener('click', e => { if (e.target !== $file) $file.click(); });
  $file.addEventListener('change', () => { if ($file.files[0]) loadFile($file.files[0]); });
  $zone.addEventListener('dragover', e => { e.preventDefault(); $zone.classList.add('over'); });
  $zone.addEventListener('dragleave', () => $zone.classList.remove('over'));
  $zone.addEventListener('drop', e => {
    e.preventDefault(); $zone.classList.remove('over');
    const f = e.dataTransfer.files[0];
    if (f?.type.startsWith('image/')) loadFile(f);
  });
}

function loadFile(file) {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    S.original = img;
    S.aiResult = null;

    origCanvas.width  = img.naturalWidth;
    origCanvas.height = img.naturalHeight;
    origCanvas.getContext('2d').drawImage(img, 0, 0);

    $upload.classList.add('hidden');
    $editor.classList.remove('hidden');
    $download.disabled = false;

    if ($meta) $meta.textContent = `${img.naturalWidth} × ${img.naturalHeight}`;

    requestAnimationFrame(() => {
      renderEdited();
      buildFilterThumbs();
      renderComp();
    });
  };
  img.src = url;
}

/* ═══════════════════════════════════════════
   SLIDERS
═══════════════════════════════════════════ */
const SLIDERS = [
  { id: 'sl-yaw',             key: 'yaw',             vid: 'v-yaw',             fmt: v => v + '°' },
  { id: 'sl-pitch',           key: 'pitch',            vid: 'v-pitch',           fmt: v => v + '°' },
  { id: 'sl-roll',            key: 'roll',             vid: 'v-roll',            fmt: v => v + '°' },
  { id: 'sl-brightness',      key: 'brightness',       vid: 'v-brightness',      fmt: v => (v>0?'+':'')+v },
  { id: 'sl-contrast',        key: 'contrast',         vid: 'v-contrast',        fmt: v => (v>0?'+':'')+v },
  { id: 'sl-saturation',      key: 'saturation',       vid: 'v-saturation',      fmt: v => (v>0?'+':'')+v },
  { id: 'sl-sharpness',       key: 'sharpness',        vid: 'v-sharpness',       fmt: v => v },
  { id: 'sl-highlights',      key: 'highlights',       vid: 'v-highlights',      fmt: v => (v>0?'+':'')+v },
  { id: 'sl-shadows',         key: 'shadows',          vid: 'v-shadows',         fmt: v => (v>0?'+':'')+v },
  { id: 'sl-temperature',     key: 'temperature',      vid: 'v-temperature',     fmt: v => (v>0?'+':'')+v },
  { id: 'sl-tint',            key: 'tint',             vid: 'v-tint',            fmt: v => (v>0?'+':'')+v },
  { id: 'sl-vignette',        key: 'vignette',         vid: 'v-vignette',        fmt: v => v+'%' },
  { id: 'sl-grain',           key: 'grain',            vid: 'v-grain',           fmt: v => v+'%' },
  { id: 'sl-filterIntensity', key: 'filterIntensity',  vid: 'v-filterIntensity', fmt: v => v+'%' },
  { id: 'sl-gfpgan',          key: 'gfpgan',           vid: 'v-gfpgan',          fmt: v => v+'%' },
  {
    id: 'sl-angleStrength', key: 'angleStrength', vid: 'v-angleStrength',
    fmt: v => v===1?'약하게':v===2?'중간':'강하게',
  },
];

function initSliders() {
  SLIDERS.forEach(({ id, key, vid, fmt }) => {
    const el = document.getElementById(id);
    const vEl = document.getElementById(vid);
    if (!el) return;
    el.addEventListener('input', () => {
      const v = +el.value;
      S.settings[key] = v;
      if (vEl) vEl.textContent = fmt(v);
      setTrack(el);
      schedRender();
    });
    setTrack(el);
  });
}

function setTrack(el) {
  const pct = ((+el.value - +el.min) / (+el.max - +el.min)) * 100;
  el.style.background =
    `linear-gradient(90deg, #c084fc ${pct}%, rgba(255,255,255,0.07) ${pct}%)`;
}

/* ═══════════════════════════════════════════
   CAMERA ANGLE BUTTONS
═══════════════════════════════════════════ */
function initCameraAngles() {
  document.querySelectorAll('.ang-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.ang-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      S.settings.cameraAngle = btn.dataset.angle;
    });
  });
}

/* ═══════════════════════════════════════════
   FILTERS
═══════════════════════════════════════════ */
function initFilters() {
  document.querySelectorAll('.f-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.f-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      S.settings.filter = btn.dataset.filter;
      schedRender();
    });
  });
}

function buildFilterThumbs() {
  if (!S.original) return;
  const FILTERS = ['none','cinematic','hip','moody','vintage','dramatic','fade','cold','warm','neon'];
  FILTERS.forEach(name => {
    const wrap = document.getElementById('fp-' + name);
    if (!wrap) return;
    const c = document.createElement('canvas');
    const SIZE = 56; c.width = c.height = SIZE;
    const ctx = c.getContext('2d');
    const img = S.original;
    const r = img.naturalWidth / img.naturalHeight;
    let sx=0,sy=0,sw=img.naturalWidth,sh=img.naturalHeight;
    if (r>1) { sw=sh; sx=(img.naturalWidth-sw)/2; }
    else     { sh=sw; sy=(img.naturalHeight-sh)/2; }
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, SIZE, SIZE);
    const id = ctx.getImageData(0,0,SIZE,SIZE);
    applyPixels(id.data, { brightness:0,contrast:0,saturation:0,highlights:0,shadows:0,temperature:0,tint:0,filter:name,filterIntensity:80 });
    ctx.putImageData(id, 0, 0);
    wrap.innerHTML = '';
    wrap.appendChild(c);
  });
}

/* ═══════════════════════════════════════════
   RENDER ENGINE
═══════════════════════════════════════════ */
function schedRender() {
  if (S.rendering) return;
  S.rendering = true;
  requestAnimationFrame(() => {
    S.rendering = false;
    renderEdited();
    renderComp();
  });
}

function renderEdited() {
  if (!S.original) return;
  const src = S.aiResult || S.original;
  const W = src.naturalWidth || src.width;
  const H = src.naturalHeight || src.height;
  if (!W || !H) return;

  editCanvas.width = W; editCanvas.height = H;
  const ctx = editCanvas.getContext('2d');
  ctx.clearRect(0,0,W,H);
  ctx.drawImage(src, 0, 0, W, H);

  const id = ctx.getImageData(0,0,W,H);
  applyPixels(id.data, S.settings);
  ctx.putImageData(id, 0, 0);

  if (S.settings.sharpness > 0) applySharp(ctx, W, H, S.settings.sharpness);
  if (S.settings.vignette  > 0) applyVignette(ctx, W, H, S.settings.vignette/100);
  if (S.settings.grain     > 0) applyGrain(ctx, W, H, S.settings.grain/100);
}

function renderComp() {
  if (!S.original) return;
  const OW = origCanvas.width, OH = origCanvas.height;
  if (!OW || !OH) return;

  const panel = $preview;
  const maxW = panel.clientWidth  - 32;
  const maxH = panel.clientHeight - 60;
  if (maxW <= 0 || maxH <= 0) return;

  const scale = Math.min(maxW/OW, maxH/OH, 1);
  const dW = Math.floor(OW*scale);
  const dH = Math.floor(OH*scale);
  if (!dW || !dH) return;

  $comp.width = dW; $comp.height = dH;
  $comp.style.width  = dW + 'px';
  $comp.style.height = dH + 'px';

  const ctx = $comp.getContext('2d');
  const sx = Math.floor(dW * S.compPos);

  // 원본 (왼쪽)
  ctx.drawImage(origCanvas, 0,0,OW,OH, 0,0,dW,dH);

  // 편집본 (오른쪽)
  if (editCanvas.width > 0) {
    ctx.save();
    ctx.beginPath(); ctx.rect(sx, 0, dW-sx, dH); ctx.clip();
    ctx.drawImage(editCanvas, 0,0,editCanvas.width,editCanvas.height, 0,0,dW,dH);
    ctx.restore();
  }

  // 구분선
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(sx,0); ctx.lineTo(sx,dH); ctx.stroke();

  // 핸들
  const cy = dH/2;
  ctx.fillStyle = '#fff';
  ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 10;
  ctx.beginPath(); ctx.arc(sx, cy, 16, 0, Math.PI*2); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = '#555'; ctx.lineWidth = 1.8; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(sx-5,cy-3); ctx.lineTo(sx-9,cy); ctx.lineTo(sx-5,cy+3);
  ctx.moveTo(sx+5,cy-3); ctx.lineTo(sx+9,cy); ctx.lineTo(sx+5,cy+3);
  ctx.stroke();
}

/* ═══════════════════════════════════════════
   PIXEL EFFECTS
═══════════════════════════════════════════ */
function applyPixels(data, s) {
  const bright  = (s.brightness||0) * 2;
  const contF   = s.contrast ? (259*(s.contrast+255))/(255*(259-s.contrast)) : 1;
  const satF    = 1 + (s.saturation||0)/100;
  const tempR   = s.temperature>0 ? s.temperature*0.6  : s.temperature*0.4;
  const tempB   = s.temperature>0 ? -s.temperature*0.4 : -s.temperature*0.6;
  const tintG   = (s.tint||0)*0.5;
  const ft      = (s.filterIntensity||80)/100;

  for (let i=0; i<data.length; i+=4) {
    let r=data[i], g=data[i+1], b=data[i+2];

    // brightness
    r+=bright; g+=bright; b+=bright;

    // contrast
    if (s.contrast) {
      r=contF*(r-128)+128; g=contF*(g-128)+128; b=contF*(b-128)+128;
    }

    // saturation
    if (s.saturation) {
      const gr=0.299*r+0.587*g+0.114*b;
      r=gr+(r-gr)*satF; g=gr+(g-gr)*satF; b=gr+(b-gr)*satF;
    }

    // temperature + tint
    r+=tempR; b+=tempB; g+=tintG;

    // highlights / shadows
    if (s.highlights||s.shadows) {
      const lum=(r+g+b)/3;
      if (lum>128 && s.highlights) {
        const hf=(s.highlights/100)*((lum-128)/127);
        r+=(255-r)*hf; g+=(255-g)*hf; b+=(255-b)*hf;
      } else if (lum<=128 && s.shadows) {
        const sf=(s.shadows/100)*((128-lum)/128);
        if (s.shadows>0){r+=(128-r)*sf;g+=(128-g)*sf;b+=(128-b)*sf;}
        else            {r+=r*sf;g+=g*sf;b+=b*sf;}
      }
    }

    // filter
    if (s.filter && s.filter!=='none' && ft>0) {
      [r,g,b] = applyFilter(r,g,b, s.filter, ft);
    }

    data[i]=clamp(r); data[i+1]=clamp(g); data[i+2]=clamp(b);
  }
}

function applyFilter(r,g,b,f,t) {
  const lum=(r+g+b)/3;
  switch(f) {
    case 'cinematic': {
      const nr=lum>128?lerp(r,Math.min(255,r*1.12+18),t):lerp(r,r*0.80,t);
      const ng=lerp(g,lum>128?g*0.94:g*1.02,t);
      const nb=lum>128?lerp(b,b*0.78,t):lerp(b,Math.min(255,b*1.18+14),t);
      return[nr,ng,nb];
    }
    case 'hip': {
      const cf=1.25;
      return[lerp(r,clamp(cf*(r-128)+118),t),lerp(g,clamp(cf*(g-128)+118),t),lerp(b,Math.min(255,clamp(cf*(b-128)+130)+12),t)];
    }
    case 'moody': {
      const gr=0.299*r+0.587*g+0.114*b;
      return[lerp(r,(gr+(r-gr)*0.65)*0.82,t),lerp(g,(gr+(g-gr)*0.65)*0.85,t),lerp(b,Math.min(255,(gr+(b-gr)*0.65)*0.88+15),t)];
    }
    case 'vintage': return[lerp(r,Math.min(255,r*1.07+12),t),lerp(g,g*0.95+8,t),lerp(b,Math.max(25,b*0.85)+10,t)];
    case 'dramatic': { const df=1.5; return[lerp(r,clamp((r-128)*df+128),t),lerp(g,clamp((g-128)*df+128),t),lerp(b,clamp((b-128)*df+128),t)]; }
    case 'fade': { const gr=0.299*r+0.587*g+0.114*b; return[lerp(r,gr+(r-gr)*0.5+32,t),lerp(g,gr+(g-gr)*0.5+28,t),lerp(b,gr+(b-gr)*0.5+38,t)]; }
    case 'cold':  return[lerp(r,r*0.88,t),lerp(g,g*0.96,t),lerp(b,Math.min(255,b*1.1+12),t)];
    case 'warm':  return[lerp(r,Math.min(255,r*1.1+14),t),lerp(g,Math.min(255,g*1.03+4),t),lerp(b,b*0.88,t)];
    case 'neon':  { const gr=0.299*r+0.587*g+0.114*b; return[lerp(r,clamp(gr+(r-gr)*2.2),t),lerp(g,clamp(gr+(g-gr)*2.2),t),lerp(b,clamp(gr+(b-gr)*2.2+20),t)]; }
    default: return[r,g,b];
  }
}

function applySharp(ctx, W, H, amt) {
  const id = ctx.getImageData(0,0,W,H);
  const src = new Uint8ClampedArray(id.data);
  const d = id.data;
  const f = amt/100*1.2;
  for (let y=1;y<H-1;y++) for (let x=1;x<W-1;x++) {
    const idx=(y*W+x)*4;
    for (let c=0;c<3;c++) {
      const ctr=src[idx+c],
            t=src[((y-1)*W+x)*4+c],
            bo=src[((y+1)*W+x)*4+c],
            l=src[(y*W+x-1)*4+c],
            ri=src[(y*W+x+1)*4+c];
      d[idx+c]=clamp(ctr+(5*ctr-t-bo-l-ri)*f);
    }
  }
  ctx.putImageData(id,0,0);
}

function applyVignette(ctx, W, H, s) {
  const g=ctx.createRadialGradient(W/2,H/2,0,W/2,H/2,Math.sqrt(W*W+H*H)/2);
  g.addColorStop(0.4,'transparent');
  g.addColorStop(1.0,`rgba(0,0,0,${s*0.9})`);
  ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
}

function applyGrain(ctx, W, H, s) {
  const id=ctx.getImageData(0,0,W,H);
  const d=id.data, amp=s*55;
  for (let i=0;i<d.length;i+=4) {
    const n=(Math.random()-0.5)*amp;
    d[i]=clamp(d[i]+n); d[i+1]=clamp(d[i+1]+n); d[i+2]=clamp(d[i+2]+n);
  }
  ctx.putImageData(id,0,0);
}

const clamp = v => Math.max(0,Math.min(255,v));
const lerp  = (a,b,t) => a+(b-a)*t;

/* ═══════════════════════════════════════════
   COMPARISON SLIDER
═══════════════════════════════════════════ */
function initCompSlider() {
  let drag = false;
  const move = x => {
    const r = $comp.getBoundingClientRect();
    S.compPos = Math.max(0, Math.min(1, (x-r.left)/r.width));
    renderComp();
  };
  $comp.addEventListener('mousedown',  e => { drag=true;  move(e.clientX); });
  document.addEventListener('mousemove', e => { if(drag) move(e.clientX); });
  document.addEventListener('mouseup',   () => { drag=false; });
  $comp.addEventListener('touchstart', e => { e.preventDefault(); drag=true;  move(e.touches[0].clientX); }, {passive:false});
  document.addEventListener('touchmove', e => { if(drag){e.preventDefault(); move(e.touches[0].clientX);} }, {passive:false});
  document.addEventListener('touchend',  () => { drag=false; });
}

/* ═══════════════════════════════════════════
   RESET
═══════════════════════════════════════════ */
function initButtons() {
  $reset.addEventListener('click', () => {
    S.settings = {
      yaw:0, pitch:0, roll:0, cameraAngle:'eye-level', angleStrength:2,
      brightness:0, contrast:0, saturation:0, sharpness:0,
      highlights:0, shadows:0, temperature:0, tint:0,
      vignette:0, grain:0, filter:'none', filterIntensity:80, gfpgan:80
    };
    S.aiResult = null;

    const DEFS = {yaw:0,pitch:0,roll:0,angleStrength:2,brightness:0,contrast:0,saturation:0,sharpness:0,highlights:0,shadows:0,temperature:0,tint:0,vignette:0,grain:0,filterIntensity:80,gfpgan:80};
    SLIDERS.forEach(({id,key,vid,fmt})=>{
      const el=document.getElementById(id);
      const vEl=document.getElementById(vid);
      if(!el)return;
      const dv = DEFS[key]??0;
      el.value=dv;
      if(vEl) vEl.textContent=fmt(dv);
      setTrack(el);
    });

    document.querySelectorAll('.ang-btn').forEach(b=>b.classList.toggle('active',b.dataset.angle==='eye-level'));
    document.querySelectorAll('.f-btn').forEach(b=>b.classList.toggle('active',b.dataset.filter==='none'));
    schedRender();
    toast('초기화 완료');
  });

  $download.addEventListener('click', () => {
    if (!S.original) return;
    const a = document.createElement('a');
    a.download = 'photoai-' + Date.now() + '.png';
    a.href = editCanvas.toDataURL('image/png');
    a.click();
    toast('저장 완료!');
  });

  // AI 버튼들
  document.getElementById('btnApplyAngle').addEventListener('click', runAngleAI);
  document.getElementById('btnApplyCamera').addEventListener('click', runCameraAI);
  document.getElementById('btnGfpgan').addEventListener('click', runGfpgan);
  document.getElementById('btnUpscale').addEventListener('click', runUpscale);
}

/* ═══════════════════════════════════════════
   AI — FLUX KONTEXT (얼굴각도 & 카메라앵글)
═══════════════════════════════════════════ */

// 얼굴 각도를 텍스트 프롬프트로 변환
function angleToPrompt(yaw, pitch, roll) {
  const parts = [];

  if (Math.abs(yaw) < 5 && Math.abs(pitch) < 5 && Math.abs(roll) < 5) {
    return 'front facing, looking directly at camera, neutral head position, same person same lighting';
  }

  // Yaw (좌우)
  if (yaw > 30)       parts.push('face turned far to the right, showing mostly left side of face');
  else if (yaw > 15)  parts.push('face slightly turned to the right, 3/4 view from left side');
  else if (yaw > 5)   parts.push('face slightly angled to the right');
  else if (yaw < -30) parts.push('face turned far to the left, showing mostly right side of face');
  else if (yaw < -15) parts.push('face slightly turned to the left, 3/4 view from right side');
  else if (yaw < -5)  parts.push('face slightly angled to the left');

  // Pitch (상하)
  if (pitch > 15)      parts.push('chin tucked down, looking downward');
  else if (pitch > 5)  parts.push('head slightly tilted down');
  else if (pitch < -15) parts.push('chin raised up, looking upward');
  else if (pitch < -5)  parts.push('head slightly tilted up');

  // Roll (기울기)
  if (roll > 10)       parts.push('head tilted to the right shoulder');
  else if (roll > 5)   parts.push('head slightly tilted to the right');
  else if (roll < -10) parts.push('head tilted to the left shoulder');
  else if (roll < -5)  parts.push('head slightly tilted to the left');

  const base = parts.join(', ');
  return `${base}, maintaining exact same person identity facial features lighting and background, photorealistic`;
}

// 카메라 앵글을 텍스트 프롬프트로 변환
function cameraAngleToPrompt(angle, strength) {
  const intensityWord = strength===1 ? 'slightly' : strength===3 ? 'dramatically' : 'clearly';
  const prompts = {
    'eye-level':  'eye level camera angle, neutral perspective, camera at face height',
    'high-angle': `${intensityWord} high angle shot, camera positioned above looking down at subject`,
    'low-angle':  `${intensityWord} low angle shot, camera positioned below looking up at subject, dramatic upward perspective`,
    'birds-eye':  `bird's eye view from directly overhead, ${intensityWord} top-down aerial perspective`,
    'dutch-angle':`${intensityWord} dutch angle, tilted diagonal camera, canted shot`,
    'worm-eye':   `${intensityWord} extreme worm's eye view, camera on ground looking sharply upward`,
  };
  const base = prompts[angle] || prompts['eye-level'];
  return `${base}, same person same facial features same lighting same clothing, photorealistic high quality`;
}

async function runAngleAI() {
  if (!S.original) { toast('먼저 사진을 업로드해주세요'); return; }
  const { yaw, pitch, roll } = S.settings;
  if (Math.abs(yaw)<2 && Math.abs(pitch)<2 && Math.abs(roll)<2) {
    toast('슬라이더를 먼저 조정해주세요'); return;
  }

  const prompt = angleToPrompt(yaw, pitch, roll);
  await runKontext(prompt, 'AI 얼굴 각도 변경 중...');
}

async function runCameraAI() {
  if (!S.original) { toast('먼저 사진을 업로드해주세요'); return; }
  const prompt = cameraAngleToPrompt(S.settings.cameraAngle, S.settings.angleStrength);
  await runKontext(prompt, 'AI 카메라 앵글 변경 중...');
}

async function runKontext(prompt, statusMsg) {
  setAIBusy(true, statusMsg);
  try {
    // 현재 편집본을 base64로 변환
    const imageB64 = editCanvas.toDataURL('image/jpeg', 0.92);

    const output = await callReplicate(
      'black-forest-labs/flux-kontext-pro',
      { prompt, input_image: imageB64 }
    );

    const url = Array.isArray(output) ? output[0] : output;
    S.aiResult = await loadImg(url);

    // origCanvas도 업데이트 (새로운 원본으로 설정)
    origCanvas.width  = S.aiResult.naturalWidth;
    origCanvas.height = S.aiResult.naturalHeight;
    origCanvas.getContext('2d').drawImage(S.aiResult, 0, 0);
    S.original = S.aiResult;

    schedRender();
    buildFilterThumbs();
    toast('✅ AI 처리 완료!');
  } catch(e) {
    console.error(e);
    toast('오류: ' + (e.message || '처리 실패'));
  } finally {
    setAIBusy(false);
  }
}

/* ═══════════════════════════════════════════
   AI — GFPGAN & ESRGAN
═══════════════════════════════════════════ */
async function runGfpgan() {
  if (!S.original) { toast('먼저 사진을 업로드해주세요'); return; }
  setAIBusy(true, 'GFPGAN 얼굴 복원 중...');
  try {
    const output = await callReplicate(
      'tencentarc/gfpgan',
      { img: editCanvas.toDataURL('image/png'), version:'v1.4', scale:2 }
    );
    const url = Array.isArray(output) ? output[0] : output;
    S.aiResult = await loadImg(url);
    schedRender();
    toast('✅ 얼굴 복원 완료!');
  } catch(e) {
    toast('오류: ' + e.message);
  } finally {
    setAIBusy(false);
  }
}

async function runUpscale() {
  if (!S.original) { toast('먼저 사진을 업로드해주세요'); return; }
  setAIBusy(true, 'Real-ESRGAN 화질 개선 중...');
  try {
    const output = await callReplicate(
      'nightmareai/real-esrgan',
      { image: editCanvas.toDataURL('image/png'), scale:2, face_enhance:true }
    );
    const url = Array.isArray(output) ? output[0] : output;
    S.aiResult = await loadImg(url);
    schedRender();
    toast('✅ 화질 개선 완료!');
  } catch(e) {
    toast('오류: ' + e.message);
  } finally {
    setAIBusy(false);
  }
}

/* ═══════════════════════════════════════════
   REPLICATE API CALL (Netlify 함수 경유)
═══════════════════════════════════════════ */
async function callReplicate(model, input) {
  // 예측 생성
  const res = await fetch(PROXY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'create', model, input }),
  });
  if (!res.ok) throw new Error(`서버 오류 ${res.status}`);
  let pred = await res.json();
  if (pred.error) throw new Error(pred.error);

  // 폴링
  let tries = 0;
  while (!['succeeded','failed','canceled'].includes(pred.status)) {
    if (++tries > 60) throw new Error('타임아웃 (90초 초과)');
    await sleep(1500);
    const poll = await fetch(PROXY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'poll', predictionId: pred.id }),
    });
    pred = await poll.json();
  }
  if (pred.status !== 'succeeded') throw new Error(pred.error || '처리 실패');
  return pred.output;
}

/* ═══════════════════════════════════════════
   UTILS
═══════════════════════════════════════════ */
function setAIBusy(on, msg='AI 처리 중...') {
  $aiOver.classList.toggle('hidden', !on);
  if (on && $aiText) $aiText.textContent = msg;
  ['btnApplyAngle','btnApplyCamera','btnGfpgan','btnUpscale'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = on;
  });
}

function loadImg(url) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => res(img);
    img.onerror = () => rej(new Error('이미지 로드 실패'));
    img.src = url;
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function toast(msg) {
  $toast.textContent = msg;
  $toast.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $toast.classList.add('hidden'), 2800);
}

/* ── ResizeObserver ── */
new ResizeObserver(() => {
  if (S.original) { renderEdited(); renderComp(); }
}).observe(document.getElementById('previewPanel') || document.body);
