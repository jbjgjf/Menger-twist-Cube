import { useMemo } from 'react';
import type { Quaternion, Vector3Tuple } from 'three';
import { Color, Quaternion as ThreeQuaternion, Vector3 } from 'three';
import { frameById } from '../engine/frameDefinitions';
import type { Cubie, FrameId } from '../types/puzzle';

interface Props {
  cubie: Cubie;
  size: number;
  gap: number;
  transparent: boolean;
  dimmed: boolean;
  selectedFrame: FrameId | null;
  dragPreview: { frameId: FrameId; angle: number } | null;
}

const faceColors = [
  new Color('#ef4444'),
  new Color('#3b82f6'),
  new Color('#22c55e'),
  new Color('#f97316'),
  new Color('#a855f7'),
  new Color('#eab308'),
];

export default function CubieMesh({
  cubie,
  size,
  gap,
  transparent,
  dimmed,
  selectedFrame,
  dragPreview,
}: Props) {
  const previewQuaternion = useMemo(() => {
    if (!dragPreview) return null;
    const frame = frameById.get(dragPreview.frameId);
    if (!frame || !frame.selector(cubie.currentPosition)) return null;
    return new ThreeQuaternion().setFromAxisAngle(
      new Vector3(frame.axis[0], frame.axis[1], frame.axis[2]),
      (dragPreview.angle * Math.PI) / 180,
    );
  }, [dragPreview, cubie.currentPosition]);

  const orientation = useMemo<Quaternion>(() => {
    if (!previewQuaternion) return cubie.orientation;
    return cubie.orientation.clone().premultiply(previewQuaternion);
  }, [cubie.orientation, previewQuaternion]);

  const position = useMemo<Vector3Tuple>(() => {
    if (!dragPreview) {
      return cubie.currentPosition.map((v) => v * (size + gap)) as Vector3Tuple;
    }
    const frame = frameById.get(dragPreview.frameId);
    if (!frame || !frame.selector(cubie.currentPosition)) {
      return cubie.currentPosition.map((v) => v * (size + gap)) as Vector3Tuple;
    }

    const rotated = new Vector3(...cubie.currentPosition).applyAxisAngle(
      new Vector3(...frame.axis),
      (dragPreview.angle * Math.PI) / 180,
    );

    return [rotated.x * (size + gap), rotated.y * (size + gap), rotated.z * (size + gap)];
  }, [cubie.currentPosition, dragPreview, gap, size]);

  const emissiveIntensity = selectedFrame ? 0.08 : 0.02;

  return (
    <mesh position={position} quaternion={orientation} castShadow receiveShadow>
      <boxGeometry args={[size, size, size]} />
      {faceColors.map((color, index) => (
        <meshStandardMaterial
          key={index}
          attach={`material-${index}`}
          color={color}
          transparent={transparent || dimmed}
          opacity={dimmed ? 0.25 : transparent ? 0.5 : 0.95}
          metalness={0.25}
          roughness={0.35}
          emissive={color}
          emissiveIntensity={emissiveIntensity}
        />
      ))}
    </mesh>
  );
}
