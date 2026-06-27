import { useMemo, useRef } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import { Vector2, Vector3 } from 'three';
import type { AxisName, Cubie, DragPreview, FrameId, InteractionMode, RotationFrame, TurnTarget } from '../types/puzzle';

import { getAffectedCubieIds, getAffectedTurnTargetCubieIds, isSelectableInCubieMode } from '@menger/engine';
import CubieMesh from './CubieMesh';
import InstancedCubieMeshes from './InstancedCubieMeshes';

interface Props {
  cubies: Cubie[];
  level: number;
  frames: RotationFrame[];
  frameById: Map<FrameId, RotationFrame>;
  extensionTargets: TurnTarget[];
  turnTargetById: Map<string, TurnTarget>;
  frameScale: number;
  extensionDepth: number;
  selectedFrame: FrameId | null;
  selectedCubie: string | null;
  selectedExtension: string | null;
  interactionMode: InteractionMode;
  hoveredFrame: FrameId | null;
  transparentView: boolean;
  dragPreview: DragPreview | null;
  onSelectFrame: (frame: FrameId) => void;
  onSelectCubie: (cubieId: string | null) => void;
  onSelectExtension: (targetId: string | null) => void;
  onDragPreview: (frame: FrameId, angle: number | null) => void;
  onTwistActiveChange: (active: boolean) => void;
}

type TwistGesture = {
  frameId: FrameId;
  pointerId: number;
  startX: number;
  startY: number;
  screenTangent: Vector2;
  hasMoved: boolean;
};

const instancedRenderingThreshold = 1200;

const frameForCubieHit = (
  cubie: Cubie,
  event: ThreeEvent<MouseEvent | PointerEvent>,
  frames: RotationFrame[],
  frameById: Map<FrameId, RotationFrame>,
  selectedFrame: FrameId | null,
  frameScale: number,
): FrameId | null => {
  const normal = event.face?.normal.clone() ?? new Vector3(...cubie.currentPosition).normalize();
  normal.applyQuaternion(cubie.orientation).normalize();

  const normalAxisIndex = Math.abs(normal.x) > Math.abs(normal.y)
    ? Math.abs(normal.x) > Math.abs(normal.z)
      ? 0
      : 2
    : Math.abs(normal.y) > Math.abs(normal.z)
      ? 1
      : 2;

  const axisNames = ['X', 'Y', 'Z'] as AxisName[];

  // Prioritize axes perpendicular to the clicked face (i.e. going deep)
  const deepAxes = [0, 1, 2].filter((i) => i !== normalAxisIndex);
  const preferredOrder = [...deepAxes, normalAxisIndex];

  // Find the frame of current scale that contains this cubie for each axis
  const candidateFrames = preferredOrder.map((axisIdx) => {
    const axisName = axisNames[axisIdx]!;
    return frames.find(
      (f) => f.axisName === axisName && f.scale === frameScale && f.selector(cubie.currentPosition),
    )?.id ?? null;
  }).filter((id): id is FrameId => id !== null && frameById.has(id));

  if (candidateFrames.length === 0) return null;

  const currentIndex = selectedFrame ? candidateFrames.indexOf(selectedFrame) : -1;
  if (currentIndex !== -1) {
    // Cycle to the next frame in the preferred order
    return candidateFrames[(currentIndex + 1) % candidateFrames.length]!;
  }

  // Default to the first deep axis
  return candidateFrames[0]!;
};

const extensionTargetForCubieHit = (
  cubie: Cubie,
  extensionTargets: TurnTarget[],
  extensionDepth: number,
): string | null =>
  extensionTargets.find((target) => target.depth === extensionDepth && target.selector(cubie.currentPosition))?.id ?? null;

const screenPoint = (point: Vector3, event: ThreeEvent<PointerEvent>): Vector2 => {
  const projected = point.clone().project(event.camera);
  const rect = (event.nativeEvent.target as HTMLElement).getBoundingClientRect();
  return new Vector2(
    ((projected.x + 1) / 2) * rect.width,
    ((-projected.y + 1) / 2) * rect.height,
  );
};

const screenTangentForTwist = (
  frameId: FrameId,
  hitPoint: Vector3,
  event: ThreeEvent<PointerEvent>,
  frameById: Map<FrameId, RotationFrame>,
): Vector2 => {
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
  level,
  frames,
  frameById,
  extensionTargets,
  turnTargetById,
  frameScale,
  extensionDepth,
  selectedFrame,
  selectedCubie,
  selectedExtension,
  interactionMode,
  hoveredFrame,
  transparentView,
  dragPreview,
  onSelectFrame,
  onSelectCubie,
  onSelectExtension,
  onDragPreview,
  onTwistActiveChange,
}: Props) {
  const twistGesture = useRef<TwistGesture | null>(null);
  const suppressNextClick = useRef(false);
  const gridSize = 3 ** level;
  const cubieSize = 2.65 / gridSize;
  const gap = 0.24 / gridSize;

  const highlightedIds = useMemo(() => {
    if (interactionMode === 'cubie') {
      if (!selectedExtension) return new Set<string>();
      return getAffectedTurnTargetCubieIds(cubies, selectedExtension, turnTargetById);
    }
    const targetFrame = hoveredFrame ?? selectedFrame;
    if (!targetFrame) return new Set<string>();
    return getAffectedCubieIds(cubies, targetFrame, frameById);
  }, [cubies, frameById, hoveredFrame, interactionMode, selectedExtension, selectedFrame, turnTargetById]);

  const highlightedCubies = useMemo(() => {
    if (cubies.length <= instancedRenderingThreshold || highlightedIds.size === 0) return [];
    return cubies.filter((cubie) => highlightedIds.has(cubie.id));
  }, [cubies, highlightedIds]);

  const baseCubies = useMemo(() => {
    if (cubies.length <= instancedRenderingThreshold || highlightedIds.size === 0) return cubies;
    return cubies.filter((cubie) => !highlightedIds.has(cubie.id));
  }, [cubies, highlightedIds]);

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

  if (cubies.length > instancedRenderingThreshold) {
    const sharedHandlers = {
      onPointerDown: (targetCubie: Cubie, event: ThreeEvent<PointerEvent>) => {
        if (!selectedFrame || !highlightedIds.has(targetCubie.id)) return;

        event.stopPropagation();
        twistGesture.current = {
          frameId: selectedFrame,
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          screenTangent: screenTangentForTwist(selectedFrame, event.point, event, frameById),
          hasMoved: false,
        };
        onTwistActiveChange(true);
        onDragPreview(selectedFrame, 0);
        (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
      },
      onPointerMove: (event: ThreeEvent<PointerEvent>) => {
        const gesture = twistGesture.current;
        if (!gesture || gesture.pointerId !== event.pointerId) return;

        event.stopPropagation();
        const delta = new Vector2(event.clientX - gesture.startX, event.clientY - gesture.startY);
        const travel = delta.length();
        if (travel > 6) gesture.hasMoved = true;

        const signedTravel = delta.dot(gesture.screenTangent);
        const preview = Math.max(-105, Math.min(105, signedTravel * 0.95));
        onDragPreview(gesture.frameId, preview);
      },
      onPointerUp: endTwist,
      onClick: (targetCubie: Cubie, event: ThreeEvent<MouseEvent>) => {
        if (suppressNextClick.current) {
          suppressNextClick.current = false;
          return;
        }
        event.stopPropagation();
        if (interactionMode === 'cubie') {
          if (!isSelectableInCubieMode(targetCubie.type)) return;
          const targetId = extensionTargetForCubieHit(targetCubie, extensionTargets, extensionDepth);
          const nextTargetId = selectedExtension === targetId ? null : targetId;
          onSelectCubie(nextTargetId ? targetCubie.id : null);
          onSelectExtension(nextTargetId);
        } else {
          const frameId = frameForCubieHit(targetCubie, event, frames, frameById, selectedFrame, frameScale);
          if (frameId) onSelectFrame(frameId);
        }
      },
    };

    return (
      <group>
        <InstancedCubieMeshes
          cubies={baseCubies}
          size={cubieSize}
          gap={gap}
          transparent={transparentView}
          dimmed={highlightedIds.size > 0}
          highlighted={false}
          frameById={frameById}
          turnTargetById={turnTargetById}
          dragPreview={null}
          {...sharedHandlers}
        />
        <InstancedCubieMeshes
          cubies={highlightedCubies}
          size={cubieSize}
          gap={gap}
          transparent={transparentView}
          dimmed={false}
          highlighted
          frameById={frameById}
          turnTargetById={turnTargetById}
          dragPreview={dragPreview}
          {...sharedHandlers}
        />
      </group>
    );
  }

  return (
    <group>
      {cubies.map((cubie) => {
        const highlighted = highlightedIds.has(cubie.id);
        const dimmed = highlightedIds.size > 0 && !highlighted;
        return (
          <CubieMesh
            key={cubie.id}
            cubie={cubie}
            size={cubieSize}
            gap={gap}
            transparent={transparentView}
            dimmed={dimmed}
            highlighted={highlighted}
            isCubieSelected={cubie.id === selectedCubie}
            frameById={frameById}
            turnTargetById={turnTargetById}
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
                screenTangent: screenTangentForTwist(selectedFrame, event.point, event, frameById),
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
              if (interactionMode === 'cubie') {
                if (!isSelectableInCubieMode(targetCubie.type)) return;
                const targetId = extensionTargetForCubieHit(targetCubie, extensionTargets, extensionDepth);
                const nextTargetId = selectedExtension === targetId ? null : targetId;
                onSelectCubie(nextTargetId ? targetCubie.id : null);
                onSelectExtension(nextTargetId);
              } else {
                const frameId = frameForCubieHit(targetCubie, event, frames, frameById, selectedFrame, frameScale);
                if (frameId) onSelectFrame(frameId);
              }
            }}
          />
        );
      })}
    </group>
  );
}
