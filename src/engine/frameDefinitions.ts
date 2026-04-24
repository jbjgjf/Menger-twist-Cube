import type { RotationFrame } from '../types/puzzle';

export const frames: RotationFrame[] = [
  {
    id: 'X_PLUS',
    name: 'X+',
    axis: [1, 0, 0],
    selector: (p) => p[0] === 1,
    color: '#fb7185',
    radius: 2.0,
  },
  {
    id: 'X_MINUS',
    name: 'X-',
    axis: [1, 0, 0],
    selector: (p) => p[0] === -1,
    color: '#f43f5e',
    radius: 2.0,
  },
  {
    id: 'Y_PLUS',
    name: 'Y+',
    axis: [0, 1, 0],
    selector: (p) => p[1] === 1,
    color: '#38bdf8',
    radius: 2.0,
  },
  {
    id: 'Y_MINUS',
    name: 'Y-',
    axis: [0, 1, 0],
    selector: (p) => p[1] === -1,
    color: '#0ea5e9',
    radius: 2.0,
  },
  {
    id: 'Z_PLUS',
    name: 'Z+',
    axis: [0, 0, 1],
    selector: (p) => p[2] === 1,
    color: '#4ade80',
    radius: 2.0,
  },
  {
    id: 'Z_MINUS',
    name: 'Z-',
    axis: [0, 0, 1],
    selector: (p) => p[2] === -1,
    color: '#22c55e',
    radius: 2.0,
  },
  {
    id: 'H_X',
    name: 'Hx',
    axis: [1, 0, 0],
    selector: (p) => p[1] === 0 || p[2] === 0,
    color: '#f59e0b',
    radius: 1.3,
  },
  {
    id: 'H_Y',
    name: 'Hy',
    axis: [0, 1, 0],
    selector: (p) => p[0] === 0 || p[2] === 0,
    color: '#a78bfa',
    radius: 1.3,
  },
  {
    id: 'H_Z',
    name: 'Hz',
    axis: [0, 0, 1],
    selector: (p) => p[0] === 0 || p[1] === 0,
    color: '#facc15',
    radius: 1.3,
  },
];

export const frameById = new Map(frames.map((frame) => [frame.id, frame]));
