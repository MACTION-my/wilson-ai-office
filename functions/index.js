// Wilson & Co. AI Office — the 7 AI employees.
// A task written to Firestore `tasks/{id}` is picked up here, worked on with Claude,
// and every step is written back (task fields + `events`) so the office page can animate it.
import { onDocumentCreated, onDocumentUpdated, onDocumentWritten } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { setGlobalOptions } from "firebase-functions/v2";
import { defineSecret } from "firebase-functions/params";
import * as logger from "firebase-functions/logger";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "node:fs";

const ORG = JSON.parse(readFileSync(new URL("./org.json", import.meta.url), "utf8"));
const REGION = "us-central1"; // same location as the Firestore database (nam5)
const MODEL = "claude-opus-5-5";
const DEPTS = ["nana", "mimi", "kiki", "lulu", "bobo", "wawa"];
const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY");

setGlobalOptions({ region: REGION, maxInstances: 10 });
initializeApp();
const db = getFirestore();

/* ---------- Claude ---------- */
let client = null;
function claude() {
  if (!client) client = new Anthropic({ apiKey: ANTHROPIC_API_KEY.value().trim() });
  return client;
}
async function ask(system, user, effort = "medium") {
  // Server-side fallback: if the request is declined by a safety classifier, the API retries on a fallback model.
  const res = await claude().beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort },
    system,
    messages: [{ role: "user", content: user }],
  });
  if (res.stop_reason === "refusal") throw new Error("Claude 拒绝了这个请求，请换个说法再试");
  const text = res.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
  if (!text) throw new Error("Claude 没有返回内容");
  return text;
}
function systemFor(id) {
  const a = ORG.agents[id], r = a.role;
  return [
    `你是 ${ORG.company} 的 ${a.name}，岗位：${r.title}（${a.dept} · ${a.cn}）。`,
    `公司背景：${ORG.context}`,
    `核心职责：${r.duty.join("；")}。`,
    `日常任务：${r.daily.join("；")}。`,
    `交付物：${r.deliver}。KPI：${r.kpi}。`,
    `必须由 Wilson 批准的事：${r.approve.join("、")}。`,
    "工作规则：",
    "- 目前还没有连接任何外部系统（广告后台、WhatsApp、社媒账号、订单系统都没接）。你只能产出可以直接使用的方案、文案、清单、脚本或草稿。不要假装已经执行了对外操作，也不要编造真实数据；需要数据时写明需要什么，并给出标注清楚的合理假设。",
    "- 用简体中文，结构清晰，可以直接交付。",
    "- 第一行写一句话总结（不超过 60 个字，不加任何符号前缀），空一行后再写完整交付内容（可以用 Markdown）。",
  ].join("\n");
}
function split(text) {
  const lines = text.split("\n");
  const i = lines.findIndex((l) => l.trim());
  const summary = (lines[i] || "").replace(/^[#>*\-\s]+/, "").replace(/\*\*/g, "").trim().slice(0, 120);
  const body = lines.slice(i + 1).join("\n").trim() || text;
  return { summary: summary || "已完成", body };
}

/* ---------- helpers ---------- */
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function ev(taskId, agent, event, extra = {}) {
  await db.collection("events").add({ agent, event, taskId, ...extra, ts: FieldValue.serverTimestamp() });
}
const SENSITIVE = /(预算|花费|付款|采购|补货|群发|发布|上线|投放|推广|折|退款|合作|网红|对外|加钱|买)/;
async function needsApproval(t) {
  const s = (await db.doc("settings/main").get()).data() || {};
  const rule = s.aprule || "smart";
  if (rule === "all") return true;
  if (rule === "none") return false;
  if (t.auto) return !!(ORG.autos.find((u) => u.key === t.autoKey) || {}).ap;
  return SENSITIVE.test(t.title);
}
const stepObj = ([tool, desc, st], i) => ({ i, tool, desc, st: !!st });
async function taskDigest(days) {
  const since = Timestamp.fromMillis(Date.now() - days * 864e5);
  const snap = await db.collection("tasks").where("createdAt", ">=", since).orderBy("createdAt", "desc").limit(80).get();
  if (snap.empty) return "（这段时间没有任务记录）";
  return snap.docs.map((d) => {
    const t = d.data(), who = t.who === "all" ? "全公司" : ORG.agents[t.who]?.name;
    const sum = (t.outs || []).find((o) => !o.final)?.text || "";
    return `- [${t.status}] ${who}${t.auto ? "（自动化）" : ""}：${t.title}${sum ? " → " + sum : ""}`;
  }).join("\n");
}
async function finish(ref, t, who, summary, body, extra = {}) {
  const needAp = await needsApproval(t);
  const name = who === "all" ? "Sasa" : ORG.agents[who].name;
  if (needAp) {
    await ref.update({ status: "review", stage: "review", needAp, result: body, summary, ...extra, outs: FieldValue.arrayUnion({ who: name, text: summary }) });
    await ev(ref.id, who === "all" ? "sasa" : who, "review_requested", { task: t.title });
  } else {
    await ref.update({ status: "done", stage: "done", needAp, result: body, summary, ...extra, finishedAt: FieldValue.serverTimestamp(),
      outs: FieldValue.arrayUnion({ who: name, text: summary }, { who: t.auto ? "⚡ 自动完成" : "已完成", text: summary, final: true }) });
    await ev(ref.id, who === "all" ? "sasa" : who, "done", { task: t.title });
  }
}

/* ---------- one employee ---------- */
async function runOne(ref, t) {
  const id = t.who, auto = t.auto ? ORG.autos.find((u) => u.key === t.autoKey) : null;
  const steps = (auto ? auto.steps : ORG.agents[id].steps).map(stepObj);
  await ref.update({ status: "running", stage: "think", prog: 1, total: steps.length + 2, startedAt: FieldValue.serverTimestamp() });
  await ev(ref.id, id, auto ? "automation_start" : "task_start", { task: t.title });
  await wait(2500);
  let prompt = auto ? auto.prompt : `Wilson 交代给你的任务：${t.title}`;
  if (auto?.data === "tasks_1d") prompt += "\n\n任务记录：\n" + (await taskDigest(1));
  if (auto?.data === "tasks_7d") prompt += "\n\n任务记录：\n" + (await taskDigest(7));
  // Claude does the real work during the "main" step; the other steps are short progress markers for the page.
  const callAt = steps.length > 2 ? 1 : steps.length - 1;
  let text = null;
  for (let i = 0; i < steps.length; i++) {
    await ref.update({ stage: "tool", step: steps[i], prog: 1 + i });
    await ev(ref.id, id, "tool_call", { tool: steps[i].tool });
    if (i === callAt) text = await ask(systemFor(id), prompt);
    else await wait(2500);
  }
  const { summary, body } = split(text);
  await ref.update({ prog: steps.length + 1 });
  await finish(ref, t, id, summary, body);
}

/* ---------- whole company: Sasa plans, departments work in parallel, Sasa merges ---------- */
async function runTeam(ref, t) {
  await ref.update({ status: "running", stage: "plan", prog: 0, total: 9, startedAt: FieldValue.serverTimestamp() });
  await ev(ref.id, "sasa", "plan_start", { task: t.title });
  const plan = await ask(systemFor("sasa"),
    `Wilson 交代给全公司的任务：${t.title}\n\n请把它拆给 6 个部门。只输出 6 行，每行严格是「部门代号：这个部门要负责的具体子任务（一句话）」。部门代号只能用：nana（Meta 广告）、mimi（社媒内容）、kiki（WhatsApp 客服）、lulu（平面设计）、bobo（视频）、wawa（运营）。这次不需要参与的部门写「部门代号：本次不参与」。`,
    "low");
  const subs = {};
  for (const line of plan.split("\n")) {
    const m = line.match(/(nana|mimi|kiki|lulu|bobo|wawa)\s*[:：]\s*(.+)$/i);
    if (m && !/不参与/.test(m[2])) subs[m[1].toLowerCase()] = m[2].trim().replace(/\*\*/g, "");
  }
  const ids = DEPTS.filter((d) => subs[d]);
  if (!ids.length) DEPTS.forEach((d) => { subs[d] = `从${ORG.agents[d].cn}角度负责这个任务`; ids.push(d); });
  const team = Object.fromEntries(ids.map((d) => [d, { state: "queued", sub: subs[d] }]));
  await ref.update({ stage: "depts", team, prog: 1, total: ids.length + 3 });
  await ev(ref.id, "sasa", "kickoff", { assigned: ids });
  await wait(6000);
  const parts = {};
  await Promise.all(ids.map(async (d) => {
    await ref.update({ [`team.${d}.state`]: "working" });
    await ev(ref.id, d, "tool_call", { subtask: subs[d] });
    const text = await ask(systemFor(d), `全公司任务：${t.title}\nSasa 分给你的部分：${subs[d]}\n请交付你负责的这部分。`);
    const { summary, body } = split(text);
    parts[d] = body;
    await ref.update({ [`team.${d}.state`]: "done", [`team.${d}.summary`]: summary, prog: FieldValue.increment(1),
      outs: FieldValue.arrayUnion({ who: ORG.agents[d].name, text: summary }) });
    await ev(ref.id, d, "done", { subtask: subs[d] });
  }));
  await ref.update({ stage: "merge", parts });
  await ev(ref.id, "sasa", "tool_call", { tool: "merge_outputs" });
  const merged = await ask(systemFor("sasa"),
    `全公司任务：${t.title}\n\n下面是各部门交上来的成果。请合并成一份给 Wilson 的完整执行方案：先写总体时间线和每个部门负责什么，再写需要 Wilson 拍板的事项，最后附上各部门的关键内容（精简，不要原样照抄）。\n\n` +
    ids.map((d) => `### ${ORG.agents[d].name}（${ORG.agents[d].cn}）\n${parts[d]}`).join("\n\n"));
  const { summary, body } = split(merged);
  await ref.update({ prog: ids.length + 2 });
  await finish(ref, t, "all", summary, body);
}

/* ---------- triggers ---------- */
export const onTaskCreated = onDocumentCreated(
  { document: "tasks/{id}", secrets: [ANTHROPIC_API_KEY], timeoutSeconds: 540, memory: "512MiB" },
  async (event) => {
    const ref = event.data.ref, t = event.data.data();
    if (t.status !== "queued") return;
    try {
      if (t.who === "all") await runTeam(ref, t);
      else if (ORG.agents[t.who]) await runOne(ref, t);
      else throw new Error("未知的员工：" + t.who);
    } catch (e) {
      logger.error("task failed", ref.id, e);
      await ref.update({ status: "failed", error: String(e.message || e).slice(0, 500), finishedAt: FieldValue.serverTimestamp() });
      await ev(ref.id, t.who === "all" ? "sasa" : t.who, "failed", { error: String(e.message || e).slice(0, 200) });
    }
  });

export const onTaskDecision = onDocumentUpdated(
  { document: "tasks/{id}", secrets: [ANTHROPIC_API_KEY], timeoutSeconds: 540, memory: "512MiB" },
  async (event) => {
    const before = event.data.before.data(), t = event.data.after.data(), ref = event.data.after.ref;
    if (before.status !== "review" || before.decision || !t.decision) return;
    const who = t.who === "all" ? "sasa" : t.who;
    try {
      if (t.decision === "approve") {
        await ref.update({ status: "done", stage: "done", decision: FieldValue.delete(), decisionNote: FieldValue.delete(), finishedAt: FieldValue.serverTimestamp(),
          prog: t.total || 1, outs: FieldValue.arrayUnion({ who: "Wilson 已批准", text: t.summary || t.title, final: true }) });
        await ev(ref.id, "wilson", "approved", { task: t.title });
        return;
      }
      const note = (t.decisionNote || "").trim() || "请再完善一下，写得更具体、更可执行。";
      await ref.update({ status: "revising", stage: "revise", decision: FieldValue.delete(), decisionNote: FieldValue.delete() });
      await ev(ref.id, "wilson", "revise", { to: who, note });
      const text = await ask(systemFor(who),
        `任务：${t.title}\n\n你之前交的版本：\n${t.result || ""}\n\nWilson 的修改意见：${note}\n\n请按意见修改后重新交付完整版本。`);
      const { summary, body } = split(text);
      await ref.update({ status: "review", stage: "review", result: body, summary,
        outs: FieldValue.arrayUnion({ who: ORG.agents[who].name, text: "已按意见修改：" + summary }) });
      await ev(ref.id, who, "review_requested", { task: t.title, revised: true });
    } catch (e) {
      logger.error("decision failed", ref.id, e);
      await ref.update({ status: "failed", error: String(e.message || e).slice(0, 500) });
    }
  });

/* ---------- automations ---------- */
const TZ_OFFSET = "+08:00"; // Asia/Singapore, no daylight saving
function localParts(d) {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: ORG.timezone, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" });
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
  const dow = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }[p.weekday];
  return { date: `${p.year}-${p.month}-${p.day}`, dow };
}
function isDue(s, last, now) {
  const lastMs = last ? last.toMillis() : 0;
  if (s.every) return now.getTime() - lastMs >= (s.every - 1) * 60000;
  const lp = localParts(now), at = s.daily || s.at;
  if (s.weekly && lp.dow !== s.weekly) return false;
  const target = new Date(`${lp.date}T${at}:00${TZ_OFFSET}`).getTime();
  return now.getTime() >= target && lastMs < target;
}
async function createAutoTask(u) {
  const open = await db.collection("tasks").where("autoKey", "==", u.key).limit(20).get();
  if (open.docs.some((d) => !["done", "failed"].includes(d.data().status))) return false;
  await db.collection("tasks").add({ title: u.n, who: u.who, auto: true, autoKey: u.key, status: "queued", createdBy: "automation", createdAt: FieldValue.serverTimestamp() });
  await ev(null, u.who, "automation_trigger", { automation: u.n, schedule: u.cad });
  return true;
}
export const automationTick = onSchedule({ schedule: "every 15 minutes", timeZone: ORG.timezone }, async () => {
  const now = new Date();
  for (const u of ORG.autos) {
    const ref = db.doc(`automations/${u.key}`), snap = await ref.get(), st = snap.exists ? snap.data() : {};
    const on = st.on ?? u.on;
    if (!on || !isDue(u.schedule, st.last, now)) continue;
    if (await createAutoTask(u)) await ref.set({ last: Timestamp.fromDate(now), runs: FieldValue.increment(1) }, { merge: true });
  }
});
export const automationRunNow = onDocumentWritten({ document: "automations/{key}" }, async (event) => {
  const after = event.data.after.exists ? event.data.after.data() : null;
  if (!after || after.runNow !== true) return;
  const u = ORG.autos.find((x) => x.key === event.params.key);
  await event.data.after.ref.set({ runNow: false }, { merge: true });
  if (u && await createAutoTask(u)) await event.data.after.ref.set({ last: Timestamp.now(), runs: FieldValue.increment(1) }, { merge: true });
});
