# Expanded inner-square research

Run all commands at the repository root, Node22.3+ with `npm install` completed.

- Model/proof: `docs/proofs/inner-square-completeness.md`.
- Research brief: `docs/research/isef-research-brief.md`.
- Study and limits: `docs/research/inner-square-study.md`.
- Primary paired results: `docs/research/inner-square-results.md`.
- Continuation prompt: `HANDOFF.md`.

## Reproduce

```sh
npm run audit:inner-square
npm run prove:inner-square
npm run test:inner-square
node --import tsx research/inner-square-expanded/transport-audit.ts 3
node --import tsx research/inner-square-expanded/transport-audit.ts 4
node --import tsx research/inner-square-expanded/factored-audit.ts 4
node --import tsx research/inner-square-expanded/functional.ts 3
node --import tsx research/inner-square-expanded/functional.ts 4
node --import tsx research/inner-square-expanded/restoration-check.ts 3
node --import tsx research/inner-square-expanded/restoration-check.ts 4
node --import tsx research/inner-square-expanded/shared-check.ts 3
node --import tsx research/inner-square-expanded/shared-check.ts 4
python3 research/inner-square-expanded/report.py
node --import tsx research/inner-square-expanded/provenance.ts
```

Geometry enumeration reuses complete exact-witness profiles. To force an independent rerun, use e.g. `enumerate.ts 4 --force`; a numeric argument selects one profile. Never write the same profile concurrently. Accepted atom certificates and candidate rejection witnesses serve different purposes; both are required before export.

`find-tools.ts 3/4` rediscovers tools and updates production data. It is a discovery step, not a required verification step. Existing checked-in tools are independently replayed by `certify.ts`.

## Primary experiments

```sh
# Each level in 2 3; each length in 100 1000; each seed in101..110:
npm run bench:inner-square -- 3 1000 101 all
# Level4 length1000, seeds101..103:
npm run bench:inner-square -- 4 1000 101 all
# Full-group direct state controls:
npm run bench:inner-square -- 3 0 101 all direct
npm run bench:inner-square -- 4 0 104 certified direct
```

A complete Level4 trial may take tens of minutes because all emitted atoms are independently replayed and the D output is checked again. Source/version and input hashes are stored. Do not use total elapsed time of concurrent jobs as a speed comparison.

`out/bench-*seed1..20.json` are development artifacts, including older implementation hashes. They are retained for traceability and are not pooled into primary tables. The primary report explicitly lists pending/failed seeds; do not drop them. Exact group-order decimal integers are in `group-order-L3.txt` and `group-order-L4.txt` and have hashes in the certificates.
