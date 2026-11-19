const $ = (id) => document.getElementById(id);
let exhibits = [], current = -1, idleSeconds = 90, playing = false, cols = 1;
const no = (i) => String(i + 1).padStart(2, "0");

// ============================================================
// 一覧を表示する
// ============================================================
async function loadList() {
  try {
    const data = await (await fetch("/api/exhibits")).json();
    exhibits = data.exhibits;
    idleSeconds = data.idleSeconds;
    $("title").textContent = data.title;
    document.title = data.title;
    fitTitle();
    $("count").innerHTML = `<b>${exhibits.length}</b><span>作品</span>`;
    // QR コードは提出フォルダに置いたときだけ出す
    if (data.qr && $("qr").hidden) $("qrimg").src = `${data.qr}?t=${Date.now()}`; // 差し替えた画像も出るよう毎回の時刻を付ける
    $("qr").hidden = !data.qr;
    renderGrid(data.error);
  } catch (e) {
    renderGrid("サーバーにつながりません。黒い画面で node server.js が動いているか確認してください。");
  }
}

function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

// カードの絵: 最初のページ。スライドが無く動画だけなら動画の1秒目。パワポ変換中はお知らせを出す
function thumbHtml(e) {
  const first = e.pages[0];
  if (first) return `<img class="thumb" src="${first.url}" alt="" loading="lazy">`;
  if (e.videos.length && !e.notice) return `<video class="thumb" src="${e.videos[0]}#t=1" muted preload="metadata"></video>`;
  return `<span class="thumb ${e.notice ? "wait" : "none"}">${esc(e.notice || "スライドがありません")}</span>`;
}
// カード右上の小さな印 (ページ数・動画あり)
function chipsHtml(e) {
  const chips = [];
  if (e.pages.length > 1) chips.push(`${e.pages.length} ページ`);
  if (e.videos.length) chips.push("動画");
  return chips.length ? `<span class="chips">${chips.map((c) => `<span class="chip">${c}</span>`).join("")}</span>` : "";
}

let refreshTimer;
function renderGrid(error) {
  // パワポを変換中の作品があれば、3秒ごとに読み直して終わったら表示する
  clearTimeout(refreshTimer);
  if (exhibits.some((e) => e.notice && e.notice.includes("準備中"))) {
    refreshTimer = setTimeout(() => { if (!$("home").hidden) loadList(); }, 3000);
  }
  if (error || !exhibits.length) {
    $("grid").innerHTML = `<p class="empty">${esc(error || "まだ作品がありません。提出フォルダに作品のフォルダを入れてください。")}</p>`;
    return;
  }
  $("grid").innerHTML = exhibits.map((e, i) => `
    <button class="card" data-i="${i}">
      ${thumbHtml(e)}
      ${chipsHtml(e)}
      <span class="meta">
        <span class="no">${no(i)}</span>
        <span class="t">${esc(e.title)}</span>
        <span class="a">${esc(e.author || "")}</span>
      </span>
      ${e.hasExe ? `<span class="badge">▶ 遊べる</span>` : ""}
    </button>`).join("");
  document.querySelectorAll(".card").forEach((c) => (c.onclick = () => openViewer(+c.dataset.i)));
  layoutGrid();
}

// 作品数に合わせて「何列にすればカードが一番大きくなるか」を計算する
// カードの高さ = 幅 × (9/16 [スライド] + 0.34 [番号と名前の部分])
const CARD_RATIO = 9 / 16 + 0.34;
const MIN_CARD = 220; // これより小さくなる場合はスクロールさせる
const RAIL = 32; // 段ごとのレールのための余白 (CSS の --rail と同じ値)
const PAD = { x: 32, top: 16 + RAIL, bottom: 32 }; // #grid の基本の余白 (CSS の padding と同じ値)
function layoutGrid() {
  const grid = $("grid");
  const n = exhibits.length;
  if (!n) return;
  // 左右の余白は前回の計算で広げてあるので、いまの余白ではなく基本の余白を引く
  const W = grid.clientWidth - PAD.x * 2;
  const H = grid.clientHeight - PAD.top - PAD.bottom;
  const gap = Math.round(Math.max(16, Math.min(40, W * 0.018)));

  let best = { cw: 0, cols: 1 };
  for (let c = 1; c <= n; c++) {
    const rows = Math.ceil(n / c);
    const byWidth = (W - gap * (c - 1)) / c;
    const byHeight = ((H - (gap + RAIL) * (rows - 1)) / rows) / CARD_RATIO;
    const cw = Math.min(byWidth, byHeight);
    if (cw > best.cw) best = { cw, cols: c };
  }
  let cw = Math.floor(best.cw);
  cols = best.cols;
  if (cw < MIN_CARD) { // 作品がとても多いとき: 最低サイズで並べてスクロール
    cw = MIN_CARD;
    cols = Math.max(1, Math.floor((W + gap) / (cw + gap)));
  }
  const apply = () => {
    grid.style.setProperty("--cw", cw + "px");
    grid.style.setProperty("--gap", gap + "px");
    // 列数どおりに折り返すよう、並びの幅を決める(左右の余白は均等になる)
    // % で書くと親の横幅が基準になってしまうので px で決める
    grid.style.paddingInline = Math.max(PAD.x, Math.floor((grid.clientWidth - (cols * cw + (cols - 1) * gap)) / 2)) + "px";
  };
  apply();
  // 見積もりより実際のカードが高く、はみ出してしまったら少しずつ小さくする
  while (cw > MIN_CARD && grid.scrollHeight > grid.clientHeight) {
    cw = Math.max(MIN_CARD, cw - 4);
    apply();
  }
  drawRails();
}

// 段ごとに横のレールを引く。どの段も同じ長さにして、カードの関節(丸)がレールに乗るようにする
function drawRails() {
  const grid = $("grid");
  grid.querySelectorAll(".rail").forEach((r) => r.remove());
  const cards = [...grid.querySelectorAll(".card")];
  if (!cards.length) return;
  const left = Math.min(...cards.map((c) => c.offsetLeft));
  const right = Math.max(...cards.map((c) => c.offsetLeft + c.offsetWidth));
  const inset = cards[0].offsetWidth * 0.15;
  for (const top of new Set(cards.map((c) => c.offsetTop))) {
    const r = document.createElement("div");
    r.className = "rail";
    r.style.cssText = `top:${top - 22}px;left:${left + inset}px;width:${right - left - inset * 2}px`;
    grid.prepend(r); // カードより先に置いて、関節の丸がレールの上に重なるようにする
  }
}
// タイトルが1行に入りきらないときは、入るまで文字を小さくする (一番小さくて 18px)
function fitTitle() {
  const h1 = $("title");
  h1.style.fontSize = "";
  let size = parseFloat(getComputedStyle(h1).fontSize);
  while (h1.scrollWidth > h1.clientWidth && size > 18) h1.style.fontSize = --size + "px";
}
addEventListener("resize", fitTitle);
$("qrimg").addEventListener("load", fitTitle); // QR コードが出ると、タイトルに使える幅が狭くなる

// 画面の大きさが変わったときや、QR コードが出た/消えて見出しの高さが変わったときに並べ直す
new ResizeObserver(layoutGrid).observe($("grid"), { box: "border-box" });

// 矢印キーでカードを移動
function moveFocus(key) {
  const cards = [...document.querySelectorAll(".card")];
  if (!cards.length) return;
  let i = cards.indexOf(document.activeElement);
  if (i < 0) { cards[0].focus(); return; }
  const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols }[key];
  const j = Math.min(cards.length - 1, Math.max(0, i + step));
  cards[j].focus();
  cards[j].scrollIntoView({ block: "nearest" });
}

// ============================================================
// 1枚を大きく見る
// ============================================================
let page = 0;
function openViewer(i, startAtLast = false) {
  current = (i + exhibits.length) % exhibits.length;
  const e = exhibits[current];
  page = startAtLast ? Math.max(0, e.pages.length - 1) : 0;
  $("vno").textContent = no(current);
  $("vtitle").textContent = e.title;
  $("vauthor").textContent = [e.author, e.summary].filter(Boolean).join(" ― ");
  $("play").hidden = !e.hasExe;
  $("watch").hidden = !e.videos.length;
  $("home").hidden = true;
  $("viewer").hidden = false;
  showPage();
  [$("play"), $("watch"), $("next")].find((b) => !b.hidden).focus();
}

// いまのページ(スライド画像)を表示する。動画を再生中なら止めてスライドに戻る
function showPage() {
  const e = exhibits[current];
  const pg = e.pages[page];
  const img = $("vimg"), notice = $("vnotice");
  closeVideo();
  img.hidden = notice.hidden = true;
  if (pg) {
    img.src = pg.url;
    img.alt = e.title;
    img.hidden = false;
  } else {
    notice.textContent = e.notice || (e.videos.length ? "「動画を再生」を押すと動画が流れます" : "スライドがありません");
    notice.hidden = false;
  }
  $("pager").textContent = e.pages.length > 1 ? `${page + 1} / ${e.pages.length}` : "";
}

// ============================================================
// 動画: 「動画を再生」ボタンを押したときだけ再生する
// ============================================================
let videoIndex = -1; // 再生中の動画の番号 (-1 = スライドを表示中)
function playVideo(k = 0) {
  const e = exhibits[current], video = $("vvideo");
  videoIndex = k;
  $("vimg").hidden = $("vnotice").hidden = true;
  video.src = e.videos[k];
  video.hidden = false;
  video.play().catch(() => {}); // 再生できなくても、動画の再生ボタンで見られる
  $("pager").textContent = e.videos.length > 1 ? `動画 ${k + 1} / ${e.videos.length}` : "動画";
  $("watch").textContent = "■ 動画を閉じる";
  $("watch").classList.add("on");
}

function closeVideo() {
  if (videoIndex < 0) return;
  videoIndex = -1;
  stopVideo();
  $("vvideo").hidden = true;
  $("watch").textContent = "▶ 動画を再生";
  $("watch").classList.remove("on");
}

// 最後まで見たら次の動画へ。全部終わったらスライドに戻る
$("vvideo").onended = () => {
  if (videoIndex + 1 < exhibits[current].videos.length) playVideo(videoIndex + 1);
  else { showPage(); $("watch").focus(); }
};

// 次へ/前へ: 作品の中のページを進め、最後(最初)まで来たら隣の作品へ
function step(dir) {
  const n = exhibits[current].pages.length;
  if (page + dir >= 0 && page + dir < n) { page += dir; showPage(); }
  else openViewer(current + dir, dir < 0);
}

function stopVideo() {
  const v = $("vvideo");
  v.pause();
  v.removeAttribute("src");
  v.load();
}

function goHome() {
  const last = current;
  closeVideo();
  $("viewer").hidden = true;
  $("home").hidden = false;
  current = -1;
  loadList().then(() => document.querySelector(`.card[data-i="${last}"]`)?.focus()); // 新しい提出も読み直す
}

$("back").onclick = goHome;
$("prev").onclick = () => step(-1);
$("next").onclick = () => step(1);
$("vimg").onclick = () => step(1); // スライドを押しても次へ
$("play").onclick = () => launch(exhibits[current]);
$("watch").onclick = () => (videoIndex < 0 ? playVideo() : showPage());

// ============================================================
// 放置したら一覧に戻る
// ============================================================
let idleTimer;
function resetIdle() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    const v = $("vvideo");
    if (!v.hidden && !v.paused && !v.ended) { resetIdle(); return; } // 動画を再生中は戻らない
    if (!playing && !$("viewer").hidden) goHome();
  }, idleSeconds * 1000);
}
["pointerdown", "pointermove", "keydown", "wheel", "touchstart"].forEach((ev) => addEventListener(ev, resetIdle, { passive: true }));

// ============================================================
// exe を起動する → 終わったら戻る
// ============================================================
async function launch(e) {
  if (videoIndex >= 0) showPage(); // 動画を見ていたら止めてスライドに戻す
  const res = await fetch("/api/launch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: e.id }) });
  const data = await res.json();
  if (!data.ok) { toast(data.error || "起動できませんでした"); return; }
  showPlaying(e.title);
}

let pollTimer;
function showPlaying(title) {
  playing = true;
  $("ptitle").textContent = title;
  $("playing").hidden = false;
  clearInterval(pollTimer);
  pollTimer = setInterval(checkStatus, 1000);
  checkStatus();
}

async function checkStatus() {
  try {
    const s = await (await fetch("/api/status")).json();
    if (!s.running) {
      clearInterval(pollTimer);
      playing = false;
      $("playing").hidden = true;
      resetIdle();
      $("play").focus();
      return;
    }
    const sec = Math.floor((Date.now() - s.running.startedAt) / 1000);
    const left = Math.max(0, s.maxPlayMinutes * 60 - sec);
    $("ptime").textContent = `あと ${Math.floor(left / 60)}分${String(left % 60).padStart(2, "0")}秒で自動的に終了します`;
  } catch (e) { /* 次の確認で回復 */ }
}

// ============================================================
// 係の人用の非常ボタン (Ctrl + Shift + Q)
// ============================================================
async function emergencyStop() {
  await fetch("/api/stop", { method: "POST" }).catch(() => {});
  toast("作品を強制終了しました");
}

// ---------- キー操作 ----------
addEventListener("keydown", (ev) => {
  if (ev.ctrlKey && ev.shiftKey && ev.key.toLowerCase() === "q") { ev.preventDefault(); emergencyStop(); return; }
  if (playing) return;
  if (!$("viewer").hidden) {
    if ((ev.key === "Escape" || ev.key === "Backspace") && videoIndex >= 0) { ev.preventDefault(); showPage(); $("watch").focus(); } // 動画中はスライドへ
    else if (ev.key === "Escape" || ev.key === "Backspace") { ev.preventDefault(); goHome(); }
    else if (ev.key === "ArrowLeft" || ev.key === "PageUp") { ev.preventDefault(); step(-1); }
    else if (ev.key === "ArrowRight" || ev.key === "PageDown") { ev.preventDefault(); step(1); }
    // Enter は、選ばれているボタン(遊ぶ・▶ など)がそのまま押される
  } else if (ev.key.startsWith("Arrow")) {
    ev.preventDefault();
    moveFocus(ev.key);
  }
});

addEventListener("contextmenu", (ev) => ev.preventDefault());
addEventListener("dragstart", (ev) => ev.preventDefault());

let toastTimer;
function toast(msg) {
  $("toast").textContent = msg;
  $("toast").hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($("toast").hidden = true), 3000);
}

loadList().then(async () => {
  resetIdle();
  try {
    const s = await (await fetch("/api/status")).json();
    if (s.running) showPlaying(s.running.title);
  } catch (e) {}
});
