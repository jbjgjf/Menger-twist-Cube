import { cube3x3x3 } from 'cubing/puzzles';
import { KPattern } from 'cubing/kpuzzle';
import { experimentalSolve3x3x3IgnoringCenters } from 'cubing/search';

async function run() {
  const kpuzzle = await cube3x3x3.kpuzzle();
  const p1 = kpuzzle.defaultPattern().applyAlg('M');
  const d = JSON.parse(JSON.stringify(p1.patternData));
  d.CENTERS.pieces = [0, 1, 2, 3, 4, 5];
  const p2 = new KPattern(kpuzzle, d);
  console.log('Success');
}
run();
