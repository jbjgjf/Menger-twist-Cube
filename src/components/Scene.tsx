import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { GizmoHelper, GizmoViewport, OrbitControls } from '@react-three/drei';
import { Vector3 } from 'three';
import type { Cubie, DragPreview, FrameId, InteractionMode, RotationFrame } from '../types/puzzle';
import PuzzleCube from './PuzzleCube';
import FrameGuides from './FrameGuides';

export type CameraPreset = 'reset' | 'up' | 'down' | 'front' | 'back' | 'right' | 'left';

interface SceneProps {
  cubies: Cubie[];
  level: number;
  frames: RotationFrame[];
  frameById: Map<FrameId, RotationFrame>;
  frameScale: number;
  selectedFrame: FrameId | null;
  selectedCubie: string | null;
  interactionMode: InteractionMode;
  hoveredFrame: FrameId | null;
  transparentView: boolean;
  showGuides: boolean;
  dragPreview: DragPreview | null;
  cameraPreset: CameraPreset;
  cameraPresetRequest: number;
  onHoverFrame: (frame: FrameId | null) => void;
  onSelectFrame: (frame: FrameId) => void;
  onSelectCubie: (cubieId: string | null) => void;
  onDragPreview: (frame: FrameId, angle: number | null) => void;
}

const targetMap: Record<CameraPreset, Vector3> = {
  reset: new Vector3(6, 6, 6),
  up: new Vector3(0, 8, 0),
  down: new Vector3(0, -8, 0),
  front: new Vector3(0, 0, 8),
  back: new Vector3(0, 0, -8),
  right: new Vector3(8, 0, 0),
  left: new Vector3(-8, 0, 0),
};

function CameraRig({ cameraPreset, cameraPresetRequest }: { cameraPreset: CameraPreset; cameraPresetRequest: number }) {
  const { camera } = useThree();
  const goal = useMemo(() => targetMap[cameraPreset].clone(), [cameraPreset]);
  const activeGoal = useRef(goal.clone());
  const isMoving = useRef(true);

  useEffect(() => {
    activeGoal.current = goal.clone();
    isMoving.current = true;
  }, [goal, cameraPresetRequest]);

  useFrame(() => {
    if (!isMoving.current) return;

    camera.position.lerp(activeGoal.current, 0.12);
    camera.lookAt(0, 0, 0);
    if (camera.position.distanceTo(activeGoal.current) < 0.02) {
      camera.position.copy(activeGoal.current);
      camera.lookAt(0, 0, 0);
      isMoving.current = false;
    }
  });

  return null;
}

export default function Scene(props: SceneProps) {
  const controlsRef = useRef<any>(null);
  const [twistActive, setTwistActive] = useState(false);
  const gridSize = 3 ** props.level;
  const cubieSize = 2.65 / gridSize;
  const gap = 0.24 / gridSize;
  const cellStride = cubieSize + gap;

  // Only show guide rings for the current active scale
  const guidedFrames = useMemo(
    () => props.frames.filter((f) => f.scale === props.frameScale),
    [props.frames, props.frameScale],
  );

  useEffect(() => {
    if (controlsRef.current) {
      controlsRef.current.target.set(0, 0, 0);
      controlsRef.current.update();
    }
  }, [props.cameraPreset, props.cameraPresetRequest]);

  return (
    <Canvas className="touch-none" shadows camera={{ position: [6, 6, 6], fov: 50, near: 0.1, far: 100 }}>
      <color attach="background" args={['#070b14']} />
      <fog attach="fog" args={['#070b14', 12, 28]} />

      <ambientLight intensity={0.85} />
      <directionalLight
        castShadow
        position={[8, 10, 6]}
        intensity={1.8}
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
      />
      <directionalLight
        position={[-8, -2, -6]}
        intensity={0.6}
      />

      <PuzzleCube
        cubies={props.cubies}
        level={props.level}
        frames={props.frames}
        frameById={props.frameById}
        frameScale={props.frameScale}
        selectedFrame={props.selectedFrame}
        selectedCubie={props.selectedCubie}
        interactionMode={props.interactionMode}
        hoveredFrame={props.hoveredFrame}
        transparentView={props.transparentView}
        dragPreview={props.dragPreview}
        onSelectFrame={props.onSelectFrame}
        onSelectCubie={props.onSelectCubie}
        onDragPreview={props.onDragPreview}
        onTwistActiveChange={setTwistActive}
      />

      {props.showGuides && (
        <FrameGuides
          frames={guidedFrames}
          cellStride={cellStride}
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
        makeDefault
        enabled={!twistActive}
        enableDamping
        dampingFactor={0.08}
        enablePan={true}
        mouseButtons={{ LEFT: 0, MIDDLE: 1, RIGHT: 2 }}
        touches={{ ONE: 0, TWO: 2 }}
        rotateSpeed={0.8}
        panSpeed={0.8}
        zoomSpeed={0.9}
        minDistance={2}
        maxDistance={50}
      />
      <CameraRig cameraPreset={props.cameraPreset} cameraPresetRequest={props.cameraPresetRequest} />

      <GizmoHelper alignment="bottom-right" margin={[80, 80]}>
        <GizmoViewport axisColors={['#ef4444', '#38bdf8', '#4ade80']} labelColor="white" />
      </GizmoHelper>
    </Canvas>
  );
}
