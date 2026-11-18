/* ---------- idle life ---------- */
const held = new Set();
function hold(id){const a = AG[id]; a.gen = (a.gen||0)+1; held.add(id); a.wander = false; a.carry = a.cup = a.phone = a.reading = false; a.bubble = null}
function release(id){held.delete(id)}
const gensOf = ids => ids.map(id=>AG[id].gen||0);
const alive = (ids,gs) => !busy && ids.every((id,i)=>(AG[id].gen||0)===gs[i]);
function abortIdle(ids,gs){
  foos.on = false;
  ids.forEach((id,i) => {
    const a = AG[id]; if((a.gen||0)!==gs[i]) return;
    a.wander = false; a.cup = a.carry = a.phone = false; a.bubble = null;
    if(busy) return;
    go(id,a.home).then(()=>{if((a.gen||0)===gs[i] && !busy){id==='wilson' ? setState(id,'office','在办公室处理邮件',null) : setRoutine(id)}});
  });
}
async function backHome(id,ok){await go(id,AG[id].home); if(!ok()) return false; setRoutine(id); return true}
const STATION_TXT = {nana:['去大屏前看广告数据','这组受众跑得不错'], mimi:['在补光灯前拍日常 Story','今天也要元气满满！'], lulu:['去画架前画草图','灵感来了'], wawa:['更新流程看板','这单要跟紧'], bobo:['调试摄影机','白平衡好了'], sasa:['去打印会议资料','打印好啦']};
async function wander(id){
  const a = AG[id], g = gensOf([id]), ok = () => alive([id],g), bail = () => abortIdle([id],g);
  a.wander = true;
  if(id==='wilson'){
    const r = Math.random(), dest = r<0.4 ? BOSS_TV : r<0.7 ? BOSS_TANK : BOSS_SHELF;
    setState(id,'office', dest===BOSS_TV ? '看公司实时大屏' : dest===BOSS_TANK ? '给鱼缸里的鱼喂食' : '在书架前翻书', null);
    await go(id,dest); if(!ok()) return bail();
    a.bubble = dest===BOSS_TV ? pickR(['数据不错','订单涨了','团队给力']) : dest===BOSS_TANK ? pickR(['小鱼吃饭啦','今天也很精神']) : pickR(['这本不错','学习一下']);
    if(dest===BOSS_TANK && !RM){const [px,py] = P(5.75,0.65,1.4); burst(px,py,['#ffd166','#ffffff'],10,50)}
    await sleep(2600); if(!ok()) return bail();
    a.bubble = null; await go(id,a.home); if(!ok()) return bail();
    setState(id,'office','在办公室处理邮件',null); a.wander = false; return;
  }
  const r = Math.random();
  if(a.station && r<0.3){
    const txt = STATION_TXT[id];
    setState(id,'away',txt[0],null); await go(id,a.station); if(!ok()) return bail();
    if(id==='mimi'){a.phone = true; a.say = {text:txt[1], until:performance.now()+1800, happy:true}} else a.bubble = txt[1];
    a.state = 'working'; await sleep(3400); if(!ok()) return bail();
    a.phone = false; a.state = 'away'; a.bubble = null; if(id==='sasa') a.carry = true;
    if(!await backHome(id,ok)) return bail();
  } else if(id==='sasa' && r<0.6 && !held.has('wilson')){
    setState(id,'away','给 Wilson 送咖啡','去倒咖啡'); await go(id,COFFEE); if(!ok()) return bail();
    a.bubble = '拿铁做好啦'; await sleep(1200); if(!ok()) return bail();
    if(held.has('wilson')){a.bubble = '老板在忙，等会再送'; if(!await backHome(id,ok)) return bail(); a.wander = false; return}
    a.cup = true; a.bubble = '老板，咖啡'; await go(id,BOSS_VISIT); if(!ok()) return bail();
    a.cup = false; a.bubble = null;
    if(!held.has('wilson')){AG.wilson.say = {text:'谢谢 Sasa！', until:performance.now()+1800, happy:true}; pop('wilson','♥','#ffd166')}
    await sleep(1400); if(!ok()) return bail();
    if(!await backHome(id,ok)) return bail();
  } else if(r<0.55){
    setState(id,'away','去茶水间倒杯咖啡',null); await go(id,COFFEE); if(!ok()) return bail();
    a.cup = true; a.bubble = pickR(['来杯拿铁','续命咖啡','补充能量']);
    await sleep(1600); if(!ok()) return bail();
    a.bubble = null; await go(id,SOFA); if(!ok()) return bail();
    a.bubble = pickR(['休息五分钟','这沙发真舒服']); await sleep(1800); if(!ok()) return bail();
    a.bubble = null; if(!await backHome(id,ok)) return bail();
  } else {
    const oid = pickR(TEAM.filter(x=>x!==id)), b = AG[oid], file = Math.random() < 0.6;
    const what = pickR(['周报草稿','素材链接','会议纪要','数据截图','客户反馈']);
    a.carry = file; setState(id,'away', file ? `给 ${b.name} 送「${what}」` : `去找 ${b.name} 聊两句`, file ? '送文件' : null);
    await go(id,b.visitPlace); if(!ok()) return bail();
    if(file){beam(a.pos,b.seat,a.color); a.carry = false; emit(id,'handoff',{to:oid, payload:what}); b.say = {text:`收到「${what}」`, until:performance.now()+1800}}
    else {a.bubble = pickR(['午饭吃什么？','这个数据好看','周末去哪玩']); b.say = {text:pickR(['好呀！','等我一下','哈哈对']), until:performance.now()+1800}}
    await sleep(1800); if(!ok()) return bail();
    a.bubble = null; if(!await backHome(id,ok)) return bail();
  }
  a.wander = false;
}
async function pairFoos(p,q){
  const ids = [p,q], g = gensOf(ids), ok = () => alive(ids,g), bail = () => abortIdle(ids,g);
  AG[p].wander = AG[q].wander = true;
  setState(p,'away',`和 ${AG[q].name} 踢桌上足球`,'来一局！'); setState(q,'away',`和 ${AG[p].name} 踢桌上足球`,null);
  await Promise.all([go(p,FOOS_L), go(q,FOOS_R)]); if(!ok()) return bail();
  AG[p].bubble = AG[q].bubble = null; foos.on = true; AG[p].state = AG[q].state = 'working';
  await sleep(2600); if(!ok()) return bail();
  const win = Math.random()<0.5 ? p : q, lose = win===p ? q : p;
  AG[win].say = {text:'进球！', until:performance.now()+1600, happy:true}; AG[win].jump = 0.6; pop(win,'★','#ffd166',2);
  AG[lose].say = {text:'再来！', until:performance.now()+1600};
  await sleep(1700); foos.on = false; if(!ok()) return bail();
  const r = await Promise.all([backHome(p,ok), backHome(q,ok)]); if(!r[0] || !r[1]) return bail();
  AG[p].wander = AG[q].wander = false;
}
async function pairShoot(){
  const ids = ['mimi','bobo'], g = gensOf(ids), ok = () => alive(ids,g), bail = () => abortIdle(ids,g), m = AG.mimi, b = AG.bobo;
  m.wander = b.wander = true;
  setState('mimi','away','去摄影棚，Bobo 帮忙拍视频','拍一条！'); setState('bobo','away','给 Mimi 拍短视频',null);
  await Promise.all([go('mimi',SHOOT), go('bobo',STATION.bobo)]); if(!ok()) return bail();
  m.bubble = null; b.state = 'working'; b.bubble = 'Action！'; m.state = 'done';
  await sleep(1400); if(!ok()) return bail();
  b.bubble = null; m.jump = 0.6; m.say = {text:'大家好～', until:performance.now()+1600, happy:true};
  await sleep(1800); if(!ok()) return bail();
  b.say = {text:'完美，收工！', until:performance.now()+1500, happy:true};
  await sleep(900); if(!ok()) return bail();
  const r = await Promise.all([backHome('mimi',ok), backHome('bobo',ok)]); if(!r[0] || !r[1]) return bail();
  m.wander = b.wander = false;
}
setInterval(() => {
  if(busy) return;
  const free = TEAM.filter(id=>!AG[id].wander && !AG[id].path.length && !held.has(id));
  if(free.length >= 3 && Math.random() < 0.8){
    const r = Math.random();
    if(r<0.12 && free.length>=2){const p = pickR(free), q = pickR(free.filter(x=>x!==p)); pairFoos(p,q)}
    else if(r<0.22 && free.includes('mimi') && free.includes('bobo')) pairShoot();
    else {let id = pickR(free); if(id==='kiki' && Math.random()<0.6) id = pickR(free); wander(id)}
  }
  if(!held.has('wilson') && !AG.wilson.wander && !AG.wilson.path.length && Math.random() < 0.15) wander('wilson');
}, 2300);

