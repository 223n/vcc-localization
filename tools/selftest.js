// 翻訳スクリプトの動作確認（ブラウザーのコンソールやdev-serverの画面で実行する）。
// 操作しないと出てこないダイアログの文を、Reactと同じ「テキストノード+要素」の並びで組み立てて訳させる。
// 戻り値は、期待と違ったもの（failed）と結果の一覧（results）。
(async () => {
  const h = (tag, ...children) => {
    const el = document.createElement(tag);
    for (const c of children) el.append(typeof c === 'string' ? document.createTextNode(c) : c);
    return el;
  };
  const icon = () => document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const cases = [
    [h('p', 'You are trying to downgrade ', h('b', 'VRChat SDK - Base'), ' to a version that no longer supports ', h('b', 'Unity ', '2022'), ' used by your project, this will cause issues and is not supported.'),
      'VRChat SDK - Baseを、プロジェクトで使用中のUnity 2022に対応していないバージョンへダウングレードしようとしています。問題が発生するため、この操作はサポートされていません。'],
    [h('p', 'This package version was made for ', h('b', 'Unity ', '2019'), ', while your project is using ', h('b', 'Unity ', '2022'), '. This will most likely work, but we recommend checking for updates'),
      'このバージョンのパッケージはUnity 2019向けですが、このプロジェクトではUnity 2022を使用しています。おそらく動作しますが、アップデートの確認をおすすめします'],
    [h('div', 'Check out the', ' ', h('a', 'documentation'), ' ', 'for more information.'), '詳しくはドキュメントをご覧ください。'],
    [h('li', h('span', icon()), ' ', h('b', 'VRChat SDK - Base'), ' ', h('span', 'from ', '3.9.0', ' to ', h('b', '3.10.5'))), 'VRChat SDK - Base 3.9.0 → 3.10.5'],
    [h('div', 'You are upgrading', ' ', h('b', 'VRChat SDK - Base'), ' ', 'to', ' version ', h('b', '3.10.5'), ' ', h('span', icon())), 'アップグレード: VRChat SDK - Base → 3.10.5'],
    [h('div', 'Creating ', 'MyProject'), 'MyProjectを作成中'],
    [h('div', '• This will ', h('b', 'make a new ', 'MyProject', '-Migrated'), ' project and migrate it.'), '• 新しいプロジェクト「MyProject-Migrated」を作成し、そちらを移行します。'],
    [h('div', '• This original project ', h('b', 'WILL NOT'), ' be touched.'), '• 元のプロジェクトは変更されません。'],
    [h('div', '• This will ', h('b', 'NOT'), ' make a copy!'), '• コピーを作成しません！'],
    [h('div', '• This will migrate ', h('b', 'the original project'), ' directly!'), '• 元のプロジェクトを直接移行します！'],
    [h('div', 'VRChat has upgraded to Unity ', '2022.3.22f1', '. ', 'Set this version as default', ' to use all the latest features.'),
      'VRChatはUnity 2022.3.22f1にアップグレードしました。最新の機能をすべて使うには、このバージョンをデフォルトに設定してください。'],
    [h('div', 'Current Version ', h('b', '2.4.5')), '現在のバージョン: 2.4.5'],
    [h('div', icon(), ' Failed to load settings'), '設定を読み込めませんでした'],
    [h('div', 'If you have any questions about the Creator Companion or creating VRChat content, check out the ', h('button', 'Learn'), ' page.', icon()),
      'Creator CompanionやVRChatのコンテンツ制作について知りたいことがあれば、学ぶページをご覧ください。'],
    [h('div', 'Versions marked with ', icon(), ' are supported by VRChat'), ' が付いたバージョンはVRChatでサポートされています'],
    [h('div', h('b', 'Selected editor is not recommended.'), 'VRChat recommends using Unity ', '2022.3.22f1'), '選択中のエディターは推奨バージョンではありません。VRChatの推奨バージョン: Unity 2022.3.22f1'],
    [h('div', 'None of the packages are available for download. You should add the relevant listings to the Creator Companion in the', ' ', h('a', 'Settings.')),
      'ダウンロードできるパッケージがありません。必要なリスティングをCreator Companionに追加してください。追加する場所:設定'],
    [h('div', '3 days ago'), '3日前'],
    [h('div', 'Failed to add package: Some error'), 'パッケージを追加できませんでした: Some error'],
    [h('div', h('b', 'Located At:'), ' ', h('span', 'C:\\Projects\\Foo')), '場所: C:\\Projects\\Foo'],
  ];
  const box = h('div');
  box.id = 'vccja-selftest';
  document.body.append(box);
  for (const [el] of cases) box.append(el);
  await new Promise((r) => setTimeout(r, 50));
  // 連続する空白は表示上ひとつにまとまるので、比較の前にそろえる
  const normalize = (s) => s.replace(/\s+/g, ' ').trim();
  const results = cases.map(([el, expected]) => ({ actual: normalize(el.textContent), expected: normalize(expected) }));
  box.remove();
  return { failed: results.filter((r) => r.actual !== r.expected), results: results.map((r) => r.actual) };
})();
