import { useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { GizmoHelper, GizmoViewport, TrackballControls } from '@react-three/drei';
import {
  BufferGeometry,
  CanvasTexture,
  Color,
  Float32BufferAttribute,
  Matrix4,
  Quaternion,
  Vector3,
  type Mesh,
} from 'three';
import {
  octaAxes,
  octaInnerColor,
  octaPieceGeometry,
  octaRotations,
  type OctaPuzzle,
  type OctaState,
} from '@menger/octahedron';

/** The turn in flight: which pieces move, about which axis, and how far they have turned (radians). */
export interface OctaAnimation {
  axis: number;
  pieces: Set<number>;
  angle: number;
}

interface Props {
  puzzle: OctaPuzzle;
  state: OctaState;
  animation: MutableRefObject<OctaAnimation | null>;
  highlighted: Set<number>;
  cameraRequest: number;
}

/** The octahedron has radius 1; this matches it to the Menger cube's on-screen size. */
const puzzleScale = 2.1;

const quaternionOf = (rot: number): Quaternion => {
  const m = octaRotations[rot]!;
  return new Quaternion().setFromRotationMatrix(
    new Matrix4().set(m[0]!, m[1]!, m[2]!, 0, m[3]!, m[4]!, m[5]!, 0, m[6]!, m[7]!, m[8]!, 0, 0, 0, 0, 1),
  );
};
const rotationQuaternions = octaRotations.map((_, i) => quaternionOf(i));
const axisVectors = octaAxes.map((a) => new Vector3(...a.d));

function Piece({ puzzle, index, rot, highlighted, animation }: {
  puzzle: OctaPuzzle;
  index: number;
  rot: number;
  highlighted: boolean;
  animation: MutableRefObject<OctaAnimation | null>;
}) {
  const meshRef = useRef<Mesh>(null);
  const { faces, edges } = useMemo(() => {
    const geometry = octaPieceGeometry(puzzle.pieces[index]!);
    const colors: number[] = [];
    for (const axis of geometry.colorAxes) {
      const c = new Color(axis < 0 ? octaInnerColor : octaAxes[axis]!.color);
      colors.push(c.r, c.g, c.b);
    }
    const faceGeometry = new BufferGeometry();
    faceGeometry.setAttribute('position', new Float32BufferAttribute(geometry.positions, 3));
    faceGeometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
    faceGeometry.computeVertexNormals();
    const edgeGeometry = new BufferGeometry();
    edgeGeometry.setAttribute('position', new Float32BufferAttribute(geometry.edges, 3));
    return { faces: faceGeometry, edges: edgeGeometry };
  }, [puzzle, index]);
  useEffect(() => () => { faces.dispose(); edges.dispose(); }, [faces, edges]);

  const spin = useMemo(() => new Quaternion(), []);
  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    mesh.quaternion.copy(rotationQuaternions[rot]!);
    const turn = animation.current;
    if (turn && turn.pieces.has(index)) {
      mesh.quaternion.premultiply(spin.setFromAxisAngle(axisVectors[turn.axis]!, turn.angle));
    }
  });

  return (
    <mesh ref={meshRef} geometry={faces} castShadow>
      <meshStandardMaterial
        vertexColors
        side={2}
        metalness={0}
        roughness={1}
        emissive={highlighted ? '#5a6ca8' : '#000000'}
        emissiveIntensity={highlighted ? 0.9 : 0}
      />
      <lineSegments geometry={edges}>
        <lineBasicMaterial color={highlighted ? '#67e8f9' : '#10121c'} />
      </lineSegments>
    </mesh>
  );
}

/** A rod, an arrowhead and a name tag beyond each vertex. They turn with the view, not with the pieces. */
function AxisMarkers() {
  const labels = useMemo(() => octaAxes.map((axis) => {
    const W = 120;
    const H = 72;
    const r = 18;
    const m = 3;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const x = canvas.getContext('2d')!;
    x.fillStyle = '#e3e6f2';
    x.strokeStyle = '#10121c';
    x.lineWidth = 5;
    x.beginPath();
    x.moveTo(m + r, m);
    x.arcTo(W - m, m, W - m, H - m, r);
    x.arcTo(W - m, H - m, m, H - m, r);
    x.arcTo(m, H - m, m, m, r);
    x.arcTo(m, m, W - m, m, r);
    x.closePath();
    x.fill();
    x.stroke();
    x.fillStyle = '#10121c';
    x.font = 'bold 40px Inter, system-ui, sans-serif';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText(axis.label, W / 2, H / 2 + 2);
    return new CanvasTexture(canvas);
  }), []);
  useEffect(() => () => labels.forEach((texture) => texture.dispose()), [labels]);

  return (
    <group>
      {octaAxes.map((axis, i) => {
        const d = axisVectors[i]!;
        const q = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), d);
        return (
          <group key={axis.label}>
            <mesh quaternion={q} position={d.clone().multiplyScalar(1.17)}>
              <cylinderGeometry args={[0.014, 0.014, 0.3, 10]} />
              <meshBasicMaterial color="#8a90a8" />
            </mesh>
            <mesh quaternion={q} position={d.clone().multiplyScalar(1.37)}>
              <coneGeometry args={[0.05, 0.13, 14]} />
              <meshBasicMaterial color="#8a90a8" />
            </mesh>
            <sprite position={d.clone().multiplyScalar(1.64)} scale={[0.35, 0.21, 1]} renderOrder={10}>
              <spriteMaterial map={labels[i]} depthTest={false} transparent />
            </sprite>
          </group>
        );
      })}
    </group>
  );
}

function CameraReset({ request }: { request: number }) {
  const { camera, controls } = useThree();
  useEffect(() => {
    camera.position.set(6, 6, 6);
    camera.up.set(0, 1, 0);
    camera.lookAt(0, 0, 0);
    const trackball = controls as unknown as { target?: Vector3; update?: () => void } | null;
    trackball?.target?.set(0, 0, 0);
    trackball?.update?.();
  }, [camera, controls, request]);
  return null;
}

export default function OctahedronScene({ puzzle, state, animation, highlighted, cameraRequest }: Props) {
  return (
    <Canvas className="touch-none" shadows camera={{ position: [6, 6, 6], fov: 50, near: 0.1, far: 100 }}>
      <color attach="background" args={['#070b14']} />
      <fog attach="fog" args={['#070b14', 12, 28]} />
      <ambientLight intensity={0.85} />
      <directionalLight castShadow position={[8, 10, 6]} intensity={1.8} shadow-mapSize-width={2048} shadow-mapSize-height={2048} />
      <directionalLight position={[-8, -2, -6]} intensity={0.6} />

      <group scale={puzzleScale}>
        {puzzle.pieces.map((_, index) => (
          <Piece
            key={`${puzzle.level}-${index}`}
            puzzle={puzzle}
            index={index}
            rot={state[index]!}
            highlighted={highlighted.has(index)}
            animation={animation}
          />
        ))}
        <AxisMarkers />
      </group>

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -3.4, 0]} receiveShadow>
        <planeGeometry args={[30, 30]} />
        <shadowMaterial opacity={0.2} />
      </mesh>

      <TrackballControls makeDefault rotateSpeed={2.5} panSpeed={0.8} zoomSpeed={1.2} />
      <CameraReset request={cameraRequest} />
      <GizmoHelper alignment="bottom-right" margin={[80, 80]}>
        <GizmoViewport axisColors={['#ef4444', '#38bdf8', '#4ade80']} labelColor="white" />
      </GizmoHelper>
    </Canvas>
  );
}
