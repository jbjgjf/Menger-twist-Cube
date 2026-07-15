import { registerAlgorithm } from '../algorithm/registry';
import { level1QuotientAlgorithm } from './level1QuotientSolver';
import { level2BlockQuotientAlgorithm } from './level2BlockQuotientSolver';
import { level2SliceReductionAlgorithm } from './level2SliceReductionSolver';

// Built-in algorithms self-register on import. ES modules only evaluate
// once per process, so importing this file (directly or via the package
// barrel) is enough — no separate "init" call is required.
registerAlgorithm(level1QuotientAlgorithm);
registerAlgorithm(level2BlockQuotientAlgorithm);
registerAlgorithm(level2SliceReductionAlgorithm);
