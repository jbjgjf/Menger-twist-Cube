# Primary Comparison Results for the Inner-Square Move System

Regenerated from raw JSON via `python3 research/inner-square-expanded/report.py`. Missing or failed runs are not excluded from the trial denominator.

| Level | Input length | Completed / Planned | Certified mean moves | Option D mean moves | Option D mean reduction (seed bootstrap 95% CI) | Hierarchical restoration = D |
| --- | ---: | ---: | ---: | ---: | --- | ---: |
| 2 | 100 | 10/10 | 3,871.4 | 3,814.3 | 1.473% (1.346–1.636%) | 10/10 |
| 2 | 1000 | 10/10 | 4,019.0 | 3,967.1 | 1.286% (1.105–1.483%) | 10/10 |
| 3 | 100 | 10/10 | 893,617.4 | 857,245.2 | 4.068% (4.006–4.124%) | 10/10 |
| 3 | 1000 | 10/10 | 1,054,840.1 | 1,005,477.3 | 4.679% (4.608–4.750%) | 10/10 |
| 4 | 1000 | 3/3 | 19,553,701.0 | 19,310,855.3 | 1.242% (1.213–1.262%) | 3/3 |

Inputs follow a fixed scramble distribution spanning all `slice`, `extension`, and `inner` move families. Long random walks are not claimed to be uniform group samples. Separate `direct` group-element inputs are recorded below.
Both methods are evaluated on identical inputs, and every atomic move is replayed via exact integer arithmetic after Option D cancellation. Because wall-clock runtimes are affected by concurrency, caching, and garbage collection, no runtime superiority claims are drawn.
When hierarchical restoration equals D (`Hierarchical restoration = D`), the additional move reduction attributable to hierarchical search is 0. Local shared-setup examples (16 → 10 moves) must not be conflated with move reductions on deep scrambles.
Confidence intervals are exploratory bootstraps over a small number of seeds. We do not extrapolate to uniform group distributions, unobserved Levels, or optimal God's-number distances.

## Directly Constructed Full-Group States

| Level | Seed | Certified solve | Certified moves | Post-Option-D moves | Displaced cubies |
| --- | ---: | --- | ---: | ---: | ---: |
| 3 | 101 | Success | 1176279 | 1104511 | 7888 |
| 4 | 104 | Success | 26240580 | 25932334 | 158765 |

Under ideal independent randomness, direct construction samples uniformly from the full group via sections of the kernel and the joint homomorphism image. Actual runs use a seeded LCG and do not constitute a proof of cryptographic or perfect randomness. If an Option D entry is incomplete, verification of the shortened output word may still be in progress.
