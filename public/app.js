// Firebase connection for the office page: sign-in gate, live data, and the actions Wilson can take.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, collection, doc, query, orderBy, limit, onSnapshot, addDoc, setDoc, updateDoc, deleteDoc, getDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const $ = (s) => document.querySelector(s);
const O = window.OFFICE;
const gateEl = $("#gate"), gmsg = $("#gmsg"), gbtn = $("#gbtn"), gnote = $("#gnote");
function gate(msg, action, label, note) {
  gateEl.hidden = false; gmsg.textContent = msg; gnote.textContent = note || "";
  gbtn.hidden = !action; gbtn.textContent = label || ""; gbtn.onclick = action ? async () => {
    gbtn.disabled = true;
    try { await action(); } catch (e) { gnote.textContent = "出错了：" + (e.message || e); }
    gbtn.disabled = false;
  } : null;
}

let cfg;
try { cfg = await (await fetch("/__/firebase/init.json")).json(); }
catch (e) { gate("无法读取 Firebase 设置。请用正式网址打开这个页面。"); throw e; }
const app = initializeApp(cfg), auth = getAuth(app), db = getFirestore(app);
const unsubs = [];
const stop = () => { while (unsubs.length) unsubs.pop()(); };
const fail = (what) => (err) => O.toast(`${what}失败：${err.message}`);

onAuthStateChanged(auth, async (user) => {
  stop();
  $("#outBtn").hidden = !user; $("#memBtn").hidden = true;
  if (!user) {
    gate("请先登录。只有 Wilson 和他批准的同事能进入办公室。", () => signInWithPopup(auth, new GoogleAuthProvider()), "用 Google 登录");
    return;
  }
  try {
    const ownerSnap = await getDoc(doc(db, "config", "owner"));
    if (!ownerSnap.exists()) {
      gate(`你好 ${user.displayName || ""}。这个办公室还没有老板账号。`, async () => {
        await setDoc(doc(db, "config", "owner"), { uid: user.uid, email: user.email || "", name: user.displayName || "", claimedAt: serverTimestamp() });
        await setDoc(doc(db, "members", user.uid), { email: user.email || "", name: user.displayName || "", role: "owner" });
        location.reload();
      }, "我是 Wilson，认领这个办公室", "认领后只有你能批准任务；其他人登录后需要你同意才能进入。");
      return;
    }
    const isOwner = ownerSnap.data().uid === user.uid;
    const member = isOwner || (await getDoc(doc(db, "members", user.uid))).exists();
    if (!member) {
      await setDoc(doc(db, "requests", user.uid), { email: user.email || "", name: user.displayName || "", at: serverTimestamp() });
      gate("已经向 Wilson 申请进入。他在办公室里批准后，刷新页面就能进来。", () => signOut(auth), "换个账号登录");
      return;
    }
    gateEl.hidden = true;
    O.setSession({ uid: user.uid, name: user.displayName || user.email || "", isOwner });
    subscribe(isOwner);
  } catch (e) {
    gate("连接数据库失败：" + (e.message || e), () => location.reload(), "重试");
  }
});

function subscribe(isOwner) {
  unsubs.push(onSnapshot(query(collection(db, "tasks"), orderBy("createdAt", "desc"), limit(80)),
    (s) => O.applyTasks(s.docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: "estimate" }) }))), fail("读取任务")));
  unsubs.push(onSnapshot(query(collection(db, "events"), orderBy("ts", "desc"), limit(60)),
    (s) => O.applyEvents(s.docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: "estimate" }) }))), fail("读取事件")));
  unsubs.push(onSnapshot(collection(db, "automations"),
    (s) => O.applyAutos(Object.fromEntries(s.docs.map((d) => [d.id, d.data()]))), fail("读取自动化")));
  unsubs.push(onSnapshot(doc(db, "settings", "main"), (s) => O.applySettings(s.data() || {}), fail("读取设置")));
  if (isOwner) {
    unsubs.push(onSnapshot(collection(db, "requests"), (s) => O.applyRequests(s.docs.map((d) => ({ uid: d.id, ...d.data() }))), fail("读取申请")));
    unsubs.push(onSnapshot(collection(db, "members"), (s) => O.applyMembers(s.docs.map((d) => ({ uid: d.id, ...d.data() }))), fail("读取成员")));
  }
}

window.DB = {
  createTask: (title, who, page) => addDoc(collection(db, "tasks"), { title, who, auto: false, status: "queued", createdBy: auth.currentUser.uid, createdAt: serverTimestamp(), ...(page ? { page } : {}) }),
  decide: (id, ok, note) => updateDoc(doc(db, "tasks", id), { decision: ok ? "approve" : "revise", decisionNote: note || "", decidedAt: serverTimestamp() }),
  setAuto: (key, on) => setDoc(doc(db, "automations", key), { on }, { merge: true }),
  runAuto: (key) => setDoc(doc(db, "automations", key), { runNow: true }, { merge: true }),
  setRule: (v) => setDoc(doc(db, "settings", "main"), { aprule: v }),
  approveMember: async (uid, r) => {
    await setDoc(doc(db, "members", uid), { email: r.email || "", name: r.name || "", role: "member" });
    await deleteDoc(doc(db, "requests", uid));
  },
  removeMember: (uid) => deleteDoc(doc(db, "members", uid)),
};
$("#outBtn").addEventListener("click", () => signOut(auth));
