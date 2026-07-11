import { useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { BoxGeometry, Group, MathUtils, MeshStandardMaterial, Vector3 } from 'three';
import type { Vector3Tuple } from 'three';
import type { Cubie, MengerPuzzleState } from '@menger/engine';
import type { SolverMove } from '@menger/solver-core';

interface Props {
  puzzle: MengerPuzzleState;
  cubies: Cubie[];
  activeMove: SolverMove | null;
  /** 0..1 progress of the active move; read every frame without re-rendering React. */
  progressRef: React.MutableRefObject<number>;
  /** Wall-clock playback advancement, invoked once per rendered frame. */
  tick: () => void;
}

// One shared geometry + material set for all cubies (up to 400 meshes).
// BoxGeometry has one group per face in +x,-x,+y,-y,+z,-z order, so the
// material array gives every cubie a fixed local sticker layout — rotating
// the mesh by the cubie's orientation quaternion makes orientation errors
// directly visible as off-color stickers.
const cubieGeometry = new BoxGeometry(0.92, 0.92, 0.92);
const faceMaterials = [
  '#dc2626', // +x red
  '#f97316', // -x orange
  '#f8fafc', // +y white
  '#eab308', // -y yellow
  '#22c55e', // +z green
  '#3b82f6', // -z blue
].map((color) => new MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.05 }));

interface ResolvedMove {
  axis: Vector3Tuple;
  pivot: Vector3Tuple;
  angle: number;
  affectedIds: Set<string>;
}

const resolveMove = (
  move: SolverMove | null,
  puzzle: MengerPuzzleState,
  cubies: Cubie[],
): ResolvedMove | null => {
  if (!move) return null;
  if (move.targetKind === 'frame' && move.frameId) {
    const frame = puzzle.frameById.get(move.frameId);
    if (!frame) return null;
    return {
      axis: frame.axis,
      pivot: [0, 0, 0],
      angle: move.angle,
      affectedIds: new Set(cubies.filter((cubie) => frame.selector(cubie.currentPosition)).map((cubie) => cubie.id)),
    };
  }
  if (move.targetKind === 'extension' && move.extensionTargetId) {
    const target = puzzle.turnTargetById.get(move.extensionTargetId);
    if (!target) return null;
    return {
      axis: target.axis,
      pivot: target.pivot,
      angle: move.angle,
      affectedIds: new Set(cubies.filter((cubie) => target.selector(cubie.currentPosition)).map((cubie) => cubie.id)),
    };
  }
  return null;
};

function CubieMesh({ cubie, offset }: { cubie: Cubie; offset: Vector3Tuple }) {
  return (
    <mesh
      geometry={cubieGeometry}
      material={faceMaterials}
      position={[
        cubie.currentPosition[0] - offset[0],
        cubie.currentPosition[1] - offset[1],
        cubie.currentPosition[2] - offset[2],
      ]}
      quaternion={cubie.orientation}
    />
  );
}

function RotatingSlice({
  resolved,
  cubies,
  progressRef,
  tick,
}: {
  resolved: ResolvedMove | null;
  cubies: Cubie[];
  progressRef: React.MutableRefObject<number>;
  tick: () => void;
}) {
  const groupRef = useRef<Group>(null);
  const axisVector = useMemo(
    () => (resolved ? new Vector3(...resolved.axis).normalize() : new Vector3(1, 0, 0)),
    [resolved],
  );

  useFrame(() => {
    tick();
    if (!groupRef.current || !resolved) return;
    const progress = Math.min(1, Math.max(0, progressRef.current));
    const eased = 1 - Math.pow(1 - progress, 3);
    groupRef.current.quaternion.setFromAxisAngle(axisVector, MathUtils.degToRad(resolved.angle * eased));
  });

  if (!resolved) return null;
  const affected = cubies.filter((cubie) => resolved.affectedIds.has(cubie.id));
  return (
    <group position={resolved.pivot} ref={groupRef}>
      {affected.map((cubie) => (
        <CubieMesh key={cubie.id} cubie={cubie} offset={resolved.pivot} />
      ))}
    </group>
  );
}

export default function CubeView({ puzzle, cubies, activeMove, progressRef, tick }: Props) {
  const resolved = useMemo(() => resolveMove(activeMove, puzzle, cubies), [activeMove, puzzle, cubies]);
  const staticCubies = useMemo(
    () => (resolved ? cubies.filter((cubie) => !resolved.affectedIds.has(cubie.id)) : cubies),
    [cubies, resolved],
  );
  const gridSize = 3 ** puzzle.level;
  const cameraDistance = gridSize * 1.9;

  return (
    <Canvas
      camera={{ position: [cameraDistance, cameraDistance * 0.8, cameraDistance * 1.15], fov: 42 }}
      className="rounded-lg"
    >
      <color attach="background" args={['#020617']} />
      <ambientLight intensity={1.1} />
      <directionalLight position={[14, 20, 12]} intensity={1.4} />
      <directionalLight position={[-12, -8, -14]} intensity={0.5} />
      {staticCubies.map((cubie) => (
        <CubieMesh key={cubie.id} cubie={cubie} offset={[0, 0, 0]} />
      ))}
      <RotatingSlice resolved={resolved} cubies={cubies} progressRef={progressRef} tick={tick} />
      <OrbitControls enablePan={false} minDistance={gridSize * 0.9} maxDistance={gridSize * 5} />
    </Canvas>
  );
}
