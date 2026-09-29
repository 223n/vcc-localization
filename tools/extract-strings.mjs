// VCCのJSバンドルから、UI文字列の候補を抽出する開発用ツール。
// 使い方: node tools/extract-strings.mjs [--out work/strings.json] [index-*.jsのパス]
// --outを省略すると標準出力に書き出す。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function findBundle() {
  const assets = path.join(process.env.LOCALAPPDATA, 'Programs', 'VRChat Creator Companion', 'WebApp', 'Dist', 'assets');
  const name = fs.readdirSync(assets).find((n) => /^index-[\w-]+\.js$/.test(n));
  if (!name) throw new Error(`index-*.jsが見つかりません: ${assets}`);
  return path.join(assets, name);
}

// 文字列リテラル・テンプレートリテラルを列挙する簡易トークナイザー。
// 正規表現リテラルとコメントは読み飛ばす（ミニファイ済みコード前提のヒューリスティック）。
export function* scanLiterals(src) {
  const REGEX_PREV = new Set([...'(,=:[!&|?{};+-*%<>~^']);
  const stack = []; // 評価中の${ }を持つテンプレート（depthは式の中の波括弧の深さ）
  let i = 0;
  let lastSignificant = '';
  let lastWord = '';
  while (i < src.length) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      i = end < 0 ? src.length : end + 2;
      continue;
    }
    if (c === '/' && src[i + 1] === '/') {
      const end = src.indexOf('\n', i + 2);
      i = end < 0 ? src.length : end + 1;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      let value = '';
      while (j < src.length && src[j] !== c) {
        if (src[j] === '\\') {
          value += unescapeAt(src, j);
          j += escapeLength(src, j);
        } else {
          value += src[j++];
        }
      }
      yield { kind: 'string', value, start: i, end: j + 1 };
      i = j + 1;
      lastSignificant = c;
      lastWord = '';
      continue;
    }
    if (c === '`' || (c === '}' && stack.length && stack[stack.length - 1].depth === 0)) {
      // テンプレートの開始、または${ }の終わりからの再開。式の部分は{0}, {1}...に置き換える
      let frame;
      if (c === '}') {
        frame = stack.pop();
        frame.parts.push(`{${frame.expressions++}}`);
      } else {
        frame = { depth: 0, parts: [], start: i, expressions: 0 };
      }
      let j = i + 1;
      let raw = '';
      while (j < src.length) {
        if (src[j] === '\\') {
          raw += unescapeAt(src, j);
          j += escapeLength(src, j);
        } else if (src[j] === '`') {
          frame.parts.push(raw);
          yield { kind: 'template', value: frame.parts.join(''), start: frame.start, end: j + 1 };
          frame = null;
          j++;
          break;
        } else if (src[j] === '$' && src[j + 1] === '{') {
          frame.parts.push(raw);
          frame.depth = 0;
          stack.push(frame);
          j += 2;
          break;
        } else {
          raw += src[j++];
        }
      }
      i = j;
      lastSignificant = frame ? '{' : '`';
      lastWord = '';
      continue;
    }
    if (c === '{') {
      if (stack.length) stack[stack.length - 1].depth++;
    } else if (c === '}') {
      if (stack.length) stack[stack.length - 1].depth--;
    }
    if (c === '/') {
      const isRegex = lastSignificant === '' || REGEX_PREV.has(lastSignificant) || ['return', 'typeof', 'case', 'void', 'in', 'of', 'new', 'delete', 'throw'].includes(lastWord);
      if (isRegex) {
        let j = i + 1;
        let inClass = false;
        while (j < src.length) {
          const d = src[j];
          if (d === '\\') { j += 2; continue; }
          if (d === '[') inClass = true;
          else if (d === ']') inClass = false;
          else if (d === '/' && !inClass) break;
          else if (d === '\n') break;
          j++;
        }
        j++;
        while (/[a-z]/i.test(src[j] ?? '')) j++;
        i = j;
        lastSignificant = 'r';
        lastWord = '';
        continue;
      }
    }
    if (/[A-Za-z_$]/.test(c)) {
      let j = i;
      while (j < src.length && /[\w$]/.test(src[j])) j++;
      lastWord = src.slice(i, j);
      lastSignificant = 'a';
      i = j;
      continue;
    }
    if (!/\s/.test(c)) {
      lastSignificant = c;
      lastWord = '';
    }
    i++;
  }
}

function escapeLength(src, j) {
  const n = src[j + 1];
  if (n === 'u') return src[j + 2] === '{' ? src.indexOf('}', j) - j + 1 : 6;
  if (n === 'x') return 4;
  return 2;
}

function unescapeAt(src, j) {
  const n = src[j + 1];
  const map = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', v: '\v', 0: '\0' };
  if (n in map) return map[n];
  if (n === 'u') {
    const hex = src[j + 2] === '{' ? src.slice(j + 3, src.indexOf('}', j)) : src.slice(j + 2, j + 6);
    return String.fromCodePoint(parseInt(hex, 16));
  }
  if (n === 'x') return String.fromCharCode(parseInt(src.slice(j + 2, j + 4), 16));
  if (n === '\n') return '';
  return n;
}

const CLASS_WORDS = new Set(['flex', 'grid', 'hidden', 'block', 'inline', 'truncate', 'relative', 'absolute', 'fixed', 'sticky', 'grow', 'shrink', 'italic', 'underline', 'uppercase', 'lowercase', 'capitalize', 'contents', 'invisible', 'visible', 'static', 'border', 'rounded', 'shadow', 'transition', 'container', 'isolate', 'group', 'peer', 'table', 'outline']);

export function looksLikeUiText(s) {
  const t = s.trim();
  if (t.length < 2 || !/[A-Za-z]{2}/.test(t)) return false;
  if (/^(https?:|wss?:|file:|mailto:|data:|\/|\.\/|#|@)/.test(t)) return false;
  if (/^[A-Z0-9_]+$/.test(t)) return false; // 定数
  if (/^[a-z][A-Za-z0-9]*$/.test(t)) return false; // 識別子
  if (/^[\w$.-]+$/.test(t) && /[._-]/.test(t) && !/\.\.\.$/.test(t)) return false; // com.vrchat.base, some-key（"Loading..."は残す）
  const tokens = t.split(/\s+/);
  if (tokens.every((w) => /[-:[\]/]|^!/.test(w) || CLASS_WORDS.has(w))) return false; // Tailwindクラス（"!mt-2"など）
  if (/^[\w-]+\([^)]*\)$/.test(t)) return false; // calc(...)など
  return true;
}

function propBefore(src, start) {
  const before = src.slice(Math.max(0, start - 300), start);
  const m = /([A-Za-z_$][\w$]*|"[^"]+")\s*:\s*$/.exec(before);
  if (m) return m[1].replace(/"/g, '');
  if (/children:\[[^\]]*$/.test(before)) return 'children[]';
  const call = /([A-Za-z_$][\w$.]*)\(\s*$/.exec(before);
  if (call) return `${call[1]}()`;
  return '';
}

export function extract(src, { from = 0 } = {}) {
  const map = new Map();
  for (const lit of scanLiterals(src)) {
    if (lit.start < from) continue;
    if (!looksLikeUiText(lit.value)) continue;
    const key = `${lit.kind}\u0000${lit.value}`;
    const entry = map.get(key) ?? { text: lit.value, kind: lit.kind, count: 0, props: new Set(), offsets: [], context: '' };
    entry.count++;
    const prop = propBefore(src, lit.start);
    if (prop) entry.props.add(prop);
    if (entry.offsets.length < 3) entry.offsets.push(lit.start);
    if (!entry.context) entry.context = src.slice(Math.max(0, lit.start - 80), Math.min(src.length, lit.end + 80));
    map.set(key, entry);
  }
  return [...map.values()]
    .sort((a, b) => a.offsets[0] - b.offsets[0])
    .map((e) => ({ ...e, props: [...e.props] }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const outIndex = args.indexOf('--out');
  const out = outIndex >= 0 ? args.splice(outIndex, 2)[1] : null;
  const file = args[0] ?? findBundle();
  const src = fs.readFileSync(file, 'utf8');
  const from = Number(process.env.FROM ?? 0);
  const result = extract(src, { from });
  const json = JSON.stringify({ source: path.basename(file), count: result.length, strings: result }, null, 1);
  if (out) {
    fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
    fs.writeFileSync(out, json);
    console.log(`${result.length}件を${out}に書き出しました`);
  } else {
    process.stdout.write(json);
  }
}
