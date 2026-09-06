// ============================================
// 應用程式邏輯
// ============================================

const STORAGE_KEY = "ej_progress_v1";
const BOX_INTERVALS = [0, 1, 3, 7, 14]; // box 1~5 對應的複習間隔（天）

function todayStr() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + n);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

function loadProgress() {
  let raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return { vocab: {}, readPassages: {}, dailyLog: {} };
  }
  try {
    return JSON.parse(raw);
  } catch (e) {
    return { vocab: {}, readPassages: {}, dailyLog: {} };
  }
}

function saveProgress(p) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
}

let progress = loadProgress();

function ensureVocabInit() {
  let changed = false;
  VOCAB.forEach(v => {
    if (!progress.vocab[v.id]) {
      progress.vocab[v.id] = { box: 1, next: todayStr() };
      changed = true;
    }
  });
  if (changed) saveProgress(progress);
}
ensureVocabInit();

function ensureDay(dateStr) {
  if (!progress.dailyLog[dateStr]) {
    progress.dailyLog[dateStr] = { vocabCount: 0, reading: false, shadow: false };
  }
  return progress.dailyLog[dateStr];
}

function getDueVocab() {
  const t = todayStr();
  return VOCAB.filter(v => progress.vocab[v.id].next <= t);
}

function markVocabResult(id, knew) {
  const p = progress.vocab[id];
  if (knew) {
    p.box = Math.min(p.box + 1, 5);
  } else {
    p.box = 1;
  }
  p.next = addDays(todayStr(), BOX_INTERVALS[p.box - 1]);
  const day = ensureDay(todayStr());
  day.vocabCount += 1;
  saveProgress(progress);
}

function markReadingDone(passageId) {
  progress.readPassages[passageId] = todayStr();
  const day = ensureDay(todayStr());
  day.reading = true;
  saveProgress(progress);
}

function markShadowDone() {
  const day = ensureDay(todayStr());
  day.shadow = true;
  saveProgress(progress);
}

function computeStreak() {
  let streak = 0;
  let d = todayStr();
  while (true) {
    const log = progress.dailyLog[d];
    const active = log && (log.vocabCount > 0 || log.reading || log.shadow);
    if (!active) {
      // 今天還沒開始不算斷，往前一天檢查即可判斷是否延續
      if (d === todayStr() && streak === 0) {
        d = addDays(d, -1);
        continue;
      }
      break;
    }
    streak += 1;
    d = addDays(d, -1);
  }
  return streak;
}

function speak(text, rate) {
  if (!("speechSynthesis" in window)) {
    alert("你的瀏覽器不支援語音朗讀功能，建議使用 Chrome。");
    return;
  }
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "en-US";
  u.rate = rate || 0.9;
  window.speechSynthesis.speak(u);
}

// 從單字文字找出對應的字典解釋（處理簡單複數形）
function lookupVocabByText(word) {
  const w = word.toLowerCase();
  let hit = VOCAB.find(v => v.word.toLowerCase() === w);
  if (hit) return hit;
  if (w.endsWith("s")) {
    const base = w.slice(0, -1);
    hit = VOCAB.find(v => v.word.toLowerCase() === base);
    if (hit) return hit;
  }
  return null;
}

// ============================================
// 畫面渲染
// ============================================

const app = document.getElementById("app");
const tabs = document.querySelectorAll(".tab-btn");
tabs.forEach(btn => btn.addEventListener("click", () => {
  tabs.forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  renderView(btn.dataset.view);
}));

function renderView(view) {
  if (view === "dashboard") renderDashboard();
  else if (view === "vocab") renderVocab();
  else if (view === "reading") renderReading();
  else if (view === "shadow") renderShadow();
}

// ---------- 首頁 / 進度追蹤 ----------
function renderDashboard() {
  const t = todayStr();
  const day = progress.dailyLog[t] || { vocabCount: 0, reading: false, shadow: false };
  const streak = computeStreak();
  const dueCount = getDueVocab().length;

  let cells = "";
  for (let i = 13; i >= 0; i--) {
    const d = addDays(t, -i);
    const log = progress.dailyLog[d];
    const active = log && (log.vocabCount > 0 || log.reading || log.shadow);
    cells += `<div class="trail-dot ${active ? "on" : ""}" title="${d}"></div>`;
  }

  app.innerHTML = `
    <section class="card hero-card">
      <p class="eyebrow-free">今天是 ${t}</p>
      <h2>連續學習 <span class="streak-num">${streak}</span> 天</h2>
      <div class="trail-row">${cells}</div>
    </section>

    <section class="card">
      <h3>今日三件事</h3>
      <ul class="task-list">
        <li class="${day.vocabCount > 0 ? "done" : ""}">
          <span>單字複習</span>
          <span class="task-status">${day.vocabCount} 個已複習・還有 ${dueCount} 個待複習</span>
        </li>
        <li class="${day.reading ? "done" : ""}">
          <span>閱讀短文</span>
          <span class="task-status">${day.reading ? "今天已完成" : "尚未完成"}</span>
        </li>
        <li class="${day.shadow ? "done" : ""}">
          <span>口說跟讀</span>
          <span class="task-status">${day.shadow ? "今天已完成" : "尚未完成"}</span>
        </li>
      </ul>
    </section>

    <section class="card">
      <h3>快速開始</h3>
      <div class="quick-links">
        <button class="btn primary" onclick="document.querySelector('[data-view=vocab]').click()">開始背單字</button>
        <button class="btn" onclick="document.querySelector('[data-view=reading]').click()">閱讀短文</button>
        <button class="btn" onclick="document.querySelector('[data-view=shadow]').click()">口說跟讀</button>
      </div>
    </section>
  `;
}

// ---------- 單字卡 ----------
let vocabQueue = [];
let vocabIndex = 0;
let vocabRevealed = false;

function renderVocab() {
  vocabQueue = getDueVocab();
  vocabIndex = 0;
  vocabRevealed = false;
  renderVocabCard();
}

function renderVocabCard() {
  if (vocabQueue.length === 0) {
    app.innerHTML = `
      <section class="card empty-state">
        <h3>今天沒有待複習的單字了</h3>
        <p>所有單字都在複習排程內，明天再回來繼續累積吧。你也可以到「閱讀」或「口說跟讀」練習其他能力。</p>
      </section>`;
    return;
  }
  if (vocabIndex >= vocabQueue.length) {
    app.innerHTML = `
      <section class="card empty-state">
        <h3>本輪複習完成！</h3>
        <p>你剛剛複習了 ${vocabQueue.length} 個單字。休息一下，或去閱讀短文、練習口說跟讀。</p>
        <button class="btn primary" onclick="renderVocab()">再複習一輪</button>
      </section>`;
    return;
  }
  const v = vocabQueue[vocabIndex];
  const progressLabel = `${vocabIndex + 1} / ${vocabQueue.length}`;

  app.innerHTML = `
    <section class="card flashcard">
      <p class="eyebrow-free">${progressLabel}・第 ${progress.vocab[v.id].box} 關卡</p>
      <div class="word-row">
        <h2>${v.word}</h2>
        <button class="icon-btn" onclick="speak('${v.word.replace(/'/g, "\\'")}')" aria-label="播放發音">🔊</button>
      </div>
      <p class="pos">${v.pos}</p>
      ${vocabRevealed ? `
        <div class="reveal">
          <p class="zh">${v.zh}</p>
          <p class="example">${v.example}</p>
        </div>
        <div class="btn-row">
          <button class="btn danger" onclick="answerVocab('${v.id}', false)">還不熟</button>
          <button class="btn primary" onclick="answerVocab('${v.id}', true)">我認得</button>
        </div>
      ` : `
        <button class="btn primary" onclick="revealVocab()">顯示中文與例句</button>
      `}
    </section>
  `;
}

function revealVocab() {
  vocabRevealed = true;
  renderVocabCard();
}

function answerVocab(id, knew) {
  markVocabResult(id, knew);
  vocabIndex += 1;
  vocabRevealed = false;
  renderVocabCard();
}

// ---------- 閱讀 ----------
function renderReading() {
  const list = PASSAGES.map(p => {
    const done = progress.readPassages[p.id];
    return `
      <li class="passage-item" onclick="openPassage('${p.id}')">
        <div>
          <p class="passage-title">${p.title}</p>
          <p class="passage-meta">${UNITS.find(u => u.id === p.unit).name}・難度 Lv.${p.level}</p>
        </div>
        <span class="badge ${done ? "badge-done" : ""}">${done ? "已讀" : "未讀"}</span>
      </li>`;
  }).join("");

  app.innerHTML = `
    <section class="card">
      <h3>短文閱讀</h3>
      <p class="hint">點一篇短文開始閱讀。文章中的<strong>粗體字</strong>是這個單元的重點單字，點擊可以看解釋。</p>
      <ul class="passage-list">${list}</ul>
    </section>
  `;
}

function highlightPassage(text) {
  return text.replace(/\*\*(.+?)\*\*/g, (m, word) => {
    const v = lookupVocabByText(word);
    if (!v) return `<span class="vocab-hl">${word}</span>`;
    return `<span class="vocab-hl" onclick="showVocabPopup('${v.id}')">${word}</span>`;
  });
}

function openPassage(id) {
  const p = PASSAGES.find(x => x.id === id);
  app.innerHTML = `
    <section class="card">
      <button class="btn back" onclick="renderReading()">← 回文章列表</button>
      <h3>${p.title}</h3>
      <p class="passage-meta">${UNITS.find(u => u.id === p.unit).name}・難度 Lv.${p.level}</p>
      <p class="passage-body">${highlightPassage(p.text)}</p>
      <div id="vocab-popup"></div>
      <button class="btn primary" onclick="markReadingDone('${p.id}'); openPassage('${p.id}')">標記為已讀完</button>
    </section>
  `;
}

function showVocabPopup(id) {
  const v = VOCAB.find(x => x.id === id);
  const el = document.getElementById("vocab-popup");
  if (!el) return;
  el.innerHTML = `
    <div class="popup">
      <p class="popup-word">${v.word} <span class="pos">${v.pos}</span></p>
      <p class="zh">${v.zh}</p>
      <p class="example">${v.example}</p>
    </div>`;
}

// ---------- 口說跟讀 ----------
function renderShadow() {
  const list = PASSAGES.map(p => `
    <li class="passage-item" onclick="openShadowPassage('${p.id}')">
      <div>
        <p class="passage-title">${p.title}</p>
        <p class="passage-meta">${UNITS.find(u => u.id === p.unit).name}・難度 Lv.${p.level}</p>
      </div>
      <span class="badge">跟讀</span>
    </li>`).join("");

  app.innerHTML = `
    <section class="card">
      <h3>口說跟讀</h3>
      <p class="hint">選一篇短文，逐句播放語音、跟著唸出聲。唸熟一句再進到下一句。</p>
      <ul class="passage-list">${list}</ul>
    </section>
  `;
}

let shadowSentences = [];
let shadowIdx = 0;
let shadowRate = 0.8;

function openShadowPassage(id) {
  const p = PASSAGES.find(x => x.id === id);
  const plain = p.text.replace(/\*\*(.+?)\*\*/g, "$1");
  shadowSentences = plain.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 0);
  shadowIdx = 0;
  shadowRate = 0.8;
  renderShadowSentence(p);
}

function renderShadowSentence(p) {
  if (shadowIdx >= shadowSentences.length) {
    app.innerHTML = `
      <section class="card empty-state">
        <h3>這篇文章跟讀完成！</h3>
        <p>你完成了《${p.title}》全部 ${shadowSentences.length} 句的跟讀練習。</p>
        <button class="btn primary" onclick="markShadowDone(); renderShadow()">記錄今日跟讀並回列表</button>
      </section>`;
    return;
  }
  const sentence = shadowSentences[shadowIdx];
  app.innerHTML = `
    <section class="card">
      <button class="btn back" onclick="renderShadow()">← 回文章列表</button>
      <p class="eyebrow-free">${p.title}・第 ${shadowIdx + 1} / ${shadowSentences.length} 句</p>
      <p class="shadow-sentence">${sentence}</p>
      <div class="btn-row">
        <button class="btn" onclick="playShadow(0.7)">🔊 慢速播放</button>
        <button class="btn" onclick="playShadow(1)">🔊 正常速度</button>
      </div>
      <div class="btn-row">
        <button class="btn primary" onclick="nextShadowSentence('${p.id}')">跟讀完成，下一句</button>
      </div>
    </section>
  `;
}

function playShadow(rate) {
  speak(shadowSentences[shadowIdx], rate);
}

function nextShadowSentence(passageId) {
  shadowIdx += 1;
  renderShadowSentence(PASSAGES.find(x => x.id === passageId));
}

// ============================================
// 啟動
// ============================================
renderView("dashboard");
