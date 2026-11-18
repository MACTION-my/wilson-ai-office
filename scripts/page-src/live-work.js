
/* ---------- visual runners: animate what the AI employees are doing on the server ---------- */
const EXAMPLES = {
  sasa:['安排下周三和供应商开会的议程','整理本周各部门周报'],
  nana:['写一份新品上市的 Meta 广告投放方案','给玫瑰精华液写 5 组广告文案'],
  mimi:['写 3 条下周的 IG 帖子文案','策划一条开箱 Reels'],
  kiki:['写一套新品咨询的 WhatsApp 回复话术','整理退换货的标准回复'],
  lulu:['写双 12 促销海报的画面方案','做一版圣诞主题的视觉方向'],
  bobo:['写一条新品开箱短视频的分镜脚本','把直播精华剪辑方案写出来'],
  wawa:['做一份每日发货检查清单','写一份新品上市的库存与发货排期'],
};
const rsleep = ms => new Promise(r => setTimeout(r, ms));
async function until(pred, ms=400){while(!pred()) await rsleep(ms)}
const DONE = t => t.status==='done' || t.status==='failed';
const agentBusy = new Set(), waiters = [];
function acquire(ids){return new Promise(res => {const tryIt = () => {if(ids.every(i=>!agentBusy.has(i))){ids.forEach(i=>agentBusy.add(i)); res(); return true} return false}; if(!tryIt()) waiters.push(tryIt)})}
function releaseAg(ids){ids.forEach(i=>agentBusy.delete(i)); for(let i=0;i<waiters.length;){if(waiters[i]()) waiters.splice(i,1); else i++}}
let bossQ = Promise.resolve(), bossN = 0;
function withBoss(fn){bossN++; const p = bossQ.then(fn).finally(()=>{bossN--}); bossQ = p.catch(()=>{}); return p}
function vfx(id,ev){const a = AG[id]; a.act[a.act.length-1]++; renderSpark(id); react(id,ev)}
async function visReview(t,id){
  const a = AG[id];
  while(true){
    if(bossN>0) setState(id,'waiting','排队等 Wilson 有空审阅','等老板…');
    const r = await withBoss(async () => {
      hold('wilson'); await go('wilson',AG.wilson.home);
      setState(id,'handoff','把成果送给 Wilson','送审'); a.carry = true; vfx(id,'handoff');
      await go(id,BOSS_VISIT);
      a.carry = false; AG.wilson.reading = true;
      setState('wilson','reviewing',`审阅 ${a.name} 的成果`,'review()'); setState(id,'waiting','等待 Wilson 审批','');
      await until(() => t.status!=='review');
      AG.wilson.reading = false;
      const res = t.status;
      if(res==='done'){
        vfx('wilson','approved');
        setState('wilson','done','已批准，辛苦了','干得漂亮！'); setState(id,'done','获得批准','Yay!');
        a.jump = 0.6; setTimeout(()=>{AG.wilson.jump = 0.6},150);
        await rsleep(2200);
      } else if(res==='revising'){
        setState('wilson','office','要求修改','这里再改改'); a.say = {text:'好的，马上改！', until:performance.now()+1600};
        await rsleep(1200);
      }
      AG.wilson.bubble = null; setState('wilson','office','在办公室处理邮件',null); release('wilson');
      return res;
    });
    if(r!=='revising') return r;
    await go(id,a.home); setState(id,'working','根据 Wilson 的意见修改','revise()'); vfx(id,'tool_call');
    await until(() => t.status!=='revising');
    if(t.status!=='review') return t.status;
  }
}
async function visEmp(t){
  const id = t.who, a = AG[id], sub = t.auto ? '⚡ '+t.title : '老板交代';
  await acquire([id]); hold(id);
  try{
    if(t.auto){pop(id,'⚡','#ffd166'); a.say = {text:'⚡ '+t.title, until:performance.now()+1800}}
    else if(t.status==='queued' || t.stage==='think'){
      beam(AG.wilson.pos, a.seat, '#ffd166');
      if(!held.has('wilson')) AG.wilson.say = {text:`${a.name}，交给你了！`, until:performance.now()+1800};
      setTimeout(()=>{a.say = {text:'收到，老板！', until:performance.now()+1500}; vfx(id,'received')}, 1400);
    }
    setState(id,'thinking', t.auto ? `${sub}：准备中` : `理解任务：${t.title}`);
    if(a.loc!==a.home) await go(id,a.home);
    let lastStep = -1, tick = 0;
    while(!DONE(t) && t.status!=='review'){
      if(t.status==='revising'){if(a.state!=='working' || a.bubble!=='revise()') setState(id,'working','根据 Wilson 的意见修改','revise()')}
      else if(t.step && t.step.i!==lastStep){
        lastStep = t.step.i;
        const target = t.step.st && a.station ? a.station : a.home;
        if(a.loc!==target){setState(id,'working',`${sub}：${t.step.st?'前往工作区':'回到工位'}`,null); await go(id,target)}
        setState(id,'working',`${sub}：${t.step.desc}`, t.step.tool+'()'); vfx(id,'tool_call');
        a.phone = id==='mimi' && !!t.step.st;
      } else if(a.state==='working' && ++tick % 10 === 0){a.bubble = tick % 20 ? pickR(QUIP[id]) : (t.step ? t.step.tool+'()' : null)}
      await rsleep(400);
    }
    a.phone = false;
    if(a.loc!==a.home) await go(id,a.home);
    if(t.status==='failed'){setState(id,'waiting','出错了：'+(t.error||''),'出错了…'); await rsleep(3000)}
    else if(t.status==='review') await visReview(t,id);
    else {
      vfx(id,'done'); setState(id,'done', t.auto ? `⚡ 自动化完成：${t.title}` : '任务完成，已汇报 Wilson','完成 ✓');
      if(!t.auto && !held.has('wilson')) setTimeout(()=>{AG.wilson.say = {text:`收到，辛苦了 ${a.name}！`, until:performance.now()+1800, happy:true}}, 600);
      await rsleep(1600);
    }
  } finally {
    a.carry = false; setRoutine(id); release(id); releaseAg([id]);
  }
}
async function visTeam(t){
  await acquire([...TEAM]); busy = true; ALL.forEach(hold); foos.on = false;
  try{
    TEAM.forEach(id=>setState(id,'routine','收到通知，回到工位',null)); setState('wilson','office','在办公室',null);
    await Promise.all(ALL.map(id=>go(id,AG[id].home)));
    if(t.status==='queued' || t.stage==='plan'){
      setState('wilson','working','撰写任务简报','brief()'); await rsleep(1200);
      setState('wilson','office','任务已交给 Sasa','Sasa，交给你了！'); beam(AG.wilson.pos, AG.sasa.seat, '#ffd166');
      await rsleep(1600); AG.sasa.say = {text:'收到，老板！', until:performance.now()+1500}; vfx('sasa','received');
      setState('wilson','office','等待团队交付',null);
      setState('sasa','thinking','把任务拆给各部门');
      await until(() => t.stage!=='plan' && t.status!=='queued' || DONE(t));
    }
    if(t.stage==='depts' && !DONE(t)){
      hqTarget = 1;
      TEAM.forEach(id=>setState(id,'meeting', id==='sasa'?'主持启动会':'前往 HQ 启动会', ''));
      await Promise.all(TEAM.map(id=>go(id,AG[id].spotPlace)));
      setState('sasa','meeting','分派子任务','分派任务'); vfx('sasa','kickoff');
      Object.entries(t.team||{}).forEach(([id,s])=>{setState(id,'meeting',`领取：${s.sub}`,'收到'); vfx(id,'assigned'); beam(C,AG[id].seat,AG[id].color)});
      await rsleep(2200); hqTarget = 0.15;
      TEAM.forEach(id=>setState(id,'meeting','返回工位',''));
      await Promise.all(TEAM.map(id=>go(id,AG[id].home)));
      setState('sasa','working','跟进各部门进度','track()');
      const seen = {}; let tick = 0;
      while(t.stage==='depts' && !DONE(t)){
        Object.entries(t.team||{}).forEach(([id,s]) => {
          if(seen[id]===s.state) return; seen[id] = s.state;
          if(s.state==='working'){const st = STEPS[id][1] || STEPS[id][0]; setState(id,'working',s.sub, st ? st[0]+'()' : null)}
          if(s.state==='done'){vfx(id,'done'); setState(id,'done',`${s.sub}（已完成）`,'完成 ✓')}
        });
        if(++tick % 12 === 0) TEAM.forEach(id => {if(AG[id].state==='working') AG[id].bubble = pickR(QUIP[id])});
        await rsleep(400);
      }
    }
    if(t.stage==='merge' && !DONE(t)){
      hqTarget = 1;
      TEAM.forEach(id=>setState(id, id==='sasa'?'working':'meeting', id==='sasa'?'汇总各部门成果':'带着成果回到 HQ', id==='sasa'?'merge()':''));
      await Promise.all(TEAM.map(id=>go(id,AG[id].spotPlace)));
      await until(() => t.stage!=='merge' || DONE(t));
      hqTarget = 0.4;
    }
    if(t.status==='review' || t.status==='revising'){
      TEAM.filter(x=>x!=='sasa').forEach(id=>setState(id,'waiting','等待老板批准','等待…'));
      await visReview(t,'sasa'); hold('wilson');
    }
    if(t.status==='done'){
      if(!t.needAp) celebrate('MISSION COMPLETE','任务完成 · 已汇报 Wilson');
      TEAM.forEach(id=>setState(id,'done', id==='sasa'?'方案完成':'本轮协作完成','Yay!'));
      ALL.forEach((id,i)=>setTimeout(()=>{AG[id].jump=0.6},i*110));
      await rsleep(2800);
    } else if(t.status==='failed'){setState('sasa','waiting','出错了：'+(t.error||''),'出错了…'); await rsleep(3000)}
  } finally {
    hqTarget = 0.15;
    await Promise.all(TEAM.map(id=>go(id,AG[id].home)));
    TEAM.forEach(id=>setRoutine(id)); setState('wilson','office','在办公室处理邮件',null);
    ALL.forEach(release); busy = false; releaseAg([...TEAM]);
  }
}

/* ---------- live data from Firestore (called by app.js) ---------- */
const started = new Set(); let firstLoad = true;
function pickFocus(){
  const mine = tasks.filter(t=>!t.auto);
  focus = mine.find(t=>!DONE(t)) || mine[0] || null;
  if(focus) $('#mtag').innerHTML = `${DONE(focus)?'上一个任务':focus.who==='all'?'Wilson → 全公司':'Wilson → '+AG[focus.who].name}：<b>${esc(focus.title)}</b>${focus.status==='done'?' · 已完成':''}`;
}
function applyTasks(list){
  const seen = new Set();
  list.forEach(d => {
    seen.add(d.id);
    let t = byId.get(d.id);
    if(t){['decision','step','team','error'].forEach(k=>{if(!(k in d)) delete t[k]}); Object.assign(t,d)}
    else {t = Object.assign({}, d); byId.set(d.id,t); tasks.push(t)}
    if(!started.has(t.id)){
      started.add(t.id);
      if(!(firstLoad && DONE(t)) && !DONE(t) && (t.who==='all' || AG[t.who])) (t.who==='all' ? visTeam : visEmp)(t).catch(e=>console.error(e));
    }
  });
  for(let i=tasks.length-1;i>=0;i--) if(!seen.has(tasks[i].id)){byId.delete(tasks[i].id); tasks.splice(i,1)}
  tasks.sort((x,y)=>(tsMs(y.createdAt)||Date.now())-(tsMs(x.createdAt)||Date.now()));
  firstLoad = false;
  pickFocus(); renderFocus(); renderTasks(); renderReview(); updateQueue(); renderStats();
}
function applyEvents(list){
  logEl.innerHTML = list.map(e => {
    const a = AG[e.agent] || AG.wilson, extra = Object.fromEntries(Object.entries(e).filter(([k])=>!['id','agent','event','ts','taskId'].includes(k)));
    const json = esc(JSON.stringify(Object.assign({agent:e.agent, event:e.event}, extra))).replace(`&quot;${e.agent}&quot;`, `<b>&quot;${e.agent}&quot;</b>`);
    return `<div class="ev" style="--c:${a.tag||a.color}"><span class="t">${hmOf(tsMs(e.ts))}</span><code>${json}</code></div>`;
  }).join('');
  $('#evn').textContent = list.length+' 条';
}
function applyAutos(map){
  Object.values(AUTO_BY).forEach(u => {const s = map[u.key] || {}; u.on = s.on ?? (ORG.autos.find(x=>x.key===u.key)||{}).on; u.runs = s.runs || 0; u.last = s.last});
  TEAM.forEach(renderCard); renderStats();
  if(dlg.open && dlg.dataset.id) openRole(dlg.dataset.id);
}
function applySettings(s){rule = s.aprule || 'smart'; $('#aprule').value = rule}
let requests = [], members = [];
function applyRequests(list){requests = list; const b = $('#memBtn'); b.hidden = !session.isOwner; b.textContent = list.length ? `团队成员 · ${list.length} 个申请` : '团队成员'; if($('#memDlg').open) renderMembers()}
function applyMembers(list){members = list; if($('#memDlg').open) renderMembers()}
function renderMembers(){
  $('#memBody').innerHTML = `<h4>等你批准</h4>${requests.length ? requests.map(r=>`<div class="au"><div><b>${esc(r.name||'')}</b><small>${esc(r.email||r.uid)}</small></div><button type="button" data-ok="${r.uid}">批准进入</button></div>`).join('') : '<p class="tip">没有新的申请。</p>'}
    <h4>已在办公室</h4>${members.map(m=>`<div class="au"><div><b>${esc(m.name||'')}${m.role==='owner'?'（老板）':''}</b><small>${esc(m.email||m.uid)}</small></div>${m.role==='owner'?'':`<button type="button" data-rm="${m.uid}">移除</button>`}</div>`).join('')}`;
}
$('#memBody').addEventListener('click', async e => {
  const b = e.target.closest('button'); if(!b) return;
  try{
    if(b.dataset.ok){await window.DB.approveMember(b.dataset.ok, requests.find(r=>r.uid===b.dataset.ok)||{}); toast('已批准')}
    if(b.dataset.rm && confirm('确定把这个人移出办公室吗？')){await window.DB.removeMember(b.dataset.rm); toast('已移除')}
  }catch(err){toast('操作失败：'+err.message)}
});
$('#memBtn').addEventListener('click', () => {renderMembers(); $('#memDlg').showModal()});
$('#memClose').addEventListener('click', () => $('#memDlg').close());
function setSession(s){
  session = s;
  $('#conn').innerHTML = `已上线 · <b>${esc(s.name)}</b>${s.isOwner?'（老板）':''}`;
  $('#aprule').disabled = !s.isOwner;
  $('#memBtn').hidden = !s.isOwner;
  renderTasks(); renderReview();
}
window.OFFICE = {applyTasks, applyEvents, applyAutos, applySettings, applyRequests, applyMembers, setSession, toast};

/* ---------- role sheet dialog ---------- */
const dlg = $('#roleDlg');
const li = arr => (arr||[]).map(x=>`<li>${esc(x)}</li>`).join('');
function openRole(id){
  const a = AG[id], r = ROLES[id] || {};
  dlg.dataset.id = id;
  $('#rdBody').innerHTML = `
    <div class="rdh" style="--c:${a.color}">${PET_SVG}<div><h3 id="rdTitle">${a.name} · ${esc(a.dept)} · ${esc(a.cn)}</h3><p>${esc(r.title||'')}</p></div><button type="button" class="x" aria-label="关闭">✕</button></div>
    <div class="rdg">
      <section><h4>核心职责</h4><ul>${li(r.duty)}</ul></section>
      <section><h4>日常任务</h4><ul>${li(r.daily)}</ul></section>
      <section><h4>交付物</h4><p>${esc(r.deliver||'')}</p><h4>KPI</h4><p>${esc(r.kpi||'')}</p></section>
      <section><h4>必须 Wilson 批准</h4><ul>${li(r.approve)}</ul><h4>交接</h4><p>${esc(r.hand||'')}</p></section>
    </div>
    <div><h4>⚡ 自动化 · 到时间由 AI 自动执行，结果记在「任务记录」</h4>
    <div class="autos">${AUTOS[id].map(u=>`<div class="au"><label class="sw"><input type="checkbox" data-key="${u.key}" ${u.on?'checked':''} ${session.isOwner?'':'disabled'} aria-label="开启自动化：${esc(u.n)}"><span></span></label><div><b>${esc(u.n)}</b><small>${esc(u.cad)} · ${u.ap?'完成后需你批准':'自动完成，不用批准'} · 已运行 ${u.runs} 次${u.needs?` · <span class="need">需先接入 ${esc(u.needs)}，现在只出草稿</span>`:''}</small></div>${session.isOwner?`<button type="button" data-run="${u.key}">立即运行</button>`:''}</div>`).join('')}</div></div>
    <div class="rdf"><button type="button" class="go" data-assign="1">派任务给 ${a.name}</button></div>`;
  $('#rdBody').onclick = async e => {
    const b = e.target.closest('button'); if(!b) return;
    if(b.classList.contains('x')) dlg.close();
    else if(b.dataset.assign){dlg.close(); assignTo(id)}
    else if(b.dataset.run){b.disabled = true; b.textContent = '已触发…'; try{await window.DB.runAuto(b.dataset.run); toast('已触发，几秒后会出现在任务记录')}catch(err){toast('触发失败：'+err.message)}}
  };
  $('#rdBody').onchange = async e => {const c = e.target; if(c.dataset.key){try{await window.DB.setAuto(c.dataset.key, c.checked)}catch(err){c.checked = !c.checked; toast('保存失败：'+err.message)}}};
  if(!dlg.open) dlg.showModal();
}
dlg.addEventListener('click', e => {if(e.target===dlg) dlg.close()});
dlg.addEventListener('close', () => {delete dlg.dataset.id});

/* ---------- controls ---------- */
const taskEl = $('#task'), goEl = $('#go'), preEl = $('#presets'), whoEl = $('#who');
let assignee = 'all';
function renderWho(){
  whoEl.innerHTML = [['all','全公司','#ffd166'], ...TEAM.map(id=>[id,`${AG[id].name} · ${AG[id].cn}`,AG[id].color])]
    .map(([id,lab,c])=>`<button type="button" data-who="${id}" style="--c:${c}" aria-pressed="${id===assignee}"><i></i>${lab}</button>`).join('');
}
whoEl.addEventListener('click', e => {const b = e.target.closest('button'); if(b) selectWho(b.dataset.who)});
function selectWho(id){
  assignee = id; renderWho(); renderPresets();
  $('#tasklb').textContent = id==='all' ? '② Wilson，今天想让团队做什么？' : `② Wilson，要 ${AG[id].name}（${AG[id].dept} · ${AG[id].cn}）做什么？`;
  taskEl.placeholder = id==='all' ? '例如：下个月办一场会员答谢直播' : `例如：${EXAMPLES[id][0]}`;
}
function assignTo(id){selectWho(id); taskEl.scrollIntoView({behavior:'smooth', block:'center'}); taskEl.focus({preventScroll:true})}
function renderPresets(){
  preEl.innerHTML = '';
  const list = assignee==='all' ? SCN.map(s=>[s.chip,s.title]) : EXAMPLES[assignee].map(x=>[x,x]);
  list.forEach(([lab,val]) => {const b = document.createElement('button'); b.type = 'button'; b.textContent = lab; b.addEventListener('click',()=>{taskEl.value = val; taskEl.focus()}); preEl.appendChild(b)});
}
function parseAt(v){
  const m = v.match(/^[@＠]\s*([^\s:：,，]+)[\s:：,，]*([\s\S]*)$/);
  if(!m) return null;
  const key = m[1].toLowerCase();
  const id = TEAM.find(x => AG[x].name.toLowerCase()===key || AG[x].cn===m[1] || x===key);
  return id ? {who:id, text:m[2].trim() || v} : null;
}
goEl.addEventListener('click', async () => {
  const v = taskEl.value.trim(); if(!v){taskEl.focus(); return}
  if(!window.DB){toast('还没连上数据库，请稍等'); return}
  const at = parseAt(v);
  goEl.disabled = true;
  try{await window.DB.createTask(at ? at.text : v, at ? at.who : assignee); taskEl.value = ''; toast('已派出')}
  catch(e){toast('派任务失败：'+e.message)}
  goEl.disabled = false;
});
taskEl.addEventListener('keydown', e => {if(e.key==='Enter' && (e.ctrlKey || e.metaKey)){e.preventDefault(); goEl.click()}});
$('#aprule').addEventListener('change', async e => {try{await window.DB.setRule(e.target.value); toast('审批规则已保存')}catch(err){e.target.value = rule; toast('保存失败：'+err.message)}});
document.querySelectorAll('[data-sp]').forEach(b=>b.addEventListener('click',()=>{
  speed = +b.dataset.sp; document.querySelectorAll('[data-sp]').forEach(x=>x.setAttribute('aria-pressed', x===b?'true':'false'));
}));
document.querySelectorAll('[data-tod]').forEach(b=>b.addEventListener('click',()=>{
  todMode = b.dataset.tod; document.querySelectorAll('[data-tod]').forEach(x=>x.setAttribute('aria-pressed', x===b?'true':'false'));
  $('#clock').textContent = clockText();
}));
function toWorld(e){const r = cv.getBoundingClientRect(); return [(e.clientX-r.left-W/2-cam.x)/zoom+W/2, (e.clientY-r.top-H/2-cam.y)/zoom+H/2]}
function hit(e){
  const [x,y] = toWorld(e);
  return ALL.find(id=>{const a=AG[id], [px,py]=P(a.pos.x,a.pos.y,a.z); return Math.hypot(px-x,py-TW*0.5*PS*0.9-y) < TW*0.6*PS});
}
function hitBot(e){const [x,y] = toWorld(e), [px,py] = P(bot.pos.x,bot.pos.y,0.1); return Math.hypot(px-x,(py-y)*1.6) < TW*0.45}
cv.addEventListener('click',e=>{const id=hit(e); if(id){greet(id); if(id!=='wilson') setTimeout(()=>openRole(id), 350)} else if(hitBot(e)){bot.spin = 1.2; pop('bot','♪','#3ee6ff',2)}});
cv.addEventListener('mousemove',e=>{const r=cv.getBoundingClientRect(); mouse={x:e.clientX-r.left,y:e.clientY-r.top}; cv.style.cursor = (hit(e)||hitBot(e))?'pointer':'default'});
cv.addEventListener('mouseleave',()=>{mouse=null});

ALL.forEach(id=>{renderCard(id); renderSpark(id)});
renderWho(); renderPresets(); renderTasks(); renderFocus(); updateQueue(); renderStats();
buildFurniture();
resize();
new ResizeObserver(()=>resize()).observe(stage);
if(document.fonts) document.fonts.ready.then(()=>renderAllBG());
requestAnimationFrame(frame);
})();
</script>
