import * as THREE from 'three';
import './styles.css';
import {
  WORM_VISIBLE_SECONDS_MAX,
  WORM_VISIBLE_SECONDS_MIN,
  findRingHitTarget
} from './collision.js';

const app = document.querySelector('#app');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x93cbd4);
scene.fog = new THREE.Fog(0x93cbd4, 8, 28);

const camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.1, 80);
camera.position.set(0, 1.55, 0);

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: false,
  powerPreference: 'high-performance',
  preserveDrawingBuffer: true
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
app.appendChild(renderer.domElement);

const ui = document.createElement('div');
ui.className = 'hud';
ui.innerHTML = `
  <div class="topbar">
    <div class="stat"><span>Score</span><strong id="score">0</strong></div>
    <div class="stat"><span>Rings</span><strong id="rings">12</strong></div>
    <div class="stat"><span>Hits</span><strong id="hits">0</strong></div>
    <button id="reset" type="button" aria-label="Reset round">Reset</button>
  </div>
  <div class="crosshair" aria-hidden="true"></div>
  <div class="charge">
    <div class="charge-fill" id="chargeFill"></div>
  </div>
  <button id="throwButton" class="throw-button" type="button" aria-label="Throw ring">Throw</button>
  <div id="toast" class="toast">Drag to aim. Hold to charge. Release to throw.</div>
  <div id="gameOverModal" class="modal" aria-hidden="true">
    <div class="modal-panel" role="dialog" aria-modal="true" aria-labelledby="finalTitle">
      <h1 id="finalTitle">Round Complete</h1>
      <div class="final-score" id="finalScore">0</div>
      <div class="result-grid">
        <div><span>Accuracy</span><strong id="finalAccuracy">0%</strong></div>
        <div><span>Hits</span><strong id="finalHits">0 / 12</strong></div>
      </div>
      <div class="modal-actions">
        <button id="playAgain" type="button">Reset</button>
        <button id="shareScore" type="button">Share</button>
      </div>
    </div>
  </div>
`;
document.body.appendChild(ui);

const scoreEl = document.querySelector('#score');
const ringsEl = document.querySelector('#rings');
const hitsEl = document.querySelector('#hits');
const chargeFill = document.querySelector('#chargeFill');
const toast = document.querySelector('#toast');
const throwButton = document.querySelector('#throwButton');
const resetButton = document.querySelector('#reset');
const modal = document.querySelector('#gameOverModal');
const finalScore = document.querySelector('#finalScore');
const finalAccuracy = document.querySelector('#finalAccuracy');
const finalHits = document.querySelector('#finalHits');
const playAgainButton = document.querySelector('#playAgain');
const shareButton = document.querySelector('#shareScore');

const hemi = new THREE.HemisphereLight(0xfff2dc, 0x477063, 2.2);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xfff2cf, 2.8);
sun.position.set(-5, 8, 4);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 24;
sun.shadow.camera.left = -10;
sun.shadow.camera.right = 10;
sun.shadow.camera.top = 10;
sun.shadow.camera.bottom = -10;
scene.add(sun);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(80, 80),
  new THREE.MeshStandardMaterial({ color: 0x477c56, roughness: 0.96 })
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.02;
ground.receiveShadow = true;
scene.add(ground);

const lane = new THREE.Mesh(
  new THREE.PlaneGeometry(7, 23),
  new THREE.MeshStandardMaterial({ color: 0xd5bf80, roughness: 0.9 })
);
lane.rotation.x = -Math.PI / 2;
lane.position.set(0, 0.001, -10.5);
lane.receiveShadow = true;
scene.add(lane);

const backRail = new THREE.Mesh(
  new THREE.BoxGeometry(8, 0.2, 0.18),
  new THREE.MeshStandardMaterial({ color: 0x6b4e31, roughness: 0.75 })
);
backRail.position.set(0, 0.4, -17.5);
backRail.castShadow = true;
scene.add(backRail);

const holeMat = new THREE.MeshStandardMaterial({ color: 0x3a2b20, roughness: 0.92 });
const wormMaterials = [
  new THREE.MeshStandardMaterial({ color: 0xf06d4f, roughness: 0.62 }),
  new THREE.MeshStandardMaterial({ color: 0xf48958, roughness: 0.62 })
];
const eyeMat = new THREE.MeshStandardMaterial({ color: 0x171717, roughness: 0.2 });
const eyeWhiteMat = new THREE.MeshStandardMaterial({ color: 0xfff7e8, roughness: 0.3 });

const wormSlots = [
  [-2.25, -8.2],
  [0, -8.9],
  [2.15, -9.7],
  [-1.15, -11.35],
  [1.35, -12.2],
  [0, -14.25]
];

const worms = wormSlots.map(([x, z], index) => createWorm(x, z, index));
const activeRings = [];
const settledRings = [];
const floatingScores = [];

const ringMat = new THREE.MeshStandardMaterial({
  color: 0xf8d24a,
  metalness: 0.08,
  roughness: 0.34
});
const ghostMat = new THREE.MeshStandardMaterial({
  color: 0xfff4b4,
  transparent: true,
  opacity: 0.42,
  metalness: 0.05,
  roughness: 0.3
});

let score = 0;
let ringsLeft = 12;
let throwsTaken = 0;
let hits = 0;
let yaw = 0;
let pitch = -0.03;
let targetYaw = 0;
let targetPitch = -0.03;
let charging = false;
let chargeStart = 0;
let charge = 0;
let lastThrow = 0;
let gameOver = false;
let modalReadyAt = 0;

const aimRing = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.045, 14, 48), ghostMat);
aimRing.position.set(0, -0.45, -1.2);
aimRing.rotation.x = Math.PI / 2;
camera.add(aimRing);
scene.add(camera);

function createWorm(x, z, index) {
  const root = new THREE.Group();
  root.position.set(x, 0, z);
  root.userData.baseX = x;
  scene.add(root);

  const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.66, 0.8, 0.08, 40), holeMat);
  hole.position.y = 0.005;
  hole.scale.z = 0.7;
  hole.receiveShadow = true;
  root.add(hole);

  const body = new THREE.Group();
  root.add(body);
  const segments = [];

  for (let i = 0; i < 7; i += 1) {
    const segment = new THREE.Mesh(
      new THREE.SphereGeometry(0.36 - i * 0.018, 32, 20),
      wormMaterials[(i + index) % 2]
    );
    segment.position.y = 0.2 + i * 0.28;
    segment.scale.set(0.95, 1.08, 0.95);
    segment.castShadow = true;
    segment.receiveShadow = true;
    body.add(segment);
    segments.push(segment);
  }

  const head = segments.at(-1);
  for (const eyeX of [-0.13, 0.13]) {
    const white = new THREE.Mesh(new THREE.SphereGeometry(0.074, 16, 12), eyeWhiteMat);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.033, 16, 10), eyeMat);
    white.position.set(eyeX, 0.12, 0.29);
    pupil.position.set(eyeX, 0.12, 0.35);
    head.add(white, pupil);
  }

  return {
    root,
    body,
    segments,
    head,
    state: 'hidden',
    visibleAmount: 0,
    timer: Math.random() * 1.4,
    hideAt: 0,
    appearedAt: 0,
    hit: false,
    scoreLabel: null,
    ringStack: 0
  };
}

function makeRing(material = ringMat) {
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.44, 0.055, 16, 72), material);
  ring.castShadow = true;
  ring.receiveShadow = true;
  return ring;
}

function resetRound() {
  for (const ring of activeRings.splice(0)) scene.remove(ring.mesh);
  for (const ring of settledRings.splice(0)) {
    if (ring.parent) ring.parent.remove(ring);
  }
  for (const label of floatingScores.splice(0)) label.element.remove();
  for (const worm of worms) {
    worm.state = 'hidden';
    worm.visibleAmount = 0;
    worm.timer = Math.random() * 1.2;
    worm.hideAt = 0;
    worm.appearedAt = 0;
    worm.hit = false;
    worm.ringStack = 0;
    worm.body.position.y = -1.72;
    worm.body.rotation.set(0, 0, 0);
  }
  score = 0;
  ringsLeft = 12;
  throwsTaken = 0;
  hits = 0;
  charge = 0;
  charging = false;
  gameOver = false;
  targetYaw = 0;
  targetPitch = -0.03;
  modal.classList.remove('show');
  modal.classList.remove('ready');
  modal.setAttribute('aria-hidden', 'true');
  modalReadyAt = 0;
  showToast('Hit pop-up worms fast for bonus points.');
  updateHud();
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('show'), 2200);
}

function updateHud() {
  scoreEl.textContent = String(score);
  ringsEl.textContent = String(ringsLeft);
  hitsEl.textContent = String(hits);
  chargeFill.style.transform = `scaleX(${Math.max(0.03, charge)})`;
}

function throwRing() {
  if (gameOver || ringsLeft <= 0 || performance.now() - lastThrow < 220) return;
  lastThrow = performance.now();
  ringsLeft -= 1;
  throwsTaken += 1;

  const ring = makeRing();
  const origin = new THREE.Vector3(0, -0.22, -0.78).applyMatrix4(camera.matrixWorld);
  const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion).normalize();
  const strength = 8.5 + charge * 9;
  ring.position.copy(origin);
  ring.quaternion.copy(camera.quaternion);
  ring.rotateX(Math.PI / 2);
  scene.add(ring);
  activeRings.push({
    mesh: ring,
    velocity: direction.multiplyScalar(strength).add(new THREE.Vector3(0, 1.2 + charge * 1.7, 0)),
    spin: new THREE.Vector3(6 + charge * 10, 0.5 - Math.random(), 1.2),
    age: 0,
    scored: false
  });

  charge = 0;
  charging = false;
  updateHud();
}

const pointerState = {
  active: false,
  x: 0,
  y: 0
};

function beginCharge() {
  if (ringsLeft <= 0 || gameOver) return;
  charging = true;
  chargeStart = performance.now();
}

function endCharge() {
  if (!charging) return;
  charging = false;
  throwRing();
}

renderer.domElement.addEventListener('pointerdown', (event) => {
  pointerState.active = true;
  pointerState.x = event.clientX;
  pointerState.y = event.clientY;
  renderer.domElement.setPointerCapture(event.pointerId);
  beginCharge();
});

renderer.domElement.addEventListener('pointermove', (event) => {
  if (!pointerState.active) return;
  const dx = event.clientX - pointerState.x;
  const dy = event.clientY - pointerState.y;
  pointerState.x = event.clientX;
  pointerState.y = event.clientY;
  targetYaw -= dx * 0.0033;
  targetPitch -= dy * 0.0025;
  targetYaw = THREE.MathUtils.clamp(targetYaw, -0.72, 0.72);
  targetPitch = THREE.MathUtils.clamp(targetPitch, -0.36, 0.18);
});

renderer.domElement.addEventListener('pointerup', (event) => {
  pointerState.active = false;
  renderer.domElement.releasePointerCapture(event.pointerId);
  endCharge();
});

renderer.domElement.addEventListener('pointercancel', () => {
  pointerState.active = false;
  charging = false;
});

throwButton.addEventListener('pointerdown', (event) => {
  event.stopPropagation();
  beginCharge();
});
throwButton.addEventListener('pointerup', (event) => {
  event.stopPropagation();
  endCharge();
});
throwButton.addEventListener('pointerleave', endCharge);
resetButton.addEventListener('click', resetRound);
playAgainButton.addEventListener('click', (event) => {
  if (!isModalReady()) {
    event.preventDefault();
    return;
  }
  resetRound();
});
shareButton.addEventListener('click', (event) => {
  if (!isModalReady()) {
    event.preventDefault();
    return;
  }
  shareScore();
});

window.addEventListener('keydown', (event) => {
  if (event.code === 'Space') {
    event.preventDefault();
    if (!charging) beginCharge();
  }
  if (event.code === 'KeyR') resetRound();
});

window.addEventListener('keyup', (event) => {
  if (event.code === 'Space') {
    event.preventDefault();
    endCharge();
  }
});

function revealWorm(worm, now) {
  worm.state = 'rising';
  worm.hit = false;
  worm.ringStack = 0;
  worm.appearedAt = now;
  worm.hideAt = now + WORM_VISIBLE_SECONDS_MIN * 1000 + Math.random() * (WORM_VISIBLE_SECONDS_MAX - WORM_VISIBLE_SECONDS_MIN) * 1000;
  worm.root.position.x = worm.root.userData.baseX + (Math.random() - 0.5) * 0.34;
}

function hideWorm(worm) {
  worm.state = 'falling';
}

function updateWorms(delta, time, now) {
  let visibleWorms = worms.filter((worm) => worm.state === 'rising' || worm.state === 'up').length;

  for (const worm of worms) {
    if (worm.state === 'hidden') {
      worm.timer -= delta;
      if (worm.timer <= 0 && visibleWorms < 3) {
        revealWorm(worm, now);
        visibleWorms += 1;
      }
    } else if (worm.state === 'rising') {
      worm.visibleAmount = Math.min(1, worm.visibleAmount + delta * 3.4);
      if (worm.visibleAmount >= 1) worm.state = 'up';
    } else if (worm.state === 'up') {
      if (now >= worm.hideAt) hideWorm(worm);
    } else if (worm.state === 'falling') {
      worm.visibleAmount = Math.max(0, worm.visibleAmount - delta * 3.1);
      if (worm.visibleAmount <= 0) {
        worm.state = 'hidden';
        worm.timer = 0.45 + Math.random() * 2.5;
      }
    }

    const bob = Math.sin(time * 7 + worm.root.userData.baseX) * 0.03;
    worm.body.position.y = THREE.MathUtils.lerp(-1.72, 0, easeOutBack(worm.visibleAmount)) + bob * worm.visibleAmount;
    worm.body.rotation.z = Math.sin(time * 4.8 + worm.root.userData.baseX * 2) * 0.14 * worm.visibleAmount;
    worm.body.rotation.x = Math.sin(time * 3.6 + worm.root.position.z) * 0.08 * worm.visibleAmount;

    for (let i = 0; i < worm.segments.length; i += 1) {
      const segment = worm.segments[i];
      segment.position.x = Math.sin(time * 5.2 + i * 0.8 + worm.root.position.x) * 0.05 * worm.visibleAmount;
      segment.rotation.y = Math.sin(time * 4 + i) * 0.18 * worm.visibleAmount;
    }
  }
}

function easeOutBack(value) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(value - 1, 3) + c1 * Math.pow(value - 1, 2);
}

function wormTargetWorldPosition(worm) {
  const pos = new THREE.Vector3();
  worm.head.getWorldPosition(pos);
  pos.y -= 0.18;
  return pos;
}

function findHitWorm(ring) {
  const ringNow = ring.mesh.position;
  const ringBefore = ring.previousPosition ?? ringNow;
  return findRingHitTarget({
    candidates: worms.map((worm) => ({
      source: worm,
      canHit: worm.visibleAmount >= 0.45 && (worm.state === 'rising' || worm.state === 'up'),
      points: visibleWormPoints(worm)
    })),
    ringBefore,
    ringNow,
    velocityZ: ring.velocity.z
  });
}

function visibleWormPoints(worm) {
  const points = [wormTargetWorldPosition(worm)];
  const position = new THREE.Vector3();

  for (const segment of worm.segments) {
    segment.getWorldPosition(position);
    if (position.y < 0.2) continue;
    points.push(position.clone());
  }

  return points;
}

function pointsForWorm(worm, now) {
  const reactionSeconds = Math.max(0, (now - worm.appearedAt) / 1000);
  return Math.max(25, Math.round(125 - reactionSeconds * 30));
}

function settleRing(ring, worm = null) {
  const index = activeRings.indexOf(ring);
  if (index >= 0) activeRings.splice(index, 1);

  if (worm) {
    const midSegment = worm.segments[Math.floor(worm.segments.length / 2)];
    const stackSpacing = 0.24;
    worm.body.add(ring.mesh);
    ring.mesh.position.set(0, midSegment.position.y + worm.ringStack * stackSpacing, 0);
    ring.mesh.rotation.set(Math.PI / 2, 0, 0);
    worm.ringStack += 1;
    settledRings.push(ring.mesh);
  } else {
    ring.mesh.position.y = Math.max(0.06, ring.mesh.position.y);
    ring.mesh.rotation.x = Math.PI / 2;
    settledRings.push(ring.mesh);
  }
}

function showFloatingScore(worm, points) {
  const element = document.createElement('div');
  element.className = 'floating-score';
  element.textContent = `+${points}`;
  document.body.appendChild(element);
  floatingScores.push({
    element,
    worm,
    age: 0,
    duration: 1.05,
    offset: new THREE.Vector3(0.62, 0.34, 0)
  });
}

function updateFloatingScores(delta) {
  for (let i = floatingScores.length - 1; i >= 0; i -= 1) {
    const label = floatingScores[i];
    label.age += delta;
    const headPosition = wormTargetWorldPosition(label.worm).add(label.offset);
    const projected = headPosition.project(camera);
    const x = (projected.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-projected.y * 0.5 + 0.5) * window.innerHeight - label.age * 38;
    const progress = label.age / label.duration;
    label.element.style.transform = `translate(-50%, -50%) translate(${x}px, ${y}px)`;
    label.element.style.opacity = String(Math.max(0, 1 - progress));

    if (progress >= 1) {
      label.element.remove();
      floatingScores.splice(i, 1);
    }
  }
}

function updateRings(delta, now) {
  for (let i = activeRings.length - 1; i >= 0; i -= 1) {
    const ring = activeRings[i];
    ring.age += delta;
    ring.previousPosition = ring.mesh.position.clone();
    ring.velocity.y -= 5.9 * delta;
    ring.velocity.multiplyScalar(1 - delta * 0.055);
    ring.mesh.position.addScaledVector(ring.velocity, delta);
    ring.mesh.rotateX(ring.spin.x * delta);
    ring.mesh.rotateY(ring.spin.y * delta);
    ring.mesh.rotateZ(ring.spin.z * delta);

    const hitWorm = !ring.scored ? findHitWorm(ring) : null;
    if (hitWorm) {
      ring.scored = true;
      const points = pointsForWorm(hitWorm, now);
      score += points;
      hits += 1;
      showFloatingScore(hitWorm, points);
      settleRing(ring, hitWorm);
      updateHud();
      continue;
    }

    if (ring.mesh.position.y <= 0.06 && ring.velocity.y < 0) {
      ring.velocity.set(0, 0, 0);
      settleRing(ring);
    } else if (ring.age > 4 || ring.mesh.position.z < -24) {
      scene.remove(ring.mesh);
      activeRings.splice(i, 1);
    }
  }

  if (!gameOver && ringsLeft <= 0 && activeRings.length === 0) {
    endRound();
  }
}

function endRound() {
  gameOver = true;
  charging = false;
  modalReadyAt = performance.now() + 850;
  const accuracy = throwsTaken ? Math.round((hits / throwsTaken) * 100) : 0;
  finalScore.textContent = String(score);
  finalAccuracy.textContent = `${accuracy}%`;
  finalHits.textContent = `${hits} / ${throwsTaken}`;
  modal.classList.add('show');
  modal.classList.remove('ready');
  modal.setAttribute('aria-hidden', 'false');
  window.setTimeout(() => {
    if (gameOver && performance.now() >= modalReadyAt) modal.classList.add('ready');
  }, 850);
}

function isModalReady() {
  return gameOver && performance.now() >= modalReadyAt;
}

async function shareScore() {
  shareButton.disabled = true;
  try {
    const blob = await makeScoreScreenshot();
    const file = new File([blob], 'worm-ring-toss-score.png', { type: 'image/png' });
    const text = `I scored ${score} with ${Math.round((hits / Math.max(1, throwsTaken)) * 100)}% accuracy in Worm Ring Toss.`;

    if (navigator.canShare?.({ files: [file] }) && navigator.share) {
      await navigator.share({ title: 'Worm Ring Toss', text, files: [file] });
    } else {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'worm-ring-toss-score.png';
      link.click();
      URL.revokeObjectURL(url);
      showToast('Screenshot saved.');
    }
  } catch {
    showToast('Screenshot sharing is not available here.');
  } finally {
    shareButton.disabled = false;
  }
}

async function makeScoreScreenshot() {
  const width = renderer.domElement.width;
  const height = renderer.domElement.height;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(renderer.domElement, 0, 0, width, height);

  const scale = Math.max(1, Math.min(width, height) / 520);
  const panelWidth = Math.min(width - 48 * scale, 460 * scale);
  const panelHeight = 210 * scale;
  const x = (width - panelWidth) / 2;
  const y = (height - panelHeight) / 2;
  const accuracy = throwsTaken ? Math.round((hits / throwsTaken) * 100) : 0;

  ctx.fillStyle = 'rgba(24, 32, 28, 0.78)';
  roundedRect(ctx, x, y, panelWidth, panelHeight, 14 * scale);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 248, 232, 0.32)';
  ctx.lineWidth = 2 * scale;
  ctx.stroke();

  ctx.fillStyle = '#fff8e8';
  ctx.textAlign = 'center';
  ctx.font = `${22 * scale}px system-ui, sans-serif`;
  ctx.fillText('Worm Ring Toss', width / 2, y + 42 * scale);
  ctx.font = `800 ${58 * scale}px system-ui, sans-serif`;
  ctx.fillText(String(score), width / 2, y + 108 * scale);
  ctx.font = `${20 * scale}px system-ui, sans-serif`;
  ctx.fillText(`${accuracy}% accuracy  |  ${hits} hits from ${throwsTaken} rings`, width / 2, y + 154 * scale);
  ctx.fillStyle = '#ffe66d';
  ctx.font = `800 ${16 * scale}px system-ui, sans-serif`;
  ctx.fillText('Fast pop-up hits score more points', width / 2, y + 185 * scale);

  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject()), 'image/png'));
}

function roundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

function resize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
}

window.addEventListener('resize', resize);

let previous = performance.now();
function animate(now) {
  const delta = Math.min(0.033, (now - previous) / 1000);
  previous = now;
  const time = now / 1000;

  if (charging) {
    charge = THREE.MathUtils.clamp((now - chargeStart) / 950, 0, 1);
  }

  yaw = THREE.MathUtils.lerp(yaw, targetYaw, 0.14);
  pitch = THREE.MathUtils.lerp(pitch, targetPitch, 0.14);
  camera.rotation.set(pitch, yaw, 0, 'YXZ');
  aimRing.scale.setScalar(0.82 + charge * 0.38);
  aimRing.material.opacity = 0.24 + charge * 0.34;

  updateWorms(delta, time, now);
  updateRings(delta, now);
  updateFloatingScores(delta);
  updateHud();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

resetRound();
requestAnimationFrame(animate);
