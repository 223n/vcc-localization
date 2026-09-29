/*
 * VCC日本語化パッチ（非公式）：実行時翻訳スクリプト
 * Copyright (c) 2026 223n <223n@223n.tech>
 * SPDX-License-Identifier: MIT
 * 辞書に含まれる英語の文字列はVRChat Inc.に帰属し、MITライセンスの対象外（NOTICEを参照）。
 *
 * VCCの画面（DOM）に出てくる英語テキストを、辞書に従って日本語へ置き換える。
 * VCC本体のJSバンドルには手を加えない。辞書にない文字列は英語のまま残る。
 * vcc-ja.ps1が辞書（window.__VCCJA_DICT__）と一緒にindex.htmlへ埋め込む。
 */
(function (dict) {
  'use strict';
  if (!dict || window.__vccJa) return;

  var ATTRS = ['placeholder', 'title', 'aria-label'];
  // 中身をたどらない要素と、属性は訳すが本文は訳さない要素（入力値やコード）
  var SKIP_SUBTREE = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1 };
  var NO_TEXT = 'textarea,code,pre,[contenteditable]:not([contenteditable="false"])';
  // 全角文字（かな、漢字、全角記号）。この隣には空白を置かない
  var WIDE = /[⺀-鿿豈-﫿︰-﹏＀-￯]/;
  var skipSelector = dict.skip || '';
  var hasOwn = Object.prototype.hasOwnProperty;

  // 辞書は画面ごとのセクションに分かれているので、ひとつの表にまとめる
  var exact = {};
  var patterns = [];
  (dict.sections || []).forEach(function (section) {
    var entries = section.exact || {};
    for (var key in entries) {
      if (hasOwn.call(entries, key)) exact[key] = entries[key];
    }
    (section.patterns || []).forEach(function (p) {
      patterns.push([new RegExp(p[0]), p[1]]);
    });
  });

  // Reactが書いた原文と、こちらが最後に書いた訳文を覚えておく。
  // 現在値が訳文と違えばReactが書き換えたとみなし、原文を更新する。
  var textSource = new WeakMap();
  var textWritten = new WeakMap();
  var attrState = new WeakMap();

  function isWide(ch) {
    return !!ch && WIDE.test(ch);
  }

  function translateCore(text) {
    if (hasOwn.call(exact, text)) return exact[text];
    var normalized = text.replace(/\s+/g, ' ');
    if (hasOwn.call(exact, normalized)) return exact[normalized];
    for (var i = 0; i < patterns.length; i++) {
      if (patterns[i][0].test(normalized)) return normalized.replace(patterns[i][0], patterns[i][1]);
    }
    return null;
  }

  // 空白込みのキーが辞書にあればそれを使う。なければ前後の空白を除いて照合し、
  // 原文の前後の空白は、訳文の端が全角でない場合だけ残す。
  function translate(text) {
    if (hasOwn.call(exact, text)) return exact[text];
    var core = text.trim();
    if (!core) return null;
    var result = translateCore(core);
    if (result === null) return null;
    var lead = isWide(result.charAt(0)) ? '' : text.match(/^\s*/)[0];
    var trail = isWide(result.charAt(result.length - 1)) ? '' : text.match(/\s*$/)[0];
    return lead + result + trail;
  }

  function sourceOf(node) {
    var value = node.nodeValue;
    if (textWritten.get(node) === value) return textSource.get(node);
    textSource.set(node, value);
    textWritten.delete(node);
    return value;
  }

  function write(node, value) {
    if (node.nodeValue !== value) node.nodeValue = value;
    textWritten.set(node, value);
  }

  function isSkipped(el) {
    return !!(skipSelector && el.closest(skipSelector));
  }

  function isTextSkipped(el) {
    return hasOwn.call(SKIP_SUBTREE, el.tagName.toUpperCase()) || !!el.closest(NO_TEXT);
  }

  // 兄弟ノードをたどって、隣に表示されている文字を返す（stepが負なら前、正なら後ろ）
  function neighborChar(node, step) {
    for (var n = step < 0 ? node.previousSibling : node.nextSibling; n; n = step < 0 ? n.previousSibling : n.nextSibling) {
      var text = n.nodeType === 1 || n.nodeType === 3 ? n.textContent.trim() : '';
      if (text) return step < 0 ? text.charAt(text.length - 1) : text.charAt(0);
    }
    return '';
  }

  // 要素直下のテキストを訳す。テキストだけで構成される要素（例: "Creating "とプロジェクト名）は
  // 連結した文で照合し、訳文を先頭ノードへまとめる。要素が混ざる場合は断片ごとに照合し、
  // 要素の間の空白は、隣が全角なら詰める。
  function translateTexts(el) {
    if (isTextSkipped(el)) return;
    var texts = [];
    var mixed = false;
    for (var c = el.firstChild; c; c = c.nextSibling) {
      if (c.nodeType === 3) texts.push(c);
      else if (c.nodeType === 1) mixed = true;
    }
    if (!texts.length) return;
    var sources = texts.map(sourceOf);
    var changed = false;
    var joined = !mixed && texts.length > 1 ? translate(sources.join('')) : null;
    if (joined !== null) {
      write(texts[0], joined);
      for (var i = 1; i < texts.length; i++) write(texts[i], '');
      changed = true;
    } else {
      for (var j = 0; j < texts.length; j++) {
        var source = sources[j];
        var out = translate(source);
        if (out !== null) {
          changed = true;
        } else if (mixed && source && !source.trim()) {
          out = isWide(neighborChar(texts[j], -1)) || isWide(neighborChar(texts[j], 1)) ? '' : source;
        } else {
          out = source;
        }
        write(texts[j], out);
      }
    }
    // style.cssから「翻訳した要素」だけを狙えるように印を付ける
    if (changed !== el.hasAttribute('data-vccja')) {
      if (changed) el.setAttribute('data-vccja', '');
      else el.removeAttribute('data-vccja');
    }
  }

  function translateAttrs(el) {
    for (var i = 0; i < ATTRS.length; i++) {
      var name = ATTRS[i];
      var value = el.getAttribute(name);
      if (value === null) continue;
      var state = attrState.get(el);
      if (!state) attrState.set(el, (state = {}));
      var prev = state[name];
      var source = prev && prev.written === value ? prev.source : value;
      var translated = translate(source);
      var out = translated === null ? source : translated;
      state[name] = { source: source, written: out };
      if (out !== value) el.setAttribute(name, out);
    }
  }

  // 親の空白の詰め方は子の訳文で決まるので、子孫から先に処理する
  function walk(root) {
    if (isSkipped(root)) return;
    var elements = [];
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
      acceptNode: function (el) {
        if (hasOwn.call(SKIP_SUBTREE, el.tagName.toUpperCase())) return NodeFilter.FILTER_REJECT;
        if (skipSelector && el.matches(skipSelector)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    for (var el = walker.nextNode(); el; el = walker.nextNode()) elements.push(el);
    for (var i = elements.length - 1; i >= 0; i--) {
      translateAttrs(elements[i]);
      translateTexts(elements[i]);
    }
    translateAttrs(root);
    translateTexts(root);
  }

  var observer = new MutationObserver(function (records) {
    var roots = new Set();
    var changed = new Set();
    var attrTargets = new Set();
    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      if (r.type === 'characterData') {
        if (r.target.parentNode && r.target.parentNode.nodeType === 1) changed.add(r.target.parentNode);
      } else if (r.type === 'attributes') {
        attrTargets.add(r.target);
      } else {
        if (r.target.nodeType === 1) changed.add(r.target);
        for (var j = 0; j < r.addedNodes.length; j++) {
          if (r.addedNodes[j].nodeType === 1) roots.add(r.addedNodes[j]);
        }
      }
    }
    roots.forEach(function (el) {
      if (el.isConnected) {
        walk(el);
        if (el.parentElement) changed.add(el.parentElement);
      }
    });
    changed.forEach(function (el) {
      if (!el.isConnected || isSkipped(el)) return;
      translateTexts(el);
      // 訳文が変わると、親の要素間の空白の詰め方も変わりうる
      if (el.parentElement && !isSkipped(el.parentElement)) translateTexts(el.parentElement);
    });
    attrTargets.forEach(function (el) {
      if (el.isConnected && !isSkipped(el)) translateAttrs(el);
    });
    // ここまでの書き換えで発生した通知は自分の変更なので捨てる
    observer.takeRecords();
  });

  document.documentElement.lang = 'ja';
  observer.observe(document, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ATTRS,
  });
  if (document.body) walk(document.body);

  window.__vccJa = {
    translate: translate,
    // 未翻訳の文字列を探すための開発用ヘルパー
    untranslated: function () {
      var found = new Set();
      var japanese = /[぀-ヿ一-鿿]/;
      var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (var t = walker.nextNode(); t; t = walker.nextNode()) {
        var v = t.nodeValue.trim();
        var parent = t.parentNode;
        if (!parent || parent.nodeType !== 1 || isTextSkipped(parent) || isSkipped(parent)) continue;
        if (/[A-Za-z]{2}/.test(v) && !japanese.test(v)) found.add(v);
      }
      document.querySelectorAll('[placeholder],[title],[aria-label]').forEach(function (el) {
        ATTRS.forEach(function (a) {
          var v = el.getAttribute(a);
          if (v && /[A-Za-z]{2}/.test(v) && !japanese.test(v)) found.add('@' + a + ': ' + v);
        });
      });
      return Array.from(found);
    },
  };
})(window.__VCCJA_DICT__);
