import { useMemo, useRef } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import { Quaternion, Vector2, Vector3 } from 'three';
import type { Cubie, DragPreview, FrameId } from '../types/puzzle';
import { getAffectedCubieIds } from '../engine/moves';
import { frameById } from '../engine/frameDefinitions';
import CubieMesh from './CubieMesh';

interface Props {
  cubies: Cubie[];
  selectedFrame: FrameId | null;
  hoveredFrame: FrameId | null;
  transparentView: boolean;
  dragPreview: DragPreview | null;
  onSelectFrame: (frame: FrameId) => void;
  onDragPreview: (frame: FrameId, angle: number | null) => void;
  onTwistActiveChange: (active: boolean) => void;
}

const CUBIE_SIZE = 0.88;
const GAP = 0.08;

type TwistGesture = {
  frameId: FrameId;
  pointerId: number;
  startX: number;
  startY: number;
  screenTangent: Vector2;
  hasMoved: boolean;
};

const frameForCubieHit = (cubie: Cubie, event: ThreeEvent<MouseEvent | PointerEvent>): FrameId => {
  const normal = event.face?.normal.clone() ?? new Vector3(...cubie.currentPosition).normalize();
  const worldQuaternion = new Quaternion();
  event.object.getWorldQuaternion(worldQuaternion);
  normal.applyQuaternion(worldQuaternion).normalize();

  const axisIndex = Math.abs(normal.x) > Math.abs(normal.y)
    ? Math.abs(normal.x) > Math.abs(normal.z)
      ? 0
      : 2
    : Math.abs(normal.y) > Math.abs(normal.z)
      ? 1
      : 2;

  const axisNames = ['X', 'Y', 'Z'] as const;
  const value = cubie.currentPosition[axisIndex] ?? 0;
  if (value > 0) return `${axisNames[axisIndex]}_PLUS` as FrameId;
  if (value < 0) return `${axisNames[axisIndex]}_MINUS` as FrameId;
  return `H_${axisNames[axisIndex]}` as FrameId;
};

const screenPoint = (point: Vector3, event: ThreeEvent<PointerEvent>): Vector2 => {
  const projected = point.clone().project(event.camera);
  const rect = (event.nativeEvent.target as HTMLElement).getBoundingClientRect();
  return new Vector2(
    ((projected.x + 1) / 2) * rect.width,
    ((-projected.y + 1) / 2) * rect.height,
  );
};

const screenTangentForTwist = (frameId: FrameId, hitPoint: Vector3, event: ThreeEvent<PointerEvent>): Vector2 => {
  const frame = frameById.get(frameId);
  if (!frame) return new Vector2(1, 0);

  const axis = new Vector3(...frame.axis).normalize();
  const radial = hitPoint.clone().sub(axis.clone().multiplyScalar(hitPoint.dot(axis)));
  const tangent = axis.clone().cross(radial.lengthSq() > 0.0001 ? radial.normalize() : new Vector3(0, 1, 0));
  if (tangent.lengthSq() < 0.0001) tangent.set(1, 0, 0);
  tangent.normalize();

  const start = screenPoint(hitPoint, event);
  const end = screenPoint(hitPoint.clone().add(tangent.multiplyScalar(0.75)), event);
  const delta = end.sub(start);
  return delta.lengthSq() > 0.0001 ? delta.normalize() : new Vector2(1, 0);
};

export default function PuzzleCube({
  cubies,
  selectedFrame,
  hoveredFrame,
  transparentView,
  dragPreview,
  onSelectFrame,
  onDragPreview,
  onTwistActiveChange,
}: Props) {
  const twistGesture = useRef<TwistGesture | null>(null);
  const suppressNextClick = useRef(false);

  const highlightedIds = useMemo(() => {
    const targetFrame = hoveredFrame ?? selectedFrame;
    if (!targetFrame) return new Set<string>();
    return getAffectedCubieIds(cubies, targetFrame);
  }, [cubies, hoveredFrame, selectedFrame]);

  const endTwist = (event: ThreeEvent<PointerEvent>) => {
    const gesture = twistGesture.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;

    event.stopPropagation();
    twistGesture.current = null;
    suppressNextClick.current = gesture.hasMoved;
    onTwistActiveChange(false);
    onDragPreview(gesture.frameId, null);
    (event.target as HTMLElement).releasePointerCapture?.(event.pointerId);
  };

  return (
    <group>
      {cubies.map((cubie) => {
        const highlighted = highlightedIds.has(cubie.id);
        const dimmed = highlightedIds.size > 0 && !highlighted;
        return (
          <CubieMesh
            key={cubie.id}
            cubie={cubie}
            size={CUBIE_SIZE}
            gap={GAP}
            transparent={transparentView}
            dimmed={dimmed}
            highlighted={highlighted}
            selectedFrame={selectedFrame}
            dragPreview={dragPreview}
            onPointerDown={(targetCubie, event) => {
              if (!selectedFrame || !highlightedIds.has(targetCubie.id)) return;

              event.stopPropagation();
              twistGesture.current = {
                frameId: selectedFrame,
                pointerId: event.pointerId,
                startX: event.clientX,
                startY: event.clientY,
                screenTangent: screenTangentForTwist(selectedFrame, event.point, event),
                hasMoved: false,
              };
              onTwistActiveChange(true);
              onDragPreview(selectedFrame, 0);
              (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
            }}
            onPointerMove={(event) => {
              const gesture = twistGesture.current;
              if (!gesture || gesture.pointerId !== event.pointerId) return;

              event.stopPropagation();
              const delta = new Vector2(event.clientX - gesture.startX, event.clientY - gesture.startY);
              const travel = delta.length();
              if (travel > 6) gesture.hasMoved = true;

              const signedTravel = delta.dot(gesture.screenTangent);
              const preview = Math.max(-105, Math.min(105, signedTravel * 0.95));
              onDragPreview(gesture.frameId, preview);
            }}
            onPointerUp={endTwist}
            onClick={(targetCubie, event) => {
              if (suppressNextClick.current) {
                suppressNextClick.current = false;
                return;
              }
              event.stopPropagation();
              onSelectFrame(frameForCubieHit(targetCubie, event));
            }}
          />
        );
      })}
    </group>
  );
}
