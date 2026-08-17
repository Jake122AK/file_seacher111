# RULE//BREAK

> 盤面を解くのではなく、この世界を支配している"ルール"そのものを解く。

スマートフォン向けの超高難度パズル。ルールは一切説明されない。プレイヤーは操作の結果を
観測し、仮説を立て、検証し、発見した法則を**悪用**して脱出する。終盤では法則そのものを
物理的に編集し、最後には自分でルールを書いて世界を成立させる。

- **本編51ステージ**（1〜46 / 隠しステージ47 / FINAL / STAGE NULL ×3）
- **積層キャンペーン16ステージ**（A1〜A16）――覚えた法則が消えずに積み上がるモード
- 全ステージ **フルドット絵**（5×7ビットマップフォント + 8×8スプライトを自前描画）
- 依存ライブラリ **ゼロ**。静的ファイルのみ。オフライン動作。
- ステージは**完全にデータ駆動**。エンジンのコードを1行も触らずに問題を追加できる。

---

## 遊ぶ

### 単体ファイル（配布用・オフライン）

```bash
node tools/build.mjs
# → dist/RULE-BREAK.html         全51ステージ入り。ダブルクリックで起動
# → dist/RULE-BREAK-EDITOR.html  ステージエディタ
```

`dist/RULE-BREAK.html` は依存ゼロの単一HTML。ブラウザで直接開けば（`file://` でも）
そのまま動く。スマホへ送って開いてもよいし、任意の場所に置いて配ってもよい。

### 開発時

静的サーバーに置く（ソースのままだと `file://` ではESモジュールが読めないため）。

```bash
cd rule-break
python3 -m http.server 8080     # または npx http-server -p 8080
# → http://localhost:8080/index.html
```

### 操作

| 操作 | 意味 |
| --- | --- |
| スワイプ（上下左右） | 1マス移動 |
| 矢印キー / WASD | 同上（PC） |
| UNDO / `Z` | 1手戻す ―― ただし戻るのは位置だけとは限らない |
| RESET / `R` | ステージ初期化 |
| HINT | 3段階ヒント（答えは出ない） |
| ダブルタップ / ピンチ | 盤面の拡大縮小 |
| 右下のハンドル | 盤面の回転 |
| ステージ名をタップ | ？ |
| RULE NOTE の × | ？ |
| UI文字・ボタンをドラッグ | ？ |

後半4つは「押せることに気づくこと」自体がパズルなので、使えるステージでしか反応しない。

---

## 2つのモード

### 本編（Stage 1〜）: 毎回ルールが変わる

1ステージに1つの隠された法則。解いたら次の面では別の法則になる。
「前提を疑う」ことそのものを扱うため、UI・時間・ステージ番号まで壊しにいく。

### 積層 ACCUMULATE（Stage A1〜A16）: ルールが積み上がる

**一度出てきた法則は、以後すべてのステージで生き続ける。** 色の意味も全ステージ共通で、
黄色い床はどの面でも「離れると壁になる」。法則はその色が盤面に無ければ眠っているだけなので、
A16の盤面では9つの法則が同時に効いている。

| # | 導入面 | 法則 |
| --- | --- | --- |
| 01 | A1 | 黄色い床は、離れた瞬間に壁になる |
| 02 | A3 | 青い壁は偶数手のあいだだけ通れる |
| 03 | A5 | 箱を押すと手数が2つ進む（＝偶奇がずれる） |
| 04 | A7 | 台座に物が載っているあいだだけ、対応する扉が開く |
| 05 | A9 | 紫の床を踏むと、以後の操作が上下左右とも反転する |
| 06 | A11 | 影はプレイヤーと同じ向きへ動く。触れると捕まる |
| 07 | A13 | 白い床を踏むと、その場に動かない自分が残る |
| 08 | A15 | 橙色の床を踏むと、ゴールが1マス右へ動く |
| 09 | A16 | 緑の床を踏むと重力が入り、もう一度踏むと消える |

導入面（A1, A3, A5 …）はその法則ひとつだけで解ける形にしてあり、偶数番の面で
既存の法則と組み合わせる。RULE NOTE の下に **RULEBOOK** が出て、
いま効いている法則が発見済みは名前で、未発見は `??????` のまま並ぶ。
自分がこの世界のどれだけを言語化できたかが、常に見える。

法則の追加は `src/stages/accumulate.js` の `LAWS` に1項目足すだけで、
以降のステージが自動的にその法則を抱える。

---

## テスト

```bash
node test/run.mjs        # 全51ステージの solution を実際に再生してクリア可能性を保証
node test/monkey.mjs     # 「適当に操作しただけで解けてしまう」度合いを実測（難易度テスト）
node test/browser.mjs    # Playwright によるUI操作のE2E（スワイプ/ドラッグ/ピンチ/回転/番号合成）
node test/play.mjs 9     # 1ステージを1手ずつ盤面表示（作問用）
node test/solve.mjs 11 20  # BFSで解を探索（作問用）
```

`test/run.mjs` は「解けないステージが存在しない」ことを保証する回帰テスト。ステージを
追加・変更したら必ず通すこと。ヒント3段階・grid形状・solutionの有無も同時に検査する。

### 難易度テスト（test/monkey.mjs）

**何も理解していない操作を大量に流し込み、偶然クリアしてしまう確率を測る。**
1ステージにつき数千回、ランダムな移動・UNDO・画面操作を「想定解の3倍の手数」だけ
浴びせ、クリア率を出す。5%以上のステージは「適当でも解ける」＝設計失敗として扱う。

初回計測では14ステージが5%超（最悪85%）だったため、該当ステージは全面的に作り直した。
現在は**チュートリアルのStage 1（意図的に一直線）以外、すべて5%未満**。

```
  rate    stage  sol  budget  title
   24.3%  1        4      30  FIRST STEP  <- 意図的な罠。ここだけは歩けば終わる
    4.4%  40       6      30  ELSEWHERE   <- 本当の難所はステージ間の往復側にある
    4.1%  NULL-1  29      87  TWO LIES
    ...
    0.0%  33      20      60  UPSIDE DOWN <- 作り直し前は 85%
```

### 適当な操作を通さないための設計原則

計測に基づき、以下を全ステージへ適用した。

- **想定解を長くする。** 4手で終わる部屋は偶然で終わる。多くのステージを15〜28手にした。
- **順序ミスを致命傷にする。** ゴールを袋小路へ押し込む、天井の袋穴へ飛ぶなど、
  取り返しのつかない状態を用意した（UNDO/RESETで即座に戻せるので理不尽ではない）。
- **偶奇ゲートを運任せにしない。** 「2回に1回は通る門」は乱打で抜けられてしまうため、
  一本道にして遠回りで手数を稼げなくし、位相をずらす手段を1つに絞った。
- **試行回数を数える門。** LEVEL 7 の青い門は弾いた回数を記憶し、2度目で失敗になる。
  ただし UNDO すれば回数も巻き戻る。**乱打は殺すが、考えながらの実験は殺さない。**
- **UI操作に条件を付ける。** 盤面が回るのは黄色い軸の上だけ、など
  （`ui_conditions`）。ボタン連打では何も起きない。

`test/browser.mjs` はローカルサーバー（既定 `http://127.0.0.1:8123`）が必要:

```bash
npx http-server -p 8123 -s . & node test/browser.mjs
```

---

## 構成

```
index.html          ゲーム本体
editor.html         ステージエディタ
style.css
src/
  engine.js         世界そのもの。DOM非依存で、Nodeでもそのまま動く
  expr.js           ステージデータ用の小さな式言語（JSON）
  sentence.js       盤面上の「ルール文章」パーサ（LEVEL 6-7）
  render.js         キャンバス描画とヒットテスト
  pixel.js          5×7フォント / 8×8スプライト / タイル模様
  audio.js          WebAudioの合成音（ファイル無し）
  save.js           オートセーブ（localStorage）
  app.js            タイトル / ステージ選択 / プレイ画面 / 入力・ドラッグ
  editor.js         ステージエディタ
  stages/
    index.js        全ステージの集約と外部ステージの登録
    l1.js .. l7.js  ステージデータ
test/
  run.mjs           全ステージ検証
  browser.mjs       E2E
  play.mjs solve.mjs actions.mjs
```

---

## ステージの追加

### エディタから（コード変更なし）

`editor.html` を開き、JSONを書いて **検証** → **ゲームに追加**。
ステージ選択画面の `CUSTOM` に出る。追加分は本編セーブとは別枠 (`rulebreak.custom.v1`) に
保存され、いつでも一括削除できる。

### データファイルとして

`src/stages/*.js` に追記し、`src/stages/index.js` で結合するだけ。

### ステージスキーマ

```jsonc
{
  "id": "12", "title": "QUIET ROOM", "level": 2,
  "grid": {
    "rows": ["#######", "#.....#", "#######"],
    "legend": {                       // 文字 → タイル定義（省略可）
      "r": { "type": "redwall",
             "solid": { "op": "==", "a": { "v": "parity" }, "b": 1 } }
    }
  },
  "view":   { "x": 0, "y": 0, "w": 9, "h": 4 },   // 「見えている枠」。盤面はこれより広くてよい
  "objects": [
    { "kind": "player", "x": 1, "y": 1 },
    { "kind": "box", "x": 3, "y": 3, "slide": true, "push": false },
    { "kind": "door", "link": "a", "x": 1, "y": 2, "label": "4",
      "openIf": { "op": "==", "a": { "label": "#door1" }, "b": "14" } },
    { "kind": "goal", "x": 5, "y": 5, "spawnIf": { "global": "s40_seen" } }
  ],
  "marks": [{ "x": 3, "y": 3, "g": "10" }],       // 床の模様＝推理材料
  "banner": "THERE IS NO PUZZLE.",                // 盤面に書かれる文字
  "hidden_rules": [ /* 下記 */ ],
  "rule_priority": ["R_A", "R_B"],                // 同時に発火する規則の評価順
  "turn_conditions": { "countBlocked": true, "startTurn": 40, "step": 1, "uiCountsTurn": false },
  "win_conditions": [{ "at": ["player", "goal"] },
                     { "op": "==", "a": { "v": "turn" }, "b": 10 }],
  "cross_stage_variables": { "read": ["s12_box_placed"], "write": ["s40_seen"] },
  "available_ui_actions": ["undo", "reset", "zoom", "rotate", "tapTitle",
                           "closeNote", "dropUI", "dropChar", "splitWord", "wordDrag"],
  "tokens": ["箱", "4", "回", "入れ替わる"],        // RULE NOTE の仮説用単語
  "laws": [{ "id": "L2", "name": "…", "answer": ["ゴール", "10", "手目"] }],
  "hint_1": "考えるべき対象だけ", "hint_2": "関係する現象", "hint_3": "かなり具体的に",
  "solution": ["R", "R", "U", "Z", "ui:zoom"]     // テストが再生する解答
}
```

その他のフラグ: `use_sentences`（盤面の文章が壁の定義を支配する）、`words_pushable`、
`words_walkable`、`semantics_defaults`、`existence_kinds` / `spawns`（`X EXISTS` で物体を
生成する）、`ui_words`（画面下の単語トレイ）、`hidden`（ステージ選択に出さない）、
`nullStage` / `rootLocked`（根本規則の編集を受け付けない）、`flags`（初期フラグ。
`{"gravDir":"down"}` で重力ON）。

### 隠しルール（hidden_rules）

```jsonc
{
  "id": "R_GRAV",
  "name": "3回右へ進むと重力が反転する",     // 発見後にRULE NOTEへ載る文言
  "when": "afterMove",
  "if":   { "op": "==", "a": { "v": "streak.right" }, "b": 3 },
  "then": [{ "do": "flipGravity" }, { "do": "sound", "name": "low" }],
  "once": false,
  "note": "右へ3回 → 世界が裏返った",        // 自動で観測記録に載る文（答えは書かない）
  "answer": ["右", "3", "回", "重力", "反転"] // 仮説システムの正解トークン集合
}
```

**when**: `start` `beforeMove` `afterMove` `moveBlocked` `onEnter` `onPush` `onUndo`
`onReset` `onUI` `everyTurn` `beforeWin`

**if / 式**: `{v:"turn"}` `{v:"parity"}` `{v:"streak.right"}` `{v:"facing"}` `{v:"undos"}`
`{v:"visitsPrev"}` `{v:"tx"}` `{v:"ty"}` `{v:"trailLen"}` `{v:"flag.X"}` `{global:"X"}`
`{tileAt:[x,y]}` `{objAt:[x,y]}` `{objProp:["box","pushed"]}` `{visitsAt:[x,y]}`
`{textAt:[x,y]}` `{label:"#door1"}` `{has:"WALL IS SOLID"}` `{at:["player","goal"]}`
／ 演算子 `== != < <= > >= + - * / % and or not if in abs min max`

**then / 効果**: `setFlag` `addFlag` `toggleFlag` `setGlobal` `setTile` `setTileHere`
`setTilePrev` `addTurn` `setTurn` `moveObj` `teleport` `swap` `spawn` `remove` `removeAll`
`setProp` `setLabel` `flipGravity` `setGravity` `rotate` `setView` `spawnGhost` `win` `fail`
`cancel` `redirect` `note` `discover` `unlock` `flash` `sound`

**solution の記法**: `U D L R`（移動） `Z`（UNDO） `X`（RESET） `W`（待機）
`ui:zoom` `ui:rotate` `ui:tapTitle` `ui:closeNote`
`ui:dropUI:RESET,4,2` `ui:dropChar:1,#door1,prepend`
`ui:splitWord:#ui_RESET,2,3,1` `ui:wordDrag:#ui_SET,6,1`

---

## 設計方針

**理不尽にしない。** 難しいのは思考だけで、反射神経も運も要らない。制限時間もない。
すべてのステージに推理材料が盤面上（床の模様・壁の色・数字・オブジェクトの配置・
ステージ名・ステージ番号・手数表示）に必ず置いてある。答えを知ってから見ると
「最初から全部書いてあった」と分かる配置になっている。

**RULE NOTE。** 観測した現象は自動で記録される（答えは書かれない）。プレイヤーは単語を
組み合わせて法則を宣言し、正しければ `RULE DISCOVERED` として登録される。

**ヒントは3段階。** HINT1=考えるべき対象、HINT2=関係する現象、HINT3=かなり具体的。
それでも最後の一歩＝発見だけは絶対に代行しない。

**セーブデータは安全。** 「ゲームが壊れたように見える」演出は使うが、実際のセーブ
（発見済みルール / ステージ状態 / ステージ間干渉変数 / 隠しステージ / RULE NOTE）は
常に無事で、アプリを閉じること自体をパズルにするような真似はしない。壊れたJSONを
読んでも例外を投げずに新規データで復帰する。

**覚えさせたいのは攻略法ではなく「前提を疑う癖」。**
壁があったら「どう越えるか」ではなく「なぜこれを壁だと思ったのか」。
UNDOがあったら「間違えた時に使うボタン」ではなく「誰がそう決めたのか」。

---

## 進行（ネタバレ注意）

<details>
<summary>各LEVELで何が起きるか</summary>

| LEVEL | ステージ | 何を疑わせるか |
| --- | --- | --- |
| 1 | 1–9 | **盤面を疑う。** 説明のない法則を、現象から逆算して発見する |
| 2 | 10–16 | **法則を利用する。** 邪魔だった規則を、自分の道具として悪用する |
| 3 | 17–24 | **法則同士を干渉させる。** 1ステージに2〜4個の規則が同時に効く |
| 4 | 25–31 | **時間を疑う。** UNDOも1手。巻き戻した経路は過去の自分として歩き出す |
| 5 | 32–36 | **画面を疑う。** 盤面＝世界ではない。枠の外・回転・UIパネルの裏 |
| 6 | 37–39 | **UIを疑う。** `MOVES 14` から `1` を抜き、`DOOR 4` を `DOOR 14` にする |
| 8 | 40 | **ステージを疑う。** 40で起きたことが12を書き換え、12での行動が40の壁を消す |
| 6–7 | 41–46 | **エンジンを疑う。** 盤面の文章が設定そのもの。自己言及と評価順序 |
| — | 47 | ステージ選択画面で `24` から `4` を取り、`7` に重ねると生成される |
| 9 | FINAL | 盤面は白紙。`PLAYER EXISTS` `GOAL EXISTS` `PLAYER = GOAL` を自分で書く |
| — | NULL | 100%後、タイトルの `//` を押して `RULE BREAK` にすると解放される |

</details>
