# Level 4：完全解法と一般nへの結果

標準手系の全合法手について、160,000セルの現在状態から解く
`level4-slice-reduction` を実装した。履歴を読む解法ではない。
完全性は有限個のスクランブルの成功ではなく、出荷工具と群構造の計算証明に基づく。

| 項目 | Level 4 |
| --- | ---: |
| セル | 160,000 |
| 合法原子手 | 44,784 |
| 位置軌道 | 3,050 |
| パリティ空間の次元 | 66 |
| 位置から姿勢が決まるセル | 148,680 |
| 全群位数の常用対数 | 244,936.58485676695… |
| God's number の下界 | 52,662 |
| God's number の構成的上界 | 23,645,070 |

手数は、合法ターゲットの90°・−90°・180°を各1手と数える。
上界は任意の状態に対する工具・輸送回数の解析から得たものであり、観測解の長さを上界としたものではない。
最短解法ではない。

全軌道に、他の軌道の位置と姿勢を変えない純粋3-cycleがある。
共役支持の連結性から、それぞれ独立な交代群を得る。C3のtwist和0とD4のflip偶数が
姿勢の同時制約で、二点工具と独立セルrollで全ての許される姿勢を消せる。

3点setupの探索は最大軌道で巨大になったため、共通辺を持つ3候補と2点輸送に置き換えた。
全3,050軌道の順序対23,099,392状態を検査し、候補までの距離は最大8手だった。
全状態を格納できる有限の2点表から必要な3-cycleを構成する。

証明と一般nの導出はリポジトリの
[`docs/proofs/level4-completeness.md`](../docs/proofs/level4-completeness.md)、
実装説明は [`docs/algorithms/level4-slice-reduction-solver.md`](../docs/algorithms/level4-slice-reduction-solver.md)。
3,050軌道の詳細は [`orbits-L4.csv`](../research/level4/out/orbits-L4.csv) にある。

## 一般のLevel n

合法な独立単一セルrollの個数は

$$
R_n=(100\,20^{n-1}+272\,8^{n-1}+648\,3^{n-1})/85.
$$

合法原子手数もこのRから閉じた式で求められる。独立部分群 `C4^(R_n)` と手列数を比較すると、
一般nについて `G_n = Ω(20^n/n)`。この結論に、一般nの全軌道の交代群構造という未証明の外挿は不要である。

## 再現

```bash
npm run prove:l4
npm run verify:l4
npm run test:l4
npm run verify:l4:synthetic
npm run bench -- --algorithm=level4-slice-reduction --level=4 --seeds=1 --length=5
```

LabではデスクトップからLevel4を選べる。Scramble・Solve・benchmarkはworkerで実行し、
160,000メッシュの描画や数百万手の逐次再生は作らず、結果とフェーズを表示する。
