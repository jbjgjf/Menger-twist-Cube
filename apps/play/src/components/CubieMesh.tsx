import { useMemo } from 'react';
import type { Quaternion, Vector3Tuple } from 'three';
import { Color, Quaternion as ThreeQuaternion, Vector3 } from 'three';
import type { ThreeEvent } from '@react-three/fiber';
import { Edges } from '@react-three/drei';
import type { Cubie, DragPreview, FrameId, RotationFrame, TurnTarget } from '../types/puzzle';
import { rotatePositionAroundPivot } from '../engine/geometry';

interface Props {
  cubie: Cubie;
  size: number;
  gap: number;
  transparent: boolean;
  dimmed: boolean;
  highlighted: boolean;
  isCubieSelected: boolean;
  frameById: Map<FrameId, RotationFrame>;
  turnTargetById: Map<string, TurnTarget>;
  selectedFrame: FrameId | null;
  dragPreview: DragPreview | null;
  onPointerDown: (cubie: Cubie, event: ThreeEvent<PointerEvent>) => void;
  onPointerMove: (event: ThreeEvent<PointerEvent>) => void;
  onPointerUp: (event: ThreeEvent<PointerEvent>) => void;
  onClick: (cubie: Cubie, event: ThreeEvent<MouseEvent>) => void;
}

const faceColors = [
  new Color('#c41e3a'), // Right (Red)
  new Color('#ff5800'), // Left (Orange)
  new Color('#ffffff'), // Top (White)
  new Color('#ffd500'), // Bottom (Yellow)
  new Color('#009e60'), // Front (Green)
  new Color('#0051ba'), // Back (Blue)
];

export default function CubieMesh({
  cubie,
  size,
  gap,
  transparent,
  dimmed,
  highlighted,
  isCubieSelected,
  frameById,
  turnTargetById,
  selectedFrame,
  dragPreview,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onClick,
}: Props) {
  const previewQuaternion = useMemo(() => {
    if (!dragPreview) return null;
    if (dragPreview.extensionTargetId) {
      const target = turnTargetById.get(dragPreview.extensionTargetId);
      if (!target?.selector(cubie.currentPosition)) return null;
      return new ThreeQuaternion().setFromAxisAngle(
        new Vector3(...target.axis),
        (dragPreview.angle * Math.PI) / 180,
      );
    }
    // cubie-specific drag preview
    if (dragPreview.cubieId) {
      if (cubie.id !== dragPreview.cubieId || !dragPreview.cubieAxis) return null;
      return new ThreeQuaternion().setFromAxisAngle(
        new Vector3(...dragPreview.cubieAxis),
        (dragPreview.angle * Math.PI) / 180,
      );
    }
    // frame drag preview
    const frame = dragPreview.frameId ? frameById.get(dragPreview.frameId) : null;
    if (!frame || !frame.selector(cubie.currentPosition)) return null;
    return new ThreeQuaternion().setFromAxisAngle(
      new Vector3(frame.axis[0], frame.axis[1], frame.axis[2]),
      (dragPreview.angle * Math.PI) / 180,
    );
  }, [dragPreview, cubie.currentPosition, cubie.id, frameById, turnTargetById]);

  const orientation = useMemo<Quaternion>(() => {
    if (!previewQuaternion) return cubie.orientation;
    return cubie.orientation.clone().premultiply(previewQuaternion);
  }, [cubie.orientation, previewQuaternion]);

  const position = useMemo<Vector3Tuple>(() => {
    if (!dragPreview) {
      return cubie.currentPosition.map((v) => v * (size + gap)) as Vector3Tuple;
    }
    if (dragPreview.extensionTargetId) {
      const target = turnTargetById.get(dragPreview.extensionTargetId);
      if (!target?.selector(cubie.currentPosition)) {
        return cubie.currentPosition.map((v) => v * (size + gap)) as Vector3Tuple;
      }
      const rotated = rotatePositionAroundPivot(cubie.currentPosition, target.axis, dragPreview.angle, target.pivot);
      return [rotated[0] * (size + gap), rotated[1] * (size + gap), rotated[2] * (size + gap)];
    }
    // cubie drag preview keeps the cubie in place
    if (dragPreview.cubieId) {
      return cubie.currentPosition.map((v) => v * (size + gap)) as Vector3Tuple;
    }
    const frame = dragPreview.frameId ? frameById.get(dragPreview.frameId) : null;
    if (!frame || !frame.selector(cubie.currentPosition)) {
      return cubie.currentPosition.map((v) => v * (size + gap)) as Vector3Tuple;
    }

    const rotated = new Vector3(...cubie.currentPosition).applyAxisAngle(
      new Vector3(...frame.axis),
      (dragPreview.angle * Math.PI) / 180,
    );

    return [rotated.x * (size + gap), rotated.y * (size + gap), rotated.z * (size + gap)];
  }, [cubie.currentPosition, dragPreview, frameById, gap, size, turnTargetById]);

  const emissiveIntensity = highlighted ? 0.18 : isCubieSelected ? 0.22 : selectedFrame ? 0.04 : 0.02;

  return (
    <mesh
      position={position}
      quaternion={orientation}
      castShadow
      receiveShadow
      onPointerDown={(event) => onPointerDown(cubie, event)}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onClick={(event) => onClick(cubie, event)}
    >
      <boxGeometry args={[size, size, size]} />
      {faceColors.map((color, index) => (
        <meshStandardMaterial
          key={index}
          attach={`material-${index}`}
          color={color}
          transparent={transparent || dimmed}
          opacity={dimmed ? 0.18 : transparent ? 0.52 : 0.96}
          metalness={0.25}
          roughness={0.35}
          emissive={color}
          emissiveIntensity={emissiveIntensity}
        />
      ))}
      {highlighted && (
        <Edges
          threshold={15}
          color={dragPreview ? '#f8fafc' : '#67e8f9'}
          scale={1.015}
          renderOrder={20}
        />
      )}
      {isCubieSelected && (
        <Edges
          threshold={15}
          color={dragPreview?.cubieId === cubie.id ? '#fde68a' : '#f59e0b'}
          scale={1.02}
          renderOrder={21}
        />
      )}
    </mesh>
  );
}
