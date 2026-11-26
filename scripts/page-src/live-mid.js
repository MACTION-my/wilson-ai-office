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
const hmOf = ms => ms ? myTime(new Date(ms)) : '';
const myDay = d => new Intl.DateTimeFormat('en-CA',{timeZone:MY_TZ}).format(d);
const isToday = ms => !!ms && myDay(new Date(ms)) === myDay(new Date());
const whoName = t => t.auto ? `自动化 · ${AG[t.who].name}` : t.who==='all' ? '全公司 · Sasa 拆解' : `${AG[t.who].name} · ${AG[t.who].cn}`;
const whoColor = t => t.who==='all' ? '#ffd166' : AG[t.who].color;
function toast(msg){const el = $('#toast'); el.textContent = msg; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(()=>{el.hidden = true}, 5000)}
/* ---------- work board: notices · to approve · doing · done · auto-done · log ---------- */
let bTab = 'notice', notices = [];
const HELP = {
  notice: '每位员工每天发 2 次通知：09:00「今天要做什么」，18:00「今天完成了什么」。',
  review: '这些成果等你决定：看摘要或全文，然后「批准」或写意见「退回修改」。',
  doing: '已经派出、还在做的任务（包括自动化）。做完会移到「已完成」或「自动完成」；需要你批准的会先到「待我审批」。',
  done: '你亲自派的任务做完的成果，按日期排。点「查看完整交付」看全文。',
  auto: '员工按时间表自己做完的工作（例如每天的简报、FB 帖子草稿），按日期排。',
  log: '给技术人员看的原始事件记录，平时不用看。',
};
const dayLabel = ms => { if(!ms) return '更早'; const d = myDay(new Date(ms)), t = myDay(new Date()), y = myDay(new Date(Date.now()-864e5)); return d===t ? '今天' : d===y ? '昨天' : d; };
function cardHTML(t){
  const [lab,sc] = TS[t.status] || TS.queued, pct = Math.round((t.prog||0)/(t.total||1)*100);
  const outs = t.outs || [], fin = outs.filter(o=>o.final), rest = outs.filter(o=>!o.final), rv = t.status==='review';
  return `<article class="task${rv?' rv':''}" style="--c:${whoColor(t)}">
    <div class="th"><span class="tw">${esc(whoName(t))}</span>${t.page && ORG.meta ? `<span class="tag">${esc((ORG.meta.pages.find(p=>p.key===t.page)||{}).name||t.page)}</span>`:''}${t.qa?`<span class="tag ${t.qa.ok?'qa-ok':'qa-bad'}" title="${esc(t.qa.note||'')}">${t.qa.ok?'Wawa 验收合格':'Wawa：需改进'}</span>`:''}<span class="pill" style="--pc:${sc}">${lab}</span></div>
    <div class="tt">${esc(t.title)}${t.auto && AUTO_BY[t.autoKey]?` <span class="tag">${esc(AUTO_BY[t.autoKey].cad)}</span>`:''}</div>
    ${['queued','running','revising'].includes(t.status)?`<div class="bar"><i style="width:${pct}%"></i></div>`:''}
    <div class="tm"><span>${hmOf(tsMs(t.createdAt))} ${t.auto?'自动开始':'派出'}${t.finishedAt?` · ${hmOf(tsMs(t.finishedAt))} ${t.status==='failed'?'停止':'完成'}`:''}</span>${['queued','running','revising'].includes(t.status)?`<span>${pct}%</span>`:''}</div>
    ${t.status==='running' && t.step ? `<div class="tm"><span>现在：${esc(t.step.desc||'')}</span></div>`:''}
    ${t.status==='failed'?`<div class="terr">${esc(t.error||'未知错误')}</div>`:''}
    ${rv && t.summary ? `<div class="rvsum">${esc(t.summary)}</div>`:''}
    ${rv && session.isOwner ? `<textarea class="rvnote" data-note="${t.id}" placeholder="要退回修改的话，在这里写意见（批准就不用写）"></textarea><div class="rvb"><button type="button" class="ap" data-ap="${t.id}">批准 ✓</button><button type="button" data-rv="${t.id}">退回修改</button></div>` : ''}
    ${outs.length?`<details data-id="${t.id}"${t.open?' open':''}><summary>交付物（${outs.length}）</summary><div class="outs">${[...fin,...rest].map(o=>`<div class="out${o.final?' final':''}" style="--c:${o.final?'#ffd166':(AG[TEAM.find(x=>AG[x].name===o.who)]||{}).color||'#9d99c9'}"><i></i><div><b>${esc(o.who)}</b>${esc(o.text)}</div></div>`).join('')}</div></details>`:''}
    ${(t.images||[]).length?`<div class="timgs">${(t.images).map(im=>`<a href="${esc(im.url)}" target="_blank" rel="noopener"><img src="${esc(im.url)}" alt="AI 配图：${esc((im.prompt||'').slice(0,80))}" loading="lazy"></a>`).join('')}</div>`:''}
    <div class="dbtns">${t.fb&&t.fb.url?`<a class="dbtn fbl" href="${esc(t.fb.url)}" target="_blank" rel="noopener">看 FB 帖子</a>`:''}${t.metaAd&&t.metaAd.url?`<a class="dbtn fbl" href="${esc(t.metaAd.url)}" target="_blank" rel="noopener">在 Ads Manager 打开</a>`:''}${t.result?`<button type="button" class="dbtn ghost" data-doc="${t.id}">查看完整交付</button>`:''}${t.who==='kiki'&&t.result?`<a class="dbtn wa" href="https://wa.me/?text=${encodeURIComponent(t.result.slice(0,3500))}" target="_blank" rel="noopener">用 WhatsApp 转发</a>`:''}</div>
  </article>`;
}
function grouped(list, key){
  let html = '', last = null;
  list.forEach(t => { const d = dayLabel(tsMs(t[key]) || tsMs(t.createdAt)); if(d!==last){html += `<h4 class="bday">${d}</h4>`; last = d} html += cardHTML(t) });
  return html;
}
const NK = {auto:'⚡', task:'📝', review:'⏳', failed:'⚠️', doing:'🔄'};
function noticeSec(n, title, when){
  if(!n) return `<div class="nsec"><h5>${title}<span>${when} 发出</span></h5><p class="wait">还没到时间。</p></div>`;
  return `<div class="nsec"><h5>${title}<span>${hmOf(tsMs(n.at))}</span></h5><p>${esc(n.text||'')}</p>${(n.items||[]).length?`<ul>${n.items.map(x=>`<li>${NK[x.kind]||'•'} ${esc(x.text)} <small>· ${esc(x.when||'')}${x.qa?' · '+esc(x.qa):''}</small></li>`).join('')}</ul>`:''}</div>`;
}
function renderNotices(){
  const today = myDay(new Date());
  const mineOf = (id, k) => notices.find(n => n.who===id && n.kind===k && n.day===today);
  const anyToday = notices.some(n => n.day===today);
  return `${session.isOwner?`<div class="nrun"><button type="button" class="dbtn ghost" data-notice="plan">现在发「今天要做什么」</button><button type="button" class="dbtn ghost" data-notice="report">现在发「今天完成了什么」</button></div>`:''}
    ${anyToday?'':'<p class="empty">今天的通知还没发出：每天 09:00 和 18:00 会自动发。也可以按上面的按钮马上发一次。</p>'}
    <div class="notes">${TEAM.map(id => `<div class="note" style="--c:${AG[id].color}"><div class="nh">${AVA(id,34)}<div><b>${AG[id].name}</b><small>${esc(AG[id].dept)} · ${esc(AG[id].cn)}</small></div></div>
      ${noticeSec(mineOf(id,'plan'),'☀️ 今天要做什么','09:00')}${noticeSec(mineOf(id,'report'),'🌙 今天完成了什么','18:00')}</div>`).join('')}</div>`;
}
function setTab(k){
  bTab = k;
  document.querySelectorAll('#btabs button').forEach(b => b.setAttribute('aria-selected', b.dataset.tab===k ? 'true' : 'false'));
  renderBoard();
}
function renderBoard(){
  const review = tasks.filter(t=>t.status==='review'), doing = tasks.filter(t=>['queued','running','revising'].includes(t.status));
  const done = tasks.filter(t=>!t.auto && ['done','failed'].includes(t.status)), auto = tasks.filter(t=>t.auto && ['done','failed'].includes(t.status));
  const todayN = l => l.filter(t=>isToday(tsMs(t.finishedAt))).length;
  const setN = (id,n,hot) => {const el = $(id); el.textContent = n; el.classList.toggle('hot', !!hot && n>0)};
  setN('#nReview', review.length, true); setN('#nDoing', doing.length); setN('#nDone', todayN(done)); setN('#nAuto', todayN(auto));
  $('#tcount').textContent = `今天完成 ${todayN(done)+todayN(auto)} 个 · 待审批 ${review.length} 个`;
  $('#bhelp').textContent = HELP[bTab];
  $('#log').hidden = bTab!=='log'; tasksEl.hidden = bTab==='log';
  if(bTab==='log') return;
  let html = '';
  if(bTab==='notice') html = renderNotices();
  else if(bTab==='review') html = review.length ? review.slice().reverse().map(cardHTML).join('') : '<p class="empty">没有等你审批的任务。</p>';
  else if(bTab==='doing') html = doing.length ? doing.map(cardHTML).join('') : '<p class="empty">现在没有进行中的任务。到上面「指令台」派一个吧。</p>';
  else if(bTab==='done') html = done.length ? grouped(done,'finishedAt') : '<p class="empty">你派的任务做完后会出现在这里。</p>';
  else if(bTab==='auto') html = auto.length ? grouped(auto,'finishedAt') : '<p class="empty">自动化做完的工作会出现在这里。可以点员工，在「自动化」里开启或立即运行。</p>';
  const typing = tasksEl.querySelector('textarea:focus');
  if(typing && bTab==='review') return; // don't wipe a note being written
  tasksEl.innerHTML = html;
}
const renderTasks = renderBoard;
function applyNotices(list){notices = list; if(bTab==='notice') renderBoard()}
document.querySelectorAll('#btabs button').forEach(b => b.addEventListener('click', () => setTab(b.dataset.tab)));
tasksEl.addEventListener('toggle', e => {const d = e.target; if(d.tagName==='DETAILS'){const t = byId.get(d.dataset.id); if(t) t.open = d.open}}, true);
tasksEl.addEventListener('click', async e => {
  const b = e.target.closest('button'); if(!b) return;
  if(b.dataset.ap) decide(b.dataset.ap,true);
  if(b.dataset.rv) decide(b.dataset.rv,false);
  if(b.dataset.doc) openDoc(b.dataset.doc);
  if(b.dataset.notice){b.disabled = true; try{await window.DB.runNotices(b.dataset.notice); toast('已通知员工，几秒后会出现')}catch(err){toast('发送失败：'+err.message)} b.disabled = false}
});
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
  const n = tasks.filter(x=>x.status==='review').length;
  $('#review').hidden = !(session.isOwner && n); $('#rvN').textContent = n;
}
$('#rvGo').addEventListener('click', () => {setTab('review'); $('#board').scrollIntoView({behavior:'smooth', block:'start'})});
async function decide(id,ok){
  const t = byId.get(id); if(!t || t.status!=='review') return;
  let note = '';
  if(!ok){
    const box = tasksEl.querySelector(`textarea[data-note="${id}"]`); note = box ? box.value.trim() : '';
    if(!note){const v = prompt(`给 ${t.who==='all'?'Sasa':AG[t.who].name} 的修改意见（可以留空）：`, ''); if(v===null) return; note = v.trim()}
  }
  try{await window.DB.decide(id, ok, note); toast(ok ? '已批准' : '已退回修改')}catch(e){toast('操作失败：'+e.message)}
}
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
