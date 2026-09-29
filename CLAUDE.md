# CLAUDE.md

このリポジトリで作業するときの決まりです。
Claude Codeがこのファイルを読みます。
人が読む手引きは[CONTRIBUTING.md](CONTRIBUTING.md)と[README.md](README.md)にあります。

## 利用者のVCCに触らない

このリポジトリは、利用者のPCに入っているVRChat Creator Companion（VCC）の画面を書き換えるパッチです。
作業中は次を守ってください。

- VCCのインストール先（`%LOCALAPPDATA%\Programs\VRChat Creator Companion`）のファイルを、利用者の指示なく書き換えません
- 起動中のVCCを止めたり、再起動したりしません。利用者がUnityと併用していることがあります
- 起動中のVCCの`WebApp\Dist`にファイルを足しません。VCCの画面を配信するサーバーは、応答しなくなることがあります
- 画面の確認は`npm run dev`で行います。VCCのファイルは読むだけで、VCCのAPIへも読み取りの要求だけを送ります
- `work/`にはVCCのコード片が入るため、コミットしません

## mainとdevelopをPull Requestのheadにしない

このリポジトリは「Automatically delete head branches」を有効にしています（「Settings」→「General」→「Pull Requests」）。
GitHubの文書は、この設定を「head branches automatically deleted after pull requests are merged」と説明しています。

消えるのはheadブランチだけで、baseブランチは消えません。
そのため、`main`や`develop`をheadにしたPull Requestを作ると、マージでそのブランチごと失う恐れがあります。

| Pull Request | headブランチ | マージすると |
| ---- | ---- | ---- |
| `develop`→`main` | `develop` | `develop`が消える恐れがあります |
| `main`→`develop` | `main` | `main`が消える恐れがあります |

`develop`が消えると、リリースのワークフローが最初の確認で止まります。
`release.yml`が`develop`の存在をAPIで確かめ、無ければ`develop ブランチが無い`と出して終わるためです。
Dependabotの`target-branch`、ラベル同期の`--ref`、CIの`push`トリガーも`develop`を指しています。

### 代わりにすること

`develop`の内容を`main`へ出すときは、Actionsの「リリース」を実行します。
ワークフローが`release/vX.Y.Z`ブランチを切り、そこをheadにしてPull Requestを開きます。

`main`の内容を`develop`へ戻すときは、「リリースを公開する」ワークフローに任せます。
直接pushできないときは、ワークフローが`merge/vX.Y.Z-into-develop`ブランチからPull Requestを開きます。

どちらもheadは`release/*`か`merge/*`で、`develop`や`main`ではありません。

ワークフローの外で取り込む必要があるときは、作業用のブランチを切ってからPull Requestを開きます。

```bash
git switch --create merge/main-into-develop origin/main
git push --set-upstream origin merge/main-into-develop
gh pr create --base develop --head merge/main-into-develop --title "main を develop に取り込む"
```

### gh pr mergeに--delete-branchを付けない

`gh pr merge --delete-branch`は、リポジトリの設定とは別に、手元とリモートの両方のブランチを消しにいきます。
`main`や`develop`がheadのPull Requestには使わないでください。

### 自動削除を止める設定

GitHubの文書は「Branch protection rules and repository rules can also prevent branches being automatically deleted.」と書いています。
ルールセット「main」が`main`と`develop`にかかっています。
削除を止めるのは、その中の「Restrict deletions」（APIの`deletion`）です。
同じルールセットで、強制push（`non_fast_forward`）も禁止し、マージをPull Request経由のマージコミットに限っています。
リポジトリの管理者はこのルールを迂回できます。

`.github/workflows/branch-guard.yml`が、`main`や`develop`をheadにしたPull Requestで失敗します。
ただしこれは気付かせるだけで、マージは止めません。
必須チェックにするとGITHUB_TOKENが開いたPull Requestで埋まらなくなるためです。
削除そのものを止めるのはルールセットです。

既定ブランチは削除できません。
ただし自動削除の文書に既定ブランチの例外は書かれていないため、これを守りとして当てにしないでください。

### 消してしまったとき

マージ済みのPull Requestの画面に「Restore branch」が出ます。
これで戻ります。
復元できる期間は公式の文書に書かれていないため、気付いたらすぐ戻してください。

ボタンがないときは、消える前の先端のSHAから作り直します。

```bash
gh pr view <番号> --json headRefOid --jq .headRefOid
gh api --method POST "repos/OWNER/REPO/git/refs" -f "ref=refs/heads/develop" -f "sha=<SHA>"
```

削除を禁止する規則をかけていると、作り直しも拒まれることがあります。
その場合は先に規則を一時的に無効にし、作り直したあとで戻します。

## そのほかの決まり

- ブランチの運用、文書とスクリプトの書き方は[CONTRIBUTING.md](CONTRIBUTING.md)にあります
- リリースの手順は[README.md](README.md)の「開発の流れ」にあります
- Pull Requestはマージコミット（Create a merge commit）でマージします
- 変更したら`npm run lint`と`npm test`を通します
- `vcc-ja.ps1`はWindows PowerShell 5.1でも動かすため、BOM付きのUTF-8で保存し、PowerShell 7だけの書き方を使いません
- 辞書（`locales/ja.json`）の訳文は、全角と半角の間に空白を入れません
