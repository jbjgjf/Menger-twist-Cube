import type { SolverAlgorithm } from './types';

const registry = new Map<string, SolverAlgorithm<any, any>>();

export const registerAlgorithm = <TState, TMove>(algorithm: SolverAlgorithm<TState, TMove>): void => {
  registry.set(algorithm.id, algorithm);
};

export const getAlgorithm = (id: string): SolverAlgorithm<any, any> | undefined => registry.get(id);

export const listAlgorithms = (): SolverAlgorithm<any, any>[] => Array.from(registry.values());
