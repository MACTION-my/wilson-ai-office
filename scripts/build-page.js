// One-off build: turns the approved design demo (design-demo.html) into the live page (public/index.html)
// by removing the fake data / simulated scheduler and wiring in the Firestore-driven parts from scripts/page-src.
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const src = (f) => fs.readFileSync(path.join(root, f), "utf8");
let s = src("design-demo.html");

function rep(find, to) {
  if (typeof find === "string") {
    if (!s.includes(find)) throw new Error("not found: " + find.slice(0, 80));
    s = s.replace(find, () => to);
  } else {
    if (!find.test(s)) throw new Error("no match: " + find);
    s = s.replace(find, () => to);
  }
}
function cut(startMark, endMark, to) {
  const a = s.indexOf(startMark); if (a < 0) throw new Error("start not found: " + startMark);
  const b = endMark === null ? s.length : s.indexOf(endMark, a); if (b < 0) throw new Error("end not found: " + endMark);
  s = s.slice(0, a) + to + (endMark === null ? "" : s.slice(b + endMark.length));
}

/* ---- header, panels, dialogs ---- */
rep('<span class="chip">演示模式 · <b>模拟事件与示例数据</b></span>',
  '<span class="chip" id="conn">连接中…</span><button type="button" class="chip cbtn" id="memBtn" hidden>团队成员</button><button type="button" class="chip cbtn" id="outBtn" hidden>退出</button>');
cut('<div class="review" id="review" hidden>', '</div>\n        </div>',
  '<div class="review" id="review" hidden>\n          <b>待你审批</b><span id="rvTitle"></span><span id="rvSum"></span>\n          <textarea id="rvNote" placeholder="修改意见（退回时填写，可以留空）"></textarea>\n          <div class="rvb"><button type="button" class="ap" id="approve">批准 ✓</button><button type="button" id="revise">退回修改</button><button type="button" id="rvDoc">看全文</button></div>\n        </div>');
cut('<section class="panel how">', '</section>', `<section class="panel how">
      <h2>现在接上了什么</h2>
      <p class="lead">这是正式版：任务和审批存在 Firestore，7 位员工由 Claude 真正产出内容，自动化按时间表在云端运行。目前还没有接入外部账号，所以员工交的是方案、文案、清单和脚本，对外操作仍由人来执行。</p>
      <div class="steps">
        <div class="step"><h3><small>01</small>已经可以用</h3><p>派任务给全公司或某位员工、审批与退回修改、自动化、任务记录、团队成员管理，手机和电脑同步。</p></div>
        <div class="step"><h3><small>02</small>下一步接入</h3><p>Meta 广告后台、WhatsApp Business、Instagram / Facebook 账号、订单系统。接上后，标着「需先接入」的自动化就能真的执行。</p></div>
        <div class="step"><h3><small>03</small>安全规则</h3><p>花钱、对外发布、群发都要 Wilson 批准；只有 Wilson 批准的人能登录；AI 的密钥只放在云端，不在网页里。</p></div>
      </div>
    </section>`);
rep('<dialog id="roleDlg" aria-labelledby="rdTitle"><div class="rd" id="rdBody"></div></dialog>',
  `<dialog id="roleDlg" aria-labelledby="rdTitle"><div class="rd" id="rdBody"></div></dialog>
  <dialog id="docDlg" class="dlg" aria-labelledby="docTitle"><div class="rd"><div class="rdh"><div><h3 id="docTitle"></h3><p>AI 员工交付的完整内容</p></div><button type="button" class="x" id="docClose" aria-label="关闭">✕</button></div><pre class="docbody" id="docBody"></pre><div class="timgs big" id="docImgs"></div><div class="rdf"><button type="button" class="go" id="docCopy">复制全文</button></div></div></dialog>
  <dialog id="memDlg" class="dlg" aria-label="团队成员"><div class="rd"><div class="rdh"><div><h3>团队成员</h3><p>批准同事进入办公室</p></div><button type="button" class="x" id="memClose" aria-label="关闭">✕</button></div><div id="memBody" class="autos"></div></div></dialog>
  <div class="toast" id="toast" hidden role="status"></div>
  <div class="gate" id="gate"><div class="gcard"><h2>Wilson 的 AI 办公室</h2><p id="gmsg">正在连接…</p><button type="button" class="go" id="gbtn" hidden></button><p class="tip" id="gnote"></p></div></div>`);
rep("<script>\n(() => {", '<script src="org.js"></script>\n<script>\n(() => {');

/* ---- CSS ---- */
rep("dialog#roleDlg{", "dialog#roleDlg,dialog.dlg{");
rep("dialog#roleDlg::backdrop{", "dialog#roleDlg::backdrop,dialog.dlg::backdrop{");
rep(".rdf .go{width:auto;padding:8px 16px}", `.rdf .go{width:auto;padding:8px 16px}
[hidden]{display:none!important}
.gate{position:fixed;inset:0;z-index:50;background:rgba(5,4,18,.94);display:grid;place-items:center;padding:16px}
.gcard{max-width:420px;width:100%;box-sizing:border-box;background:#141133;border:1px solid var(--line);border-radius:16px;padding:24px;text-align:center}
.gcard h2{font:700 22px var(--f-display);margin:0 0 8px}
.gcard p{color:var(--muted);margin:0 0 12px}
.cbtn{background:transparent;cursor:pointer;font:inherit;font-size:12px;color:var(--fg)}
.cbtn:focus-visible{outline:2px solid var(--gold);outline-offset:2px}
.terr{font-size:12px;color:#ff8a9a}
#rvSum{display:block;color:var(--muted);font-size:12px;margin-top:4px}
#rvNote{width:100%;box-sizing:border-box;margin-top:8px;min-height:44px;background:rgba(0,0,0,.28);border:1px solid var(--line);border-radius:8px;color:var(--fg);font:13px var(--f-body);padding:6px 8px;resize:vertical}
.docbody{white-space:pre-wrap;word-break:break-word;font:13.5px/1.7 var(--f-body);background:rgba(0,0,0,.25);border:1px solid var(--line);border-radius:10px;padding:14px;max-height:60vh;overflow:auto;margin:0}
.toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:60;background:#1d1a48;border:1px solid var(--line);border-radius:10px;padding:8px 14px;font-size:13px;max-width:calc(100vw - 32px)}
.need{color:var(--warn)}
.timgs{display:grid;grid-template-columns:repeat(auto-fill,minmax(84px,1fr));gap:6px}
.timgs.big{grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px}
.timgs.big:empty{display:none}
.timgs img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:10px;border:1px solid var(--line);display:block;transition:transform .2s}
.timgs a:hover img{transform:scale(1.03)}
.dbtn.wa{display:inline-flex;align-items:center;text-decoration:none;background:#25d366;border-color:#25d366;color:#04200f;font-weight:600}
.dbtn.wa:hover{filter:brightness(1.06);background:#25d366}
.tag.qa-ok{background:rgba(52,211,153,.16);color:var(--ok)}
.tag.qa-bad{background:rgba(251,191,36,.16);color:var(--warn)}
.rd h4{margin-top:4px}`);

/* ---- remove fake KPI numbers ---- */
cut("const KPI = {", "KPI.wawa[1].b = 98.1;\n", "");
rep("KPI.nana[0].v.toFixed(1)+'× ROAS'", "'ROAS ↑'");
rep("'24/7 · '+KPI.kiki[0].v+' 对话'", "'24/7 在线'");
rep(/<div class="kpis">\$\{KPI\[id\][^\n]*<\/div>\n/, '<div class="kpis"><div><span>今日完成</span><b class="s0">0</b></div><div><span>待审批</span><b class="s1">0</b></div><div><span>进行中</span><b class="s2">0</b></div></div>\n');
cut("const ovEl = document.createElement('article');", "}, 2000);\n", `const ovEl = document.createElement('article');
ovEl.className = 'dept ov'; ovEl.style.setProperty('--c','#ffd166');
ovEl.innerHTML = \`<div class="dhead"><svg viewBox="0 0 40 40" aria-hidden="true"><rect x="5" y="22" width="6" height="12" rx="2" fill="currentColor"/><rect x="14" y="14" width="6" height="20" rx="2" fill="currentColor"/><rect x="23" y="18" width="6" height="16" rx="2" fill="currentColor"/><rect x="32" y="8" width="4" height="26" rx="2" fill="currentColor"/></svg><div><div class="dname">公司今日</div><div class="ddept">Wilson &amp; Co. · 实时</div></div><span class="pill" style="--pc:#4dffa6">LIVE</span></div>
  <div class="kpis k4"><div><span>今日派出</span><b id="ov0">0</b></div><div><span>今日完成</span><b id="ov1">0</b></div><div><span>待你审批</span><b id="ov2">0</b></div><div><span>自动化开启</span><b id="ov3">0</b></div></div>\`;
deptsEl.appendChild(ovEl);
`);
rep("el.querySelector('.ac').textContent = a.autoDone||0}", "el.querySelector('.ac').textContent = AUTOS[id].reduce((n,u)=>n+(u.runs||0),0)}");
rep("已自动完成 <b class=\"ac\">0</b> 次", "已自动运行 <b class=\"ac\">0</b> 次");
cut("const logEl = $('#log'); let evCount = 0;", "$('#evn').textContent = (++evCount)+' 条';\n}\n", "const logEl = $('#log');\nfunction emit(id, ev){vfx(id, ev)} // visuals only; the event stream shows server events\n");

/* ---- replace the simulated task system with the live one ---- */
cut("/* ---------- roles & automations ---------- */", null,
  src("scripts/page-src/live-mid.js") + "\n" + src("scripts/page-src/idle.js") + src("scripts/page-src/live-work.js"));

s = s.trimEnd() + '\n<script type="module" src="app.js"></script>\n';
fs.writeFileSync(path.join(root, "public", "index.html"), s);
console.log("public/index.html written", s.length, "chars");
