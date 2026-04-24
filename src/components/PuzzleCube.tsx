import { useMemo } from 'react';
import type { Cubie, DragPreview, FrameId } from '../types/puzzle';
import { getAffectedCubieIds } from '../engine/moves';
import CubieMesh from './CubieMesh';

interface Props {
  cubies: Cubie[];
  selectedFrame: FrameId | null;
  hoveredFrame: FrameId | null;
  transparentView: boolean;
  dragPreview: DragPreview | null;
}

const CUBIE_SIZE = 0.88;
const GAP = 0.08;

export default function PuzzleCube({ cubies, selectedFrame, hoveredFrame, transparentView, dragPreview }: Props) {
  const highlightedIds = useMemo(() => {
    const targetFrame = hoveredFrame ?? selectedFrame;
    if (!targetFrame) return new Set<string>();
    return getAffectedCubieIds(cubies, targetFrame);
  }, [cubies, hoveredFrame, selectedFrame]);

  return (
    <group>
      {cubies.map((cubie) => {
        const dimmed = highlightedIds.size > 0 && !highlightedIds.has(cubie.id);
        return (
          <CubieMesh
            key={cubie.id}
            cubie={cubie}
            size={CUBIE_SIZE}
            gap={GAP}
            transparent={transparentView}
            dimmed={dimmed}
            selectedFrame={selectedFrame}
            dragPreview={dragPreview}
          />
        );
      })}
    </group>
  );
}
