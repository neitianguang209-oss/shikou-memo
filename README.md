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

- すべて端末内の IndexedDB に保存されます（サーバーには送信されません）
- 設定画面の「データを書き出す」で定期的に JSON バックアップを取ることを推奨します
- 端末変更・アプリ再インストール時は、書き出した JSON を「データを読み込む」から復元してください
