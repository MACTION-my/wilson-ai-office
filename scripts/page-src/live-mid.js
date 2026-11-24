/* ---------- org data (public/org.js, generated from functions/org.json) ---------- */
const ORG = window.ORG || {agents:{}, autos:[]};
const ROLES = {}, STEPS = {}, AUTOS = {};
TEAM.forEach(id => {const g = ORG.agents[id] || {}; ROLES[id] = g.role; STEPS[id] = g.steps || []; AUTOS[id] = []});
ORG.autos.forEach(u => {if(AUTOS[u.who]) AUTOS[u.who].push(Object.assign({}, u, {runs:0}))});
const AUTO_BY = {}; Object.values(AUTOS).flat().forEach(u => {AUTO_BY[u.key] = u});

/* ---------- task records (live from Firestore) ---------- */
const TS = {queued:['排队中','#9d99c9'], running:['进行中','#3ee6ff'], review:['待你审批','#ffd166'], revising:['修改中','#ff9466'], done:['已完成','#4dffa6'], failed:['出错了','#ff5a6e']};
const tasks = [], byId = new Map(), tasksEl = $('#tasks');
let focus = null, tFilter = 'all', session = {isOwner:false, name:''}, rule = 'smart', reviewId = null;
const tsMs = v => v && typeof v.toMillis === 'function' ? v.toMillis() : 0;
const hmOf = ms => {if(!ms) return ''; const d = new Date(ms); return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0')};
const isToday = ms => ms && new Date(ms).toDateString() === new Date().toDateString();
const whoName = t => t.auto ? `自动化 · ${AG[t.who].name}` : t.who==='all' ? '全公司 · Sasa 拆解' : `${AG[t.who].name} · ${AG[t.who].cn}`;
const whoColor = t => t.who==='all' ? '#ffd166' : AG[t.who].color;
function toast(msg){const el = $('#toast'); el.textContent = msg; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(()=>{el.hidden = true}, 5000)}
function renderTasks(){
  const nrev = tasks.filter(t=>t.status==='review').length;
  $('#tcount').textContent = `${tasks.length} 个${nrev ? ` · ${nrev} 个待审批` : ''}`;
  const list = tasks.filter(t => tFilter==='all' || (tFilter==='me' && !t.auto) || (tFilter==='auto' && t.auto) || (tFilter==='review' && t.status==='review')).slice(0,40);
  if(!list.length){tasksEl.innerHTML = `<p class="empty">${tFilter==='review' ? '目前没有等你审批的任务。' : '派出的任务和自动化任务会出现在这里：排队中 → 进行中 →（需要时）待你审批 → 已完成。'}</p>`; return}
  const lastDone = list.find(x=>x.status==='done');
  tasksEl.innerHTML = list.map(t => {
    const [lab,sc] = TS[t.status] || TS.queued, pct = Math.round((t.prog||0)/(t.total||1)*100), open = t.open ?? (t.status!=='done' || t===lastDone);
    const outs = t.outs || [], fin = outs.filter(o=>o.final), rest = outs.filter(o=>!o.final);
    return `<article class="task${t.status==='review'?' rv':''}" style="--c:${whoColor(t)}">
      <div class="th"><span class="tw">${esc(whoName(t))}</span>${t.needAp!=null?`<span class="tag">${t.needAp?'需审批':'直接完成'}</span>`:''}<span class="pill" style="--pc:${sc}">${lab}</span></div>
      <div class="tt">${esc(t.title)}${t.auto && AUTO_BY[t.autoKey]?` <span class="tag">${esc(AUTO_BY[t.autoKey].cad)}</span>`:''}</div>
      <div class="bar"><i style="width:${t.status==='done'?100:pct}%"></i></div>
      <div class="tm"><span>${hmOf(tsMs(t.createdAt))} ${t.auto?'自动触发':'派出'}${t.finishedAt?` · ${hmOf(tsMs(t.finishedAt))} ${t.status==='failed'?'停止':'完成'}`:''}</span><span>${t.status==='done'?100:pct}%</span></div>
      ${t.status==='failed'?`<div class="terr">${esc(t.error||'未知错误')}</div>`:''}
      ${t.status==='review'&&session.isOwner?`<div class="rvb"><button type="button" class="ap" data-ap="${t.id}">批准 ✓</button><button type="button" data-rv="${t.id}">退回修改</button></div>`:''}
      ${outs.length?`<details data-id="${t.id}"${open?' open':''}><summary>交付物（${outs.length}）</summary><div class="outs">${[...fin,...rest].map(o=>`<div class="out${o.final?' final':''}" style="--c:${o.final?'#ffd166':(AG[TEAM.find(x=>AG[x].name===o.who)]||{}).color||'#9d99c9'}"><i></i><div><b>${esc(o.who)}</b>${esc(o.text)}</div></div>`).join('')}</div></details>`:''}
      ${t.result?`<button type="button" class="dbtn ghost" data-doc="${t.id}">查看完整交付</button>`:''}
    </article>`;
  }).join('');
}
tasksEl.addEventListener('toggle', e => {const d = e.target; if(d.tagName==='DETAILS'){const t = byId.get(d.dataset.id); if(t) t.open = d.open}}, true);
tasksEl.addEventListener('click', e => {const b = e.target.closest('button'); if(!b) return; if(b.dataset.ap) decide(b.dataset.ap,true); if(b.dataset.rv) decide(b.dataset.rv,false); if(b.dataset.doc) openDoc(b.dataset.doc)});
document.querySelectorAll('#tf button').forEach(b => b.addEventListener('click', () => {
  tFilter = b.dataset.f; document.querySelectorAll('#tf button').forEach(x => x.setAttribute('aria-pressed', x===b ? 'true' : 'false')); renderTasks();
}));
function openDoc(id){
  const t = byId.get(id); if(!t) return;
  $('#docTitle').textContent = `${whoName(t)}：${t.title}`;
  $('#docBody').textContent = t.result || '';
  $('#docDlg').showModal();
}
$('#docClose').addEventListener('click', () => $('#docDlg').close());
$('#docCopy').addEventListener('click', async () => {try{await navigator.clipboard.writeText($('#docBody').textContent); toast('已复制')}catch(e){toast('复制失败，请手动选择文字')}});
function addOut(){} // deliverables come from the server
function setBar(){
  const t = focus, p = !t ? 0 : t.status==='done' ? 100 : Math.round((t.prog||0)/(t.total||1)*100);
  prog = p; total = 100; $('#bar').style.width = p+'%'; $('#pnum').textContent = p+'%';
}
function bump(){}
function setPhases(labels){[...$('#phases').children].forEach((s,k)=>{s.textContent = labels[k]})}
function setPhase(i,txt){
  [...$('#phases').children].forEach((s,k)=>{s.className = k<i?'ok':k===i?'on':''});
  $('#ptxt').textContent = txt;
}
function renderFocus(){
  const t = focus;
  if(!t){setPhases(['老板下达','启动会','部门执行','汇总','老板审批']); setPhase(-1,'等待 Wilson 下达任务'); setBar(); return}
  const team = t.who==='all', name = team ? 'Sasa' : AG[t.who].name;
  setPhases(team ? ['老板下达','启动会','部门执行','汇总',t.needAp===false?'完成':'老板审批'] : ['老板下达',`${name} 接收`,'执行中','送审',t.needAp===false?'完成':'老板审批']);
  let i = 0, txt = '';
  if(t.status==='queued'){i = 0; txt = '已派出，等待开工'}
  else if(t.status==='running'){
    if(team){i = t.stage==='plan' ? 1 : t.stage==='depts' ? 2 : t.stage==='merge' ? 3 : 1; txt = t.stage==='plan' ? 'Sasa 正在拆解任务' : t.stage==='depts' ? '各部门正在做' : t.stage==='merge' ? 'Sasa 正在汇总' : '开工中'}
    else {i = t.stage==='think' ? 1 : 2; txt = t.step ? `${name}：${t.step.desc}` : `${name} 正在理解任务`}
  }
  else if(t.status==='review'){i = 4; txt = session.isOwner ? '等你审批：点「批准」或「退回修改」' : '等 Wilson 审批'}
  else if(t.status==='revising'){i = 3; txt = `${name} 正在按意见修改`}
  else if(t.status==='done'){i = 5; txt = t.needAp ? '已完成，Wilson 已批准' : '已完成'}
  else if(t.status==='failed'){i = -1; txt = '出错了：' + (t.error||'')}
  setPhase(i,txt); setBar();
}
function renderReview(){
  const box = $('#review');
  const t = session.isOwner ? tasks.slice().reverse().find(x=>x.status==='review') : null;
  if(!t){box.hidden = true; reviewId = null; return}
  if(reviewId !== t.id){reviewId = t.id; $('#rvNote').value = ''}
  $('#rvTitle').textContent = `${whoName(t)}：${t.title}`;
  $('#rvSum').textContent = t.summary || '';
  box.hidden = false;
}
async function decide(id,ok){
  const t = byId.get(id); if(!t || t.status!=='review') return;
  let note = '';
  if(!ok){
    if(reviewId===id) note = $('#rvNote').value.trim();
    if(!note){const v = prompt(`给 ${t.who==='all'?'Sasa':AG[t.who].name} 的修改意见（可以留空）：`, ''); if(v===null) return; note = v.trim()}
  }
  try{await window.DB.decide(id, ok, note); toast(ok ? '已批准' : '已退回修改')}catch(e){toast('操作失败：'+e.message)}
}
$('#approve').addEventListener('click', () => reviewId && decide(reviewId,true));
$('#revise').addEventListener('click', () => reviewId && decide(reviewId,false));
$('#rvDoc').addEventListener('click', () => reviewId && openDoc(reviewId));
function updateQueue(){
  const run = tasks.filter(t=>t.status==='running'||t.status==='revising').length, q = tasks.filter(t=>t.status==='queued').length, rv = tasks.filter(t=>t.status==='review').length;
  $('#qinfo').textContent = `${run} 个进行中${q ? ` · ${q} 个排队` : ''}${rv ? ` · ${rv} 个待审批` : ''}`;
}
function renderStats(){
  TEAM.forEach(id => {
    const el = cards[id]; if(!el) return;
    const mine = tasks.filter(t => t.who===id || (t.who==='all' && t.team && t.team[id]));
    el.querySelector('.s0').textContent = mine.filter(t=>t.status==='done' && isToday(tsMs(t.finishedAt))).length;
    el.querySelector('.s1').textContent = mine.filter(t=>t.status==='review').length;
    el.querySelector('.s2').textContent = mine.filter(t=>t.status==='running'||t.status==='revising').length;
  });
  $('#ov0').textContent = tasks.filter(t=>isToday(tsMs(t.createdAt))).length;
  $('#ov1').textContent = tasks.filter(t=>t.status==='done' && isToday(tsMs(t.finishedAt))).length;
  $('#ov2').textContent = tasks.filter(t=>t.status==='review').length;
  $('#ov3').textContent = Object.values(AUTO_BY).filter(u=>u.on).length + ' / ' + Object.keys(AUTO_BY).length;
}
