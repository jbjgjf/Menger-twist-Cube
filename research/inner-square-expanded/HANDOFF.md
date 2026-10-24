# Claude Science に渡すプロンプト

Menger twisty puzzleの研究を、ISEFで説明・再現・検証できる数学・計算研究へ発展させてください。
リポジトリは `jbjgjf/Menger-twist-Cube`、ローカルは `/Users/shou/hobby/menger-cube` です。
Draft PR: https://github.com/jbjgjf/Menger-twist-Cube/pull/13
ブランチ: `codex/inner-square-complete-l3-l4`。
この作業の変更と生データを保持し、最初に現在のgit状態と計算中プロセスを確認してください。

## 最初に読むもの

1. `docs/research/isef-research-brief.md`：研究課題、主結果、限界。
2. `docs/proofs/inner-square-completeness.md`：幾何、共同署名、核の構成、色組輸送、一般nの命題、共有修正補題。
3. `docs/research/inner-square-results.md` と `research/inner-square-expanded/out/primary-summary.json`：主要な保留seed比較。未完了があれば除外せず完了させる。
4. `docs/research/inner-square-study.md`：実験契約と先行研究。
5. `research/inner-square-expanded/out/source-manifest.json`：実装ハッシュ、環境。

## 必須の前提

研究対象は `inner-square`。旧slice・recursive extensionに、定義した一層の正方形外接箱の全合法部分集合回転を加えたもの。
内面回転のない旧 `standard` の成果や弱いスクランブルだけを、新系の完全性の証拠にしてはいけない。
Level1は両系が一致、Level2は既存完全ソルバー、Level3/4は新しい共同署名ソルバーで扱う。
任意の多層部分集合や斜め軸を解いたとは主張していない。

新しい内面手で位置軌道が合流することが重要。Level3は164→116、Level4は3050→1294。
新群の位数はそれぞれ14105桁、403271桁。数え上げによるGod's number下界は3766、81274。
正確なGod's numberや最適解ではない。旧系の一般nの直径下界を新系へ流用しない。

## 実装と再現

- `npm run audit:inner-square`：2^n平面型の全閉集合と厳密衝突証拠、カタログ出力。cap到達は未完了。
- `npm run prove:inner-square`：出荷工具と監査工具の一致、全作用、正規閉包、共同Z4像のSLP、独立ビット平面照合、整数位数・下界。
- `npm run test:inner-square`：新系、元エンジンとの照合、負例、Workerの操作系伝達。
- `node --import tsx research/inner-square-expanded/functional.ts 3`（4も）：全向き工具、孤立D4残差、到達不能C3・非単位入力。
- `transport-audit.ts 3/4` と `factored-audit.ts 4`：小軌道の全順序対、大軌道の全色組辺。
- `restoration-check.ts 3/4`、`bound-check.ts 3/4`、`shared-check.ts 3/4`：内面マクロ持上げ、復元下界、共有語。
- `npm run bench:inner-square -- 4 1000 101 all`：完全方式／案D／階層復元を同じ入力で比較。
- `npm run bench:inner-square -- 4 0 104 certified direct`：歩道を使わず全群の不変量整合状態を直接構成。
- `python3 research/inner-square-expanded/report.py`：主要CSV・JSON・Markdownを再生成。

大きい解答は全原子手を疎な整数表現で独立再生する。代表小例のみ元エンジンでも逐次再生する。両者を混同しない。
Level4は数千万手・数百億の選択セル更新になり、数分以上を要する。途中結果はJSONにチェックポイントされる。
既存の実行と同じ出力ファイルへ同時に書かない。結果失敗・中断も保存する。

## 優先して進める研究

1. 共同署名の核が、独立な交代置換と均衡向き群でちょうど生成される証明を独立監査する。
   特にD4の最後のr²補正、三点工具の向き副作用、共役支持の回避、Z4の非体上の消去と全群位数公式を確認する。
2. 旧軌道の色組輸送を一般nへ定式化し、工具存在の帰納法が成立する範囲を証明する。成立しなければ条件付き定理と反例を明示する。
3. `mengerSharedCorrection.ts` の支持条件付き共有交換子を、深い入力で生じる工具列へ自動配置する。
   局所例は四修正16→10手（37.5%）。これを全解答の改善率と混同しない。
4. 深い入力では現在の階層復元は案Dだけと同じ手数になる。この負の結果を保持し、より深い復元、強い距離下界、共有工具探索を比較する。
5. 先行研究とのモデル・定理・計算結果の差を精読する。KTH “On Rubik's Cube” §5.6原本URLが404だったので取得し直す。
6. 英語論文・ポスター、学生本人が検算できる縮小例、証明依存関係図、再現可能な図表を作る。

一般nの無条件完全性、全nの効率的アルゴリズム、新規性の確定、外部専門家による証明レビューは未完了。
AIが生成・修正した箇所と学生本人の検証・発見を研究記録に分け、裏付けのないISEF水準や新規性を断言しないでください。

## プレビュー配信に関する残件

PR作成時のVercelプレビュー3件は失敗した。ローカル `npm run build --workspace=@menger/lab` は成功。
Vercel接続は `team_jYWAv8vTZaVhpYoBb54n8vai` / `jbjgjfs-projects` のログ参照が403となり、配信失敗の原因は確定できていない。
研究結果の検証と区別し、必要なら正しいVercelチームアクセスを取得してログを調べる。勝手に配信設定や保護を変更しない。
