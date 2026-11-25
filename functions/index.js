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
import { randomUUID } from "node:crypto";
import { getStorage } from "firebase-admin/storage";
import { GoogleAuth } from "google-auth-library";

const ORG = JSON.parse(readFileSync(new URL("./org.json", import.meta.url), "utf8"));
const REGION = "us-central1"; // same location as the Firestore database (nam5)
const MODEL = "claude-opus-5-5";
const DEPTS = ["nana", "mimi", "kiki", "lulu", "bobo", "wawa"];
const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY");
const META_TOKEN = defineSecret("META_TOKEN");

setGlobalOptions({ region: REGION, maxInstances: 10 });
initializeApp();
const db = getFirestore();

/* ---------- Claude ---------- */
let client = null;
function claude() {
  if (!client) client = new Anthropic({ apiKey: ANTHROPIC_API_KEY.value().trim() });
  return client;
}
async function ask(system, user, effort = "medium", { web = false } = {}) {
  // Server-side fallback: if the request is declined by a safety classifier, the API retries on a fallback model.
  // With web search on, a long search can pause the turn; resending the conversation lets the server resume it.
  const tools = web ? [{ type: "web_search_20260209", name: "web_search", max_uses: 6 }] : null;
  const assistant = [];
  let text = "";
  for (let turn = 0; turn < 5; turn++) {
    const messages = [{ role: "user", content: user }];
    if (assistant.length) messages.push({ role: "assistant", content: assistant });
    const res = await claude().beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort },
      system,
      messages,
      ...(tools ? { tools } : {}),
    });
    if (res.stop_reason === "refusal") throw new Error("Claude 拒绝了这个请求，请换个说法再试");
    text += res.content.filter((b) => b.type === "text").map((b) => b.text).join("");
    if (res.stop_reason !== "pause_turn") break;
    assistant.push(...res.content);
  }
  text = text.trim();
  if (!text) throw new Error("Claude 没有返回内容");
  return text;
}
function systemFor(id, { format = true } = {}) {
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
    ...(a.web ? ["- 你可以上网搜索。说到「流行」「趋势」时要先搜索，附上来源链接，并写明是哪段时间的趋势。"] : []),
    ...(a.images ? ["- 需要配图时，在全文最后另起一行写 [[IMAGE: 用英文写的详细画面描述（主体、构图、光线、风格），画面里不要出现任何文字或 logo]]，最多 2 张。系统会自动用 AI 生成图片并附在交付里。"] : []),
    ...(format ? ["- 第一行写一句话总结（不超过 60 个字，不加任何符号前缀），空一行后再写完整交付内容（可以用 Markdown）。"] : []),
  ].join("\n");
}
function split(text) {
  const lines = text.split("\n");
  const i = lines.findIndex((l) => l.trim());
  const summary = (lines[i] || "").replace(/^[#>*\-\s]+/, "").replace(/\*\*/g, "").trim().slice(0, 120);
  const body = lines.slice(i + 1).join("\n").trim() || text;
  return { summary: summary || "已完成", body };
}

/* ---------- images: Google Imagen on Vertex AI, saved to Firebase Storage ---------- */
const PROJECT = process.env.GCLOUD_PROJECT || "wilson-ai-office";
const BUCKET = `${PROJECT}.firebasestorage.app`;
const gauth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
function takeImages(text) {
  const prompts = [];
  const clean = text.replace(/\[\[IMAGE:\s*([\s\S]*?)\]\]/g, (m, p) => { prompts.push(p.trim()); return ""; }).trim();
  return { clean, prompts };
}
async function imagen(prompt) {
  const token = await gauth.getAccessToken();
  for (const model of ["imagen-4.0-generate-001", "imagen-3.0-generate-002"]) {
    const r = await fetch(`https://us-central1-aiplatform.googleapis.com/v1/projects/${PROJECT}/locations/us-central1/publishers/google/models/${model}:predict`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ instances: [{ prompt }], parameters: { sampleCount: 1, aspectRatio: "1:1" } }),
    });
    if (r.status === 404) continue;
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`图片生成失败（${r.status}）：${(j.error && j.error.message) || ""}`.slice(0, 300));
    const p = j.predictions && j.predictions[0];
    if (!p || !p.bytesBase64Encoded) throw new Error("图片被安全过滤挡下了，换个画面描述再试");
    return Buffer.from(p.bytesBase64Encoded, "base64");
  }
  throw new Error("找不到可用的 Imagen 模型");
}
async function saveImage(taskId, i, buf) {
  const bucket = getStorage().bucket(BUCKET), path = `deliverables/${taskId}/image-${i + 1}.png`, token = randomUUID();
  await bucket.file(path).save(buf, { contentType: "image/png", metadata: { metadata: { firebaseStorageDownloadTokens: token } } });
  return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
}
async function makeImages(ref, prompts) {
  const images = [], errors = [];
  if (!prompts.length) return { images, errors };
  await ref.update({ step: { i: 9, tool: "generate_image", desc: "Lulu 正在生成配图", st: true } });
  await ev(ref.id, "lulu", "tool_call", { tool: "generate_image", count: Math.min(3, prompts.length) });
  for (const [i, prompt] of prompts.slice(0, 3).entries()) {
    try { images.push({ url: await saveImage(ref.id, i, await imagen(prompt)), prompt }); }
    catch (e) { logger.error("image failed", e); errors.push(String(e.message || e)); }
  }
  return { images, errors };
}

/* ---------- Meta: Facebook pages + Ads Manager ---------- */
const GRAPH = "https://graph.facebook.com/v23.0";
const PAGES = Object.fromEntries(((ORG.meta && ORG.meta.pages) || []).map((p) => [p.key, p]));
function metaToken() { try { return (META_TOKEN.value() || "").trim() || null; } catch { return null; } }
async function graph(path, { token, method = "GET", params = {} } = {}) {
  const url = new URL(GRAPH + path), opts = { method };
  const all = { ...params, access_token: token };
  const enc = (v) => (typeof v === "object" ? JSON.stringify(v) : String(v));
  if (method === "GET") for (const [k, v] of Object.entries(all)) url.searchParams.set(k, enc(v));
  else { const body = new URLSearchParams(); for (const [k, v] of Object.entries(all)) body.set(k, enc(v)); opts.body = body; }
  const r = await fetch(url, opts);
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(`Meta：${(j.error && (j.error.error_user_msg || j.error.message)) || r.status}`.slice(0, 300));
  return j;
}
const pageTokens = {};
async function pageToken(pageId) {
  if (!pageTokens[pageId]) pageTokens[pageId] = (await graph(`/${pageId}`, { token: metaToken(), params: { fields: "access_token" } })).access_token;
  return pageTokens[pageId];
}
async function recentPosts(pageId) {
  try {
    const j = await graph(`/${pageId}/posts`, { token: await pageToken(pageId), params: { fields: "message,created_time", limit: 6 } });
    return (j.data || []).filter((p) => p.message).map((p) => `- ${p.message.replace(/\s+/g, " ").slice(0, 280)}`).join("\n");
  } catch (e) { logger.warn("recent posts", e.message); return ""; }
}
async function publishPost(page, text, imageUrl) {
  const tok = await pageToken(page.pageId);
  const j = imageUrl
    ? await graph(`/${page.pageId}/photos`, { token: tok, method: "POST", params: { url: imageUrl, caption: text } })
    : await graph(`/${page.pageId}/feed`, { token: tok, method: "POST", params: { message: text } });
  const id = j.post_id || j.id;
  return { id, url: id.includes("_") ? `https://www.facebook.com/${id.replace("_", "/posts/")}` : `https://www.facebook.com/${id}` };
}
async function createPausedAd(page, ad, imageUrl, title) {
  const tok = metaToken(), act = `act_${page.adAccount}`;
  const acct = await graph(`/${act}`, { token: tok, params: { fields: "currency" } });
  const minor = ["JPY", "KRW", "IDR", "VND", "CLP", "COP", "TWD", "HUF", "ISK"].includes(acct.currency) ? 1 : 100;
  const budget = Math.min(500, Math.max(10, Number(ad.daily_budget) || 30));
  const age = (v, d) => Math.min(65, Math.max(18, Number(v) || d));
  const name = `AI Office · ${String(ad.name || title).slice(0, 60)}`;
  const link = ad.link || page.link || `https://www.facebook.com/${page.pageId}`;
  const cta = ["LEARN_MORE", "SHOP_NOW", "SIGN_UP", "CONTACT_US"].includes(ad.cta) ? ad.cta : "LEARN_MORE";
  const camp = await graph(`/${act}/campaigns`, { token: tok, method: "POST", params: { name, objective: "OUTCOME_TRAFFIC", status: "PAUSED", special_ad_categories: [], is_adset_budget_sharing_enabled: false } });
  const set = await graph(`/${act}/adsets`, { token: tok, method: "POST", params: {
    name: name + " · 受众", campaign_id: camp.id, daily_budget: Math.round(budget * minor), billing_event: "IMPRESSIONS", optimization_goal: "LINK_CLICKS",
    bid_strategy: "LOWEST_COST_WITHOUT_CAP", status: "PAUSED",
    targeting: { geo_locations: { countries: (ad.countries && ad.countries.length) ? ad.countries : ["MY"] }, age_min: age(ad.age_min, 18), age_max: age(ad.age_max, 65), targeting_automation: { advantage_audience: 0 } } } });
  const bytes = Buffer.from(await (await fetch(imageUrl)).arrayBuffer()).toString("base64");
  const imgs = await graph(`/${act}/adimages`, { token: tok, method: "POST", params: { bytes } });
  const hash = Object.values(imgs.images || {})[0]?.hash;
  if (!hash) throw new Error("广告图上传失败");
  const creative = await graph(`/${act}/adcreatives`, { token: tok, method: "POST", params: { name: name + " · 素材",
    object_story_spec: { page_id: page.pageId, link_data: { image_hash: hash, link, message: ad.primary_text || "", name: ad.headline || "", description: ad.description || "", call_to_action: { type: cta, value: { link } } } } } });
  const adObj = await graph(`/${act}/ads`, { token: tok, method: "POST", params: { name, adset_id: set.id, creative: { creative_id: creative.id }, status: "PAUSED" } });
  return { campaignId: camp.id, adId: adObj.id, budget, currency: acct.currency, url: `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${page.adAccount}&selected_campaign_ids=${camp.id}` };
}
function takeBlocks(text) {
  let post = null, ad = null;
  text = text.replace(/\[\[POST\]\]([\s\S]*?)\[\[\/POST\]\]/, (m, p) => { post = p.trim(); return `\n\n**要发布的帖子：**\n\n${p.trim()}\n`; });
  text = text.replace(/\[\[AD\]\]([\s\S]*?)\[\[\/AD\]\]/, (m, p) => {
    try { ad = JSON.parse(p.trim().replace(/^```(json)?/i, "").replace(/```$/, "").trim()); } catch { ad = null; }
    return ad ? `\n\n**广告设置（批准后在广告帐户建好，先暂停）：** 每日预算 RM ${ad.daily_budget || "?"}，年龄 ${ad.age_min || 18}–${ad.age_max || 65}，地区 ${(ad.countries || ["MY"]).join("/")}，按钮 ${ad.cta || "LEARN_MORE"}${ad.link ? "，链接 " + ad.link : ""}\n` : "";
  });
  return { text: text.trim(), post, ad };
}
async function pagePrompt(id, page) {
  let p = `\n\n这次是给 Facebook 专页「${page.name}」做的。${page.about ? "专页定位：" + page.about : ""}`;
  const posts = metaToken() ? await recentPosts(page.pageId) : "";
  if (posts) p += `\n这个专页最近的帖子（参考它的定位和语气，不要重复）：\n${posts}`;
  if (id === "mimi") p += "\n\n把最终要发出去的帖子正文放在 [[POST]] 和 [[/POST]] 之间（纯文本，不用 Markdown，可以有 emoji 和话题标签），再写一张配图的 [[IMAGE: ...]]。";
  if (id === "nana" && page.adAccount) p += '\n\n最后把推荐的那一版广告设置放在 [[AD]] 和 [[/AD]] 之间，内容是 JSON：{"name":"广告名","primary_text":"主文案","headline":"标题（40 字内）","description":"描述","cta":"LEARN_MORE / SHOP_NOW / SIGN_UP / CONTACT_US 选一个","link":"落地页链接，不知道就留空","daily_budget":每日预算的马币数字,"age_min":18,"age_max":65,"countries":["MY"]}。再写一张广告图的 [[IMAGE: ...]]。';
  if (id === "nana" && !page.adAccount) p += "\n\n注意：这个专页不投广告，只写内容建议，不要写 [[AD]]。";
  return p;
}
async function runMetaActions(ref, t) {
  const page = PAGES[t.page];
  if (!page || (!t.post && !t.ad)) return;
  const outs = [], extra = {};
  if (!metaToken()) {
    outs.push({ who: "Meta", text: "还没接上 Meta，所以没有自动发布 / 建广告。内容在交付里，可以先手动用。" });
  } else {
    if (t.post) {
      try { const r = await publishPost(page, t.post, (t.images || [])[0]?.url); extra.fb = r; outs.push({ who: `已发布到 ${page.name}`, text: r.url }); await ev(ref.id, "mimi", "fb_published", { page: page.name }); }
      catch (e) { outs.push({ who: "FB 发布失败", text: String(e.message || e) }); logger.error("publish", e); }
    }
    if (t.ad) {
      if (!page.adAccount) outs.push({ who: "广告", text: `${page.name} 不投广告，已跳过。` });
      else if (!(t.images || [])[0]) outs.push({ who: "广告没建", text: "没有广告图，先让 Lulu 补图再建广告。" });
      else {
        try { const r = await createPausedAd(page, t.ad, t.images[0].url, t.title); extra.metaAd = r; outs.push({ who: `广告已建好（暂停中）· ${page.adAccountName || page.adAccount}`, text: `每日预算 ${r.currency} ${r.budget}，去 Ads Manager 确认后再开启：${r.url}` }); await ev(ref.id, "nana", "ad_created", { page: page.name }); }
        catch (e) { outs.push({ who: "建广告失败", text: String(e.message || e) }); logger.error("ad", e); }
      }
    }
  }
  if (outs.length) await ref.update({ ...extra, outs: FieldValue.arrayUnion(...outs) });
}

/* ---------- helpers ---------- */
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function ev(taskId, agent, event, extra = {}) {
  await db.collection("events").add({ agent, event, taskId, ...extra, ts: FieldValue.serverTimestamp() });
}
const SENSITIVE = /(预算|花费|付款|采购|补货|群发|发布|上线|投放|推广|广告|ads|折|退款|合作|网红|对外|加钱|买)/i;
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
    const at = t.createdAt ? new Intl.DateTimeFormat("zh-CN", { timeZone: ORG.timezone, month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true }).format(t.createdAt.toDate()) : "";
    const qa = t.qa ? (t.qa.ok ? " [Wawa 验收合格]" : ` [Wawa 验收需改进：${t.qa.note}]`) : "";
    return `- [${t.status}] ${at} ${who}${t.auto ? "（自动化）" : ""}：${t.title}${sum ? " → " + sum : ""}${qa}${t.error ? " 错误：" + t.error : ""}`;
  }).join("\n");
}
async function finish(ref, t, who, summary, body, extra = {}) {
  const needAp = (extra.post || extra.ad) ? true : await needsApproval(t);
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
  const pageKey = t.page || (auto && auto.page) || null, page = pageKey ? PAGES[pageKey] : null;
  if (page) prompt += await pagePrompt(id, page);
  // Claude does the real work during the "main" step; the other steps are short progress markers for the page.
  const callAt = steps.length > 2 ? 1 : steps.length - 1;
  let text = null;
  for (let i = 0; i < steps.length; i++) {
    await ref.update({ stage: "tool", step: steps[i], prog: 1 + i });
    await ev(ref.id, id, "tool_call", { tool: steps[i].tool });
    if (i === callAt) text = await ask(systemFor(id), prompt, "medium", { web: !!ORG.agents[id].web });
    else await wait(2500);
  }
  const { clean, prompts } = takeImages(text);
  const { images, errors } = await makeImages(ref, prompts);
  const blocks = takeBlocks(clean);
  const { summary, body } = split(blocks.text);
  await ref.update({ prog: steps.length + 1 });
  const extra = { ...(images.length ? { images } : {}), ...(page ? { page: page.key } : {}), ...(page && blocks.post ? { post: blocks.post } : {}), ...(page && blocks.ad && page.adAccount ? { ad: blocks.ad } : {}) };
  await finish(ref, t, id, summary, body + (errors.length ? `\n\n（配图有 ${errors.length} 张没生成成功：${errors[0]}）` : ""), extra);
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
  const parts = {}, allPrompts = [];
  await Promise.all(ids.map(async (d) => {
    await ref.update({ [`team.${d}.state`]: "working" });
    await ev(ref.id, d, "tool_call", { subtask: subs[d] });
    const raw = await ask(systemFor(d), `全公司任务：${t.title}\nSasa 分给你的部分：${subs[d]}\n请交付你负责的这部分。`, "medium", { web: !!ORG.agents[d].web });
    const { clean, prompts } = takeImages(raw);
    allPrompts.push(...prompts);
    const { summary, body } = split(clean);
    parts[d] = body;
    await ref.update({ [`team.${d}.state`]: "done", [`team.${d}.summary`]: summary, prog: FieldValue.increment(1),
      outs: FieldValue.arrayUnion({ who: ORG.agents[d].name, text: summary }) });
    await ev(ref.id, d, "done", { subtask: subs[d] });
  }));
  const { images } = await makeImages(ref, allPrompts);
  await ref.update({ stage: "merge", parts, ...(images.length ? { images } : {}) });
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
  { document: "tasks/{id}", secrets: [ANTHROPIC_API_KEY, META_TOKEN], timeoutSeconds: 540, memory: "512MiB" },
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
  { document: "tasks/{id}", secrets: [ANTHROPIC_API_KEY, META_TOKEN], timeoutSeconds: 540, memory: "512MiB" },
  async (event) => {
    const before = event.data.before.data(), t = event.data.after.data(), ref = event.data.after.ref;
    if (before.status !== "review" || before.decision || !t.decision) return;
    const who = t.who === "all" ? "sasa" : t.who;
    try {
      if (t.decision === "approve") {
        await ref.update({ status: "done", stage: "done", decision: FieldValue.delete(), decisionNote: FieldValue.delete(), finishedAt: FieldValue.serverTimestamp(),
          prog: t.total || 1, outs: FieldValue.arrayUnion({ who: "Wilson 已批准", text: t.summary || t.title, final: true }) });
        await ev(ref.id, "wilson", "approved", { task: t.title });
        await runMetaActions(ref, t);
        return;
      }
      const note = (t.decisionNote || "").trim() || "请再完善一下，写得更具体、更可执行。";
      await ref.update({ status: "revising", stage: "revise", decision: FieldValue.delete(), decisionNote: FieldValue.delete() });
      await ev(ref.id, "wilson", "revise", { to: who, note });
      const text = await ask(systemFor(who),
        `任务：${t.title}\n\n你之前交的版本：\n${t.result || ""}\n\nWilson 的修改意见：${note}\n\n请按意见修改后重新交付完整版本。${t.page && PAGES[t.page] ? await pagePrompt(who, PAGES[t.page]) : ""}`);
      const blocks = takeBlocks(takeImages(text).clean);
      const { summary, body } = split(blocks.text);
      await ref.update({ status: "review", stage: "review", result: body, summary,
        ...(blocks.post ? { post: blocks.post } : {}), ...(blocks.ad ? { ad: blocks.ad } : {}),
        outs: FieldValue.arrayUnion({ who: ORG.agents[who].name, text: "已按意见修改：" + summary }) });
      await ev(ref.id, who, "review_requested", { task: t.title, revised: true });
    } catch (e) {
      logger.error("decision failed", ref.id, e);
      await ref.update({ status: "failed", error: String(e.message || e).slice(0, 500) });
    }
  });

/* ---------- automations ---------- */
const TZ_OFFSET = "+08:00"; // Malaysia (Asia/Kuala_Lumpur), no daylight saving
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
  if (s.everyDays) {
    const target = new Date(`${lp.date}T${at}:00${TZ_OFFSET}`).getTime();
    return now.getTime() >= target && (!lastMs || now.getTime() - lastMs >= s.everyDays * 864e5 - 3 * 3600e3);
  }
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

/* ---------- Wawa checks every finished task ---------- */
export const onTaskDone = onDocumentUpdated(
  { document: "tasks/{id}", secrets: [ANTHROPIC_API_KEY], timeoutSeconds: 300, memory: "512MiB" },
  async (event) => {
    const before = event.data.before.data(), t = event.data.after.data(), ref = event.data.after.ref;
    if (before.status === "done" || t.status !== "done" || t.qa) return;
    if (t.who === "wawa" || (t.auto && ["sasa", "wawa"].includes(t.who))) return;
    const owner = t.who === "all" ? "全公司（Sasa 汇总）" : ORG.agents[t.who].name;
    try {
      const verdict = await ask(systemFor("wawa", { format: false }),
        `请验收这个任务有没有按 Wilson 的指令做到位。\nWilson 的指令：${t.title}\n负责人：${owner}\n${(t.images || []).length ? `附了 ${t.images.length} 张 AI 配图。\n` : ""}交付内容：\n${(t.result || "").slice(0, 15000)}\n\n只回答两行：第一行只写「合格」或「需改进」，第二行用一句话说明理由（需改进时写清楚缺什么、谁要补）。`,
        "low");
      const lines = verdict.split("\n").map((x) => x.replace(/\*\*/g, "").trim()).filter(Boolean);
      const ok = /^合格/.test(lines[0] || "");
      const note = (lines.slice(1).join(" ") || lines[0] || "").slice(0, 200);
      await ref.update({ qa: { ok, note, at: FieldValue.serverTimestamp() },
        outs: FieldValue.arrayUnion({ who: ok ? "Wawa 验收合格" : "Wawa 验收：需改进", text: note }) });
      await ev(ref.id, "wawa", "qa", { task: t.title, ok });
    } catch (e) {
      logger.error("qa failed", ref.id, e);
    }
  });
