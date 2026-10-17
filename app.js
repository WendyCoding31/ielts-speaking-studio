const STORE_KEY = "ielts-oral-studio-v2";
const BANK_SCROLL_KEY = "ielts-speaking-practice-bank-scroll";
const DEFAULT_INTERVALS = [1, 3, 7, 14, 30, 60];

const state = {
  view: "bank",
  filter: { part: "all", tag: "all", q: "" },
  activeId: null,
  timer: { mode: "prep", remain: 60, running: false, handle: null },
  draftNote: "",
  bankOverview: false,
  bankScrollY: Math.max(0, Number(localStorage.getItem(BANK_SCROLL_KEY)) || 0),
  overviewScrollTop: 0,
  overviewScrollLeft: 0,
  answerTab: "p2"
};

const speechState = {
  recorder: null,
  stream: null,
  chunks: [],
  blob: null,
  url: null,
  recording: false,
  startedAt: 0,
  durationMs: 0,
  lastResult: null,
  status: "idle",
  recordings: []
};

const recordingUrls = new Map();

const saveState = {
  dirHandle: null,
  autoSaving: false
};

function todayISO() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}
function addDays(iso, n) {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
function qText(item) {
  return typeof item === "string" ? item : (item && item.q) || "";
}
function qAnswer(item) {
  return typeof item === "string" ? "" : (item && item.a) || "";
}
function qZh(item) {
  return typeof item === "string" ? "" : (item && item.zh) || "";
}
function fmtDate(iso) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${m}/${d}`;
}

function loadDB() {
  const raw = localStorage.getItem(STORE_KEY);
  if (raw) {
    try { return JSON.parse(raw); } catch (e) {}
  }
  return initDB();
}
function saveDB() {
  localStorage.setItem(STORE_KEY, JSON.stringify(db));
}

function blankProgress(id) {
  return {
    id,
    practiceCount: 0,
    lastPracticed: null,
    nextReview: todayISO(),
    intervalIndex: 0,
    ease: 2.5,
    history: [],
    answers: []
  };
}

function initDB() {
  const progress = {};
  SEED_SETS.forEach((s) => { progress[s.id] = blankProgress(s.id); });
  return {
    createdAt: todayISO(),
    intervals: DEFAULT_INTERVALS.slice(),
    customSets: [],
    progress,
    order: SEED_SETS.map((s) => s.id)
  };
}

let db = loadDB();
SEED_SETS.forEach((s) => {
  if (!db.progress[s.id]) db.progress[s.id] = blankProgress(s.id);
});
ensureOrder();
ensurePacks();
saveDB();

function rawSets() {
  return [...SEED_SETS, ...(db.customSets || [])];
}
function migrateTravelPacks() {
  const ver = window.PACKS_VERSION || 4;
  if (!Array.isArray(db.packs)) return;
  if ((db.packsVersion || 1) >= ver) return;
  db.packs = defaultPacks();
  db.packsVersion = ver;
}

function defaultPacks() {
  return (window.MATERIAL_PACKS || []).map((p) => ({
    id: p.id,
    title: p.title,
    blurb: p.blurb,
    tint: p.tint,
    ids: (p.ids || []).slice()
  }));
}
function ensurePacks() {
  const valid = new Set(rawSets().map((s) => s.id));
  if (!Array.isArray(db.packs) || !db.packs.length) db.packs = defaultPacks();
  migrateTravelPacks();
  db.packs.forEach((p) => {
    p.ids = (p.ids || []).filter((id) => valid.has(id));
    if (!p.title) p.title = "未命名分组";
    if (p.blurb == null) p.blurb = "";
  });
  const placed = new Set();
  db.packs.forEach((p) => (p.ids || []).forEach((id) => placed.add(id)));
  valid.forEach((id) => {
    if (placed.has(id)) return;
    const home = (window.MATERIAL_PACKS || []).find((p) => (p.ids || []).includes(id));
    let pack = home ? db.packs.find((p) => p.id === home.id) : null;
    if (home && !pack) {
      pack = { id: home.id, title: home.title, blurb: home.blurb, tint: home.tint, ids: [] };
      db.packs.push(pack);
    }
    if (!pack) {
      pack = db.packs.find((p) => p.id === "misc");
      if (!pack) {
        pack = { id: "misc", title: "未分组 / 自建", blurb: "还没归进素材包的题目。", tint: "sky", ids: [] };
        db.packs.push(pack);
      }
    }
    pack.ids.push(id);
  });
  migrateSoloPackToTop();
}
function migrateSoloPackToTop() {
  if (db.soloPackOrderVersion >= 1) return;
  const index = db.packs.findIndex((p) => p.id === "solo-p2");
  if (index > 0) db.packs.unshift(db.packs.splice(index, 1)[0]);
  db.soloPackOrderVersion = 1;
}
function ensureOrder() {
  const ids = rawSets().map((s) => s.id);
  const prev = Array.isArray(db.order) ? db.order : [];
  const kept = prev.filter((id) => ids.includes(id));
  const missing = ids.filter((id) => !kept.includes(id));
  db.order = kept.concat(missing);
}
function allSets() {
  ensureOrder();
  const map = {};
  rawSets().forEach((s) => { map[s.id] = s; });
  return db.order.map((id) => map[id]).filter(Boolean);
}
function getSet(id) {
  return allSets().find((s) => s.id === id);
}
function prog(id) {
  if (!db.progress[id]) db.progress[id] = blankProgress(id);
  return db.progress[id];
}

function isDue(p) {
  if (!p.lastPracticed) return false;
  return p.nextReview <= todayISO();
}
function isNewish(p) {
  return p.practiceCount === 0;
}
function mastery(p) {
  if (p.practiceCount >= 5 && p.intervalIndex >= 4) return "掌握中";
  if (p.practiceCount >= 2) return "巩固中";
  if (p.practiceCount >= 1) return "已开口";
  return "未练";
}

function applyReview(id, grade) {
  const p = prog(id);
  const intervals = db.intervals.length ? db.intervals : DEFAULT_INTERVALS;
  let idx = p.intervalIndex || 0;
  if (grade === "again") idx = 0;
  else if (grade === "hard") idx = Math.max(0, idx - 1);
  else if (grade === "good") idx = Math.min(intervals.length - 1, idx + 1);
  else if (grade === "easy") idx = Math.min(intervals.length - 1, idx + 2);

  const days = intervals[idx] || 1;
  p.intervalIndex = idx;
  p.practiceCount += 1;
  p.lastPracticed = todayISO();
  p.nextReview = addDays(todayISO(), days);
  p.history.unshift({
    date: todayISO(),
    time: new Date().toTimeString().slice(0, 5),
    grade,
    interval: days
  });
  saveDB();
  return days;
}

function currentAnswer(p) {
  return p.answers.find((a) => a.id === p.currentAnswerId) || p.answers[0] || null;
}

function splitAnswerContent(content) {
  const text = String(content || "");
  const marker = "--- Part 3 ---";
  const idx = text.indexOf(marker);
  if (idx < 0) return { p2: text.trim(), p3: "" };
  return {
    p2: text.slice(0, idx).trim(),
    p3: text.slice(idx + marker.length).trim()
  };
}

function defaultDraftParts(s) {
  if (!s || s.part === 1) return { p1: defaultDraft(s || {}) };
  const p2 = `Cue: ${s.cue || ""}\n\nOpening:\n\nPoint 1:\n\nPoint 2:\n\nPoint 3:\n\nClosing:`;
  const p3 = (s.part3 || []).map((q, i) => `Q${i + 1}. ${qText(q)}\nA: \n`).join("\n");
  return { p2, p3 };
}

function modelDraftParts(s) {
  if (!s || s.part === 1) return { p1: modelDraft(s || {}) };
  const zh = s.modelAnswerZh ? `\n\n参考译文：${s.modelAnswerZh}` : "";
  const p2 = `Cue: ${s.cue || ""}\n\n${s.modelAnswer || ""}${zh}`;
  const p3 = (s.part3 || []).map((q, i) => {
    const qzh = qZh(q) ? `\n（${qZh(q)}）` : "";
    return `Q${i + 1}. ${qText(q)}\nA: ${qAnswer(q)}${qzh}\n`;
  }).join("\n");
  return { p2, p3 };
}

function getAnswerParts(ans, s) {
  if (!ans) {
    const d = defaultDraftParts(s);
    return { p2: d.p2 || "", p3: d.p3 || "", p2Html: null, p3Html: null };
  }
  if (ans.part2Html != null || ans.part3Html != null || ans.part2Plain != null) {
    return {
      p2: ans.part2Plain != null ? ans.part2Plain : "",
      p3: ans.part3Plain != null ? ans.part3Plain : "",
      p2Html: ans.part2Html || null,
      p3Html: ans.part3Html || null
    };
  }
  const parts = splitAnswerContent(ans.content || "");
  return { p2: parts.p2, p3: parts.p3, p2Html: null, p3Html: null };
}

function collectCurrentAnswerData() {
  const s = getSet(state.activeId);
  if (!s) return null;
  if (s.part === 1) {
    const ed = document.getElementById("answer");
    if (!ed) return null;
    const plain = ed.innerText || ed.textContent || "";
    const html = ed.innerHTML || "";
    return {
      content: plain,
      html: /<mark[^>]*class=["'][^"']*user-highlight/i.test(html) ? html : null
    };
  }
  const p2 = document.getElementById("answer-p2");
  const p3 = document.getElementById("answer-p3");
  const p2Plain = p2 ? (p2.innerText || "") : "";
  const p3Plain = p3 ? (p3.innerText || "") : "";
  const p2Html = p2 ? (p2.innerHTML || "") : "";
  const p3Html = p3 ? (p3.innerHTML || "") : "";
  const hasP2 = /<mark[^>]*class=["'][^"']*user-highlight/i.test(p2Html);
  const hasP3 = /<mark[^>]*class=["'][^"']*user-highlight/i.test(p3Html);
  return {
    content: p2Plain.trim() + "\n\n--- Part 3 ---\n\n" + p3Plain.trim(),
    part2Plain: p2Plain,
    part3Plain: p3Plain,
    part2Html: hasP2 ? p2Html : null,
    part3Html: hasP3 ? p3Html : null
  };
}

function populateAnswerEditors() {
  if (state.view !== "practice") return;
  const s = getSet(state.activeId);
  if (!s) return;
  const p = prog(s.id);
  const ans = currentAnswer(p);
  if (s.part === 1) {
    const ed = document.getElementById("answer");
    if (!ed) return;
    const html = ans && ans.html;
    const plain = ans ? (ans.content || "") : defaultDraft(s);
    if (html && /<mark/i.test(html)) {
      ed.innerHTML = html;
    } else {
      ed.textContent = plain;
    }
  } else {
    const parts = getAnswerParts(ans, s);
    const p2 = document.getElementById("answer-p2");
    const p3 = document.getElementById("answer-p3");
    if (p2) {
      if (parts.p2Html && /<mark/i.test(parts.p2Html)) p2.innerHTML = parts.p2Html;
      else p2.textContent = parts.p2 || "";
    }
    if (p3) {
      if (parts.p3Html && /<mark/i.test(parts.p3Html)) p3.innerHTML = parts.p3Html;
      else p3.textContent = parts.p3 || "";
    }
    switchAnswerTab(state.answerTab || "p2", false);
  }
}

function switchAnswerTab(tab, updateState = true) {
  if (updateState) state.answerTab = tab;
  const p2 = document.getElementById("answer-p2");
  const p3 = document.getElementById("answer-p3");
  const tabs = document.querySelectorAll(".answer-tabs button");
  if (p2) p2.style.display = tab === "p2" ? "block" : "none";
  if (p3) p3.style.display = tab === "p3" ? "block" : "none";
  tabs.forEach(btn => {
    btn.classList.toggle("on", btn.dataset.tab === tab);
  });
}

function highlightSelection() {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || !sel.rangeCount) {
    toast("请先在答案里选中文字");
    return;
  }
  const range = sel.getRangeAt(0);
  const ids = ["answer", "answer-p2", "answer-p3"];
  const editor = ids.map(id => document.getElementById(id)).find(ed => ed && ed.contains(range.commonAncestorContainer));
  if (!editor) {
    toast("请在答案区域内选中文字");
    return;
  }
  try {
    const mark = document.createElement("mark");
    mark.className = "user-highlight";
    range.surroundContents(mark);
  } catch (e) {
    const frag = range.extractContents();
    const mark = document.createElement("mark");
    mark.className = "user-highlight";
    mark.appendChild(frag);
    range.insertNode(mark);
  }
  sel.removeAllRanges();
  toast("已高亮 · 记得点保存");
}

function clearHighlights() {
  const ids = ["answer", "answer-p2", "answer-p3"];
  let count = 0;
  ids.forEach(id => {
    const ed = document.getElementById(id);
    if (!ed) return;
    const marks = Array.from(ed.querySelectorAll("mark.user-highlight"));
    marks.forEach(m => {
      const parent = m.parentNode;
      while (m.firstChild) parent.insertBefore(m.firstChild, m);
      parent.removeChild(m);
      count++;
    });
    if (marks.length) ed.normalize();
  });
  toast(count ? `已取消 ${count} 处高亮` : "当前没有高亮");
}

function saveAnswer(id, data, asNew) {
  const p = prog(id);
  const now = new Date();
  let content = "";
  let extra = {};
  if (typeof data === "string") {
    content = data;
  } else if (data && typeof data === "object") {
    content = data.content || "";
    extra = data;
  }
  if (asNew || !p.answers.length) {
    const ans = {
      id: "v" + now.getTime(),
      content: content,
      createdAt: now.toISOString(),
      label: "v" + (p.answers.length + 1)
    };
    if (extra.html != null) ans.html = extra.html;
    if (extra.part2Html != null) ans.part2Html = extra.part2Html;
    if (extra.part3Html != null) ans.part3Html = extra.part3Html;
    if (extra.part2Plain != null) ans.part2Plain = extra.part2Plain;
    if (extra.part3Plain != null) ans.part3Plain = extra.part3Plain;
    p.answers.push(ans);
    p.currentAnswerId = ans.id;
  } else {
    const cur = currentAnswer(p);
    if (cur) {
      cur.content = content;
      cur.updatedAt = now.toISOString();
      if ("html" in extra) cur.html = extra.html;
      if ("part2Html" in extra) cur.part2Html = extra.part2Html;
      if ("part3Html" in extra) cur.part3Html = extra.part3Html;
      if ("part2Plain" in extra) cur.part2Plain = extra.part2Plain;
      if ("part3Plain" in extra) cur.part3Plain = extra.part3Plain;
    }
  }
  saveDB();
}

function toast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2200);
}

function stats() {
  const sets = allSets();
  const due = sets.filter((s) => isDue(prog(s.id))).length;
  const practiced = sets.filter((s) => prog(s.id).practiceCount > 0).length;
  const sessions = sets.reduce((n, s) => n + prog(s.id).practiceCount, 0);
  const weekStart = addDays(todayISO(), -6);
  const week = sets.reduce((n, s) => {
    return n + prog(s.id).history.filter((h) => h.date >= weekStart).length;
  }, 0);
  return { total: sets.length, due, practiced, sessions, week };
}

function filteredSets() {
  const { part, tag, q } = state.filter;
  const qq = q.trim().toLowerCase();
  return allSets().filter((s) => {
    if (part !== "all" && String(s.part) !== part) return false;
    const p = prog(s.id);
    if (tag === "new" && !s.isNew) return false;
    if (tag === "old" && s.isNew) return false;
    if (tag === "due" && !isDue(p)) return false;
    if (tag === "fresh" && !isNewish(p)) return false;
    if (tag === "done" && isNewish(p)) return false;
    if (qq) {
      const blob = [
        s.topic, s.topicZh, s.cue,
        ...(s.questions || []).map(qText),
        ...(s.part3 || []).map(qText)
      ].join(" ").toLowerCase();
      if (!blob.includes(qq)) return false;
    }
    return true;
  });
}

function navTo(view, id) {
  if (state.view === "bank" && !state.bankOverview) rememberBankScroll();
  state.view = view;
  if (view !== "bank") state.bankOverview = false;
  if (id) state.activeId = id;
  stopTimer(false);
  render();
}

function render() {
  const overview = document.getElementById("bank-overview-scroll");
  if (overview) {
    state.overviewScrollTop = overview.scrollTop;
    state.overviewScrollLeft = overview.scrollLeft;
  }
  const oldOverview = document.getElementById("bank-overview");
  if (oldOverview) oldOverview.remove();
  document.querySelectorAll(".nav button").forEach((b) => {
    b.classList.toggle("active", b.dataset.view === state.view);
  });
  const s = stats();
  document.getElementById("side-due").textContent = s.due;
  const root = document.getElementById("main");
  if (state.view === "home") root.innerHTML = viewHome();
  if (state.view === "bank") root.innerHTML = viewBank();
  if (state.view === "practice") root.innerHTML = viewPractice();
  if (state.view === "review") root.innerHTML = viewReview();
  if (state.view === "settings") root.innerHTML = viewSettings();
  if (state.view === "bank" && state.bankOverview) {
    document.body.insertAdjacentHTML("beforeend", bankOverviewHTML());
  }
  bindView();
  if (state.view === "bank") {
    requestAnimationFrame(() => {
      window.scrollTo({ top: state.bankScrollY, behavior: "auto" });
      const nextOverview = document.getElementById("bank-overview-scroll");
      if (nextOverview) {
        nextOverview.scrollTop = state.overviewScrollTop;
        nextOverview.scrollLeft = state.overviewScrollLeft;
      }
    });
  }
}

function rememberBankScroll() {
  state.bankScrollY = Math.max(0, window.scrollY || 0);
  localStorage.setItem(BANK_SCROLL_KEY, String(state.bankScrollY));
}

function viewHome() {
  const s = stats();
  const dueSets = allSets().filter((x) => isDue(prog(x.id)));
  const fresh = allSets().filter((x) => isNewish(prog(x.id))).slice(0, 4);
  return `
    <div class="topbar">
      <div>
        <h2>今日口述台</h2>
        <div class="desc">把开口练习排进遗忘曲线，而不是临时抱佛脚。</div>
      </div>
      <div class="row">
        <button class="btn primary" onclick="startFirstDue()">开始今日复习</button>
        <button class="btn" onclick="navTo('bank')">浏览题库</button>
      </div>
    </div>
    <div class="stats">
      <div class="stat"><div class="k">今日待复习</div><div class="v">${s.due}</div><div class="h">到点就开口，不要囤积</div></div>
      <div class="stat"><div class="k">已练过话题</div><div class="v">${s.practiced}<span style="font-size:16px;color:var(--muted)"> / ${s.total}</span></div><div class="h">覆盖率 ${(s.total?Math.round(s.practiced/s.total*100):0)}%</div></div>
      <div class="stat"><div class="k">累计开口次数</div><div class="v">${s.sessions}</div><div class="h">同一题可反复迭代</div></div>
      <div class="stat"><div class="k">近 7 天练习</div><div class="v">${s.week}</div><div class="h">保持语感比一次刷完更重要</div></div>
    </div>
    <div class="grid-2">
      <div class="panel">
        <h3>遗忘曲线</h3>
        <div class="curve-wrap">${curveSVG()}</div>
        <div class="legend">
          <span><i class="dot" style="background:#c9b08a"></i>不复习</span>
          <span><i class="dot" style="background:#2f6f62"></i>按计划复习</span>
        </div>
        <p style="color:var(--muted);font-size:13px;line-height:1.6;margin:10px 0 0">
          默认间隔 ${db.intervals.join(" / ")} 天。练完后按「生疏 / 磕绊 / 顺畅 / 很稳」打分，下一记日期会自动推后或拉回。
        </p>
      </div>
      <div class="panel">
        <h3>今天该开口的题</h3>
        ${dueSets.length ? dueSets.map((x) => dueRow(x)).join("") : `<div class="empty">暂无到期题。去题库挑一道新题练第一次，系统会开始排期。</div>`}
        ${!dueSets.length && fresh.length ? `<h3 style="margin-top:16px">还没练过</h3>${fresh.map((x)=>dueRow(x)).join("")}` : ""}
      </div>
    </div>
  `;
}

function dueRow(s) {
  const p = prog(s.id);
  return `
    <div class="due-item">
      <div>
        <div class="badges">
          <span class="badge part">Part ${s.part}${s.part===2?" & 3":""}</span>
          <span class="badge ${s.isNew?"new":"old"}">${s.isNew?"新题":"旧题/保留"}</span>
          ${isDue(p)?'<span class="badge due">到期</span>':""}
        </div>
        <strong>${s.topicZh}</strong>
        <div class="meta" style="font-size:12px;color:var(--muted)">${s.topic} · 练过 ${p.practiceCount} 次${p.lastPracticed?" · 上次 "+fmtDate(p.lastPracticed):""}</div>
      </div>
      <button class="btn gold" onclick="navTo('practice','${s.id}')">练习</button>
    </div>`;
}

function curveSVG() {
  const w = 520, h = 160;
  const forget = [100,58,44,33,28,25,22,21];
  const spaced = [100,92,88,94,90,96,93,97];
  const toPts = (arr) => arr.map((v,i)=>`${20+i*((w-40)/(arr.length-1))},${h-20-(v/100)*(h-40)}`).join(" ");
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
    <polyline fill="none" stroke="#d7c7a6" stroke-width="2.5" points="${toPts(forget)}"></polyline>
    <polyline fill="none" stroke="#2f6f62" stroke-width="2.8" points="${toPts(spaced)}"></polyline>
    ${spaced.map((v,i)=>`<circle cx="${20+i*((w-40)/(spaced.length-1))}" cy="${h-20-(v/100)*(h-40)}" r="3.2" fill="#2f6f62"/>`).join("")}
  </svg>`;
}

function groupedBank(list) {
  ensurePacks();
  const byId = {};
  list.forEach((s) => { byId[s.id] = s; });
  const filtering = state.filter.part !== "all" || state.filter.tag !== "all" || !!(state.filter.q || "").trim();
  return db.packs.map((p) => ({
    id: p.id,
    title: p.title,
    blurb: p.blurb,
    tint: p.tint,
    items: (p.ids || []).map((id) => byId[id]).filter(Boolean)
  })).filter((p) => p.items.length || !filtering);
}

function viewBank() {
  const list = filteredSets();
  const packs = groupedBank(list);
  const packBlocks = packs.map((p) => `
    <section class="pack tint-${p.tint || "mint"}" data-pack="${p.id}"
      ondragover="onPackDragOver(event)"
      ondragleave="onPackDragLeave(event)"
      ondrop="onPackDrop(event)">
      <div class="pack-head">
        <button class="pack-handle" type="button" title="拖动分组" draggable="true"
          ondragstart="onPackHandleStart(event)" ondragend="onPackHandleEnd(event)">⋮</button>
        <div class="pack-copy">
          <h3 contenteditable="true" spellcheck="false" data-pack="${p.id}" data-field="title"
            onblur="commitPackMeta(event)" onkeydown="packTitleKey(event)">${escapeHTML(p.title)}</h3>
          <p contenteditable="true" spellcheck="false" data-pack="${p.id}" data-field="blurb"
            onblur="commitPackMeta(event)">${escapeHTML(p.blurb || "")}</p>
        </div>
        <div class="pack-count">${p.items.length} 题</div>
      </div>
      <div class="cards">
        ${p.items.map((s, i) => cardHTML(s, i, p.id)).join("") || `<div class="empty">把题目拖进这一组</div>`}
      </div>
    </section>
  `).join("");
  return `
    <div class="topbar">
      <div>
        <h2>题库墙</h2>
        <div class="desc">点分组标题和简介可改 · 左侧竖线拖分组 · 题目可拖到别的组 · 都会记住</div>
      </div>
      <div class="row">
        <input class="search" id="qsearch" placeholder="搜索题目 / 话题" value="${escapeAttr(state.filter.q)}" />
        <button class="btn primary" onclick="openBankOverview()">全局概览</button>
        <button class="btn" onclick="resetPacks()">恢复默认分组</button>
      </div>
    </div>
    <div class="chips">
      ${chip("part","all","全部")}
      ${chip("part","1","Part 1")}
      ${chip("part","2","Part 2 & 3")}
    </div>
    <div class="chips">
      ${chip("tag","all","不限状态")}
      ${chip("tag","new","本季新题")}
      ${chip("tag","old","旧题 / 保留")}
      ${chip("tag","fresh","未练")}
      ${chip("tag","due","待复习")}
      ${chip("tag","done","已练过")}
    </div>
    ${packBlocks || `<div class="empty">没有符合筛选的题目</div>`}
  `;
}

function bankOverviewHTML() {
  ensurePacks();
  const setsById = {};
  allSets().forEach((s) => { setsById[s.id] = s; });
  const packs = db.packs.map((p) => `
    <section class="pack overview-pack tint-${p.tint || "mint"}" data-pack="${p.id}"
      ondragover="onPackDragOver(event)"
      ondragleave="onPackDragLeave(event)"
      ondrop="onPackDrop(event)">
      <div class="overview-pack-head">
        <button class="pack-handle" type="button" title="拖动分组" draggable="true"
          ondragstart="onPackHandleStart(event)" ondragend="onPackHandleEnd(event)">⋮</button>
        <div class="pack-copy">
          <h3 contenteditable="true" spellcheck="false" data-pack="${p.id}" data-field="title"
            onblur="commitPackMeta(event)" onkeydown="packTitleKey(event)">${escapeHTML(p.title)}</h3>
          <p contenteditable="true" spellcheck="false" data-pack="${p.id}" data-field="blurb"
            onblur="commitPackMeta(event)">${escapeHTML(p.blurb || "")}</p>
        </div>
        <span class="overview-count">${(p.ids || []).length}</span>
      </div>
      <div class="overview-items">
        ${(p.ids || []).map((id) => overviewItemHTML(setsById[id], p.id)).join("") || `<div class="overview-empty">拖题目到这里</div>`}
      </div>
    </section>
  `).join("");
  return `
    <div class="bank-overview" id="bank-overview" role="dialog" aria-modal="true" aria-label="题库全局概览">
      <div class="overview-toolbar">
        <div>
          <div class="overview-kicker">BANK MAP</div>
          <h2>题库全局概览</h2>
          <p>拖动左侧竖点调整分组顺序；拖动题目可排序或换组；点击组名和简介可直接修改。</p>
        </div>
        <div class="row overview-actions">
          <button class="btn" onclick="createPack()">＋ 新增分组</button>
          <button class="btn" onclick="resetPacks()">恢复默认分组</button>
          <button class="btn primary" onclick="closeBankOverview()">完成</button>
        </div>
      </div>
      <div class="overview-scroll" id="bank-overview-scroll">
        <div class="overview-grid">${packs}</div>
      </div>
    </div>
  `;
}

function overviewItemHTML(s, packId) {
  if (!s) return "";
  return `
    <div class="overview-item" draggable="true" data-id="${s.id}" data-pack="${packId}"
      ondragstart="onCardDragStart(event)"
      ondragover="onCardDragOver(event)"
      ondragleave="onCardDragLeave(event)"
      ondrop="onCardDrop(event)"
      ondragend="onCardDragEnd(event)"
      title="${escapeAttr(s.topic)}">
      <span class="overview-part">P${s.part}${s.part === 2 ? "+3" : ""}</span>
      <span>${escapeHTML(s.topicZh)}</span>
      <span class="overview-grip">⠿</span>
    </div>`;
}

function openBankOverview() {
  rememberBankScroll();
  state.bankOverview = true;
  state.overviewScrollTop = 0;
  state.overviewScrollLeft = 0;
  render();
}

function closeBankOverview() {
  state.bankOverview = false;
  render();
}

function createPack() {
  const title = prompt("新分组名称");
  if (title == null) return;
  const cleanTitle = title.replace(/\s+/g, " ").trim();
  if (!cleanTitle) {
    toast("请填写分组名称");
    return;
  }
  const blurb = prompt("分组简介（可留空）", "") || "";
  const tints = ["mint", "peach", "lavender", "sky"];
  db.packs.push({
    id: "custom-pack-" + Date.now(),
    title: cleanTitle,
    blurb: blurb.replace(/\s+/g, " ").trim(),
    tint: tints[db.packs.length % tints.length],
    ids: []
  });
  saveDB();
  render();
  toast("新分组已创建");
}

function chip(key, val, label) {
  const on = state.filter[key] === val ? "on" : "";
  return `<button class="chip ${on}" onclick="setFilter('${key}','${val}')">${label}</button>`;
}
function setFilter(key, val) {
  state.filter[key] = val;
  render();
}

const TINTS = ["tint-mint", "tint-peach", "tint-lavender", "tint-sky"];

function cardHTML(s, idx, packId) {
  const p = prog(s.id);
  const preview = s.part === 1 ? qText((s.questions || [])[0]) : (s.cue || s.topic);
  const dots = Array.from({length: 6}, (_,i)=> `<i class="${i <= (p.intervalIndex||0) && p.practiceCount ? "on":""}"></i>`).join("");
  const tint = TINTS[(idx ?? 0) % TINTS.length];
  return `
    <article class="set-card ${tint}" draggable="true" data-id="${s.id}" data-pack="${packId || ""}"
      ondragstart="onCardDragStart(event)"
      ondragover="onCardDragOver(event)"
      ondragleave="onCardDragLeave(event)"
      ondrop="onCardDrop(event)"
      ondragend="onCardDragEnd(event)"
      onclick="openCard('${s.id}')">
      <button class="drag-handle" type="button" title="拖动排序" onclick="event.stopPropagation()">⋮⋮</button>
      <div class="badges">
        <span class="badge part">Part ${s.part}${s.part===2?" & 3":""}</span>
        <span class="badge ${s.isNew?"new":"old"}">${s.isNew?"新题":"旧题"}</span>
        <span class="badge">${s.category}</span>
        ${isDue(p)?'<span class="badge due">今日到期</span>': isNewish(p)?'<span class="badge fresh">未练</span>':'<span class="badge ok">'+mastery(p)+'</span>'}
      </div>
      <h4>${s.topicZh}</h4>
      <div class="meta">${s.topic} · ${s.season}</div>
      <div class="qpreview">${escapeHTML(preview)}</div>
      <div class="meta">练过 ${p.practiceCount} 次${p.lastPracticed?" · 上次 "+fmtDate(p.lastPracticed):""}${p.practiceCount? " · 下次 "+fmtDate(p.nextReview):""}</div>
      <div class="progress-dots">${dots}</div>
    </article>`;
}

function viewPractice() {
  const s = getSet(state.activeId) || allSets()[0];
  if (!s) return `<div class="empty">题库为空</div>`;
  state.activeId = s.id;
  const p = prog(s.id);
  const ans = currentAnswer(p);
  const text = ans ? ans.content : defaultDraft(s);
  const versions = p.answers.map((a) =>
    `<button class="ver ${a.id===p.currentAnswerId?"on":""}" onclick="switchVersion('${s.id}','${a.id}')">${a.label}</button>`
  ).join("");
  const qBlock = s.part === 1
    ? `<ol class="subq">${(s.questions||[]).map((q)=>`<li>${escapeHTML(qText(q))}</li>`).join("")}</ol>`
    : `<p style="font-size:15px;margin:0 0 8px">${escapeHTML(s.cue || "")}</p>
       <ul class="bullets">${(s.bullets||[]).map((b)=>`<li>${escapeHTML(b)}</li>`).join("")}</ul>
       <div class="subq"><strong>Part 3</strong>
         <ol>${(s.part3||[]).map((q)=>`<li>${escapeHTML(qText(q))}</li>`).join("")}</ol>
       </div>`;

  return `
    <div class="topbar">
      <div>
        <h2>${s.topicZh}</h2>
        <div class="desc">${s.topic} · ${s.isNew?"新题":"旧题/保留"} · ${s.season} · 已练 ${p.practiceCount} 次</div>
      </div>
      <div class="row">
        <button class="btn" onclick="navTo('bank')">返回题库</button>
      </div>
    </div>
    <div class="practice-layout">
      <div class="practice-column practice-column-left">
        <div class="cue-card">
          <div class="cue-kicker">Speaking Part ${s.part}${s.part===2?" + 3":""}</div>
          <h3>${s.part===1? s.topic : "Cue card"}</h3>
          ${qBlock}
        </div>
        <div class="panel answer-panel">
          <h3>答案稿 · 可迭代</h3>
          <div class="versions">
            ${versions || '<span class="meta" style="font-size:12px;color:var(--muted)">还没有版本，写下第一稿即可</span>'}
            <button class="ver" onclick="forkAnswer()">+ 新版本</button>
          </div>
          ${s.part === 1 ? `
          <div class="answer-box">
            <div id="answer" class="answer-editor" contenteditable="true" spellcheck="false"></div>
          </div>
          ` : `
          <div class="answer-tabs">
            <button type="button" class="on" data-tab="p2" onclick="switchAnswerTab('p2')">Part 2 答案</button>
            <button type="button" data-tab="p3" onclick="switchAnswerTab('p3')">Part 3 答案</button>
          </div>
          <div class="answer-box">
            <div id="answer-p2" class="answer-editor" contenteditable="true" spellcheck="false"></div>
            <div id="answer-p3" class="answer-editor" contenteditable="true" spellcheck="false" style="display:none"></div>
          </div>
          `}
          <div class="highlight-bar">
            <button class="btn" type="button" onclick="highlightSelection()">高亮选中</button>
            <button class="btn" type="button" onclick="clearHighlights()">取消高亮</button>
            <span class="hint">选中核心短语后点高亮，方便记忆</span>
          </div>
          <div class="row" style="margin-top:10px">
            <button class="btn primary" onclick="persistAnswer(false)">保存当前稿</button>
            <button class="btn" onclick="persistAnswer(true)">另存为新版本</button>
            <button class="btn" onclick="loadModelAnswer()">填入题库参考答案</button>
          </div>
        </div>
      </div>
      <div class="practice-column practice-column-right">
        <div class="panel">
          <div class="timer-box">
            <div class="timer-label" id="timer-label">${state.timer.mode==="prep"?"准备 1 分钟":"陈述 2 分钟"}</div>
            <div class="timer-face" id="timer-face">${formatRemain(state.timer.remain)}</div>
            <div class="timer-modes">
              <button class="btn ${state.timer.mode==="prep"?"primary":""}" onclick="setMode('prep')">准备 60s</button>
              <button class="btn ${state.timer.mode==="speak"?"primary":""}" onclick="setMode('speak')">陈述 120s</button>
            </div>
            <div class="row" style="justify-content:center">
              <button class="btn gold" onclick="toggleTimer()">${state.timer.running?"暂停":"开始计时"}</button>
              <button class="btn" onclick="resetTimer()">重置</button>
            </div>
          </div>
        </div>
        ${speechPanelHTML()}
        <div class="panel" style="margin-top:16px">
          <h3>练完打卡</h3>
          <p style="font-size:13px;color:var(--muted);margin-top:0">按今天开口的生熟程度记一次，系统会改下次复习日。</p>
          <div class="rate-row">
            <button class="rate" onclick="gradeNow('again')"><b>生疏</b>明天再来</button>
            <button class="rate" onclick="gradeNow('hard')"><b>磕绊</b>稍后再见</button>
            <button class="rate" onclick="gradeNow('good')"><b>顺畅</b>拉长间隔</button>
            <button class="rate" onclick="gradeNow('easy')"><b>很稳</b>大幅推迟</button>
          </div>
          <div style="margin-top:12px;font-size:13px;color:var(--muted)">
            上次：${p.lastPracticed ? fmtDate(p.lastPracticed) : "尚未练习"} · 下次：${p.practiceCount? fmtDate(p.nextReview): "练第一次后生成"}
          </div>
        </div>
        <div class="panel" style="margin-top:16px">
          <h3>练习记录</h3>
          ${p.history.length ? `<ul class="timeline">${p.history.slice(0,12).map((h)=>`
            <li><time>${h.date.slice(5)} ${h.time||""}</time><div>${gradeLabel(h.grade)} · 间隔改为 ${h.interval} 天</div></li>
          `).join("")}</ul>` : `<div class="empty">还没有记录</div>`}
        </div>
      </div>
    </div>
  `;
}

function defaultDraft(s) {
  if (s.part === 1) {
    return (s.questions || []).map((q,i)=>`Q${i+1}. ${qText(q)}\nA: \n`).join("\n");
  }
  return `Cue: ${s.cue || ""}\n\nOpening:\n\nPoint 1:\n\nPoint 2:\n\nPoint 3:\n\nClosing:\n\n--- Part 3 ---\n` +
    (s.part3 || []).map((q,i)=>`Q${i+1}. ${qText(q)}\nA: \n`).join("\n");
}

function modelDraft(s) {
  if (s.part === 1) {
    return (s.questions || []).map((q,i) => {
      const zh = qZh(q) ? `\n（${qZh(q)}）` : "";
      return `Q${i+1}. ${qText(q)}\nA: ${qAnswer(q)}${zh}\n`;
    }).join("\n");
  }
  const p3 = (s.part3 || []).map((q,i) => {
    const zh = qZh(q) ? `\n（${qZh(q)}）` : "";
    return `Q${i+1}. ${qText(q)}\nA: ${qAnswer(q)}${zh}\n`;
  }).join("\n");
  const zh = s.modelAnswerZh ? `\n\n参考译文：${s.modelAnswerZh}` : "";
  return `Cue: ${s.cue || ""}\n\n${s.modelAnswer || ""}${zh}\n\n--- Part 3 ---\n${p3}`;
}

function loadModelAnswer() {
  const s = getSet(state.activeId);
  if (!s) return;
  let data;
  if (s.part === 1) {
    const draft = modelDraft(s);
    data = { content: draft };
    const ed = document.getElementById("answer");
    if (ed) ed.textContent = draft;
  } else {
    const parts = modelDraftParts(s);
    data = {
      content: (parts.p2 || "") + "\n\n--- Part 3 ---\n\n" + (parts.p3 || ""),
      part2Plain: parts.p2 || "",
      part3Plain: parts.p3 || "",
      part2Html: null,
      part3Html: null
    };
    const p2 = document.getElementById("answer-p2");
    const p3 = document.getElementById("answer-p3");
    if (p2) p2.textContent = parts.p2 || "";
    if (p3) p3.textContent = parts.p3 || "";
  }
  saveAnswer(s.id, data, !prog(s.id).answers.length);
  const p = prog(s.id);
  const cur = currentAnswer(p);
  if (cur) cur.label = cur.label || "参考稿";
  saveDB();
  toast("已填入题库参考答案，可直接改");
  render();
}

function dimCell(label, val) {
  const shown = (val === 0 || val) ? val : "待接入";
  return `<div class="score-cell"><div class="k">${label}</div><div class="v ${val || val===0 ? "" : "na"}">${shown}</div></div>`;
}

function speechPanelHTML() {
  const recLabel = speechState.recording ? "停止录音" : "开始录音";
  const hasBlob = !!speechState.blob;
  const res = speechState.lastResult;
  const dims = (res && res.dimensions) || {};
  const comments = (res && res.comments) || [
    "录音后点「Whisper 转写」。",
    "本机 Whisper 会返回转写文字和流利度参考。"
  ];
  const status = speechState.recording
    ? `<span class="rec-dot"></span>录音中`
    : hasBlob
      ? `已录 ${Math.round((speechState.durationMs||0)/1000)} 秒`
      : "尚未录音";
  const dirLabel = saveState.dirHandle
    ? `保存到 📁 ${escapeHTML(saveState.dirHandle.name)}`
    : "选择保存文件夹";
  const autoHint = window.showDirectoryPicker
    ? (saveState.dirHandle
        ? "录音停止后自动转 MP3 存入所选文件夹。"
        : "还没选文件夹：录音停止后会自动下载 MP3，点旁边按钮可改为自动存入文件夹。")
    : "当前浏览器不支持文件夹写入，录音停止后自动下载 MP3。";
  return `
    <div class="panel" style="margin-top:16px">
      <h3>开口评分</h3>
      <p class="speech-note">本机 Whisper 转写录音，并根据语速、停顿和填充词给出流利度参考。</p>
      <div class="row">
        <button class="btn ${speechState.recording?"danger":"gold"}" onclick="toggleRecord()">${recLabel}</button>
        <button class="btn primary" onclick="scoreRecording()" ${hasBlob?"":"disabled"}>Whisper 转写</button>
        <button class="btn" onclick="downloadRecording()" ${hasBlob?"":"disabled"}>下载 MP3</button>
        <button class="btn" onclick="chooseSaveDir()" title="选择录音自动保存的文件夹">${dirLabel}</button>
      </div>
      <div style="margin-top:8px;font-size:13px;color:var(--muted)">${status}</div>
      <div style="margin-top:4px;font-size:12px;color:var(--muted)">${autoHint}</div>
      ${speechState.url ? `<audio id="rec-player" controls src="${speechState.url}"></audio>` : ""}
      ${recordingHistoryHTML()}
      <div class="score-grid score-grid-one">
        ${dimCell("Fluency 流利度", dims.fluency)}
      </div>
      ${res && res.transcript ? `<div class="ref-block"><b>转写文字</b><br>${escapeHTML(res.transcript)}</div>` : ""}
      <ul style="padding-left:18px;font-size:13px;color:#5c554a;line-height:1.6">
        ${comments.map((c)=>`<li>${escapeHTML(c)}</li>`).join("")}
      </ul>
    </div>`;
}

function recordingUrl(recording) {
  if (!recording || !recording.blob) return "";
  if (!recordingUrls.has(recording.id)) {
    recordingUrls.set(recording.id, URL.createObjectURL(recording.blob));
  }
  return recordingUrls.get(recording.id);
}

function recordingTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "录音";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(d);
}

function recordingHistoryHTML() {
  const items = speechState.recordings || [];
  if (!items.length) {
    return `<div class="recording-history"><div class="recording-history-title">录音记录</div><div class="recording-empty">录完后会保存在这里，刷新网页也能继续播放。</div></div>`;
  }
  return `<div class="recording-history">
    <div class="recording-history-title">录音记录 <span>${items.length} 条</span></div>
    <div class="recording-list">
      ${items.map((item, index) => `<div class="recording-item">
        <div class="recording-meta"><b>第 ${items.length - index} 次</b><span>${recordingTime(item.createdAt)} · ${Math.max(1, Math.round((item.durationMs || 0) / 1000))} 秒</span></div>
        <audio controls preload="metadata" src="${recordingUrl(item)}"></audio>
      </div>`).join("")}
    </div>
  </div>`;
}

function viewReview() {
  const days = Array.from({length: 7}, (_,i) => addDays(todayISO(), i));
  const byDay = {};
  days.forEach((d) => byDay[d] = []);
  allSets().forEach((s) => {
    const p = prog(s.id);
    if (p.practiceCount && byDay[p.nextReview]) byDay[p.nextReview].push(s);
  });
  const overdue = allSets().filter((s) => isDue(prog(s.id)));
  return `
    <div class="topbar">
      <div>
        <h2>复习日程</h2>
        <div class="desc">按间隔把题目摊开，避免同一天堆二十道 cue card。</div>
      </div>
    </div>
    <div class="cal-strip">
      ${days.map((d,i)=>`
        <div class="cal-day ${i===0?"today":""}">
          <div class="c">${i===0?"今天":["日","一","二","三","四","五","六"][new Date(d+"T12:00:00").getDay()]}</div>
          <div class="d">${d.slice(8)}</div>
          <div class="c">${byDay[d].length} 题</div>
        </div>`).join("")}
    </div>
    <div class="grid-2">
      <div class="panel">
        <h3>到期 / 过期</h3>
        ${overdue.length? overdue.map(dueRow).join("") : `<div class="empty">今天没有待复习题目</div>`}
      </div>
      <div class="panel">
        <h3>未来 7 天分布</h3>
        ${days.map((d)=>`
          <div style="margin-bottom:10px">
            <div style="font-size:12px;color:var(--muted)">${d}${d===todayISO()?" · 今天":""}</div>
            ${byDay[d].length? byDay[d].map((s)=>`<div style="font-size:13px;padding:4px 0">${s.topicZh} <span style="color:var(--muted)">Part ${s.part}</span></div>`).join("") : `<div style="color:#c2b8a8;font-size:13px">空</div>`}
          </div>`).join("")}
      </div>
    </div>
  `;
}

function viewSettings() {
  return `
    <div class="topbar">
      <div>
        <h2>设置与数据</h2>
        <div class="desc">本地浏览器存储，不联网。导出一份备份更安心。</div>
      </div>
    </div>
    <div class="settings-grid">
      <div class="panel">
        <h3>间隔（天）</h3>
        <p style="font-size:13px;color:var(--muted)">对应 6 档：生疏重置到第一档。</p>
        <div class="interval-edit" id="interval-edit">
          ${db.intervals.map((n,i)=>`<input data-i="${i}" type="number" min="1" value="${n}">`).join("<span>→</span>")}
        </div>
        <div class="row" style="margin-top:12px">
          <button class="btn primary" onclick="saveIntervals()">保存间隔</button>
          <button class="btn" onclick="resetIntervals()">恢复默认 1/3/7/14/30/60</button>
        </div>
      </div>
      <div class="panel">
        <h3>备份</h3>
        <p style="font-size:13px;color:var(--muted)">包含练习次数、日期、答案版本。换电脑时先导出再导入。</p>
        <div class="row">
          <button class="btn primary" onclick="exportData()">导出 JSON</button>
          <label class="btn">导入 JSON<input type="file" accept="application/json" style="display:none" onchange="importData(event)"></label>
        </div>
        <div class="row" style="margin-top:12px">
          <button class="btn gold" onclick="exportMobileReview()">导出手机复习页</button>
          <button class="btn" onclick="syncToMobile()">同步到手机</button>
        </div>
        <p style="font-size:12px;color:var(--muted);margin:8px 0 0">「导出手机复习页」会生成可离线打开的 HTML；「同步到手机」需使用局域网模式启动，详见 README。</p>
        <div class="row" style="margin-top:12px">
          <button class="btn danger" onclick="wipeAll()">清空练习记录</button>
        </div>
      </div>
      <div class="panel">
        <h3>添加自定义话题</h3>
        <input class="search" id="c-zh" placeholder="中文标题，如：喜欢的季节" style="width:100%;margin-bottom:8px;border-radius:12px">
        <input class="search" id="c-en" placeholder="English topic" style="width:100%;margin-bottom:8px;border-radius:12px">
        <select id="c-part" class="search" style="width:100%;margin-bottom:8px;border-radius:12px">
          <option value="1">Part 1</option>
          <option value="2">Part 2 & 3</option>
        </select>
        <textarea id="c-body" class="search" style="width:100%;min-height:90px;border-radius:12px;padding:10px" placeholder="每行一道题。Part 2 第一行当 cue card，随后 4 行当要点，再后面当 Part 3。"></textarea>
        <div class="row" style="margin-top:10px">
          <button class="btn gold" onclick="addCustom()">加入题库</button>
        </div>
      </div>
      <div class="panel">
        <h3>使用方式</h3>
        <ol style="font-size:14px;line-height:1.7;color:#4a4338">
          <li>双击启动脚本，等待浏览器自动打开。</li>
          <li>题库墙扫题 → 点进练习台写稿、计时开口。</li>
          <li>打分后进入复习日程，只练到期的题。</li>
          <li>同一题可另存多个答案版本，对比迭代。</li>
        </ol>
        <p style="font-size:12px;color:var(--muted);margin:8px 0 0">练习答案和录音默认只保存在当前浏览器中，不会上传到 GitHub。</p>
      </div>
    </div>
  `;
}

function bindView() {
  const search = document.getElementById("qsearch");
  if (search) {
    search.addEventListener("input", (e) => {
      state.filter.q = e.target.value;
    });
    search.addEventListener("keydown", (e) => {
      if (e.key === "Enter") render();
    });
    search.addEventListener("blur", () => render());
  }
  if (state.view === "practice") {
    populateAnswerEditors();
  }
}

function startFirstDue() {
  const due = allSets().find((s) => isDue(prog(s.id))) || allSets().find((s) => isNewish(prog(s.id)));
  if (due) navTo("practice", due.id);
  else toast("题都练过且尚未到期");
}

function persistAnswer(asNew) {
  const data = collectCurrentAnswerData();
  if (!data) return;
  saveAnswer(state.activeId, data, asNew);
  toast(asNew ? "已另存新版本" : "已保存当前稿");
  render();
}
function forkAnswer() {
  persistAnswer(true);
}
function switchVersion(setId, ansId) {
  const data = collectCurrentAnswerData();
  if (data) saveAnswer(setId, data, false);
  prog(setId).currentAnswerId = ansId;
  saveDB();
  render();
}

function gradeNow(grade) {
  const data = collectCurrentAnswerData();
  if (data && (data.content || "").trim()) saveAnswer(state.activeId, data, false);
  const days = applyReview(state.activeId, grade);
  toast(`已记录 · 下次复习在 ${days} 天后`);
  render();
}

function formatRemain(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2,"0")}`;
}
function setMode(mode) {
  stopTimer(false);
  state.timer.mode = mode;
  state.timer.remain = mode === "prep" ? 60 : 120;
  render();
}
function toggleTimer() {
  if (state.timer.running) stopTimer(true);
  else startTimer();
}
function startTimer() {
  state.timer.running = true;
  const face = document.getElementById("timer-face");
  state.timer.handle = setInterval(() => {
    state.timer.remain -= 1;
    if (face) face.textContent = formatRemain(Math.max(0, state.timer.remain));
    if (state.timer.remain <= 0) {
      stopTimer(true);
      toast(state.timer.mode === "prep" ? "准备结束，开始陈述" : "时间到");
      if (state.timer.mode === "prep") {
        state.timer.mode = "speak";
        state.timer.remain = 120;
        render();
      }
    }
  }, 1000);
  const btn = document.querySelector(".timer-box .btn.gold");
  if (btn) btn.textContent = "暂停";
}
function stopTimer(updateUI) {
  state.timer.running = false;
  if (state.timer.handle) clearInterval(state.timer.handle);
  state.timer.handle = null;
  if (updateUI) {
    const btn = document.querySelector(".timer-box .btn.gold");
    if (btn) btn.textContent = "开始计时";
  }
}
function resetTimer() {
  stopTimer(false);
  state.timer.remain = state.timer.mode === "prep" ? 60 : 120;
  render();
}

function saveIntervals() {
  const inputs = [...document.querySelectorAll("#interval-edit input")];
  db.intervals = inputs.map((i) => Math.max(1, parseInt(i.value, 10) || 1));
  saveDB();
  toast("间隔已更新");
}
function resetIntervals() {
  db.intervals = DEFAULT_INTERVALS.slice();
  saveDB();
  render();
}
async function syncToMobile() {
  const sets = allSets().filter(s => {
    const p = prog(s.id);
    return p.practiceCount > 0 || (p.answers && p.answers.length);
  });
  if (!sets.length) {
    toast("还没有练过的题目");
    return;
  }
  const payload = {
    updated: new Date().toLocaleString("zh-CN", { hour12: false }),
    sets: sets.map(s => {
      const p = prog(s.id);
      const ans = currentAnswer(p);
      const item = {
        id: s.id,
        part: s.part,
        topic: s.topic,
        topicZh: s.topicZh,
        practiceCount: p.practiceCount || 0,
        lastPracticed: p.lastPracticed || "",
        cueHtml: ""
      };
      if (s.part === 1) {
        const html = ans && ans.html;
        const plain = ans ? (ans.content || "") : "";
        item.answer = (html && /<mark/i.test(html)) ? html : escapeHTML(plain).replace(/\n/g, "<br>");
        item.cueHtml = "<ol>" + (s.questions||[]).map(q => "<li>" + escapeHTML(qText(q)) + "</li>").join("") + "</ol>";
      } else {
        const parts = getAnswerParts(ans, s);
        item.part2 = (parts.p2Html && /<mark/i.test(parts.p2Html)) ? parts.p2Html : escapeHTML(parts.p2 || "").replace(/\n/g, "<br>");
        item.part3 = (parts.p3Html && /<mark/i.test(parts.p3Html)) ? parts.p3Html : escapeHTML(parts.p3 || "").replace(/\n/g, "<br>");
        item.cueHtml = "<div class=\"cue\">" + escapeHTML(s.cue || "") + "</div><ul>" +
          (s.bullets||[]).map(b => "<li>" + escapeHTML(b) + "</li>").join("") + "</ul>" +
          "<div class=\"p3q\"><strong>Part 3</strong><ol>" +
          (s.part3||[]).map(q => "<li>" + escapeHTML(qText(q)) + "</li>").join("") + "</ol></div>";
      }
      return item;
    })
  };
  try {
    const r = await fetch("/api/mobile-sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || "同步失败");
    const host = location.hostname === "127.0.0.1" || location.hostname === "localhost"
      ? "（把 127.0.0.1 换成电脑的局域网 IP）"
      : location.host;
    toast("已同步 " + j.count + " 题。手机打开 " + location.protocol + "//" + location.host + "/mobile " + host);
    // Show a more visible notice
    const note = document.createElement("div");
    note.style.cssText = "position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#1c3d39;color:#fff;padding:14px 18px;border-radius:14px;font-size:14px;z-index:9999;max-width:90%;text-align:center;box-shadow:0 8px 24px rgba(0,0,0,.2)";
    note.innerHTML = "已同步！手机连同一 WiFi 后打开<br><b>" + location.protocol + "//" + (location.hostname === "127.0.0.1" ? "电脑IP" : location.hostname) + ":" + location.port + "/mobile</b><br><span style='font-size:12px;opacity:.8'>（电脑 IP 可在终端用 ifconfig / ipconfig 查看）</span>";
    document.body.appendChild(note);
    setTimeout(() => note.remove(), 8000);
  } catch (e) {
    toast("同步失败：" + (e.message || e) + "（请用 python3 server.py 启动）");
  }
}

function exportMobileReview() {
  const sets = allSets().filter(s => {
    const p = prog(s.id);
    return p.practiceCount > 0 || (p.answers && p.answers.length > 0);
  });
  if (!sets.length) {
    toast("还没有练过的题目，先去练习台开口吧");
    return;
  }

  const today = todayISO();
  const cards = sets.map(s => {
    const p = prog(s.id);
    const ans = currentAnswer(p);
    let answerBlock = "";
    if (s.part === 1) {
      const html = ans && ans.html;
      const plain = ans ? (ans.content || "") : "";
      const content = (html && /<mark/i.test(html)) ? html : escapeHTML(plain).replace(/\n/g, "<br>");
      answerBlock = `<div class="answer">${content || "<span class=empty>暂无</span>"}</div>`;
    } else {
      const parts = getAnswerParts(ans, s);
      const p2 = (parts.p2Html && /<mark/i.test(parts.p2Html)) ? parts.p2Html : escapeHTML(parts.p2 || "").replace(/\n/g, "<br>");
      const p3 = (parts.p3Html && /<mark/i.test(parts.p3Html)) ? parts.p3Html : escapeHTML(parts.p3 || "").replace(/\n/g, "<br>");
      answerBlock = `
        <div class="tabs">
          <button type="button" class="on" data-tab="p2">Part 2</button>
          <button type="button" data-tab="p3">Part 3</button>
        </div>
        <div class="answer p2">${p2 || "<span class=empty>暂无</span>"}</div>
        <div class="answer p3" style="display:none">${p3 || "<span class=empty>暂无</span>"}</div>`;
    }
    const cue = s.part === 1
      ? `<ol>${(s.questions||[]).map(q => `<li>${escapeHTML(qText(q))}</li>`).join("")}</ol>`
      : `<div class="cue">${escapeHTML(s.cue || "")}</div>
         <ul>${(s.bullets||[]).map(b => `<li>${escapeHTML(b)}</li>`).join("")}</ul>
         <div class="p3q"><strong>Part 3</strong>
           <ol>${(s.part3||[]).map(q => `<li>${escapeHTML(qText(q))}</li>`).join("")}</ol>
         </div>`;

    return `
      <details class="card" data-topic="${escapeHTML(((s.topicZh||"") + " " + (s.topic||"")).toLowerCase())}">
        <summary>
          <div class="title">${escapeHTML(s.topicZh || s.topic)}</div>
          <div class="meta">Part ${s.part} · 练过 ${p.practiceCount} 次${p.lastPracticed ? " · " + fmtDate(p.lastPracticed) : ""}</div>
        </summary>
        <div class="body">
          <div class="qblock">${cue}</div>
          <div class="kicker">我的答案</div>
          ${answerBlock}
        </div>
      </details>`;
  }).join("");

  const script = `<script>
function filter(){
  const q = document.getElementById("q").value.trim().toLowerCase();
  document.querySelectorAll("details.card").forEach(c => {
    c.style.display = !q || c.dataset.topic.includes(q) ? "" : "none";
  });
}
document.addEventListener("click", function(e){
  const btn = e.target.closest && e.target.closest(".tabs button");
  if (!btn) return;
  const tabs = btn.parentElement;
  const wrap = tabs.parentElement;
  const which = btn.getAttribute("data-tab");
  tabs.querySelectorAll("button").forEach(b => b.classList.remove("on"));
  btn.classList.add("on");
  wrap.querySelector(".p2").style.display = which === "p2" ? "block" : "none";
  wrap.querySelector(".p3").style.display = which === "p3" ? "block" : "none";
});
</` + `script>`;

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<meta name="apple-mobile-web-app-capable" content="yes">
<title>口语复习 · ${today}</title>
<style>
  :root { --bg:#f4f1ec; --card:#fff; --text:#2b3340; --muted:#6b7585; --mint:#4aa89d; --line:#e6e1d8; --hl:#ffe082; }
  * { box-sizing:border-box; -webkit-tap-highlight-color:transparent; }
  body { margin:0; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif; background:var(--bg); color:var(--text); line-height:1.55; }
  .top { padding:16px 16px 8px; background:#fff; border-bottom:1px solid var(--line); position:sticky; top:0; z-index:20; }
  .top h1 { margin:0; font-size:22px; font-weight:600; }
  .top .sub { color:var(--muted); font-size:13px; margin-top:2px; }
  .search { margin:10px 16px 4px; }
  .search input { width:100%; padding:12px 14px; border:1px solid var(--line); border-radius:14px; font-size:16px; background:#fff; outline:none; }
  .search input:focus { border-color:var(--mint); }
  .hint { font-size:12px; color:var(--muted); text-align:center; margin:4px 16px 8px; }
  .list { padding:0 12px 60px; }
  details.card { background:var(--card); border-radius:18px; margin:10px 0; border:1px solid var(--line); overflow:hidden; }
  details.card summary { padding:14px 16px; cursor:pointer; list-style:none; }
  details.card summary::-webkit-details-marker { display:none; }
  details.card summary::after { content:" ›"; color:var(--muted); font-size:18px; float:right; }
  details.card[open] summary::after { content:" ˅"; }
  details.card .title { font-weight:600; font-size:16px; }
  details.card .meta { font-size:12px; color:var(--muted); margin-top:2px; }
  details.card .body { padding:0 16px 16px; border-top:1px solid var(--line); }
  .qblock { font-size:14px; color:#444; margin:12px 0; }
  .qblock .cue { font-weight:500; margin-bottom:6px; }
  .qblock ul, .qblock ol { margin:6px 0 6px 18px; padding:0; }
  .qblock li { margin:5px 0; }
  .kicker { font-size:11px; letter-spacing:.1em; color:var(--mint); font-weight:700; margin:10px 0 6px; }
  .answer { white-space:pre-wrap; font-size:15.5px; line-height:1.75; background:#faf8f5; padding:12px 14px; border-radius:12px; border:1px solid var(--line); }
  .answer .empty { color:#999; }
  mark { background:var(--hl); padding:1px 3px; border-radius:3px; }
  .tabs { display:flex; gap:8px; margin:8px 0; }
  .tabs button { border:1px solid var(--line); background:#fff; border-radius:999px; padding:7px 16px; font-size:13px; }
  .tabs button.on { background:var(--mint); color:#fff; border-color:var(--mint); }
</style>
</head>
<body>
<div class="top">
  <h1>口语复习</h1>
  <div class="sub">已练 ${sets.length} 题 · ${today}</div>
</div>
<div class="search"><input id="q" placeholder="搜索题目" oninput="filter()"></div>
<div class="hint">点击题目即可展开答案</div>
<div class="list" id="list">${cards}</div>
${script}
</body>
</html>`;

  const blob = new Blob([html], { type: "text/html" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `ielts-review-${today}.html`;
  a.click();
  toast("已生成手机复习页。用微信文件、网盘、邮件或 AirDrop 传到手机后，用浏览器打开即可。");
}

function exportData() {
  const blob = new Blob([JSON.stringify(db, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `ielts-oral-studio-${todayISO()}.json`;
  a.click();
}
function importData(ev) {
  const file = ev.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      db = JSON.parse(reader.result);
      ensureOrder();
      ensurePacks();
      saveDB();
      toast("已导入");
      render();
    } catch (e) {
      toast("文件无法解析");
    }
  };
  reader.readAsText(file);
}
function wipeAll() {
  if (!confirm("清空所有练习次数、日期和答案版本？题库题目仍会保留。")) return;
  db.progress = {};
  allSets().forEach((s) => { db.progress[s.id] = blankProgress(s.id); });
  saveDB();
  render();
}
function addCustom() {
  const zh = document.getElementById("c-zh").value.trim();
  const en = document.getElementById("c-en").value.trim();
  const part = parseInt(document.getElementById("c-part").value, 10);
  const lines = document.getElementById("c-body").value.split("\n").map((x)=>x.trim()).filter(Boolean);
  if (!zh || !en || !lines.length) { toast("请填标题和题目"); return; }
  const id = "custom-" + Date.now();
  const set = {
    id, part, topic: en, topicZh: zh, season: "自建", isNew: true, category: "自建"
  };
  if (part === 1) set.questions = lines;
  else {
    set.cue = lines[0];
    set.bullets = lines.slice(1, 5);
    set.part3 = lines.slice(5);
  }
  db.customSets.push(set);
  db.progress[id] = blankProgress(id);
  ensureOrder();
  ensurePacks();
  let misc = db.packs.find((p) => p.id === "misc");
  if (!misc) {
    misc = { id: "misc", title: "未分组 / 自建", blurb: "还没归进素材包的题目。", tint: "sky", ids: [] };
    db.packs.push(misc);
  }
  if (!misc.ids.includes(id)) misc.ids.push(id);
  saveDB();
  toast("已加入题库");
  navTo("bank");
}

const dragState = { id: null, moved: false, kind: "card" };

function onCardDragStart(e) {
  const id = e.currentTarget.dataset.id;
  dragState.kind = "card";
  dragState.id = id;
  dragState.moved = false;
  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData("text/plain", "card:" + id);
  e.currentTarget.classList.add("dragging");
}
function onCardDragOver(e) {
  e.preventDefault();
  e.stopPropagation();
  e.dataTransfer.dropEffect = "move";
  const card = e.currentTarget;
  if (card.dataset.id !== dragState.id) card.classList.add("drag-over");
}
function onCardDragLeave(e) {
  e.currentTarget.classList.remove("drag-over");
}
function onCardDrop(e) {
  e.preventDefault();
  e.stopPropagation();
  const targetId = e.currentTarget.dataset.id;
  const raw = e.dataTransfer.getData("text/plain") || "";
  e.currentTarget.classList.remove("drag-over");
  if (raw.startsWith("pack:")) return;
  const sourceId = raw.startsWith("card:") ? raw.slice(5) : (dragState.id || raw);
  const targetPack = e.currentTarget.dataset.pack;
  if (!sourceId || sourceId === targetId) return;
  moveCard(sourceId, targetPack, targetId);
  dragState.moved = true;
}
function onCardDragEnd(e) {
  e.currentTarget.classList.remove("dragging");
  document.querySelectorAll(".drag-over, .pack-over").forEach((el) => {
    el.classList.remove("drag-over");
    el.classList.remove("pack-over");
  });
}
function onPackHandleStart(e) {
  e.stopPropagation();
  const packId = e.currentTarget.closest(".pack")?.dataset.pack;
  dragState.kind = "pack";
  dragState.id = packId;
  dragState.moved = false;
  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData("text/plain", "pack:" + packId);
}
function onPackHandleEnd() {
  document.querySelectorAll(".pack-over").forEach((el) => el.classList.remove("pack-over"));
}
function onPackDragOver(e) {
  e.preventDefault();
  e.currentTarget.classList.add("pack-over");
}
function onPackDragLeave(e) {
  if (e.currentTarget.contains(e.relatedTarget)) return;
  e.currentTarget.classList.remove("pack-over");
}
function onPackDrop(e) {
  e.preventDefault();
  e.stopPropagation();
  const targetPack = e.currentTarget.dataset.pack;
  const raw = e.dataTransfer.getData("text/plain") || "";
  e.currentTarget.classList.remove("pack-over");
  if (raw.startsWith("pack:")) {
    reorderPacks(raw.slice(5), targetPack);
    return;
  }
  const sourceId = raw.startsWith("card:") ? raw.slice(5) : dragState.id;
  if (!sourceId) return;
  moveCard(sourceId, targetPack, null);
  dragState.moved = true;
}
function moveCard(sourceId, targetPackId, beforeId) {
  ensurePacks();
  ensureOrder();
  db.packs.forEach((p) => { p.ids = (p.ids || []).filter((id) => id !== sourceId); });
  const pack = db.packs.find((p) => p.id === targetPackId);
  if (!pack) return;
  const ids = pack.ids || [];
  if (beforeId && ids.includes(beforeId)) ids.splice(ids.indexOf(beforeId), 0, sourceId);
  else ids.push(sourceId);
  pack.ids = ids;
  const order = db.order.filter((id) => id !== sourceId);
  if (beforeId && order.includes(beforeId)) order.splice(order.indexOf(beforeId), 0, sourceId);
  else order.push(sourceId);
  db.order = order;
  saveDB();
  render();
  toast("题目已放到新位置");
}
function reorderPacks(sourceId, targetId) {
  if (!sourceId || !targetId || sourceId === targetId) return;
  ensurePacks();
  const moving = db.packs.find((p) => p.id === sourceId);
  const next = db.packs.filter((p) => p.id !== sourceId);
  const idx = next.findIndex((p) => p.id === targetId);
  if (!moving || idx < 0) return;
  next.splice(idx, 0, moving);
  db.packs = next;
  dragState.moved = true;
  saveDB();
  render();
  toast("分组顺序已保存");
}
function commitPackMeta(e) {
  const packId = e.currentTarget.dataset.pack;
  const field = e.currentTarget.dataset.field;
  const text = (e.currentTarget.textContent || "").replace(/\s+/g, " ").trim();
  ensurePacks();
  const pack = db.packs.find((p) => p.id === packId);
  if (!pack) return;
  if (field === "title") pack.title = text || "未命名分组";
  if (field === "blurb") pack.blurb = text;
  saveDB();
}
function packTitleKey(e) {
  if (e.key === "Enter") {
    e.preventDefault();
    e.currentTarget.blur();
  }
}
function resetPacks() {
  if (!confirm("恢复默认分组名称、简介和题目归属？练习记录不会丢。")) return;
  db.packs = defaultPacks();
  ensurePacks();
  saveDB();
  render();
  toast("已恢复默认分组");
}
function openCard(id) {
  if (dragState.moved) {
    dragState.moved = false;
    return;
  }
  navTo("practice", id);
}

function gradeLabel(g) {
  return ({again:"生疏", hard:"磕绊", good:"顺畅", easy:"很稳"})[g] || g;
}
function escapeHTML(str="") {
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));
}
function escapeAttr(str="") {
  return escapeHTML(str).replace(/"/g, "&quot;");
}

async function toggleRecord() {
  if (speechState.recording) {
    stopRecord();
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    speechState.stream = stream;
    speechState.chunks = [];
    const mime = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "";
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    speechState.recorder = rec;
    rec.ondataavailable = (e) => { if (e.data && e.data.size) speechState.chunks.push(e.data); };
    rec.onstop = async () => {
      speechState.blob = new Blob(speechState.chunks, { type: rec.mimeType || "audio/webm" });
      if (speechState.url) URL.revokeObjectURL(speechState.url);
      speechState.url = URL.createObjectURL(speechState.blob);
      speechState.durationMs = Date.now() - speechState.startedAt;
      if (speechState.stream) speechState.stream.getTracks().forEach((t) => t.stop());
      speechState.stream = null;
      try {
        const recording = await persistRecording({
          id: (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          createdAt: new Date().toISOString(),
          durationMs: speechState.durationMs,
          mime: speechState.blob.type,
          blob: speechState.blob
        });
        speechState.recordings.unshift(recording);
      } catch (err) {
        console.warn("保存录音历史失败", err);
        toast("录音可播放，但没有保存进历史记录");
      }
      render();
      autoSaveRecording();
    };
    speechState.startedAt = Date.now();
    speechState.recording = true;
    rec.start();
    render();
  } catch (err) {
    toast("无法打开麦克风，请检查浏览器权限");
  }
}

function stopRecord() {
  speechState.recording = false;
  if (speechState.recorder && speechState.recorder.state !== "inactive") {
    speechState.recorder.stop();
  } else {
    render();
  }
}

async function downloadRecording() {
  if (!speechState.blob) {
    toast("还没有录音");
    return;
  }
  try {
    toast("正在转成 MP3…");
    const mp3 = await blobToMp3(speechState.blob);
    const set = state.currentId ? getSet(state.currentId) : null;
    const name = `${(set && set.topicZh) || "recording"}-${todayISO()}.mp3`.replace(/[\\/:*?"<>|]/g, "_");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(mp3);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast("已下载 MP3");
  } catch (err) {
    console.error(err);
    downloadRecordingWav();
  }
}
function downloadRecordingWav() {
  blobToWav(speechState.blob).then((wav) => {
    const set = state.currentId ? getSet(state.currentId) : null;
    const name = `${(set && set.topicZh) || "recording"}-${todayISO()}.wav`.replace(/[\\/:*?"<>|]/g, "_");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(wav);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast("当前浏览器转不了 MP3，已改为下载 WAV");
  }).catch(() => toast("导出失败"));
}

/* ---- 录音自动保存到本地文件夹 ---- */
const DIR_DB = "ielts-oral-studio";
const DIR_DB_VERSION = 2;
const DIR_STORE = "handles";
const RECORDING_STORE = "recordings";
function idbOpen() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DIR_DB, DIR_DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(DIR_STORE)) {
        req.result.createObjectStore(DIR_STORE);
      }
      if (!req.result.objectStoreNames.contains(RECORDING_STORE)) {
        req.result.createObjectStore(RECORDING_STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function persistRecording(recording) {
  const database = await idbOpen();
  await new Promise((resolve, reject) => {
    const tx = database.transaction(RECORDING_STORE, "readwrite");
    tx.objectStore(RECORDING_STORE).put(recording);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  database.close();
  return recording;
}

async function loadRecordings() {
  const database = await idbOpen();
  const recordings = await new Promise((resolve, reject) => {
    const tx = database.transaction(RECORDING_STORE, "readonly");
    const req = tx.objectStore(RECORDING_STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
  database.close();
  return recordings.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

async function initRecordings() {
  try {
    speechState.recordings = await loadRecordings();
    if (state.view === "practice") render();
  } catch (err) {
    console.warn("读取录音历史失败", err);
  }
}
async function persistDirHandle(handle) {
  try {
    const db = await idbOpen();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(DIR_STORE, "readwrite");
      tx.objectStore(DIR_STORE).put(handle, "saveDir");
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch (e) { console.warn("保存文件夹句柄失败", e); }
}
async function loadDirHandle() {
  try {
    const db = await idbOpen();
    const handle = await new Promise((resolve, reject) => {
      const tx = db.transaction(DIR_STORE, "readonly");
      const req = tx.objectStore(DIR_STORE).get("saveDir");
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return handle;
  } catch (e) { return null; }
}
async function initSaveDir() {
  if (!window.showDirectoryPicker) return;
  saveState.dirHandle = await loadDirHandle();
}
async function chooseSaveDir() {
  if (!window.showDirectoryPicker) {
    toast("当前浏览器不支持选择文件夹，录音停止后会自动下载 MP3");
    return;
  }
  try {
    const handle = await window.showDirectoryPicker({ mode: "readwrite", id: "ielts-recordings" });
    saveState.dirHandle = handle;
    await persistDirHandle(handle);
    toast(`录音将自动保存到「${handle.name}」文件夹`);
    render();
  } catch (e) { /* 用户取消选择 */ }
}
function recFileName(ext) {
  const set = state.activeId ? getSet(state.activeId) : null;
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const stamp = `${todayISO().replace(/-/g, "")}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  return `${(set && set.topicZh) || "recording"}-${stamp}.${ext}`.replace(/[\\/:*?"<>|]/g, "_");
}
function triggerDownload(blob, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
async function autoSaveRecording() {
  if (saveState.autoSaving || !speechState.blob) return;
  saveState.autoSaving = true;
  const name = recFileName("mp3");
  try {
    const mp3 = await blobToMp3(speechState.blob);
    const handle = saveState.dirHandle;
    if (handle) {
      try {
        let perm = handle.queryPermission
          ? await handle.queryPermission({ mode: "readwrite" })
          : "granted";
        if (perm !== "granted" && handle.requestPermission) {
          perm = await handle.requestPermission({ mode: "readwrite" });
        }
        if (perm === "granted") {
          const fh = await handle.getFileHandle(name, { create: true });
          const w = await fh.createWritable();
          await w.write(mp3);
          await w.close();
          toast(`已自动保存到「${handle.name}」：${name}`);
          saveState.autoSaving = false;
          return;
        }
      } catch (e) { console.warn("写入文件夹失败，改为下载", e); }
    }
    triggerDownload(mp3, name);
    toast(handle ? "写入文件夹失败，已自动下载 MP3" : "未选保存文件夹，已自动下载 MP3");
  } catch (err) {
    console.error("MP3 转码失败", err);
    try {
      triggerDownload(await blobToWav(speechState.blob), recFileName("wav"));
      toast("转 MP3 失败，已自动下载 WAV");
    } catch (e2) { toast("自动保存失败"); }
  }
  saveState.autoSaving = false;
}
function floatTo16(float32) {
  const out = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}
async function decodeMono(blob) {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const raw = await blob.arrayBuffer();
  const buf = await ctx.decodeAudioData(raw.slice(0));
  const src = buf.getChannelData(0);
  if (ctx.close) ctx.close();
  return { samples: src, sampleRate: buf.sampleRate };
}
async function blobToMp3(blob) {
  if (!window.lamejs || !window.lamejs.Mp3Encoder) throw new Error("no lamejs");
  const { samples, sampleRate } = await decodeMono(blob);
  const pcm = floatTo16(samples);
  const enc = new lamejs.Mp3Encoder(1, sampleRate, 128);
  const block = 1152;
  const parts = [];
  for (let i = 0; i < pcm.length; i += block) {
    const chunk = pcm.subarray(i, Math.min(i + block, pcm.length));
    const out = enc.encodeBuffer(chunk);
    if (out && out.length) parts.push(new Uint8Array(out));
  }
  const end = enc.flush();
  if (end && end.length) parts.push(new Uint8Array(end));
  if (!parts.length) throw new Error("empty mp3");
  return new Blob(parts, { type: "audio/mpeg" });
}
async function blobToWav(blob) {
  const { samples, sampleRate } = await decodeMono(blob);
  const pcm = floatTo16(samples);
  const buf = new ArrayBuffer(44 + pcm.length * 2);
  const v = new DataView(buf);
  const w = (off, s) => { for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i)); };
  w(0, "RIFF");
  v.setUint32(4, 36 + pcm.length * 2, true);
  w(8, "WAVE");
  w(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  w(36, "data");
  v.setUint32(40, pcm.length * 2, true);
  new Int16Array(buf, 44).set(pcm);
  return new Blob([buf], { type: "audio/wav" });
}
async function scoreRecording() {
  if (!speechState.blob) { toast("请先录音"); return; }
  const s = getSet(state.activeId);
  const ta = document.getElementById("answer");
  const fn = window.OralStudio && window.OralStudio.scoreSpeech;
  if (typeof fn !== "function") {
    toast("未找到 OralStudio.scoreSpeech");
    return;
  }
  toast("Whisper 正在转写录音…");
  try {
    const result = await fn({
      blob: speechState.blob,
      mime: speechState.blob.type,
      durationMs: speechState.durationMs,
      set: s,
      question: s.part === 1 ? qText((s.questions || [])[0]) : (s.cue || s.topicZh),
      answerDraft: (collectCurrentAnswerData() || {}).content || "",
      part: s.part
    });
    speechState.lastResult = result || { comments: ["模型没有返回内容"] };
    render();
  } catch (err) {
    speechState.lastResult = {
      comments: ["评分接口报错：" + (err && err.message ? err.message : String(err))]
    };
    render();
  }
}

window.navTo = navTo;
window.setFilter = setFilter;
window.startFirstDue = startFirstDue;
window.persistAnswer = persistAnswer;
window.forkAnswer = forkAnswer;
window.switchVersion = switchVersion;
window.gradeNow = gradeNow;
window.setMode = setMode;
window.toggleTimer = toggleTimer;
window.resetTimer = resetTimer;
window.saveIntervals = saveIntervals;
window.resetIntervals = resetIntervals;
window.exportData = exportData;
window.exportMobileReview = exportMobileReview;
window.syncToMobile = syncToMobile;
window.importData = importData;
window.wipeAll = wipeAll;
window.addCustom = addCustom;
window.loadModelAnswer = loadModelAnswer;
window.switchAnswerTab = switchAnswerTab;
window.highlightSelection = highlightSelection;
window.clearHighlights = clearHighlights;
window.toggleRecord = toggleRecord;
window.scoreRecording = scoreRecording;
window.onCardDragStart = onCardDragStart;
window.onCardDragOver = onCardDragOver;
window.onCardDragLeave = onCardDragLeave;
window.onCardDrop = onCardDrop;
window.onCardDragEnd = onCardDragEnd;
window.openCard = openCard;
window.onPackHandleStart = onPackHandleStart;
window.onPackHandleEnd = onPackHandleEnd;
window.onPackDragOver = onPackDragOver;
window.onPackDragLeave = onPackDragLeave;
window.onPackDrop = onPackDrop;
window.commitPackMeta = commitPackMeta;
window.packTitleKey = packTitleKey;
window.resetPacks = resetPacks;
window.openBankOverview = openBankOverview;
window.closeBankOverview = closeBankOverview;
window.createPack = createPack;
window.downloadRecording = downloadRecording;
window.chooseSaveDir = chooseSaveDir;

window.addEventListener("scroll", () => {
  if (state.view === "bank" && !state.bankOverview) rememberBankScroll();
}, { passive: true });

render();
initSaveDir();
initRecordings();
