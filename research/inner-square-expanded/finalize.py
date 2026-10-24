"""Run after all predeclared trials complete; never omit pending seeds."""
import json
from pathlib import Path
out=Path('research/inner-square-expanded/out')
summary=json.loads((out/'primary-summary.json').read_text())
assert sum(g['expectedTrials'] for g in summary['groups'])==43
assert all(g['completeTrials']==g['expectedTrials'] for g in summary['groups'])
assert all(g['hierarchicalEqualsD']==g['completeTrials'] for g in summary['groups'])
for level,seed in [(3,101),(4,104)]:
    d=json.loads((out/f'bench-L{level}-direct-seed{seed}.json').read_text())
    assert d['certified']['success'] and d['D']['verifiedSelectedEntries']>0
rows=['# 引継ぎ時点の確定状況','','PR: https://github.com/jbjgjf/Menger-twist-Cube/pull/13','ブランチ: `codex/inner-square-complete-l3-l4`。2026-10-25 JST。','','## 完了したもの','','1. Level2/3/4の全平面型と全候補を監査。全て列挙完了、受理手の厳密証明、棄却の有理数衝突証拠を確認。','2. Level3/4の共同署名、核の構成、完全ソルバー、群位数と数え上げ下界を検証。','3. 全54個のLevel2内面原子手と全1,974個のLevel3内面原子手の持上げを確認。一般nの復元下界と共有条件を証明。','4. 混合43入力で完全方式・案D・階層復元を照合。直接構成2入力も完全解答・案Dの全原子手再生まで成功。','','全43試行で階層復元の手数は案Dと同じ。構造利用による追加改善とは数えない。','局所共有例はLevel3/4とも四修正16→10手、8葉ブロックで全作用を確認。','','## 1,000手入力の案D平均削減率','']
for g in summary['groups']:
    if g['length']==1000:
        rows.append(f"- Level{g['level']}: {g['meanPercentReductionD']:.3f}%（{g['completeTrials']}入力）")
rows += ['','## 検証記録','','`npm run typecheck`、`npm run build`、60件の試験、全群証明、独立像照合、全輸送表、全向き工具、全内面持上げ、共有語、成果物整合性検査を完了。','実行環境・ソース一覧は `out/source-manifest.json`。入力・実装ハッシュは各試行JSON。再集計は `report.py`。','','## 残る研究','','全nでの工具存在と効率的完全性、共有語の深い解答への自動配置、先行研究との新規性比較、外部専門家の証明レビュー。','Vercelの自動プレビュー3件は失敗。ログ参照はチーム権限403で原因未確定。ローカル全ビルドは成功。','','継続時は `HANDOFF.md` のClaude Science向けプロンプトを使う。']
Path('research/inner-square-expanded/STATUS.md').write_text('\n'.join(rows)+'\n')
print('All 43 paired trials and both direct controls are complete.')
