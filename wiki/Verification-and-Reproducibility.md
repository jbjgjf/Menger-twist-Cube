# 証拠、再現方法、用語上の注意

## 1. 何を計算機に任せ、何を数学で保証するか

本解法は「乱数で何度か成功したから正しい」というものではありません。計算機は有限だが大きい対象を列挙し、数学はその列挙結果から一般の場合を結論します。

| 計算機が確認するもの | そこから使う数学的結論 |
| --- | --- |
| 全合法原子手と軌道分解 | 駒は所属軌道から出ない |
| 各軌道の置換群の証明書 | 各軌道で全偶置換が可能 |
| 164 個の純粋工具の全セル作用 | 軌道を一つずつ独立に解ける |
| 位置×24向きの有限オートマトン | 必要な向き修正が尽くされている |
| 偶奇ベクトルの行基本変形 | 到達可能な偶奇を正規化できる |
| 実エンジンでの全出力手再生 | 返された個々の答えが合法で正しい |

## 2. Level 3 の実測記録

すべて、各出力手の合法性を確認しながら実エンジンで再生し、最後に全 8,000 セルの完全一致を要求した結果です。

| seed | スクランブル長 | 結果 | 実行時間 | 解答手数 |
| ---: | ---: | --- | ---: | ---: |
| 1 | 5 | 成功 | 138.1 秒 | 256,171 |
| 2 | 5 | 成功 | 112.1 秒 | 111,830 |
| 1 | 20 | 成功 | 209.9 秒 | 364,550 |
| 3 | 20 | 成功 | 154.8 秒 | 282,245 |
| 4 | 20 | 成功 | 249.0 秒 | 358,331 |
| 5 | 20 | 成功 | 197.8 秒 | 350,246 |
| 6 | 100 | 成功 | 284.2 秒 | 424,519 |

七例は実装バグを見つける証拠にはなりますが、完全性そのものは有限軌道・純粋工具・打ち切りなし探索・ポテンシャル減少の議論から得られます。

## 3. 再現コマンド

高速な Level 3 構造監査は次で実行できます。

```sh
npm run verify:l3
```

内容は、保存済み純粋工具の監査、疎シミュレータと実エンジンの比較、軌道置換群の証明書検査です。

Level 3 の一回の解答を再現する例：

```sh
npm run bench -- --algorithm=level3-slice-reduction --level=3 --seeds=6 --length=100
```

数分と大きな出力列を要します。

Level 2 の実験的ベンチマーク例：

```sh
npm run bench -- --algorithm=level2-slice-reduction --level=2 --count=10 --length=50
```

この成功は現行物理モデルでの完全性証明を代替しません。

## 4. ソース内の証拠

- `packages/solver-core/src/algorithms/level2SliceReductionSolver.ts`：Level 2 構成的解法
- `packages/solver-core/src/algorithms/level3SliceReductionSolver.ts`：Level 3 完全解法
- `packages/solver-core/src/algorithms/level3SliceReductionToolData.ts`：164 軌道の純粋工具データ
- `research/scratch/l3-orbit-groups.ts`：各軌道の置換群証明書
- `research/scratch/l3-audit-tooldata.ts`：純粋工具監査
- `research/scratch/l3-sim-vs-engine.ts`：疎シミュレータと実エンジンの比較
- `docs/architecture/rotation-legality-design-log.md`：物理衝突判定と Level 2 の未再検証事項
- `docs/research/level3-solver-completion-audit.md`：Level 3 完成監査
- `docs/research/square-region-rotation-model.md`, `docs/research/square-region-rotation-impact.md`：正方形断面の内面回転を網羅した拡張モデルの定義と、Level 2 の差分・群比較（`npm run audit:square`, `npm run test:square`）

## 5. 残っている研究課題

### Level 2

合法な 72 種の一セル回転だけを用いて、軌道、向き自由度、偶奇生成空間、位置工具、向き工具を再構成することが最優先です。結果によっては現行ソルバーの修正だけで済む場合も、解法構造自体の変更が必要な場合もあります。

### Level 3

完全性ではなく効率が課題です。工具を最短の準備手から再構成すること、連続する準備手と逆準備手を相殺すること、広い工具で一度に多くのセルを完成させることが候補です。

### God's number

Level 3 では $G_3\ge 3206$ という下界がありますが、意味のある上界や正確な値は分かっていません。Level 2 についても現行物理モデルの到達可能状態数を改めて数える必要があります。
