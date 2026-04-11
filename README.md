# savings（LP）

## ローカル表示

`lp/` をドキュメントルートとして配信します。

```bash
cd /Users/aokireimon/Desktop/work/savings
./scripts/serve-local.sh
```

- URL: `http://127.0.0.1:3002/`
- ポート変更: `PORT=8080 ./scripts/serve-local.sh`
- デフォルトポートは `3002`（衝突する場合は `PORT=...` で変更）

## microCMS（運用ルール）

`lp/` をドキュメントルートで開き、`lp/js/microcms.*.config.js` に **読み取り用 API キー** と **サービスドメイン** を設定する。本番ではビルド注入やサーバ側の差し替えを想定してもよい。

| 設定ファイル | グローバル | 既定 endpoint | 用途 |
|--------------|------------|----------------|------|
| `lp/js/microcms.examples.config.js` | `LP_MICROCMS_EXAMPLES` | **examples** | 見直しの一例 |
| `lp/js/microcms.faq.config.js` | `LP_MICROCMS_FAQ` | **faq** | よくあるご質問 |
| `lp/js/microcms.site.config.js` | `LP_MICROCMS_SITE` | **site** | HP情報（サイト名・ロゴ・問い合わせ送信先メール） |

管理画面の **API 名** を上表の endpoint と一致させる（この LP では `examples` / `faq` / `site` に固定）。

**取得**: `lp/js/main.js` が `fetch(..., { cache: "no-store" })` で取得。HTML はマウントとフォールバック用テンプレ、見た目は CSS、データ整形と描画は JS。

| 区分 | examples | faq | site |
|------|----------|-----|------|
| 取得失敗・未設定 | `template#lp-examples-fallback` | `template#lp-faq-fallback` | `LP_SITE_DEFAULT` 相当で表示 |
| 取得成功・0件 | カード内「データがありません」 | `.lp-faq__empty` | （site は正規化でデフォルト名を維持） |

**コンソール**: 本番向けに `console.log` は出さない。設定不足・HTTP エラー・レスポンス解釈失敗時のみ `console.error`（先頭に `[examples]` / `[faq]` / `[site]`）。

**切り分け用 data 属性**: `[data-examples-grid]`（`data-lp-examples-source`）、`[data-faq-list]`（`data-lp-faq-source`）、`document.documentElement.dataset.lpSiteSource`。

## 主要な編集内容（現状）

### 画像

- **「なぜ、全体で考えるのか」**
  - `lp/assets/images/reason-whole-household.png`
  - `lp/components/reason.html` で参照
  - `lp/styles/reason.css` の `aspect-ratio` を `1` に設定

- **「大切にしていること」背景**
  - `lp/assets/images/values-living-bg.png`
  - `lp/styles/values.css` の `.lp-values::before` で背景として表示
  - `.lp-values::after` の背景（オーバーレイ）は **なし**

- **「見直しの一例」カード画像**
  - 1枚目: `lp/assets/images/example-5family-mobile.png`
  - 2枚目（電気・ガス）: `lp/assets/images/example-electric-gas.png`
  - 3枚目（ウォーターサーバー）: `lp/assets/images/example-water-server.png`

### 見直しできるサービス（アイコン）

保存先: `lp/assets/icons/`

- `service-phone.svg`
- `service-wifi.svg`
- `service-bolt.svg`
- `service-water.svg`
- `service-flame.svg`
- `service-shield.svg`

色は **`#5a8f7f`** に統一（共済のチェックは白のまま）。

### ご相談の流れ（アイコン）

保存先: `lp/assets/icons/flow-*.svg`

- STEP1〜5: `flow-1.svg`〜`flow-5.svg`（指定SVGに差し替え済み、白ストローク）

※ フローアイコンは濃色円背景のため、基本は白（`#ffffff`）で表示。

### 「見直しの一例」セクション

microCMS（endpoint **`examples`**）のデータで動的描画します。

- **設定**: `lp/js/microcms.examples.config.js`
- **取得/描画**: `lp/js/main.js`
- **マウントポイント**: `lp/components/examples.html`（`data-examples-grid`）
- **スタイル**: `lp/styles/examples.css`

- 各カードに **画像（カード上部）**を表示（microCMSの `image.url`）
- 「見直し前」→「↓」→「見直し後」の並び
- 強調用マーカー:
  - 対象テキストを `span.lp-example-card__mark` で囲む
  - 複数行対応のため `box-decoration-break: clone` を使用
  - マーカーCSS（現状）:
    - `background: linear-gradient(transparent 70%, #FDDEB3 0%);`
    - `display: inline;`
    - `padding: 0 2px 4px;`
    - `font-size: 0.89em;`

**フォールバック**

- microCMSの設定が未入力/取得失敗時は、`examples.html` の `template#lp-examples-fallback` を表示
- データ0件の場合は「データがありません」表示を出して空表示にしない

**microCMS想定フィールド（examplesの各要素）**

- `title`
- `beforeLabel`
- `beforePrice`
- `afterLabel`
- `afterPrice`
- `monthlySaving`
- `yearlySaving`
- `image.url`

**カード文言（フォールバックの現状）**

- 1枚目: 5人家族の携帯料金
  - 見直し前: 月額 22,500円
  - 見直し後: 月額 9,800円
  - 削減: 月額12,700円の削減
  - 年間: 年間152,400円の削減

- 2枚目: 電気・ガス（このカードだけ「約」あり）
  - 見直し前: 月額 約18,000円
  - 見直し後: 月額 約12,000円
  - 削減: 月額約2,900円の削減
  - 年間: 年間約34,800円の削減

- 3枚目: ウォーターサーバー（「約」なし）
  - 見直し前: 月額 6,500円
  - 見直し後: 月額 2,900円
  - 削減: 月額3,600円の削減
  - 年間: 年間43,200円の削減

### 「大切にしていること」レイアウト

ファイル: `lp/components/values.html` / `lp/styles/values.css`

- セクション背景に画像を敷く
- カードは半透明＋`backdrop-filter` の **ガラス風**
- 見出し下の線はタイトル同色（`var(--color-navy)`）

