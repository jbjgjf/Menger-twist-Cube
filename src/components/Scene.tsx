import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { GizmoHelper, GizmoViewport, OrbitControls } from '@react-three/drei';
import { Vector3 } from 'three';
import type { Cubie, DragPreview, FrameId } from '../types/puzzle';
import PuzzleCube from './PuzzleCube';
import FrameGuides from './FrameGuides';

export type CameraPreset = 'reset' | 'front' | 'top' | 'side';

interface SceneProps {
  cubies: Cubie[];
  selectedFrame: FrameId | null;
  hoveredFrame: FrameId | null;
  transparentView: boolean;
  showGuides: boolean;
  dragPreview: DragPreview | null;
  cameraPreset: CameraPreset;
  onHoverFrame: (frame: FrameId | null) => void;
  onSelectFrame: (frame: FrameId) => void;
  onDragPreview: (frame: FrameId, angle: number | null) => void;
}

const targetMap: Record<CameraPreset, Vector3> = {
  reset: new Vector3(6, 6, 6),
  front: new Vector3(0, 0, 8),
  top: new Vector3(0, 8, 0),
  side: new Vector3(8, 0, 0),
};

function CameraRig({ cameraPreset }: { cameraPreset: CameraPreset }) {
  const { camera } = useThree();
  const goal = useMemo(() => targetMap[cameraPreset].clone(), [cameraPreset]);

  useFrame(() => {
    camera.position.lerp(goal, 0.1);
    camera.lookAt(0, 0, 0);
  });

  return null;
}

export default function Scene(props: SceneProps) {
  const controlsRef = useRef<any>(null);

  useEffect(() => {
    controlsRef.current?.update();
  }, [props.cameraPreset]);

  return (
    <Canvas shadows camera={{ position: [6, 6, 6], fov: 50, near: 0.1, far: 100 }}>
      <color attach="background" args={['#070b14']} />
      <fog attach="fog" args={['#070b14', 12, 28]} />

      <ambientLight intensity={0.45} />
      <directionalLight
        castShadow
        position={[8, 10, 6]}
        intensity={1.2}
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
      />

      <PuzzleCube
        cubies={props.cubies}
        selectedFrame={props.selectedFrame}
        hoveredFrame={props.hoveredFrame}
        transparentView={props.transparentView}
        dragPreview={props.dragPreview}
      />

      {props.showGuides && (
        <FrameGuides
          selectedFrame={props.selectedFrame}
          hoveredFrame={props.hoveredFrame}
          onHover={props.onHoverFrame}
          onSelect={props.onSelectFrame}
          onDragPreview={props.onDragPreview}
        />
      )}

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -3.4, 0]} receiveShadow>
        <planeGeometry args={[30, 30]} />
        <shadowMaterial opacity={0.2} />
      </mesh>

      <OrbitControls
        ref={controlsRef}
        enableDamping
        dampingFactor={0.08}
        screenSpacePanning
        mouseButtons={{ LEFT: 0, MIDDLE: 1, RIGHT: 2 }}
        touches={{ ONE: 0, TWO: 2 }}
        rotateSpeed={0.9}
        panSpeed={0.8}
        zoomSpeed={0.9}
      />
      <CameraRig cameraPreset={props.cameraPreset} />

      <GizmoHelper alignment="bottom-right" margin={[80, 80]}>
        <GizmoViewport axisColors={['#ef4444', '#38bdf8', '#4ade80']} labelColor="white" />
      </GizmoHelper>
    </Canvas>
  );
}
