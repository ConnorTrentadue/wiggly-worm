import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  WORM_VISIBLE_SECONDS_MAX,
  WORM_VISIBLE_SECONDS_MIN,
  findRingHitTarget
} from '../src/collision.js';

function makeCandidate(points, canHit = true) {
  return {
    source: { id: 'worm' },
    canHit,
    points: points.map(([x, y, z]) => new THREE.Vector3(x, y, z))
  };
}

function hit(points, before, now, velocityZ = -10) {
  return findRingHitTarget({
    candidates: [makeCandidate(points)],
    ringBefore: new THREE.Vector3(...before),
    ringNow: new THREE.Vector3(...now),
    velocityZ
  });
}

const uprightWorm = [
  [0, 0.3, -10],
  [0, 0.58, -10],
  [0, 0.86, -10],
  [0, 1.14, -10],
  [0, 1.42, -10],
  [0, 1.7, -10],
  [0, 1.98, -10]
];

assert.equal(WORM_VISIBLE_SECONDS_MIN, 2);
assert.equal(WORM_VISIBLE_SECONDS_MAX, 4);

for (let i = 0; i < 250; i += 1) {
  const y = 0.35 + Math.random() * 1.75;
  const xOffset = (Math.random() - 0.5) * 1.15;
  assert.ok(
    hit(uprightWorm, [xOffset, y, -8.7], [xOffset, y, -11.4]),
    `center/body pass should hit: ${JSON.stringify({ xOffset, y })}`
  );
}

for (let i = 0; i < 250; i += 1) {
  const y = 0.45 + Math.random() * 1.55;
  const zBefore = -9.25 + Math.random() * 0.12;
  const zNow = -10.85 - Math.random() * 0.12;
  assert.ok(
    hit(uprightWorm, [0.8, y, zBefore], [0.8, y, zNow]),
    `visible edge pass should hit: ${JSON.stringify({ y, zBefore, zNow })}`
  );
}

for (let i = 0; i < 100; i += 1) {
  const y = 0.3 + Math.random() * 1.9;
  assert.equal(
    hit(uprightWorm, [1.9, y, -8.7], [1.9, y, -11.4]),
    null,
    `clear miss should not hit: ${JSON.stringify({ y })}`
  );
}

assert.equal(hit(uprightWorm, [0, 1.2, -8.7], [0, 1.2, -11.4], 3), null);

const hiddenTarget = findRingHitTarget({
  candidates: [makeCandidate(uprightWorm, false)],
  ringBefore: new THREE.Vector3(0, 1, -8.7),
  ringNow: new THREE.Vector3(0, 1, -11.4),
  velocityZ: -10
});
assert.equal(hiddenTarget, null);

console.log('collision tests passed');
