// このプロジェクトのスクリプトを検査する（npm test）。CIでも同じものを動かす。
// - JavaScriptの構文（node --check）
// - 辞書（locales/ja.json）の形、正規表現、重複、訳文の空白
// - ラベルの定義（.github/labels.yml）の色の書き方
// - インストーラー（vcc-ja.ps1）を偽のVCCフォルダーに対して動かし、埋め込みと取り外しを確かめる
// 本物のVCCには触らない。偽のフォルダーは一時ディレクトリに作り、最後に消す。
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE = path.join(ROOT, 'tools', 'fixtures', 'index.html');
const BEGIN = '<!-- vcc-ja:begin -->';
const END = '<!-- vcc-ja:end -->';
// 全角文字（かな、漢字、全角記号）。この隣には空白を置かない
const WIDE = /[⺀-鿿豈-﫿︰-﹏＀-￯]/;

let failures = 0;
function check(name, fn) {
  try {
    fn();
    console.log(`ok  ${name}`);
  } catch (e) {
    failures++;
    console.error(`NG  ${name}\n    ${String(e.message).replace(/\n/g, '\n    ')}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

// ---- JavaScriptの構文
const scripts = [
  'src/translator.js',
  'tools/selftest.js',
  ...fs.readdirSync(path.join(ROOT, 'tools')).filter((f) => f.endsWith('.mjs')).map((f) => `tools/${f}`),
];
for (const file of scripts) {
  check(`構文: ${file}`, () => {
    const result = spawnSync(process.execPath, ['--check', path.join(ROOT, file)], { encoding: 'utf8' });
    assert(result.status === 0, result.stderr);
  });
}

// ---- 辞書
let dict = null;
check('辞書: JSONとして読める', () => {
  dict = JSON.parse(read(path.join(ROOT, 'locales', 'ja.json')));
});

if (dict) {
  check('辞書: セクションの形', () => {
    assert(Array.isArray(dict.sections) && dict.sections.length > 0, 'sectionsが配列ではない');
    for (const section of dict.sections) {
      assert(typeof section.name === 'string' && section.name, 'nameのないセクションがある');
      for (const [key, value] of Object.entries(section.exact ?? {})) {
        assert(typeof value === 'string', `${section.name}: 「${key}」の訳が文字列ではない`);
      }
      for (const pair of section.patterns ?? []) {
        assert(Array.isArray(pair) && pair.length === 2 && pair.every((v) => typeof v === 'string'), `${section.name}: patternsの要素が[正規表現, 置換]ではない`);
      }
    }
  });

  check('辞書: 正規表現が作れる', () => {
    for (const section of dict.sections) {
      for (const [source] of section.patterns ?? []) {
        try {
          new RegExp(source);
        } catch (e) {
          throw new Error(`${section.name}: ${source}\n${e.message}`);
        }
      }
    }
  });

  check('辞書: セクションをまたいで同じキーに別の訳がない', () => {
    const seen = new Map();
    const conflicts = [];
    for (const section of dict.sections) {
      for (const [key, value] of Object.entries(section.exact ?? {})) {
        const prev = seen.get(key);
        if (prev && prev.value !== value) conflicts.push(`「${key}」: ${prev.section}と${section.name}`);
        seen.set(key, { value, section: section.name });
      }
    }
    assert(conflicts.length === 0, conflicts.join('\n'));
  });

  // 行頭の「• 」は箇条書きの記号なので除く
  check('辞書: 訳文で全角の隣に空白を置いていない', () => {
    const bad = [];
    for (const section of dict.sections) {
      const values = [...Object.values(section.exact ?? {}), ...(section.patterns ?? []).map((p) => p[1])];
      for (const value of values) {
        const body = value.replace(/^• /, '');
        if (/ +/.test(body) && [...body.matchAll(/(\S) +(?=(\S))/g)].some((m) => WIDE.test(m[1]) || WIDE.test(m[2]))) {
          bad.push(`${section.name}: ${JSON.stringify(value)}`);
        }
      }
    }
    assert(bad.length === 0, bad.join('\n'));
  });
}

// ---- ラベルの定義
// ラベルを揃えるワークフローは色を文字列として読む。引用符を忘れると # 以降がコメントになり、色が空になって落ちる
check('ラベル: 色を引用符付きの#RRGGBBで書いている', () => {
  const bad = read(path.join(ROOT, '.github', 'labels.yml'))
    .split(/\r?\n/)
    .filter((line) => /^\s+color:/.test(line) && !/^\s+color: '#[0-9a-fA-F]{6}'$/.test(line));
  assert(bad.length === 0, bad.join('\n'));
});

// ---- インストーラー
function findPowerShell() {
  const candidates = process.platform === 'win32' ? ['pwsh', 'powershell'] : ['pwsh'];
  for (const name of candidates) {
    const result = spawnSync(name, ['-NoProfile', '-Command', '$PSVersionTable.PSVersion.ToString()'], { encoding: 'utf8' });
    if (result.status === 0) return name;
  }
  return null;
}

function runInstaller(ps, args) {
  const result = spawnSync(ps, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(ROOT, 'vcc-ja.ps1'), ...args], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`vcc-ja.ps1 ${args.join(' ')} が失敗した（終了コード${result.status}）\n${result.stdout}${result.stderr}`);
  return result;
}

const ps = findPowerShell();
check('インストーラー: PowerShellがある', () => {
  assert(ps, 'pwshが見つからない。PowerShell 7を入れる');
});

if (ps) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vcc-ja-test-'));
  const dist = path.join(tmp, 'WebApp', 'Dist');
  const index = path.join(dist, 'index.html');
  const backup = `${index}.vcc-ja.bak`;
  const original = read(FIXTURE);
  fs.mkdirSync(dist, { recursive: true });
  fs.writeFileSync(index, original);
  fs.writeFileSync(path.join(dist, 'buildInfo.json'), JSON.stringify({ version: { Major: 9, Minor: 9, Patch: 9 } }));

  try {
    let installed = null;
    check('インストーラー: 埋め込める', () => {
      runInstaller(ps, ['-Action', 'install', '-VccPath', tmp]);
      installed = read(index);
      assert(installed.split(BEGIN).length === 2 && installed.split(END).length === 2, '開始と終了の印が1つずつではない');
      assert(read(backup) === original, 'バックアップが元のindex.htmlと一致しない');
    });

    if (installed) {
      const block = installed.slice(installed.indexOf(BEGIN), installed.indexOf(END) + END.length);

      check('インストーラー: 埋め込みを除くと元に戻る', () => {
        assert(installed.replace(`${block}\n`, '') === original, '埋め込み以外の部分が変わっている');
      });

      check('インストーラー: 埋め込みはASCIIだけで、VCC本体より前にある', () => {
        assert(!/[^\x00-\x7F]/.test(block), 'ASCII以外の文字がある');
        assert(installed.indexOf(BEGIN) < installed.indexOf('<script type="module"'), '翻訳スクリプトがVCC本体より後ろにある');
        assert(installed.split('{{').length === original.split('{{').length, '{{が増えている');
        assert(/<style>[\s\S]*\.fui-Title1\[data-vccja\][\s\S]*<\/style>/.test(block), 'style.cssが入っていない');
      });

      check('インストーラー: 埋め込んだスクリプトが正しい', () => {
        const script = /<script>\n([\s\S]*?)<\/script>/.exec(block)?.[1];
        assert(script, 'scriptが見つからない');
        const file = path.join(tmp, 'injected.js');
        fs.writeFileSync(file, script);
        const syntax = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
        assert(syntax.status === 0, syntax.stderr);
        const context = { window: {} };
        vm.runInNewContext(script.slice(0, script.indexOf('\n(function (dict)')), context);
        assert(JSON.stringify(context.window.__VCCJA_DICT__) === JSON.stringify(dict), '埋め込んだ辞書がlocales/ja.jsonと一致しない');
      });

      check('インストーラー: もう一度入れても結果が変わらない', () => {
        runInstaller(ps, ['-Action', 'install', '-VccPath', tmp]);
        assert(read(index) === installed, '2回目のインストールで内容が変わった');
        assert(read(backup) === original, '2回目のインストールでバックアップが変わった');
      });

      check('インストーラー: -OutFileの出力がインストールと同じ', () => {
        const out = path.join(tmp, 'out.html');
        runInstaller(ps, ['-Action', 'install', '-SourceIndex', FIXTURE, '-OutFile', out]);
        assert(read(out) === installed, '-OutFileの出力がインストールした内容と違う');
      });

      check('インストーラー: 状態を表示できる', () => {
        runInstaller(ps, ['-Action', 'status', '-VccPath', tmp]);
      });

      check('インストーラー: 取り外すと元に戻る', () => {
        runInstaller(ps, ['-Action', 'uninstall', '-VccPath', tmp]);
        assert(read(index) === original, 'index.htmlが元に戻らない');
        assert(!fs.existsSync(backup), 'バックアップが残っている');
        runInstaller(ps, ['-Action', 'uninstall', '-VccPath', tmp]);
        assert(read(index) === original, '2回目のアンインストールで内容が変わった');
      });
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

console.log(failures === 0 ? '\nすべて通りました' : `\n${failures}件が失敗しました`);
process.exit(failures === 0 ? 0 : 1);
