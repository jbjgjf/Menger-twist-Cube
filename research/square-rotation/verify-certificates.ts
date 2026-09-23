/**
 * Independent re-check of `out/l2-index-certificate.json`, trusting only the
 * engine's judge and the exact 400-cell state record.
 *
 * Run: `node --import tsx research/square-rotation/verify-certificates.ts`
 * (`VERIFY_SAMPLE=<n>` replays every n-th distinct element only; the test suite
 * uses this for speed).
 *
 * Re-derived here, not read from the file:
 *   - the 468 existing atoms (from the shipped model) and 54 additional atoms,
 *   - orbit partition, the parity rank of G and H, ψ of every atom,
 *   - that the records are exactly the Schreier words t·s·rep(t·s)^-1 for
 *     t ∈ {1, a}, s ∈ S, with rep decided by the recomputed ψ,
 *   - for every distinct element: its H-word, applied to solved with a legality
 *     check per atom, followed by its certificate (existing atoms only, same
 *     check) ends exactly solved.
 * It also re-derives the single-atom verdicts: which additional atoms are in G
 * (certificate) and which are provably not (parity outside span ε(G)).
 */
import { readFileSync } from 'node:fs';
import {
  applyWord,
  buildAtomTable,
  buildParityInvariant,
  exactStateKey,
  existingRef,
  inverseRef,
  isExactlySolved,
  outDir,
  refLabel,
  solvedState,
} from './h-atoms';
import type { AtomRef, AtomTable } from './h-atoms';

export interface CertificateFile {
  transversal: string;
  result: string;
  records: Array<{ word: string[]; t: '1' | 'a'; s: string; duplicateOf?: number; certificate?: string[]; verified: boolean }>;
}

export interface VerificationReport {
  atoms: { existing: number; additional: number };
  parityRank: { G: number; H: number };
  schreierWordsWellFormed: boolean;
  distinctElements: number;
  replayed: number;
  replayFailures: string[];
  singleAtom: { inGCertified: string[]; notInGProved: string[]; undetermined: string[] };
  indexTwoProved: boolean;
}

const parseRef = (label: string, table: AtomTable): AtomRef => {
  if (label.startsWith('+')) {
    if (!table.additionalByKey.has(label.slice(1))) throw new Error(`unknown additional atom ${label}`);
    return { kind: 'additional', key: label.slice(1) };
  }
  const move = table.existingByLabel.get(label);
  if (!move) throw new Error(`unknown existing atom ${label}`);
  return existingRef(move);
};

export const verifyIndexCertificate = (
  options: { sampleEvery?: number; tamper?: (file: CertificateFile) => void } = {},
): VerificationReport => {
  const sampleEvery = options.sampleEvery ?? 1;
  const file = JSON.parse(readFileSync(`${outDir}/l2-index-certificate.json`, 'utf8')) as CertificateFile;
  // Tests use `tamper` as a negative control: a corrupted file must fail.
  options.tamper?.(file);
  const table = buildAtomTable();
  const solved = solvedState();
  const existingRefs = table.existing.map(existingRef);
  const additionalRefs: AtomRef[] = table.additional.map((atom) => ({ kind: 'additional', key: atom.key }));
  const allRefs = [...existingRefs, ...additionalRefs];

  const existingStates = existingRefs.map((ref) => applyWord(solved, [ref], table));
  const additionalStates = additionalRefs.map((ref) => applyWord(solved, [ref], table));
  const invariant = buildParityInvariant(solved, [...existingStates, ...additionalStates]);
  const spanG = invariant.spanOf(existingStates.map(invariant.vectorOf));
  const spanH = invariant.spanOf([...existingStates, ...additionalStates].map(invariant.vectorOf));
  const psiOf = new Map<string, number>();
  allRefs.forEach((ref, index) => {
    const state = index < existingRefs.length ? existingStates[index]! : additionalStates[index - existingRefs.length]!;
    psiOf.set(refLabel(ref), invariant.reduce(invariant.vectorOf(state), spanG) === 0 ? 0 : 1);
  });

  // The records must be exactly the Schreier words, in any order.
  const a = parseRef(file.transversal, table);
  const aLabel = refLabel(a);
  const aInverseLabel = refLabel(inverseRef(a));
  const expected = new Set<string>();
  for (const t of ['1', 'a'] as const) {
    for (const s of allRefs) {
      const psiTs = (t === '1' ? 0 : 1) ^ psiOf.get(refLabel(s))!;
      const word = [...(t === '1' ? [] : [aLabel]), refLabel(s), ...(psiTs === 1 ? [aInverseLabel] : [])];
      // Keyed by (t, s) as well: different pairs can spell the same word, e.g. (1, a) and (a, a^-1).
      expected.add(`${t}|${refLabel(s)}|${word.join(' ')}`);
    }
  }
  const present = new Set(file.records.map((record) => `${record.t}|${record.s}|${record.word.join(' ')}`));
  const schreierWordsWellFormed =
    psiOf.get(aLabel) === 1 &&
    present.size === expected.size &&
    file.records.length === expected.size &&
    [...expected].every((word) => present.has(word));

  // Replay distinct elements; a duplicate must really be the same element as
  // the record it points to. Single additional atoms (t = 1, s additional) are
  // always replayed because the single-atom verdicts below rest on them.
  const replayFailures: string[] = [];
  const replayedOk = new Set<string>();
  let replayed = 0;
  let distinct = 0;
  const wordOf = (labels: string[]): AtomRef[] => labels.map((label) => parseRef(label, table));
  file.records.forEach((record, index) => {
    const isSingleAdditional = record.t === '1' && record.s.startsWith('+');
    if (record.duplicateOf !== undefined) {
      if (index % sampleEvery !== 0 && !isSingleAdditional) return;
      const originalRecord = file.records[record.duplicateOf]!;
      const original = exactStateKey(applyWord(solved, wordOf(originalRecord.word), table));
      if (exactStateKey(applyWord(solved, wordOf(record.word), table)) !== original) {
        replayFailures.push(`duplicate mismatch: ${record.word.join(' ')}`);
      } else if (replayedOk.has(originalRecord.word.join(' '))) {
        // Same group element as an already certified one, so certified too.
        replayedOk.add(record.word.join(' '));
      }
      return;
    }
    distinct += 1;
    if (distinct % sampleEvery !== 0 && !isSingleAdditional) return;
    replayed += 1;
    const label = record.word.join(' ');
    if (!record.certificate) {
      replayFailures.push(`no certificate: ${label}`);
      return;
    }
    const certificate = wordOf(record.certificate);
    if (certificate.some((ref) => ref.kind !== 'existing')) {
      replayFailures.push(`certificate uses a non-existing atom: ${label}`);
      return;
    }
    try {
      const state = applyWord(solved, wordOf(record.word), table);
      if (isExactlySolved(applyWord(state, certificate, table))) replayedOk.add(label);
      else replayFailures.push(`not solved: ${label}`);
    } catch (error) {
      replayFailures.push(`${(error as Error).message}: ${label}`);
    }
  });

  // Single additional atoms: for t = 1 and ψ(s) = 0 the Schreier word is [s].
  const singleAtom: VerificationReport['singleAtom'] = { inGCertified: [], notInGProved: [], undetermined: [] };
  for (const ref of additionalRefs) {
    const label = refLabel(ref);
    if (psiOf.get(label) === 1) singleAtom.notInGProved.push(label);
    else if (replayedOk.has(label)) singleAtom.inGCertified.push(label);
    else singleAtom.undetermined.push(label);
  }

  return {
    atoms: { existing: existingRefs.length, additional: additionalRefs.length },
    parityRank: { G: spanG.length, H: spanH.length },
    schreierWordsWellFormed,
    distinctElements: distinct,
    replayed,
    replayFailures,
    singleAtom,
    indexTwoProved:
      sampleEvery === 1 && schreierWordsWellFormed && replayFailures.length === 0 && spanH.length === spanG.length + 1,
  };
};

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.env.VERIFY_VERBOSE !== '1') console.debug = () => {};
  const started = performance.now();
  const report = verifyIndexCertificate({ sampleEvery: Number(process.env.VERIFY_SAMPLE ?? 1) });
  console.log(JSON.stringify({ ...report, elapsedMs: Math.round(performance.now() - started) }, null, 1));
}
