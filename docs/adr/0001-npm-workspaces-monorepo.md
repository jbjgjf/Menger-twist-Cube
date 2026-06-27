# ADR 0001: npm workspaces monorepo, no build step for internal packages

## Status

Accepted

## Context

The project was a single Vite app (`src/`) with the solver, the engine, and the Play UI all living in one `src/` tree and importing each other by relative path. That made it structurally impossible to: run the solver outside a browser, build a second UI without dragging in the game's Three.js dependency, or reuse the engine/solver from a future package without copying code.

## Decision

Split into an npm-workspaces monorepo:

```
packages/engine        pure puzzle mechanics
packages/solver-core    PuzzleModel/SolverAlgorithm interfaces, registry, benchmark runner, CLI
apps/play               the game (React Three Fiber)
apps/lab                solver dashboard (no Three.js)
```

`packages/*` are consumed as TypeScript source directly — `package.json` `exports`/`types` point at `./src/index.ts`, with no `tsup`/`rollup` build step. Vite transforms workspace-symlinked source on the fly for the two apps; the CLI runs under `tsx` for the same reason in Node.

Considered and rejected:

- **A heavier monorepo tool (Nx/Turborepo).** Four workspaces and no need for remote caching or task orchestration beyond `npm run x --workspaces` does not justify the extra tooling and config surface.
- **Building each package to `dist/` with declaration files.** This is only worth the indirection once a package is published outside this repo or consumed by a toolchain that can't transform TS itself. Neither is true today, and a stale `dist/` someone forgot to rebuild is a worse failure mode than "no dist at all" for an internal-only package.
- **Keeping everything in one `src/`.** This is the status quo being replaced; see Context.

## Consequences

- Adding an export from `packages/engine` or `packages/solver-core` is visible to every consumer immediately — no rebuild step to forget.
- `npm run typecheck`/`npm run build` iterate `--workspaces --if-present`, so adding a fifth workspace needs no root script changes.
- If a package ever needs to be published or consumed by something that can't transform TS (e.g. a plain Node script run without `tsx`), it will need its own build step at that point — revisit this ADR then.
