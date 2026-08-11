# FileSearcher

Windows 向けの **ローカル / ファイルサーバー全文検索ツール**（Python + Tkinter GUI）。

指定したフォルダ（`C:\...` などのローカルパスや `\\server\share` の UNC パス）配下を
再帰スキャンし、Office・PDF・テキスト・ソースコードの**中身**を SQLite FTS5 でインデックス化します。
一度インデックスを作れば、数十万ファイル規模でも検索は一瞬です。

さらに、作成したインデックスを **Microsoft Copilot / ChatGPT / Claude などに読ませる TXT・Markdown**
としてエクスポートするツールも同梱しています。

---

## 目次

- [できること](#できること)
- [動作環境](#動作環境)
- [インストール](#インストール)
- [使い方（GUI）](#使い方gui)
- [検索構文](#検索構文)
- [バージョンの違い（v1 / v2 / v3）](#バージョンの違いv1--v2--v3)
- [AI 用テキスト出力（v3）](#ai-用テキスト出力v3)
- [同梱ツール](#同梱ツール)
  - [db_to_txt.py — Copilot 用 TXT 変換](#db_to_txtpy--copilot-用-txt-変換)
  - [db_to_txt_paired.py — パス↔内容ペア形式で変換](#db_to_txt_pairedpy--パス内容ペア形式で変換)
  - [build.bat — 単一 EXE 化](#buildbat--単一-exe-化)
- [データの保存場所](#データの保存場所)
- [リポジトリ構成](#リポジトリ構成)
- [制限事項・既知の注意点](#制限事項既知の注意点)
- [トラブルシューティング](#トラブルシューティング)

---

## できること

- **再帰スキャン** — ローカルフォルダ / ネットワーク共有（UNC）を複数登録可能
- **中身の全文検索** — Word / Excel / PowerPoint / PDF / RTF / テキスト / ソースコードからテキスト抽出
- **旧 Office 対応** — `.doc` / `.xls` / `.ppt`（v2 以降は Word / PowerPoint の COM 経由で高精度）
- **日本語に強い** — FTS5 の `trigram` トークナイザを使うため、分かち書き不要で部分一致する
- **増分インデックス** — 更新日時（mtime）を比較して変更されたファイルだけ再処理
- **ヒット箇所プレビュー** — 該当箇所前後をスニペット表示、ファイル / フォルダをそのまま開ける
- **並列処理** — テキスト抽出は既定 8 スレッド、検索は全シャード並列（v3）
- **AI 連携** — 検索結果を Markdown 化してクリップボード / ファイルに出力（v3）

### 対応フォーマット

| 種別 | 拡張子 | 必要ライブラリ |
|---|---|---|
| 新 Office | `.docx` `.xlsx` `.pptx` | `python-docx` / `openpyxl` / `python-pptx` |
| PDF | `.pdf` | `pypdf` |
| 旧 Office | `.doc` `.ppt` | `pywin32`（Word / PowerPoint 経由・推奨） or `olefile`（ベストエフォート） |
| 旧 Excel | `.xls` | `xlrd` |
| リッチテキスト | `.rtf` | `striprtf` |
| テキスト / コード | `.txt` `.md` `.csv` `.json` `.xml` `.html` `.py` `.js` `.java` `.sql` `.yaml` ほか多数 | **不要**（標準ライブラリのみ） |

スキャン時は `node_modules` / `.git` / `__pycache__` / `venv` / `dist` / `build` /
`System Volume Information` / `$RECYCLE.BIN` / `AppData` などを自動スキップします。
また **50MB を超えるファイルは中身を読まず、ファイル名だけをインデックス**します。

---

## 動作環境

- **Windows**（PDF・テキスト系だけなら macOS / Linux でも動作します。`.doc` / `.ppt` の COM 抽出は Windows 限定）
- **Python 3.9 以上**（3.10 以上推奨）
- **Tkinter**（Windows 版 Python には標準同梱）
- **SQLite 3.34 以上**を含む Python — `trigram` トークナイザ用。
  使えない場合は自動的に `unicode61` にフォールバックしますが、日本語の部分一致精度は落ちます。

---

## インストール

```bash
git clone https://github.com/Jake122AK/file_seacher111.git
cd file_seacher111

# Office / PDF を中身まで検索したい場合のみ（テキスト系だけなら不要）
pip install -r requirements_v2.txt
```

起動（**v3 が最新版**です）:

```bash
python file_searcher_v3.py
```

---

## 使い方（GUI）

1. **検索対象フォルダ**
   - `フォルダ追加…` でローカルフォルダを選択、または `UNCパス追加…` で `\\server\share` を直接入力
   - 複数登録でき、設定は自動保存されます
2. **インデックス対象を絞る**
   - `Word` / `Excel` / `PowerPoint` / `PDF` / `テキスト/データ` / `ソースコード/設定` のチェックで
     スキャンする種類を選択（チェックを外した種類は次回スキャン以降は無視されます）
3. **インデックス作成**
   - `インデックス更新（増分）` … 前回から変更されたファイルだけ再処理（通常はこちら）
   - `フルスキャン` … 全ファイルを読み直す
   - `停止` でいつでも中断できます（そこまでの結果は保存されます）
4. **検索**
   - キーワードを入力して `検索` または Enter
   - `すべて含む (AND)` / `いずれか含む (OR)` を切り替え
   - `結果の種類:` のチェックで、結果を拡張子グループで絞り込み
5. **結果を見る**
   - 一覧から選ぶと右側にヒット箇所のプレビューが表示されます
   - ダブルクリックで既定のアプリで開く / 右クリックメニューから
     `ファイルを開く` `場所を開く（エクスプローラ）` `パスをコピー` `ファイル名をコピー` が使えます

1 回の検索で返す件数は最大 500 件です。

---

## 検索構文

| 書き方 | 意味 |
|---|---|
| `見積 請求` | 2 語（AND / OR はラジオボタンの設定に従う） |
| `"社内 規程"` | ダブルクォートでフレーズ完全一致 |
| `-テスト` | その語を含むものを除外 |
| `契約書 -下書き` | 「契約書」を含み「下書き」を含まないもの |

- **3 文字以上**（空白を除く）の語は FTS5 インデックスで高速検索されます。
- **2 文字以下**の短い語は FTS のインデックスに乗らないため、`LIKE` による絞り込みに回ります。
  短い語だけで検索すると遅くなるので、できるだけ 3 文字以上を含めてください。

---

## バージョンの違い（v1 / v2 / v3）

3 世代のスクリプトがそのまま残してあります。**通常は `file_searcher_v3.py` を使ってください。**

| | `file_searcher.py`（v1） | `file_searcher_v2.py`（v2） | `file_searcher_v3.py`（v3・最新） |
|---|---|---|---|
| インデックス | 単一 `index.db` | 単一 `index.db` | **16 分割シャード** `shards/index_00..0f.db` |
| 検索 | 単一 DB を逐次検索 | 単一 DB を逐次検索 | **全シャードを並列検索してマージ** |
| `.doc` / `.ppt` | `olefile` でベストエフォート抽出 | **Word / PowerPoint の COM 経由**（`pywin32`）+ `olefile` フォールバック | v2 と同じ |
| 種類フィルタ | `Office` ひとまとめ | `Office` ひとまとめ | **Word / Excel / PowerPoint に分割** |
| 検索結果の絞り込み | なし | なし | **拡張子グループで絞り込み可** |
| DB の保存先変更 | 不可 | 不可 | **`DB設定…` から変更・初期化・旧DB移行** |
| AI 用出力 | なし | なし | **あり（Markdown 出力）** |
| 行数 | 約 1,340 行 | 約 1,510 行 | 約 2,320 行 |

**なぜシャード分割したか（v3）**
巨大な単一 `index.db`（10GB クラス）は書き込みロックと肥大化で急激に遅くなります。
v3 はパスの MD5 ハッシュで 16 個の DB に分散させ、書き込みも検索も並列化しています。
Windows の大文字小文字非区別に合わせて `os.path.normcase` で正規化してから振り分けるため、
同じファイルが常に同じシャードに入ります。

**旧バージョンからの移行**
v3 は起動時に旧 `~/.file_searcher/index.db` を検出すると移行を提案します。
手動で行う場合は `DB設定…` → `旧 index.db から移行…`。
移行処理は FTS5 の `path` が UNINDEXED で JOIN が実質終わらないため、
files のメタ情報をメモリに載せてから contents を 1 回スキャンする O(N) 実装になっています。

---

## AI 用テキスト出力（v3）

`🤖 AI用テキスト出力…` ボタンから、検索結果を **AI に貼り付けやすい Markdown** として書き出せます。

- **検索クエリ** と **AI への指示文**（要約方針・質問など）を入力
- **含めるファイル数**（5〜200、既定 30）と **1 ファイルあたり最大文字数**（200〜20,000、既定 3,000）を指定
- 推定文字数とトークン数の目安をその場で表示（Copilot / GPT-4: 〜128K, Claude: 〜200K）
- 出力先は **`.md` ファイル保存** または **クリップボードへコピー**

出力される Markdown は「検索クエリ → AI への指示 → 各ファイル（パス・ヒット箇所・本文）」の構成で、
パスを引用させる前提のフォーマットになっています。

---

## 同梱ツール

インデックス済みのシャード DB を、**AI のナレッジソース用 TXT** に変換する CLI ツールです。
どちらも GUI 不要・依存ライブラリ不要（標準ライブラリのみ）で動きます。

### `db_to_txt.py` — Copilot 用 TXT 変換

Microsoft Copilot Studio のナレッジに登録するための TXT を出力します。
**1 ファイルあたりのサイズ上限（既定 500MB）を 1 バイトも超えません。**

```bash
# 既定（~/.file_searcher/shards → ./copilot_export、500MB 区切り）
python db_to_txt.py

# 出力先と上限を指定
python db_to_txt.py --output-dir D:\export --max-mb 400
```

| オプション | 既定値 | 説明 |
|---|---|---|
| `--shard-dir DIR` | `~/.file_searcher/shards` | 読み込むシャード DB のフォルダ |
| `--output-dir DIR` | `./copilot_export` | TXT の出力先 |
| `--max-mb MB` | `500` | 1 ファイルの上限（SI 単位 = 1,000,000 バイト。厳守） |
| `--num-shards N` | `16` | シャード数 |

- 出力ファイル名は `copilot_source_001.txt`, `copilot_source_002.txt`, … と自動ローテート
- 1 ドキュメントが上限を超える場合は `パート 1/N` として自動分割
- 分割は **UTF-8 の文字境界を壊さず**、直前 2,000 文字以内に改行があればそこで切るため文章が途中で切れにくい
- 実行後に各ファイルのサイズ検証結果と、Copilot Studio への登録手順が表示されます

### `db_to_txt_paired.py` — パス↔内容ペア形式で変換

「どの本文がどのパスのものか」を AI が取り違えないよう、各エントリを明示的に区切って出力します。
上限の既定値は **80MB**（一般的な AI サービスのアップロード上限に合わせた値）。

```bash
python db_to_txt_paired.py
python db_to_txt_paired.py --max-mb 50 --output-dir D:\export
```

オプションは `db_to_txt.py` と同じ（`--shard-dir` / `--output-dir` / `--max-mb` / `--num-shards`）。
出力ファイル名は `paired_source_001.txt` から連番です。

出力形式:

```text
[FILE_BEGIN #00001]
PATH: \\server\share\経費精算.xlsx
NAME: 経費精算.xlsx
CONTENT:
（ここに本文）
[FILE_END #00001]
```

巨大なファイルは `[FILE_BEGIN #00001 (PART 1/3)]` のようにパート番号付きで分割されます。

### `build.bat` — 単一 EXE 化

PyInstaller で `dist\FileSearcher.exe`（単一 exe・コンソール非表示）を生成します。

```bat
build.bat
```

古い `build` / `dist` / `FileSearcher.spec` を削除してからビルドし、
`openpyxl` / `pptx` / `docx` を `--collect-all`、`xlrd` / `olefile` / `striprtf` / `pypdf` を
`--hidden-import` で明示的に取り込みます。

> **注意:** `build.bat` は `requirements.txt` のインストールと `file_searcher.py`（v1）のビルドを行います。
> v3 を exe 化する場合は、スクリプト内の `file_searcher.py` を `file_searcher_v3.py` に、
> `requirements.txt` を `requirements_v2.txt` に書き換えてください。

exe 化してもインデックスは `C:\Users\<ユーザー名>\.file_searcher\` に残るため、
exe を移動・再ビルドしてもデータは引き継がれます。

---

## データの保存場所

すべてユーザーのホーム配下に置かれ、アンインストール時はフォルダごと削除すれば済みます。

```
~/.file_searcher/
├── config.json            設定（対象フォルダ・フィルタ・検索モード・DB フォルダ）
├── index.db               v1 / v2 の単一インデックス（v3 では移行元）
└── shards/                v3 のシャード DB
    ├── index_00.db
    ├── index_01.db
    └── …（index_0f.db まで 16 個）
```

`config.json` に保存されるキー:

| キー | 内容 |
|---|---|
| `roots` | 検索対象フォルダの一覧 |
| `filters` | インデックス対象の種類（チェックボックス） |
| `search_mode` | `AND` / `OR` |
| `search_filters` | 検索結果の絞り込み（v3） |
| `db_dir` | シャード DB の保存先（v3・既定から変更した場合のみ） |

DB を大容量ドライブへ移したい場合は、v3 の `DB設定…` → `フォルダ変更…` から変更できます。

---

## リポジトリ構成

| ファイル | 内容 |
|---|---|
| `file_searcher_v3.py` | **最新版**。シャード DB・並列検索・AI 出力・DB 設定に対応 |
| `file_searcher_v2.py` | 旧 Office を COM 経由で抽出するようにした版（単一 DB） |
| `file_searcher.py` | 初版（単一 DB） |
| `db_to_txt.py` | シャード DB → Copilot 用 TXT（既定 500MB 区切り） |
| `db_to_txt_paired.py` | シャード DB → パス↔内容ペア形式 TXT（既定 80MB 区切り） |
| `requirements_v2.txt` | Office / PDF 抽出用の依存ライブラリ |
| `build.bat` | PyInstaller で単一 exe を作るスクリプト |
| `files2.zip` | 旧版一式のアーカイブ（`file_searcher2.py` / `requirements.txt` / `build.bat` / 解説 PDF） |

---

## 制限事項・既知の注意点

- **50MB 超のファイルは中身を読みません**（ファイル名のみインデックス）。上限は
  スクリプト冒頭の `MAX_FILE_SIZE` で変更できます。
- **画像 PDF（スキャン文書）は検索できません** — OCR は行っていないため、
  テキストレイヤーのない PDF からは何も抽出されません。
- **`.doc` / `.ppt` は環境依存** — `pywin32` と Word / PowerPoint が入っていれば COM 経由で
  正確に抽出しますが、無い場合は `olefile` によるベストエフォート抽出になり、文字化けや欠落が起きえます。
- **ネットワーク共有の初回スキャンは時間がかかります** — 回線速度に律速されます。2 回目以降は増分のみ。
- **検索結果は最大 500 件** — `SEARCH_LIMIT` で変更可能。
- **`trigram` が使えない環境では日本語の部分一致精度が落ちます**（`unicode61` に自動フォールバック）。
- **2 文字以下のキーワードは低速** — FTS ではなく `LIKE` 走査になります。
- **`db_to_txt*.py` は v3 のシャード DB 専用**です。v1 / v2 の単一 `index.db` しか無い場合は、
  先に v3 で移行してから実行してください。

---

## トラブルシューティング

| 症状 | 対処 |
|---|---|
| Office / PDF の中身がヒットしない | `pip install -r requirements_v2.txt` で抽出用ライブラリを入れる |
| `.doc` / `.ppt` が文字化けする | `pip install pywin32` を入れ、Word / PowerPoint がインストールされた Windows で実行する |
| 日本語の部分一致が効かない | SQLite 3.34 以上を含む Python を使う（`trigram` が必要）。ログにフォールバック時の記載が出ます |
| 検索が遅くなってきた | v3 に移行してシャード DB を使う。`DBクリア` → `フルスキャン` で作り直すのも有効 |
| インデックスを作り直したい | `DBクリア` を実行するか、`~/.file_searcher/shards/` を削除する |
| DB の置き場所を変えたい | v3 の `DB設定…` → `フォルダ変更…` |
| `db_to_txt.py` が「シャードDBフォルダが見つかりません」で終了する | v3 でインデックスを作成してから実行する。別の場所に置いている場合は `--shard-dir` で指定 |
