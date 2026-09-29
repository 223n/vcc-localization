// 動作確認用サーバー。VCC本体には一切書き込まずに、日本語化した画面をブラウザーで確認する。
//
// - 画面のファイル（WebApp\Dist）はVCCのインストール先から読み取るだけ
// - index.htmlはvcc-ja.ps1 -OutFileで作ったパッチ済みのものを返す（本番と同じ生成手順）
// - /api/はGETだけをVCCのAPI（localhost:5477）へ中継し、それ以外（設定変更や操作）は拒否する
// - WebSocket（ログやプロジェクト作成の進捗）はつながない
//
// 使い方: node tools/dev-server.mjs  →  http://localhost:5480/
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.env.PORT ?? 5480);
const API = 'http://localhost:5477';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(process.env.LOCALAPPDATA, 'Programs', 'VRChat Creator Companion', 'WebApp', 'Dist');
const PATCHED = path.join(ROOT, 'work', 'index.dev.html');
const INPUTS = ['vcc-ja.ps1', 'locales/ja.json', 'src/translator.js', 'src/style.css'].map((f) => path.join(ROOT, f));

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

let builtAt = 0;
function patchedIndex(raw) {
  // ?rawを付けると英語のまま（比較用）
  if (raw) return fs.readFileSync(path.join(DIST, 'index.html'), 'utf8').replace('{{API_URL}}', `localhost:${PORT}`);
  const newest = Math.max(...INPUTS.map((f) => fs.statSync(f).mtimeMs));
  if (newest > builtAt) {
    execFileSync('pwsh', ['-NoProfile', '-File', path.join(ROOT, 'vcc-ja.ps1'), '-Action', 'install', '-OutFile', PATCHED], { stdio: 'pipe' });
    builtAt = Date.now();
  }
  // VCCのサーバーと同じく{{API_URL}}を置き換える。APIはこのサーバーを経由させる
  return fs.readFileSync(PATCHED, 'utf8').replace('{{API_URL}}', `localhost:${PORT}`);
}

function send(res, status, type, body) {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
}

// POSTだが中身は読み取りだけの問い合わせ（VCCのJSでqueryとして定義されているもの）
const READ_ONLY_POSTS = new Set(['/api/projects/manifest', '/api/projects/validatePath']);

async function proxyApi(req, res, url) {
  if (req.method === 'POST' && READ_ONLY_POSTS.has(url.pathname)) {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const upstream = await fetch(API + url.pathname + url.search, {
      method: 'POST',
      headers: { Origin: 'http://localhost:5476', 'Content-Type': req.headers['content-type'] ?? 'application/json' },
      body: Buffer.concat(chunks),
    });
    send(res, upstream.status, upstream.headers.get('content-type') ?? TYPES['.json'], Buffer.from(await upstream.arrayBuffer()));
    return;
  }
  if (req.method !== 'GET') {
    console.log(`  blocked ${req.method} ${url.pathname}`);
    send(res, 403, TYPES['.json'], JSON.stringify({ success: false, error: 'dev-server：読み取り専用のため、この操作は送信していません' }));
    return;
  }
  const upstream = await fetch(API + url.pathname + url.search, { headers: { Origin: 'http://localhost:5476' } });
  const body = Buffer.from(await upstream.arrayBuffer());
  send(res, upstream.status, upstream.headers.get('content-type') ?? TYPES['.json'], body);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  try {
    if (url.pathname.startsWith('/api/')) {
      await proxyApi(req, res, url);
      return;
    }
    // コンソールでawait eval(await (await fetch('/__vccja/selftest.js')).text())と実行する
    if (url.pathname === '/__vccja/selftest.js') {
      send(res, 200, TYPES['.js'], fs.readFileSync(path.join(ROOT, 'tools', 'selftest.js')));
      return;
    }
    const file = path.join(DIST, decodeURIComponent(url.pathname));
    const isAsset = path.extname(url.pathname) && file.startsWith(DIST) && fs.existsSync(file) && fs.statSync(file).isFile();
    if (isAsset && !url.pathname.endsWith('/index.html')) {
      send(res, 200, TYPES[path.extname(file)] ?? 'application/octet-stream', fs.readFileSync(file));
      return;
    }
    // それ以外はSPAのルートとしてindex.htmlを返す
    send(res, 200, TYPES['.html'], patchedIndex(url.searchParams.has('raw')));
  } catch (e) {
    console.error(e);
    send(res, 500, 'text/plain; charset=utf-8', String(e));
  }
});

// ログや進捗のWebSocketはつながない
server.on('upgrade', (req, socket) => socket.destroy());

server.listen(PORT, () => console.log(`dev-server: http://localhost:${PORT}/（APIは読み取りだけを${API}へ中継）`));
