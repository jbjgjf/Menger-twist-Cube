import { useMemo, useRef } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import { Torus } from '@react-three/drei';
import type { FrameId } from '../types/puzzle';
import { frames } from '../engine/frameDefinitions';

interface Props {
  selectedFrame: FrameId | null;
  hoveredFrame: FrameId | null;
  onHover: (frame: FrameId | null) => void;
  onSelect: (frame: FrameId) => void;
  onDragPreview: (frame: FrameId, angle: number | null) => void;
}

const ringRotation = (frameId: FrameId): [number, number, number] => {
  if (frameId.includes('X')) return [0, Math.PI / 2, 0];
  if (frameId.includes('Y')) return [Math.PI / 2, 0, 0];
  return [0, 0, 0];
};

export default function FrameGuides({ selectedFrame, hoveredFrame, onHover, onSelect, onDragPreview }: Props) {
  const dragStart = useRef<{ x: number; frame: FrameId } | null>(null);

  const orderedFrames = useMemo(() => [...frames].sort((a, b) => b.radius - a.radius), []);

  return (
    <group>
      {orderedFrames.map((frame) => {
        const isActive = selectedFrame === frame.id;
        const isHover = hoveredFrame === frame.id;
        const color = isActive ? '#f8fafc' : isHover ? '#e2e8f0' : frame.color;

        return (
          <Torus
            key={frame.id}
            args={[frame.radius, frame.id.startsWith('H_') ? 0.04 : 0.03, 24, 120]}
            rotation={ringRotation(frame.id)}
            onPointerOver={(event: ThreeEvent<PointerEvent>) => {
              event.stopPropagation();
              onHover(frame.id);
            }}
            onPointerOut={(event: ThreeEvent<PointerEvent>) => {
              event.stopPropagation();
              onHover(null);
            }}
            onClick={(event: ThreeEvent<MouseEvent>) => {
              event.stopPropagation();
              onSelect(frame.id);
            }}
            onPointerDown={(event: ThreeEvent<PointerEvent>) => {
              event.stopPropagation();
              dragStart.current = { x: event.clientX, frame: frame.id };
            }}
            onPointerMove={(event: ThreeEvent<PointerEvent>) => {
              if (!dragStart.current || dragStart.current.frame !== frame.id) return;
              const deltaX = event.clientX - dragStart.current.x;
              const preview = Math.max(-90, Math.min(90, deltaX * 0.65));
              onDragPreview(frame.id, preview);
            }}
            onPointerUp={(event: ThreeEvent<PointerEvent>) => {
              event.stopPropagation();
              dragStart.current = null;
              onDragPreview(frame.id, null);
            }}
          >
            <meshStandardMaterial
              color={color}
              emissive={color}
              emissiveIntensity={isActive ? 0.65 : isHover ? 0.3 : 0.12}
              transparent
              opacity={isActive ? 0.7 : 0.35}
              depthWrite={false}
            />
          </Torus>
        );
      })}
    </group>
  );
}
