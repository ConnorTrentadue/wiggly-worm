import * as THREE from 'three';

export const WORM_VISIBLE_SECONDS_MIN = 2;
export const WORM_VISIBLE_SECONDS_MAX = 4;
export const WORM_BODY_HIT_RADIUS = 0.94;
export const WORM_NEAR_MISS_HORIZONTAL_RADIUS = 0.86;
export const WORM_NEAR_MISS_VERTICAL_RADIUS = 0.95;

export function findRingHitTarget({ candidates, ringBefore, ringNow, velocityZ }) {
  let best = null;
  let bestDistance = Infinity;

  for (const candidate of candidates) {
    if (!candidate.canHit) continue;
    const target = closestTargetPoint(candidate.points, ringBefore, ringNow);
    const horizontal = Math.hypot(ringNow.x - target.position.x, ringNow.z - target.position.z);
    const vertical = Math.abs(ringNow.y - target.position.y);
    const bodyHit = target.distance <= WORM_BODY_HIT_RADIUS;
    const forgivingBodyPass =
      horizontal <= WORM_NEAR_MISS_HORIZONTAL_RADIUS && vertical <= WORM_NEAR_MISS_VERTICAL_RADIUS;

    if ((bodyHit || forgivingBodyPass) && target.distance < bestDistance && velocityZ < 1.5) {
      best = candidate.source;
      bestDistance = target.distance;
    }
  }

  return best;
}

export function closestTargetPoint(points, ringBefore, ringNow) {
  let bestPosition = points[0];
  let bestDistance = distanceToSegment(bestPosition, ringBefore, ringNow);

  for (let i = 1; i < points.length; i += 1) {
    const distance = distanceToSegment(points[i], ringBefore, ringNow);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestPosition = points[i];
    }
  }

  return { position: bestPosition, distance: bestDistance };
}

export function distanceToSegment(point, start, end) {
  const segment = end.clone().sub(start);
  const lengthSq = segment.lengthSq();
  if (lengthSq === 0) return point.distanceTo(start);
  const t = THREE.MathUtils.clamp(point.clone().sub(start).dot(segment) / lengthSq, 0, 1);
  return point.distanceTo(start.clone().addScaledVector(segment, t));
}
