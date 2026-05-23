import { useLayoutEffect, useRef } from 'react';
import type { InstancedMesh } from 'three';
import { Color, DynamicDrawUsage, Object3D, Quaternion as ThreeQuaternion, Vector3 } from 'three';
import type { ThreeEvent } from '@react-three/fiber';
import type { Cubie, FrameId, RotationFrame } from '../types/puzzle';

interface Props {
  cubies: Cubie[];
  size: number;
  gap: number;
  transparent: boolean;
  dimmed: boolean;
  highlighted: boolean;
  frameById: Map<FrameId, RotationFrame>;
  dragPreview: { frameId: FrameId; angle: number } | null;
  onPointerDown: (cubie: Cubie, event: ThreeEvent<PointerEvent>) => void;
  onPointerMove: (event: ThreeEvent<PointerEvent>) => void;
  onPointerUp: (event: ThreeEvent<PointerEvent>) => void;
  onClick: (cubie: Cubie, event: ThreeEvent<MouseEvent>) => void;
}

const faceColors = [
  new Color('#ef4444'),
  new Color('#f97316'),
  new Color('#ffffff'),
  new Color('#facc15'),
  new Color('#22c55e'),
  new Color('#3b82f6'),
];

const dummy = new Object3D();

const applyCubieMatrix = (
  mesh: InstancedMesh,
  index: number,
  cubie: Cubie,
  size: number,
  gap: number,
  frameById: Map<FrameId, RotationFrame>,
  dragPreview: { frameId: FrameId; angle: number } | null,
) => {
  const stride = size + gap;
  const position = new Vector3(...cubie.currentPosition);
  const orientation = cubie.orientation.clone();

  if (dragPreview) {
    const frame = frameById.get(dragPreview.frameId);
    if (frame?.selector(cubie.currentPosition)) {
      const axis = new Vector3(...frame.axis);
      const previewQuaternion = new ThreeQuaternion().setFromAxisAngle(axis, (dragPreview.angle * Math.PI) / 180);
      position.applyAxisAngle(axis, (dragPreview.angle * Math.PI) / 180);
      orientation.premultiply(previewQuaternion);
    }
  }

  dummy.position.set(position.x * stride, position.y * stride, position.z * stride);
  dummy.quaternion.copy(orientation);
  dummy.scale.set(1, 1, 1);
  dummy.updateMatrix();
  mesh.setMatrixAt(index, dummy.matrix);
};

export default function InstancedCubieMeshes({
  cubies,
  size,
  gap,
  transparent,
  dimmed,
  highlighted,
  frameById,
  dragPreview,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onClick,
}: Props) {
  const meshRef = useRef<InstancedMesh>(null);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    mesh.count = cubies.length;
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    for (let index = 0; index < cubies.length; index += 1) {
      applyCubieMatrix(mesh, index, cubies[index]!, size, gap, frameById, dragPreview);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [cubies, dragPreview, frameById, gap, size]);

  if (cubies.length === 0) return null;

  const materialOpacity = dimmed ? 0.16 : transparent ? 0.52 : 0.96;
  const emissiveIntensity = highlighted ? 0.18 : dimmed ? 0.01 : 0.02;
  const castsShadow = cubies.length <= 10000;

  const cubieFromEvent = (event: ThreeEvent<MouseEvent | PointerEvent>): Cubie | null => {
    if (typeof event.instanceId !== 'number') return null;
    return cubies[event.instanceId] ?? null;
  };

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, cubies.length]}
      castShadow={castsShadow}
      receiveShadow={castsShadow}
      onPointerDown={(event) => {
        const cubie = cubieFromEvent(event);
        if (cubie) onPointerDown(cubie, event);
      }}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onClick={(event) => {
        const cubie = cubieFromEvent(event);
        if (cubie) onClick(cubie, event);
      }}
    >
      <boxGeometry args={[size, size, size]} />
      {faceColors.map((color, index) => (
        <meshStandardMaterial
          key={index}
          attach={`material-${index}`}
          color={color}
          transparent={transparent || dimmed}
          opacity={materialOpacity}
          metalness={0.1}
          roughness={0.2}
          emissive={color}
          emissiveIntensity={emissiveIntensity}
        />
      ))}
    </instancedMesh>
  );
}
