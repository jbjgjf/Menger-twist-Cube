# 証明文書

完全性の証明をLaTeXとMarkdownでまとめたものです。

| 文書 | 内容 | 状態 |
| --- | --- | --- |
| [`level2-completeness.tex`](level2-completeness.tex) | Level 2 の到達可能状態の決定と、解法 `level2-certified` の完全性。標準系（468原子手）と拡張系（522原子手）の両方 | 証明済み |
| [`level3-completeness.tex`](level3-completeness.tex) | Level 3 の到達可能状態の決定（位数、ねじれ和と反転偶奇の不変量）と、解法 `level3-slice-reduction` の構成的可解性 | 証明済み（標準系のみ。2026-10-10 に向きと位置の補題を改訂） |
| [`inner-square-completeness.md`](inner-square-completeness.md) | 内面回転を含むLevel3/4の全候補監査、共同署名、完全解法、群位数、復元下界、一般nの条件付き定理 | 計算証明＋構成的証明（新系） |
| [`preamble.tex`](preamble.tex) | 共通のプリアンブル | — |
| [`level4-completeness.md`](level4-completeness.md) | Level4の独立交代群、正確な群位数、完全解法、God's number の上下界、一般nの合法手数と直径下界 | 計算証明と構成的証明（標準系） |
| [`block-restoration.md`](block-restoration.md) | 一般nのブロック判定・部分群・条件付き還元、Level3/4の復元距離下界 | 解析的証明＋既存位置群証明に依存する整数計算 |

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
| Level 4 | `npm run prove:l4` | 出荷工具、正規閉包、姿勢制約、群位数、全順序対表、直径上界 |
| Level 4 | `npm run verify:l4` | 旧シミュレータ・元エンジンとの照合、一般nの合法手数 |
| Level 4 | `npm run test:l4` | 高いセルindex、元エンジンでの解再生、二点姿勢補正、到達不能状態の拒否 |
| Level 4 | `npm run verify:l4:synthetic` | 全3,050軌道を直接乱した不変量整合状態を、履歴なしで構成して解く |

内面回転を含む新系の再検査は `npm run audit:inner-square`、`npm run prove:inner-square`、`npm run test:inner-square`。旧 `prove:l3` / `prove:l4` は標準系を検査する。

## 新しい証明を追加するとき

`\input{preamble}` を使い、定理環境（`theorem`、`lemma`、`proposition`、`corollary`、`definition`、`check`）をそろえてください。
計算機に任せる事実は `check` 環境で番号を付け、検査するスクリプトと再実行のコマンドを本文に書きます。
