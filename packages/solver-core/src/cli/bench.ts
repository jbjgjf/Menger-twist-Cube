#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mengerPuzzleModel } from '../model/mengerPuzzleModel';
import { getAlgorithm, listAlgorithms } from '../algorithm/registry';
import { runBenchmark } from '../benchmark/runner';
import '../algorithms/register';

interface CliArgs {
  algorithmId: string;
  level: number;
  seeds: number[];
  scrambleLength: number;
  outPath?: string;
  outDir?: string;
}

const usage = `Usage: bench [options]

  --algorithm=<id>     Algorithm id to run (default: level1-quotient)
  --level=<n>           Puzzle level to scramble and solve (default: 1)
  --seeds=1,2,3          Explicit comma-separated scramble seeds
  --count=<n>           Generate seeds 1..n (default: 20, ignored if --seeds is set)
  --length=<n>          Moves per scramble (default: 20)
  --out=<path>          Exact output file path
  --out-dir=<path>      Output directory (default: <repoRoot>/research/results)

Available algorithms: ${listAlgorithms().map((algorithm) => algorithm.id).join(', ') || '(none registered)'}
`;

const parseArgValue = (argv: string[], flag: string): string | undefined => {
  const prefix = `--${flag}=`;
  const arg = argv.find((entry) => entry.startsWith(prefix));
  return arg?.slice(prefix.length);
};

const parseArgs = (argv: string[]): CliArgs => {
  const algorithmId = parseArgValue(argv, 'algorithm') ?? 'level1-quotient';
  const level = Number(parseArgValue(argv, 'level') ?? '1');
  const scrambleLength = Number(parseArgValue(argv, 'length') ?? '20');
  const seedsArg = parseArgValue(argv, 'seeds');
  const count = Number(parseArgValue(argv, 'count') ?? '20');
  const seeds = seedsArg
    ? seedsArg.split(',').map((value) => Number(value.trim()))
    : Array.from({ length: count }, (_, index) => index + 1);

  return {
    algorithmId,
    level,
    seeds,
    scrambleLength,
    outPath: parseArgValue(argv, 'out'),
    outDir: parseArgValue(argv, 'out-dir'),
  };
};

const repoRootResultsDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../research/results');

const defaultOutPath = (outDir: string | undefined, modelId: string, algorithmId: string, level: number): string => {
  const dir = outDir ?? repoRootResultsDir;
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return resolve(dir, `${modelId}_${algorithmId}_L${level}_${timestamp}.json`);
};

const main = async () => {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(usage);
    return;
  }

  const args = parseArgs(process.argv.slice(2));
  const algorithm = getAlgorithm(args.algorithmId);
  if (!algorithm) {
    console.error(`Unknown algorithm "${args.algorithmId}".\n`);
    console.error(usage);
    process.exitCode = 1;
    return;
  }

  const result = await runBenchmark(mengerPuzzleModel, algorithm, {
    level: args.level,
    scrambleSeeds: args.seeds,
    scrambleLength: args.scrambleLength,
  });

  const outPath = args.outPath ?? defaultOutPath(args.outDir, mengerPuzzleModel.id, algorithm.id, args.level);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(result, null, 2));

  console.log(`Algorithm: ${algorithm.id} (${algorithm.name}@${algorithm.version})`);
  console.log(`Model: ${mengerPuzzleModel.id}, level ${args.level}, ${args.seeds.length} seed(s), ${args.scrambleLength} scramble moves each`);
  console.log(
    `Success rate: ${(result.summary.successRate * 100).toFixed(1)}% — ` +
      `avg ${result.summary.averageRuntime.toFixed(1)}ms, avg ${result.summary.averageMoveCount.toFixed(1)} moves`,
  );
  console.log(`Wrote ${result.records.length} record(s) to ${outPath}`);
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
