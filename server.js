// 展示ランチャー サーバー (Node.js 18 以上、追加パッケージ不要)
// 起動: node server.js  → ブラウザで http://localhost:3000
const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawn, execFile } = require("child_process");

// ---------- 設定 (config.json) ----------
const ROOT = __dirname;
function loadConfig() {
  const def = { title: "展示ランチャー", exhibitsDir: "exhibits", idleSeconds: 90, maxPlayMinutes: 10, port: 3000 };
  try {
    const raw = fs.readFileSync(path.join(ROOT, "config.json"), "utf8").replace(/^﻿/, "");
    return { ...def, ...JSON.parse(raw) };
  } catch (e) {
    console.log("config.json が読めなかったので初期設定で起動します:", e.message);
    return def;
  }
}
const config = loadConfig();
const EXHIBITS_DIR = path.resolve(ROOT, config.exhibitsDir);
const CACHE_DIR = path.join(ROOT, "cache"); // パワポを画像にしたものを置く場所
const IMAGE_EXT = [".png", ".jpg", ".jpeg"];
const VIDEO_EXT = [".mp4", ".webm"];
const PPT_EXT = [".pptx", ".ppt"];
const MIME = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".mp4": "video/mp4", ".webm": "video/webm" };
const SKIP_EXE = /^(unins|unitycrashhandler|vc_redist|dxsetup|crashpad)/i;

const ext = (f) => path.extname(f).toLowerCase();
const isTempOffice = (f) => f.startsWith("~$"); // PowerPoint を開いている間にできる一時ファイル
const byName = (a, b) => a.localeCompare(b, "ja", { numeric: true });

// ============================================================
// パワーポイント → 画像 の変換 (展示PCの PowerPoint を使う)
// ============================================================
const convertState = {}; // id → { stamp, status: "converting" | "error:..." } (パワポを差し替えると再挑戦)
const convertQueue = [];
let converting = false;

function cacheDirOf(id) { return path.join(CACHE_DIR, id); }
function stampOf(file) { const s = fs.statSync(file); return `${path.basename(file)}|${s.size}|${s.mtimeMs}`; }

// 変換済みで、元のパワポから変わっていなければ画像の一覧を返す
function cachedSlides(id, pptFile) {
  const dir = cacheDirOf(id);
  try {
    if (fs.readFileSync(path.join(dir, "stamp.txt"), "utf8") !== stampOf(pptFile)) return null;
    return fs.readdirSync(dir).filter((f) => ext(f) === ".png").sort(byName);
  } catch { return null; }
}

function requestConvert(id, pptFile) {
  const stamp = stampOf(pptFile);
  if (convertState[id] && convertState[id].stamp === stamp) return; // 変換中 or 同じファイルで失敗済み
  if (process.platform !== "win32") { convertState[id] = { stamp, status: "error:パワポの変換は Windows でのみできます" }; return; }
  convertState[id] = { stamp, status: "converting" };
  convertQueue.push({ id, pptFile });
  runQueue();
}

function runQueue() {
  if (converting || !convertQueue.length) return;
  converting = true;
  const { id, pptFile } = convertQueue.shift();
  const out = cacheDirOf(id);
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  console.log(`パワポを変換中: ${id}`);
  const proc = spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File",
    path.join(ROOT, "convert-pptx.ps1"), "-Pptx", pptFile, "-OutDir", out], { windowsHide: true });
  let log = "";
  proc.stdout.on("data", (d) => (log += d));
  proc.stderr.on("data", (d) => (log += d));
  proc.on("exit", (code) => {
    const pngs = fs.existsSync(out) ? fs.readdirSync(out).filter((f) => ext(f) === ".png") : [];
    if (code === 0 && pngs.length) {
      fs.writeFileSync(path.join(out, "stamp.txt"), stampOf(pptFile));
      delete convertState[id];
      console.log(`  変換できました: ${pngs.length} 枚`);
    } else {
      const reason = /PowerPoint\.Application|80040154|ComObject/i.test(log)
        ? "この PC に PowerPoint が入っていないため変換できません" : "パワポを変換できませんでした";
      convertState[id] = { stamp: convertState[id].stamp, status: "error:" + reason };
      console.log(`  ${reason}\n${log.trim()}`);
    }
    converting = false;
    runQueue();
  });
}

// ============================================================
// 提出フォルダを読んで作品一覧を作る
// ============================================================
function readText(file) {
  return fs.readFileSync(file, "utf8").replace(/^﻿/, "");
}

// フォルダの中から exe を探す (3階層まで)
function findExes(dir, depth = 0) {
  if (depth > 3) return [];
  let out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) out = out.concat(findExes(p, depth + 1));
    else if (/\.exe$/i.test(ent.name) && !SKIP_EXE.test(ent.name)) out.push(p);
  }
  return out;
}

const mediaUrl = (id, f) => `/media/${encodeURIComponent(id)}/${encodeURIComponent(f)}`;
const cacheUrl = (id, f) => `/cache/${encodeURIComponent(id)}/${encodeURIComponent(f)}`;

function readExhibit(id) {
  const dir = path.join(EXHIBITS_DIR, id);
  const files = fs.readdirSync(dir).filter((f) => !isTempOffice(f) && fs.statSync(path.join(dir, f)).isFile());

  // ----- 説明: info.txt (1行目タイトル / 2行目名前 / 3行目以降 紹介文 / "exe:" の行は起動ファイル)
  const [nameFromDir, ...titleParts] = id.split("_");
  let title = titleParts.join("_") || id, author = titleParts.length ? nameFromDir : "", summary = "", exeHint = "";
  const infoFile = files.find((f) => f.toLowerCase() === "info.txt");
  if (infoFile) {
    const lines = readText(path.join(dir, infoFile)).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const exeLine = lines.find((l) => /^exe\s*[:：]/i.test(l));
    if (exeLine) exeHint = exeLine.replace(/^exe\s*[:：]\s*/i, "");
    const text = lines.filter((l) => l !== exeLine);
    if (text[0]) title = text[0];
    if (text[1]) author = text[1];
    summary = text.slice(2).join(" ");
  }

  // ----- 見せるもの (ページ) を集める
  // ページ: パワポのスライド(あれば) or 画像。動画は別に「動画を再生」ボタンで見せる
  const images = files.filter((f) => IMAGE_EXT.includes(ext(f))).sort((a, b) =>
    (/^slide\./i.test(b) - /^slide\./i.test(a)) || byName(a, b)); // slide.png を先頭に
  const videos = files.filter((f) => VIDEO_EXT.includes(ext(f))).sort(byName);
  const ppt = files.filter((f) => PPT_EXT.includes(ext(f))).sort(byName)[0];

  let pages = [], notice = null;
  if (ppt) {
    const pptFile = path.join(dir, ppt);
    const slides = cachedSlides(id, pptFile);
    if (slides && slides.length) {
      pages = slides.map((f) => ({ type: "image", url: cacheUrl(id, f) }));
    } else {
      requestConvert(id, pptFile);
      const st = convertState[id]?.status || "converting";
      notice = st === "converting" ? "スライドを準備中です…" : st.slice(6);
    }
  }
  if (!pages.length) pages = images.map((f) => ({ type: "image", url: mediaUrl(id, f) })); // パワポが無い/変換前は画像
  const videoUrls = videos.map((f) => mediaUrl(id, f)); // 複数あれば名前順に続けて再生

  // ----- 起動ファイル: info.txt の指定 → なければフォルダ内で見つかった exe
  let exe = null;
  if (exeHint) {
    const p = path.resolve(dir, exeHint);
    if (p.startsWith(dir) && fs.existsSync(p)) exe = p;
  }
  if (!exe) exe = findExes(dir)[0] || null;

  return { id, title, author, summary, pages, videos: videoUrls, notice, exe };
}

function listExhibits() {
  if (!fs.existsSync(EXHIBITS_DIR)) return { items: [], error: `提出フォルダが見つかりません: ${EXHIBITS_DIR}` };
  const items = [];
  for (const ent of fs.readdirSync(EXHIBITS_DIR, { withFileTypes: true })) {
    if (!ent.isDirectory() || ent.name.startsWith(".")) continue;
    try {
      items.push(readExhibit(ent.name));
    } catch (e) {
      console.log(`読み込めない作品を飛ばしました (${ent.name}):`, e.message); // 1作品の不備で全体を止めない
    }
  }
  items.sort((a, b) => byName(a.id, b.id));
  return { items, error: null };
}

// 提出フォルダの直下に置いた QR コード画像 (名前に「qr」を含む png / jpg)。スマホ閲覧用の案内に表示する
function findQr() {
  try {
    const f = fs.readdirSync(EXHIBITS_DIR).filter((f) => IMAGE_EXT.includes(ext(f)) && /qr/i.test(f)).sort(byName)[0];
    return f ? path.join(EXHIBITS_DIR, f) : null;
  } catch { return null; }
}

// ============================================================
// exe の起動と強制終了 (同時に1つだけ)
// ============================================================
let running = null;

function launch(ex) {
  if (running) return { ok: false, error: "ほかの作品が起動中です" };
  if (!ex.exe) return { ok: false, error: "この作品には起動ファイルがありません" };

  let proc, state = { id: ex.id, title: ex.title, pid: null, startedAt: Date.now() };
  if (process.platform === "win32") {
    // launch.ps1 が exe を起動し、ゲーム画面を一番手前に出して、終わるまで待つ
    proc = spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File",
      path.join(ROOT, "launch.ps1"), "-Exe", ex.exe], { windowsHide: true });
    proc.stdout.on("data", (d) => {
      const text = String(d);
      const m = text.match(/PID=(\d+)/);
      if (m) state.pid = Number(m[1]);
      text.split(/\r?\n/).filter(Boolean).forEach((l) => console.log("  [launch]", l));
    });
    proc.stderr.on("data", (d) => console.log("  [launch エラー]", String(d).trim()));
  } else {
    proc = spawn(ex.exe, [], { cwd: path.dirname(ex.exe) }); // 開発用 (Windows 以外)
    state.pid = proc.pid;
  }
  proc.on("error", (e) => console.log("起動に失敗しました:", e.message));
  proc.on("exit", () => {
    if (running && running.proc === proc) { clearTimeout(running.timer); running = null; }
    console.log(`終了: ${ex.title}`);
  });

  const timer = setTimeout(() => { console.log("制限時間になったので終了します"); stop(); }, config.maxPlayMinutes * 60 * 1000);
  running = { ...state, proc, timer, get pidNow() { return state.pid; } };
  console.log(`起動: ${ex.title} (${ex.exe})`);
  return { ok: true };
}

function stop() {
  if (!running) return;
  const { proc, pidNow } = running;
  if (process.platform === "win32") {
    if (pidNow) execFile("taskkill", ["/PID", String(pidNow), "/T", "/F"], () => {});
    execFile("taskkill", ["/PID", String(proc.pid), "/T", "/F"], () => {});
  } else {
    proc.kill();
  }
}

// ============================================================
// Web サーバー
// ============================================================
function send(res, status, body, type = "application/json; charset=utf-8") {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}
function readBody(req) {
  return new Promise((resolve) => {
    let d = "";
    req.on("data", (c) => { d += c; if (d.length > 10000) req.destroy(); });
    req.on("end", () => resolve(d));
  });
}

// 画像・動画を返す。動画は途中から再生できるよう「Range」(部分送信)に対応する
function sendFile(req, res, full) {
  const type = MIME[ext(full)];
  const size = fs.statSync(full).size;
  const range = req.headers.range && /bytes=(\d*)-(\d*)/.exec(req.headers.range);
  if (range) {
    let start = range[1] ? Number(range[1]) : size - Number(range[2]);
    let end = range[1] && range[2] ? Number(range[2]) : size - 1;
    if (isNaN(start) || start < 0 || start >= size || end >= size || start > end) {
      res.writeHead(416, { "Content-Range": `bytes */${size}` });
      return res.end();
    }
    res.writeHead(206, { "Content-Type": type, "Content-Length": end - start + 1, "Content-Range": `bytes ${start}-${end}/${size}`, "Accept-Ranges": "bytes" });
    return fs.createReadStream(full, { start, end }).pipe(res);
  }
  res.writeHead(200, { "Content-Type": type, "Content-Length": size, "Accept-Ranges": "bytes" });
  fs.createReadStream(full).pipe(res);
}

// /media/<作品>/<ファイル> と /cache/<作品>/<ファイル> を、決めたフォルダの中だけから返す
function serveFrom(baseDir, p, req, res) {
  const [, , id, file] = p.split("/");
  const full = path.resolve(baseDir, id || "", file || "");
  if (!full.startsWith(baseDir + path.sep) || !MIME[ext(full)] || !fs.existsSync(full)) {
    return send(res, 404, { error: "ファイルがありません" });
  }
  sendFile(req, res, full);
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const p = decodeURIComponent(url.pathname);

  try {
    if (req.method === "GET" && (p === "/" || p === "/index.html")) {
      return send(res, 200, fs.readFileSync(path.join(ROOT, "public", "index.html")), "text/html; charset=utf-8");
    }
    if (req.method === "GET" && p === "/style.css") {
      return send(res, 200, fs.readFileSync(path.join(ROOT, "public", "style.css")), "text/css; charset=utf-8");
    }
    if (req.method === "GET" && p === "/app.js") {
      return send(res, 200, fs.readFileSync(path.join(ROOT, "public", "app.js")), "text/javascript; charset=utf-8");
    }

    if (req.method === "GET" && p === "/api/exhibits") {
      const { items, error } = listExhibits();
      return send(res, 200, {
        title: config.title, idleSeconds: config.idleSeconds, error,
        qr: findQr() ? "/qr" : null,
        exhibits: items.map(({ exe, ...e }) => ({ ...e, hasExe: Boolean(exe) })),
      });
    }

    if (req.method === "GET" && p === "/qr") {
      const qr = findQr();
      return qr ? sendFile(req, res, qr) : send(res, 404, { error: "QR コードがありません" });
    }

    if (req.method === "GET" && p.startsWith("/media/")) return serveFrom(EXHIBITS_DIR, p, req, res);
    if (req.method === "GET" && p.startsWith("/cache/")) return serveFrom(CACHE_DIR, p, req, res);

    if (req.method === "POST" && p === "/api/launch") {
      const { id } = JSON.parse((await readBody(req)) || "{}");
      const ex = listExhibits().items.find((e) => e.id === id);
      if (!ex) return send(res, 404, { ok: false, error: "作品が見つかりません" });
      const r = launch(ex);
      return send(res, r.ok ? 200 : 409, r);
    }

    if (req.method === "GET" && p === "/api/status") {
      return send(res, 200, {
        running: running ? { id: running.id, title: running.title, startedAt: running.startedAt } : null,
        maxPlayMinutes: config.maxPlayMinutes,
      });
    }

    if (req.method === "POST" && p === "/api/stop") {
      stop();
      return send(res, 200, { ok: true });
    }

    send(res, 404, { error: "not found" });
  } catch (e) {
    console.log("エラー:", e.message);
    if (!res.headersSent) send(res, 500, { error: e.message });
  }
}).listen(config.port, "127.0.0.1", () => {
  const { items, error } = listExhibits();
  console.log(`展示ランチャー: http://localhost:${config.port}`);
  console.log(`提出フォルダ: ${EXHIBITS_DIR}`);
  console.log(error ? `注意: ${error}` : `作品数: ${items.length} (うち遊べるもの ${items.filter((e) => e.exe).length})`);
});
