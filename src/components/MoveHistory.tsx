import type { Move } from '../types/puzzle';

interface Props {
  moves: Move[];
}

export default function MoveHistory({ moves }: Props) {
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900/70 p-3">
      <h3 className="mb-2 text-sm font-semibold text-slate-200">Move History</h3>
      <div className="max-h-56 overflow-auto text-xs text-slate-300">
        {moves.length === 0 && <p className="text-slate-500">No moves yet.</p>}
        <ol className="space-y-1">
          {moves.map((move, index) => (
            <li key={`${move.timestamp}-${index}`} className="flex justify-between rounded bg-slate-800/70 px-2 py-1">
              <span>{index + 1}.</span>
              <span className="font-mono">{move.notation}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
