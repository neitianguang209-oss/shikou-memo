# 思考メモ

日常でふと思ったことを一瞬で残し、あとから時系列・テーマ・キーワードの3方向から振り返れる個人用メモアプリ（PWA）。

## 技術構成について

当初の仕様では Vite + React + TypeScript + vite-plugin-pwa 等のビルド環境を前提としていましたが、
開発端末に Node.js/npm が無いため、**ビルド不要の構成**に変更しています（ユーザー承認済み）。

- React 18 + [htm](https://github.com/developit/htm)（JSXの代わりのタグ付きテンプレート）を
  [esm.sh](https://esm.sh/) 経由の CDN import map で読み込み
- TypeScript は使用せず、素の JavaScript
- ビルドツールなし。`index.html` を直接配信するだけで動作
- データ保存は IndexedDB（`src/lib/db.js`）
- PWA の manifest / Service Worker は手書き（`manifest.json` / `sw.js`）

## ローカルでの動作確認

Node.js が無い前提のため、付属の PowerShell 製サーバーを使います。

```powershell
powershell -ExecutionPolicy Bypass -File serve.ps1
```

ブラウザで `http://localhost:5504` を開いて確認できます。

## 公開（iPhoneで使うために必須）

PWA は HTTPS 配信が必須のため、iPhone実機で使うには公開が必要です。無料枠として以下のいずれかを想定しています。

- GitHub Pages（このフォルダを新しいリポジトリにして Pages を有効化）
- Vercel の無料枠（Gitリポジトリと連携、または `vercel` CLIでデプロイ）

どちらも Node.js のビルド処理は不要です（静的ファイルをそのまま配信するだけ）。

## iPhone への入れ方

1. 公開したURLを **Safari** で開く（Chromeでは「ホーム画面に追加」がPWAとして機能しないため不可）
2. 共有ボタン（□に↑）をタップ → 「ホーム画面に追加」を選択
3. 以後はホーム画面のアイコンから全画面アプリとして起動する

## データについて

- メモとタグは端末内の IndexedDB に保存し、**同時にクラウド(Supabase)にも1件ずつ自動で保存**します（`src/lib/sync.js`）。
  - 書いた・直した・消したものは、まず端末の「送る箱(outbox)」に同じ書き込みの中で積み、少ししてクラウドへ送ります。電波が無いときは箱に残り、戻ったら自動で送ります。
  - 起動時・画面に戻ったとき・開いている間は2分おきに、クラウド側の変更(別の端末で書いたもの)を受け取ります。
  - **端末のデータが消えても（ホーム画面のアイコンを追加し直した、Safariのデータを消した、機種変更など）、アプリを開けば自動でクラウドから全部戻ります。**
- クラウド側(`shikou_memo_records`)は「新しい方を残す」「消しても中身は残す(消した印だけ付ける)」「上書き前の版は `shikou_memo_history` に残す」ので、どの端末から何が届いても本当には消えません。
  公開キーから表は直接さわれず、関数 `shikou_memo_sync` だけが入口です。
- 毎週の自動バックアップ(`~/.claude/backup-supabase.ps1`)が、記録と履歴を OneDrive に保存します（`shikou_memo_dump.json`。今の中身だけなら `app_backups.json` にも入っています）。
- 設定画面の「データを書き出す」で手元に JSON の控えも作れます。「データを読み込む」は今のメモに**足す**だけで、今のメモは消しません。
- IndexedDB が開けない端末では、メモリ上で動かしつつクラウドへの保存は続けます。
