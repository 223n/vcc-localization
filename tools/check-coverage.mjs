// 辞書の網羅状況を調べる開発用ツール。VCCを更新したあとに実行して、訳し漏れと使われなくなった訳を洗い出す。
// 使い方: node tools/check-coverage.mjs [index-*.jsのパス]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extract, findBundle, scanLiterals } from './extract-strings.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UI_PROPS = new Set(['children', 'children[]', 'label', 'content', 'title', 'placeholder', 'aria-label', 'subheader', 'tooltipText', 'text', 'validationMessage', 'description', 'header']);
// VCCのJSではなく、dayjsの組み立てやテンプレートのデータから来る文字列のセクション
const EXTERNAL_SECTIONS = new Set(['相対日時（dayjs）', 'テンプレート（VCC同梱データ）']);

const dict = JSON.parse(fs.readFileSync(path.join(ROOT, 'locales', 'ja.json'), 'utf8'));
const exact = new Map();
const patterns = [];
for (const section of dict.sections) {
  for (const [key, value] of Object.entries(section.exact)) exact.set(key, { value, section: section.name });
  for (const [re] of section.patterns) patterns.push(new RegExp(re));
}

function covered(text) {
  const t = text.trim().replace(/\s+/g, ' ');
  if (exact.has(text) || exact.has(t)) return true;
  // テンプレートの{0}には、それらしい値を入れてから照合する
  const sample = t.replace(/\{\d+\}/g, 'X1');
  return patterns.some((re) => re.test(sample));
}

const file = process.argv[2] ?? findBundle();
const src = fs.readFileSync(file, 'utf8');
const strings = extract(src);
// 使われなくなった訳の判定には、ふるい分け前のすべての文字列リテラルを使う
const bundleTexts = new Set([...scanLiterals(src)].map((lit) => lit.value.trim().replace(/\s+/g, ' ')));

const missing = strings.filter((s) => s.props.some((p) => UI_PROPS.has(p)) && !covered(s.text));
const failures = strings.filter((s) => s.kind === 'template' && /^Failed /.test(s.text) && !covered(s.text));

console.log(`対象: ${path.basename(file)}`);
console.log(`辞書：完全一致${exact.size}件、パターン${patterns.length}件\n`);
console.log(`■辞書にないUI文字列（${missing.length + failures.length}件）`);
for (const s of [...missing, ...failures]) console.log(`  ${JSON.stringify(s.text)}  [${s.props.join(', ')}]`);

const stale = [...exact.entries()].filter(([key, { section }]) => !EXTERNAL_SECTIONS.has(section) && !bundleTexts.has(key.trim().replace(/\s+/g, ' ')));
console.log(`\n■バンドルに見つからない辞書のキー（${stale.length}件。サーバーやテンプレート由来の文字列も含む）`);
for (const [key, { section }] of stale) console.log(`  ${JSON.stringify(key)}  (${section})`);
