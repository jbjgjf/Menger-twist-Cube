# 証明文書

完全性の証明を論文形式（LaTeX）でまとめたものです。

| 文書 | 内容 | 状態 |
| --- | --- | --- |
| [`level2-completeness.tex`](level2-completeness.tex) | Level 2 の到達可能状態の決定と、解法 `level2-certified` の完全性。標準系（468原子手）と拡張系（522原子手）の両方 | 証明済み |
| [`level3-completeness.tex`](level3-completeness.tex) | Level 3 の到達可能状態の決定（位数、ねじれ和と反転偶奇の不変量）と、解法 `level3-slice-reduction` の構成的可解性 | 証明済み（標準系のみ。2026-10-10 に向きと位置の補題を改訂） |
| [`preamble.tex`](preamble.tex) | 共通のプリアンブル | — |

## ビルド

LuaLaTeX と `luatexja`（`ltjsarticle` クラス）が必要です。

```bash
cd docs/proofs
lualatex level2-completeness.tex && lualatex level2-completeness.tex
lualatex level3-completeness.tex && lualatex level3-completeness.tex
```

## 計算機検査の再実行

| 文書 | コマンド | 内容 |
| --- | --- | --- |
| Level 2 | `npm run prove:l2` | 検査 C1–C9（全探索、乱数なし）。結果は `research/level2-completeness/out/certificate.json` |
| Level 2 | `npm run test:l2` | 上に加え、不変量を満たす状態を直接構成して解く試験、不変量を破った状態の拒否 |
| Level 3 | `npm run prove:l3` | 検査 C1–C9（乱数なし、数秒）。結果は `research/level3-completeness/out/certificate.json` |
| Level 3 | `npm run test:l3` | 上に加え、不変量を満たす状態を直接構成して解く試験、不変量を破った状態の拒否 |
| Level 3 | `npm run verify:l3` | 純粋工具の監査、シミュレータとエンジンの比較、軌道の置換群の証明書 |

## 新しい証明を追加するとき

`\input{preamble}` を使い、定理環境（`theorem`、`lemma`、`proposition`、`corollary`、`definition`、`check`）をそろえてください。
計算機に任せる事実は `check` 環境で番号を付け、検査するスクリプトと再実行のコマンドを本文に書きます。
