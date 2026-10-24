"""Rebuild held-out paired summaries. Missing/failed trials stay visible.
Only seeds101..110 (L2/3) and101..103 (L4) enter primary walk tables.
Runtime is descriptive: experiments shared a machine and warm caches.
"""
import csv, hashlib, json, random, statistics
from pathlib import Path
ROOT=Path(__file__).resolve().parent
OUT=ROOT/'out'
rows=[]; summaries=[]
def interval(values):
    if not values: return None
    rng=random.Random(20261025)
    draws=sorted(statistics.mean(rng.choices(values,k=len(values))) for _ in range(10000))
    return [draws[249],draws[9749]]
for level in [2,3,4]:
    for length in ([100,1000] if level<4 else [1000]):
        expected=list(range(101,111 if level<4 else 104)); cohort=[]
        for seed in expected:
            p=OUT/f'bench-L{level}-n{length}-seed{seed}.json'
            d=json.loads(p.read_text()) if p.exists() else {}
            c=d.get('certified',{});h=d.get('restoration',{});o=d.get('D',{})
            complete=bool(c.get('success') and h.get('success') and o.get('moves') is not None)
            row=dict(level=level,length=length,seed=seed,status='complete' if complete else 'pending_or_failed',displaced=d.get('displaced'),baseline=c.get('moves'),D=o.get('moves'),hierarchical=h.get('moves'),inputSha256=d.get('inputSha256'),implementationSha256=d.get('implementationSha256'))
            rows.append(row)
            if complete: cohort.append((d,(c['moves']-o['moves'])/c['moves']*100))
        stats={'level':level,'length':length,'expectedTrials':len(expected),'completeTrials':len(cohort),'missingOrFailedSeeds':[r['seed'] for r in rows if r['level']==level and r['length']==length and r['status']!='complete']}
        if cohort:
            reductions=[r for _,r in cohort]
            stats.update(meanBaselineMoves=statistics.mean(d['certified']['moves'] for d,_ in cohort),meanDMoves=statistics.mean(d['D']['moves'] for d,_ in cohort),meanPercentReductionD=statistics.mean(reductions),pairedSeedBootstrap95Percentile=interval(reductions),hierarchicalEqualsD=sum(d['D']['moves']==d['restoration']['moves'] for d,_ in cohort),displacedRange=[min(d['displaced'] for d,_ in cohort),max(d['displaced'] for d,_ in cohort)],implementationHashes=sorted({d['implementationSha256'] for d,_ in cohort}))
        summaries.append(stats)
with (OUT/'primary-trials.csv').open('w') as f:
    writer=csv.DictWriter(f,fieldnames=rows[0].keys());writer.writeheader();writer.writerows(rows)
(OUT/'primary-summary.json').write_text(json.dumps({'cohort':'held-out seeds101..110 L2/3;101..103 L4; no failure exclusion','bootstrap':'10000 resamples of paired seeds, PRNG20261025, percentile interval; exploratory uncertainty for the declared seeded distribution, not uniform-group or runtime confidence','runtimeClaim':False,'groups':summaries},indent=2)+'\n')
md=['# 内面回転系の主要比較結果','','`python3 research/inner-square-expanded/report.py` で生JSONから再生成する。欠測・失敗を試行数の分母から除かない。','', '| Level | 入力長 | 完了/予定 | 完全方式の平均手数 | 案Dの平均手数 | 案Dの平均削減率（seed bootstrap 95%区間） | 階層復元=D |','| --- | ---: | ---: | ---: | ---: | --- | ---: |']
for s in summaries:
    if not s['completeTrials']: md.append(f"| {s['level']} | {s['length']} | 0/{s['expectedTrials']} | — | — | — | — |");continue
    lo,hi=s['pairedSeedBootstrap95Percentile']
    md.append(f"| {s['level']} | {s['length']} | {s['completeTrials']}/{s['expectedTrials']} | {s['meanBaselineMoves']:,.1f} | {s['meanDMoves']:,.1f} | {s['meanPercentReductionD']:.3f}% ({lo:.3f}–{hi:.3f}%) | {s['hierarchicalEqualsD']}/{s['completeTrials']} |")
md += ['','入力はslice・extension・inner全族を含む固定分布。長い歩道を一様群標本とは呼ばない。別の`direct`入力も記録する。','両方式を同じ入力で比較し、案Dの相殺後も全原子手を整数再生する。時間は同時実行・キャッシュ・GCの影響があるため、速度優位の結論を出さない。','階層復元がDと同じ場合、階層による追加の手数改善は0である。局所の共有例（16→10手）と深い入力での改善を混同しない。','区間は少数seedの探索的bootstrap。群上の一様分布、未観測Levelや最適距離への外挿はしない。']
md += ['', '## 直接構成した全群状態', '', '| Level | seed | 完全解答 | 完全方式の手数 | 案D後の手数 | 移動部品 |', '| --- | ---: | --- | ---: | ---: | ---: |']
for level,seed in [(3,101),(4,104)]:
    p=OUT/f'bench-L{level}-direct-seed{seed}.json'
    d=json.loads(p.read_text()) if p.exists() else {}
    c=d.get('certified',{});o=d.get('D',{})
    md.append(f"| {level} | {seed} | {'成功' if c.get('success') else '未完了/失敗'} | {c.get('moves','—')} | {o.get('moves','—')} | {d.get('displaced','—')} |")
md += ['', '直接構成は理想独立乱数の下で核と共同像の切断から全群を一様化する。実測はseed付きLCGであり、完全な乱数性の証明ではない。Dの欄が未完了なら、短縮出力の検証が計算中の場合もある。']
(Path('docs/research/inner-square-results.md')).write_text('\n'.join(md)+'\n')
print(json.dumps(summaries,ensure_ascii=False))
