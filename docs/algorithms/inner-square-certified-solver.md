# 内面回転を含む完全ソルバー

`level3-inner-square-certified` / `level4-inner-square-certified` は現在状態のみを読み、slice・extension・追加内面回転の全操作群を解く。
Level2は既存の `level2-certified` が新系を扱う。Level1には追加内面対象がなく両系が一致する。

## 実行

```sh
npm run bench -- --level=3 --seeds=101 --length=100
npm run bench:inner-square -- 3 1000 101 all
npm run bench:inner-square -- 3 0 101 certified direct
```

最初は通常のCLI、次は同じ入力で完全方式・案D・階層復元を比較する研究用CLI、最後は歩道の混合性に依存しない直接状態構成。
旧 `level3-slice-reduction` / `level4-slice-reduction` を比較する場合は `--move-system=standard` を明示する。
Labの既定も新系。Workerへ操作系を渡し、対応しないアルゴリズムは実行前に拒否する。

## 処理

1. 全生成元から位置軌道と局所向き群を計算する。
2. 偶奇とアーベル化した向きの共同署名をZ4/Z3の基底SLPで正規化する。
3. 純粋3点工具の共役・交換子で各軌道の偶置換を完成する。
4. C3/C4の二点工具、D4の回転・反転工具と最後の交換子で向きを完成する。
5. 全出力原子手を疎な整数表現で独立に再生し、位置・向きの完全一致を要求する。

大きい軌道では旧軌道の色組の表を使う。旧群内で二点を証拠位置へ運び、色を変える新手を一つ実行する操作を繰り返す。
旧工具の証明書と色組の全辺検査が前提である。詳細は[構成的証明](../proofs/inner-square-completeness.md#d1-旧軌道の独立性を使った輸送)。

## 階層復元と案D

`level3-block-restoration` / `level4-block-restoration` は同じ新系を受け取る。
粗い内面回転は、細かい三平面への語にしてから支持・作用を確認する。
復元できれば粗い問題を解き、できなければ上記の完全ソルバーへ渡す。
深さL、欠損D、一手変化上界KについてD>L·Kなら探索を安全に省略する。
全Levelで案D（選択支持が互いに素な手を跨ぐ可換相殺）を最後に適用する。

深いランダム入力で復元探索が省略され、案Dだけと同じ手数になった場合、それを階層構造の改善と呼ばない。
浅い設計入力の成功と、深い入力での効率を別々に記録する。

## ソース

- `mengerAbelianSignature.ts`：共同署名、SLP、基底監査。
- `mengerInnerSquareReduction.ts`：位置・向きの完全還元。
- `mengerFactoredTransport.ts`：旧軌道の色組による大軌道輸送。
- `innerSquareTools.json`：発見後に全作用を検査した工具。
- `innerSquareCertifiedSolver.ts`：入力モデルとの照合、ソルバーAPI。
- `mengerBlockRestoration.ts` / `higherBlockRestorationSolver.ts`：復元探索と持上げ。
- `research/inner-square-expanded/`：網羅列挙、計算証明、実験・生データ。

独立再生は出力全手を調べるため、Level4の数千万手では時間を要する。
現在の出力は原子手配列。短い最適解やブラウザでの大規模再生を保証するものではない。
