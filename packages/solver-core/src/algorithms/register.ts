import { level2BlockRestorationAlgorithm } from './level2BlockRestorationSolver';
import { registerAlgorithm } from '../algorithm/registry';
import { level1QuotientAlgorithm } from './level1QuotientSolver';
import { level2BlockQuotientAlgorithm } from './level2BlockQuotientSolver';
import { level2SliceReductionAlgorithm } from './level2SliceReductionSolver';
import { level2InnerSquareCosetAlgorithm } from './level2InnerSquareCosetSolver';
import { level2CertifiedAlgorithm } from './level2CertifiedSolver';
import { level3BlockQuotientAlgorithm } from './level3BlockQuotientSolver';
import { level3SliceReductionAlgorithm } from './level3SliceReductionSolver';
import { level4SliceReductionAlgorithm } from './level4SliceReductionSolver';

// Built-in algorithms self-register on import. ES modules only evaluate
// once per process, so importing this file (directly or via the package
// barrel) is enough — no separate "init" call is required.
registerAlgorithm(level1QuotientAlgorithm);
registerAlgorithm(level2BlockQuotientAlgorithm);
registerAlgorithm(level2SliceReductionAlgorithm);
registerAlgorithm(level2InnerSquareCosetAlgorithm);
registerAlgorithm(level2CertifiedAlgorithm);
registerAlgorithm(level3BlockQuotientAlgorithm);
registerAlgorithm(level3SliceReductionAlgorithm);
registerAlgorithm(level4SliceReductionAlgorithm);

registerAlgorithm(level2BlockRestorationAlgorithm);

import { level3BlockRestorationAlgorithm, level4BlockRestorationAlgorithm } from './higherBlockRestorationSolver';
registerAlgorithm(level3BlockRestorationAlgorithm);
registerAlgorithm(level4BlockRestorationAlgorithm);

import { level3InnerSquareCertifiedAlgorithm, level4InnerSquareCertifiedAlgorithm } from './innerSquareCertifiedSolver';
registerAlgorithm(level3InnerSquareCertifiedAlgorithm);
registerAlgorithm(level4InnerSquareCertifiedAlgorithm);
