import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

const $ = (id) => document.getElementById(id);
const ui = {
  viewport: $('viewport'), briefing: $('briefing'), start: $('startButton'), startLabel: $('startLabel'),
  pause: $('pauseOverlay'), ending: $('endingOverlay'), resume: $('resumeButton'), restart: $('restartButton'),
  endingTitle: $('endingTitle'), endingCopy: $('endingCopy'), endingOverline: $('endingOverline'),
  objective: $('objectiveText'), sector: $('sectorText'), health: $('healthValue'), healthFill: $('healthFill'),
  distance: $('distanceValue'), routeFill: $('routeFill'), weapon: $('weaponName'), weaponKey: $('weaponKey'),
  ammo: $('ammoValue'), ammoUnit: $('reserveValue'), pickup: $('pickupPrompt'), crosshair: $('crosshair'),
  hit: $('hitMarker'), damage: $('damageFlash'), kills: $('killCount'), loading: $('loadingNote'),
};

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.7));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
ui.viewport.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x20241a);
scene.fog = new THREE.FogExp2(0x20241a, 0.012);

const camera = new THREE.PerspectiveCamera(76, window.innerWidth / window.innerHeight, 0.06, 120);
camera.position.set(0, 1.65, 25);
scene.add(camera);

const controls = new PointerLockControls(camera, renderer.domElement);
controls.pointerSpeed = 0.8;

const environment = new THREE.Group();
scene.add(environment);

const clock = new THREE.Clock();
const raycaster = new THREE.Raycaster();
raycaster.far = 34;
const center = new THREE.Vector2(0, 0);
const staticBlocks = [];
const enemies = [];
const pickups = [];
const shotTracers = [];
const floorY = 0;
const exitPosition = new THREE.Vector3(0, 0, -39);
const startPosition = new THREE.Vector3(0, 1.65, 25);
const ammo = [16, 32];
const maxAmmo = [32, 64];
const ammoGains = [10, 20];
const weaponNames = ['M9 · SEMIAUTOMÁTICA', 'AK-47 · AUTOMÁTICA'];
const weaponFiles = ['sidearm-m9.glb', 'carbine-ak47.glb'];
const weaponModels = [null, null];
let activeWeapon = 0;
let currentViewWeapon = null;
let muzzleFlash = null;
let playerHealth = 100;
let kills = 0;
let gameState = 'briefing';
let clockElapsed = 0;
let walkPhase = 0;
let recoil = 0;
let shotFlash = 0;
let targetEnemy = null;
let nearPickup = null;
let screenShake = 0;
let lastHudAt = 0;

const loader = new GLTFLoader();

function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function makeTexture(kind) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  const rand = seededRandom(kind === 'wall' ? 87 : 189);

  if (kind === 'wall') {
    ctx.fillStyle = '#47502a';
    ctx.fillRect(0, 0, 512, 512);
    for (let y = 0; y < 512; y += 64) {
      ctx.fillStyle = y % 128 === 0 ? '#58602d' : '#3d4724';
      ctx.fillRect(0, y, 512, 58);
      ctx.fillStyle = '#171b11';
      ctx.fillRect(0, y + 58, 512, 6);
      ctx.fillStyle = 'rgba(176, 171, 81, .13)';
      ctx.fillRect(0, y + 4, 512, 2);
    }
    for (let i = 0; i < 6200; i++) {
      const light = rand() > 0.52;
      ctx.fillStyle = light ? `rgba(163, 157, 74, ${rand() * 0.18})` : `rgba(9, 13, 8, ${rand() * 0.28})`;
      const w = 1 + rand() * 8;
      const h = 1 + rand() * 4;
      ctx.fillRect(rand() * 512, rand() * 512, w, h);
    }
    for (let i = 0; i < 42; i++) {
      ctx.fillStyle = 'rgba(19, 24, 13, .22)';
      ctx.fillRect(rand() * 512, rand() * 512, 3 + rand() * 5, 18 + rand() * 80);
    }
  } else {
    ctx.fillStyle = '#59624a';
    ctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 8200; i++) {
      const alpha = 0.025 + rand() * 0.12;
      ctx.fillStyle = rand() > 0.5 ? `rgba(212, 205, 162, ${alpha})` : `rgba(12, 18, 13, ${alpha})`;
      ctx.fillRect(rand() * 512, rand() * 512, 1 + rand() * 5, 1 + rand() * 4);
    }
    for (let i = 0; i < 23; i++) {
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(25, 31, 20, .22)';
      ctx.lineWidth = 1 + rand() * 2;
      const x = rand() * 512;
      const y = rand() * 512;
      ctx.moveTo(x, y);
      ctx.lineTo(x + rand() * 28, y + rand() * 36);
      ctx.lineTo(x + rand() * 60, y + rand() * 65);
      ctx.stroke();
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
  return texture;
}

const wallTexture = makeTexture('wall');
wallTexture.repeat.set(2, 2.6);
const floorTexture = makeTexture('floor');
floorTexture.repeat.set(10, 28);
const wallMaterial = new THREE.MeshStandardMaterial({ map: wallTexture, color: 0xa6a56a, roughness: 0.98 });
const floorMaterial = new THREE.MeshStandardMaterial({ map: floorTexture, color: 0xb7c09a, roughness: 1 });
const darkSteel = new THREE.MeshStandardMaterial({ color: 0x252a20, roughness: 0.78, metalness: 0.36 });
const wornSteel = new THREE.MeshStandardMaterial({ color: 0x555a43, roughness: 0.82, metalness: 0.3 });
const olivePaint = new THREE.MeshStandardMaterial({ color: 0x626844, roughness: 0.95 });
const blackMaterial = new THREE.MeshStandardMaterial({ color: 0x171b13, roughness: 0.92 });
const rustMaterial = new THREE.MeshStandardMaterial({ color: 0x71301e, roughness: 0.9 });
const hazardMaterial = new THREE.MeshStandardMaterial({ color: 0xb28a2e, roughness: 0.82 });
const greenGlow = new THREE.MeshStandardMaterial({ color: 0xa9d74f, emissive: 0x91d334, emissiveIntensity: 2.2, roughness: 0.35 });

const hemisphere = new THREE.HemisphereLight(0xb9c78a, 0x20281a, 1.18);
scene.add(hemisphere);
const mainLight = new THREE.DirectionalLight(0xc4c987, 1.0);
mainLight.position.set(-7, 10, 8);
mainLight.castShadow = true;
mainLight.shadow.mapSize.set(1024, 1024);
mainLight.shadow.camera.left = -22;
mainLight.shadow.camera.right = 22;
mainLight.shadow.camera.top = 24;
mainLight.shadow.camera.bottom = -24;
scene.add(mainLight);

function addBox(parent, position, size, material, options = {}) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.position.set(...position);
  mesh.castShadow = options.castShadow ?? true;
  mesh.receiveShadow = options.receiveShadow ?? true;
  mesh.name = options.name ?? '';
  parent.add(mesh);
  if (options.block) {
    staticBlocks.push({
      minX: position[0] - size[0] / 2,
      maxX: position[0] + size[0] / 2,
      minZ: position[2] - size[2] / 2,
      maxZ: position[2] + size[2] / 2,
    });
  }
  return mesh;
}

function addPointLight(color, intensity, distance, position, decay = 2) {
  const light = new THREE.PointLight(color, intensity, distance, decay);
  light.position.set(...position);
  light.castShadow = false;
  scene.add(light);
  return light;
}

function addWorld() {
  addBox(environment, [0, -0.23, -7], [27, 0.46, 78], floorMaterial, { castShadow: false });
  addBox(environment, [0, 5.25, -7], [27, 0.5, 78], new THREE.MeshStandardMaterial({ map: wallTexture, color: 0x707044, roughness: 1 }), { castShadow: false });
  addBox(environment, [-13.6, 2.5, -7], [0.7, 5.5, 78], wallMaterial);
  addBox(environment, [13.6, 2.5, -7], [0.7, 5.5, 78], wallMaterial);
  addBox(environment, [0, 2.5, 32.4], [27, 5.5, 0.7], wallMaterial);
  addBox(environment, [-7.4, 2.5, -46.4], [12.2, 5.5, 0.7], wallMaterial);
  addBox(environment, [7.4, 2.5, -46.4], [12.2, 5.5, 0.7], wallMaterial);

  for (const y of [0.88, 2.35, 3.95]) {
    addBox(environment, [-13.16, y, -7], [0.12, 0.075, 77], darkSteel, { castShadow: false });
    addBox(environment, [13.16, y, -7], [0.12, 0.075, 77], darkSteel, { castShadow: false });
  }

  for (let z = 27; z >= -42; z -= 5.8) {
    addBox(environment, [-13.12, 2.55, z], [0.15, 5.0, 0.2], wornSteel, { castShadow: false });
    addBox(environment, [13.12, 2.55, z], [0.15, 5.0, 0.2], wornSteel, { castShadow: false });
    addBox(environment, [0, 5.0, z], [26.5, 0.18, 0.22], darkSteel, { castShadow: false });
  }

  for (let z = 24; z >= -39; z -= 12) {
    addBox(environment, [0, 4.92, z], [25.5, 0.16, 0.44], wornSteel, { castShadow: false });
    addBox(environment, [-6.2, 4.78, z], [0.1, 0.14, 0.42], darkSteel, { castShadow: false });
    addBox(environment, [6.2, 4.78, z], [0.1, 0.14, 0.42], darkSteel, { castShadow: false });
  }

  for (let z = 21; z >= -37; z -= 10) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.08, 0.55), new THREE.MeshStandardMaterial({ color: 0xb2c078, emissive: 0x85954a, emissiveIntensity: 1.8, roughness: 0.25 }));
    lamp.position.set(0, 4.84, z);
    environment.add(lamp);
    addPointLight(0xa7b860, 27, 12, [0, 4.5, z], 1.8);
    for (const x of [-1.2, 1.2]) addBox(environment, [x, 4.78, z], [0.08, 0.08, 0.62], darkSteel, { castShadow: false });
  }

  for (let z = 22; z >= -40; z -= 4) {
    addBox(environment, [0, 0.012, z], [0.055, 0.018, 1.9], z % 8 === 2 ? hazardMaterial : wornSteel, { castShadow: false, receiveShadow: false });
  }

  for (const [x, z, width, height, depth, color] of [
    [-8.7, 15, 2.5, 1.4, 2.0, olivePaint], [8.2, 10, 2.1, 1.8, 2.4, darkSteel],
    [-8.5, -3.5, 2.8, 1.35, 2.2, darkSteel], [8.8, -9, 2.0, 2.1, 2.1, olivePaint],
    [-8.6, -19, 2.7, 1.5, 2.0, olivePaint], [8.6, -25, 2.8, 1.35, 2.2, darkSteel],
    [-4.9, -31, 2.0, 1.0, 1.7, rustMaterial], [5.2, -16, 1.7, 2.0, 1.9, rustMaterial],
  ]) {
    addBox(environment, [x, height / 2, z], [width, height, depth], color, { block: true });
    addBox(environment, [x, height + 0.04, z], [width * 1.03, 0.1, depth * 1.03], wornSteel, { castShadow: false });
    addBox(environment, [x, height * 0.53, z - depth / 2 - 0.012], [width * 0.82, 0.08, 0.035], hazardMaterial, { castShadow: false });
  }

  for (const [x, z] of [[-11.8, 1], [11.8, -12], [-11.8, -26], [11.8, 20]]) {
    addBox(environment, [x, 2.45, z], [0.55, 4.9, 0.75], darkSteel, { block: true });
    addBox(environment, [x, 2.5, z], [0.64, 0.28, 0.84], hazardMaterial, { castShadow: false });
    const sconce = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.58, 0.12), greenGlow);
    sconce.position.set(x > 0 ? x - 0.34 : x + 0.34, 3.65, z);
    environment.add(sconce);
  }

  const doorFrame = new THREE.MeshStandardMaterial({ color: 0x34392b, roughness: 0.86, metalness: 0.35 });
  addBox(environment, [-3.1, 2.7, -44.8], [0.55, 5.2, 1.8], doorFrame);
  addBox(environment, [3.1, 2.7, -44.8], [0.55, 5.2, 1.8], doorFrame);
  addBox(environment, [0, 5.12, -44.8], [6.7, 0.48, 1.8], doorFrame);
  addBox(environment, [-2.2, 2.6, -44.2], [0.12, 4.8, 0.12], hazardMaterial, { castShadow: false });
  addBox(environment, [2.2, 2.6, -44.2], [0.12, 4.8, 0.12], hazardMaterial, { castShadow: false });
  addBox(environment, [0, 0.018, -39], [5.7, 0.025, 10.5], new THREE.MeshStandardMaterial({ color: 0x44532f, roughness: 0.8, emissive: 0x233819, emissiveIntensity: 0.4 }), { castShadow: false });

  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.09, 8, 36), greenGlow);
  ring.position.set(0, 0.5, -39);
  ring.rotation.x = Math.PI / 2;
  environment.add(ring);
  const beaconStem = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.12, 2.6, 8), wornSteel);
  beaconStem.position.set(0, 1.35, -39);
  environment.add(beaconStem);
  const beacon = new THREE.Mesh(new THREE.OctahedronGeometry(0.53, 0), greenGlow);
  beacon.position.set(0, 2.85, -39);
  environment.add(beacon);
  const beaconLight = new THREE.PointLight(0x9dff4a, 48, 15, 1.65);
  beaconLight.position.set(0, 2.2, -39);
  scene.add(beaconLight);
  environment.userData.beacon = beacon;
  environment.userData.beaconRing = ring;
  environment.userData.beaconLight = beaconLight;

  for (const x of [-2.5, 2.5]) {
    addBox(environment, [x, 4.72, -43.6], [0.2, 0.2, 0.25], greenGlow, { castShadow: false });
  }

  const dustGroup = new THREE.Group();
  environment.add(dustGroup);
  const dustGeometry = new THREE.BufferGeometry();
  const dustPositions = [];
  const dustRand = seededRandom(44);
  for (let i = 0; i < 420; i++) dustPositions.push((dustRand() - 0.5) * 25, 0.3 + dustRand() * 4.2, 29 - dustRand() * 74);
  dustGeometry.setAttribute('position', new THREE.Float32BufferAttribute(dustPositions, 3));
  const dust = new THREE.Points(dustGeometry, new THREE.PointsMaterial({ color: 0xc5c98a, size: 0.025, transparent: true, opacity: 0.32, depthWrite: false }));
  dustGroup.add(dust);

  const radialCanvas = document.createElement('canvas');
  radialCanvas.width = 64;
  radialCanvas.height = 64;
  const radialContext = radialCanvas.getContext('2d');
  const gradient = radialContext.createRadialGradient(32, 32, 2, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(193,255,105,.9)');
  gradient.addColorStop(0.22, 'rgba(117,225,57,.55)');
  gradient.addColorStop(1, 'rgba(72,168,52,0)');
  radialContext.fillStyle = gradient;
  radialContext.fillRect(0, 0, 64, 64);
  const glowSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(radialCanvas), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  glowSprite.position.set(0, 2.0, -39);
  glowSprite.scale.set(6, 6, 1);
  environment.add(glowSprite);
}

function makeAmmoBox(position, index) {
  const group = new THREE.Group();
  group.position.set(...position);
  const caseMesh = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.46, 0.48), new THREE.MeshStandardMaterial({ color: 0x344630, roughness: 0.72, metalness: 0.25 }));
  caseMesh.castShadow = true;
  group.add(caseMesh);
  const lid = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.08, 0.5), hazardMaterial);
  lid.position.y = 0.27;
  group.add(lid);
  const crossA = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.035, 0.035), greenGlow);
  const crossB = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.035, 0.34), greenGlow);
  crossA.position.set(0, 0.36, 0);
  crossB.position.set(0, 0.36, 0);
  group.add(crossA, crossB);
  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.52, 0.025, 6, 32), greenGlow);
  halo.rotation.x = Math.PI / 2;
  halo.position.y = -0.2;
  group.add(halo);
  scene.add(group);
  pickups.push({ group, index, active: true, phase: index * 1.8 });
}

function setEnemyTags(enemy) {
  enemy.group.traverse((node) => {
    if (node.isMesh) {
      node.userData.enemy = enemy;
      node.castShadow = true;
      node.receiveShadow = true;
    }
  });
}

function createEnemy(model, x, z, index) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  const modelClone = model.clone(true);
  modelClone.scale.setScalar(0.88 + (index % 2) * 0.06);
  if (index % 3 === 1) modelClone.rotation.y = Math.PI;
  group.add(modelClone);
  scene.add(group);
  const enemy = {
    group, model: modelClone, origin: new THREE.Vector3(x, 0, z), alive: true,
    hp: 2, active: false, index, speed: 1.03 + (index % 3) * 0.16,
    attackAt: 0, phase: index * 1.2, hurtUntil: 0,
  };
  setEnemyTags(enemy);
  enemies.push(enemy);
}

function loadGlb(file) {
  return loader.loadAsync(`./assets/${file}`);
}

function setupViewWeapon(model, index) {
  if (currentViewWeapon) camera.remove(currentViewWeapon);
  const group = new THREE.Group();
  group.position.set(index === 0 ? 0.36 : 0.39, index === 0 ? -0.31 : -0.34, index === 0 ? -0.64 : -0.7);
  group.rotation.set(-0.045, index === 0 ? -0.08 : -0.06, index === 0 ? -0.025 : -0.02);
  const mesh = model.clone(true);
  mesh.scale.setScalar(index === 0 ? 0.82 : 0.72);
  mesh.traverse((node) => {
    if (node.isMesh) {
      node.castShadow = false;
      node.receiveShadow = false;
      node.frustumCulled = false;
    }
  });
  group.add(mesh);
  muzzleFlash = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.085, 0),
    new THREE.MeshBasicMaterial({ color: 0xffd68a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  muzzleFlash.position.set(0, 0.11, index === 0 ? -0.52 : -0.82);
  group.add(muzzleFlash);
  camera.add(group);
  currentViewWeapon = group;
}

function updateAmmoUi() {
  ui.weapon.textContent = weaponNames[activeWeapon];
  ui.weaponKey.textContent = String(activeWeapon + 1);
  ui.ammo.textContent = String(ammo[activeWeapon]).padStart(2, '0');
  ui.ammoUnit.textContent = 'BALAS';
}

function showHitMarker() {
  ui.hit.classList.remove('active');
  void ui.hit.offsetWidth;
  ui.hit.classList.add('active');
}

function addTracer(from, to) {
  const geometry = new THREE.BufferGeometry().setFromPoints([from, to]);
  const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: 0xffd98b, transparent: true, opacity: 0.86 }));
  line.frustumCulled = false;
  scene.add(line);
  shotTracers.push({ line, life: 0.065 });
}

function fire() {
  if (gameState !== 'playing' || !controls.isLocked || ammo[activeWeapon] <= 0) return;
  ammo[activeWeapon] -= 1;
  updateAmmoUi();
  recoil = 1;
  shotFlash = 0.075;
  if (muzzleFlash) muzzleFlash.material.opacity = 1;

  raycaster.setFromCamera(center, camera);
  const enemyRoots = enemies.filter((enemy) => enemy.alive).map((enemy) => enemy.group);
  const hits = raycaster.intersectObjects([environment, ...enemyRoots], true);
  const origin = camera.getWorldPosition(new THREE.Vector3());
  let end = origin.clone().add(camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(28));
  if (hits.length) {
    end = hits[0].point.clone();
    const enemy = hits[0].object.userData.enemy;
    if (enemy?.alive) {
      enemy.hp -= 1;
      enemy.hurtUntil = clockElapsed + 0.16;
      showHitMarker();
      if (enemy.hp <= 0) {
        enemy.alive = false;
        enemy.group.visible = false;
        kills += 1;
        ui.kills.textContent = String(kills);
      }
    }
  }
  addTracer(origin, end);
}

function checkTarget() {
  if (gameState !== 'playing') {
    targetEnemy = null;
    ui.crosshair.classList.remove('is-target');
    return;
  }
  raycaster.setFromCamera(center, camera);
  const enemyRoots = enemies.filter((enemy) => enemy.alive).map((enemy) => enemy.group);
  const hits = raycaster.intersectObjects([environment, ...enemyRoots], true);
  targetEnemy = null;
  if (hits.length) {
    const enemy = hits[0].object.userData.enemy;
    if (enemy?.alive) targetEnemy = enemy;
  }
  ui.crosshair.classList.toggle('is-target', Boolean(targetEnemy));
}

function insideBlock(x, z, radius = 0.43) {
  if (x < -12.4 + radius || x > 12.4 - radius || z < -45.4 + radius || z > 30.2 - radius) return true;
  return staticBlocks.some((block) =>
    x + radius > block.minX && x - radius < block.maxX && z + radius > block.minZ && z - radius < block.maxZ);
}

function movePlayer(dt) {
  let forward = 0;
  let right = 0;
  if (keys.has('KeyW')) forward += 1;
  if (keys.has('KeyS')) forward -= 1;
  if (keys.has('KeyD')) right += 1;
  if (keys.has('KeyA')) right -= 1;
  if (!forward && !right) return false;
  const length = Math.hypot(forward, right);
  forward /= length;
  right /= length;
  const sprint = keys.has('ShiftLeft') || keys.has('ShiftRight');
  const distance = (sprint ? 6.2 : 4.3) * dt;
  const direction = controls.getDirection(new THREE.Vector3());
  const forwardVector = new THREE.Vector3(direction.x, 0, direction.z).normalize();
  const rightVector = new THREE.Vector3().crossVectors(forwardVector, new THREE.Vector3(0, 1, 0)).normalize();
  const movement = forwardVector.multiplyScalar(forward * distance).add(rightVector.multiplyScalar(right * distance));
  const oldX = camera.position.x;
  const oldZ = camera.position.z;
  if (!insideBlock(oldX + movement.x, oldZ)) camera.position.x += movement.x;
  if (!insideBlock(camera.position.x, oldZ + movement.z)) camera.position.z += movement.z;
  if (Math.abs(camera.position.x - oldX) + Math.abs(camera.position.z - oldZ) > 0.0001) {
    walkPhase += dt * (sprint ? 12 : 8);
    return true;
  }
  return false;
}

function moveEnemy(enemy, dx, dz) {
  const oldX = enemy.group.position.x;
  const oldZ = enemy.group.position.z;
  if (!insideBlock(oldX + dx, oldZ, 0.38)) enemy.group.position.x += dx;
  if (!insideBlock(enemy.group.position.x, oldZ + dz, 0.38)) enemy.group.position.z += dz;
}

function damagePlayer(amount) {
  playerHealth = Math.max(0, playerHealth - amount);
  ui.health.textContent = String(playerHealth);
  ui.healthFill.style.width = `${playerHealth}%`;
  ui.damage.classList.add('active');
  window.setTimeout(() => ui.damage.classList.remove('active'), 170);
  screenShake = 0.16;
  if (playerHealth <= 0) finishGame(false);
}

function updateEnemies(dt) {
  const player = new THREE.Vector2(camera.position.x, camera.position.z);
  for (const enemy of enemies) {
    if (!enemy.alive) continue;
    const position = new THREE.Vector2(enemy.group.position.x, enemy.group.position.z);
    const delta = player.clone().sub(position);
    const distance = delta.length();
    if (distance <= 11.5) enemy.active = true;
    if (enemy.active && distance > 0.86) {
      delta.normalize();
      const movement = enemy.speed * dt;
      moveEnemy(enemy, delta.x * movement, delta.y * movement);
      enemy.group.rotation.y = Math.atan2(-delta.x, -delta.y);
      const stride = Math.sin(clockElapsed * 8 + enemy.phase);
      enemy.model.position.y = Math.abs(stride) * 0.045;
      enemy.model.rotation.z = Math.sin(clockElapsed * 5 + enemy.phase) * 0.025;
    } else if (distance <= 0.86 && clockElapsed - enemy.attackAt > 0.9) {
      enemy.attackAt = clockElapsed;
      damagePlayer(20);
    } else {
      enemy.model.position.y = Math.sin(clockElapsed * 1.6 + enemy.phase) * 0.018;
    }
  }
}

function updatePickups() {
  nearPickup = null;
  const player = new THREE.Vector2(camera.position.x, camera.position.z);
  for (const pickup of pickups) {
    if (!pickup.active) continue;
    pickup.group.rotation.y += 0.008;
    pickup.group.position.y = 0.48 + Math.sin(clockElapsed * 1.8 + pickup.phase) * 0.07;
    const distance = player.distanceTo(new THREE.Vector2(pickup.group.position.x, pickup.group.position.z));
    if (distance < 2.1 && (!nearPickup || distance < nearPickup.distance)) nearPickup = { pickup, distance };
  }
  ui.pickup.hidden = !nearPickup;
}

function collectAmmo() {
  if (gameState !== 'playing' || !nearPickup) return;
  const pickup = nearPickup.pickup;
  ammo[0] = Math.min(maxAmmo[0], ammo[0] + ammoGains[0]);
  ammo[1] = Math.min(maxAmmo[1], ammo[1] + ammoGains[1]);
  pickup.active = false;
  pickup.group.visible = false;
  updateAmmoUi();
  ui.pickup.hidden = true;
}

function finishGame(won) {
  if (gameState === 'won' || gameState === 'lost') return;
  gameState = won ? 'won' : 'lost';
  ui.endingTitle.innerHTML = won ? 'MISIÓN COMPLETADA<span>.</span>' : 'GAME OVER<span>.</span>';
  ui.endingCopy.textContent = won ? 'Has llegado a la zona de extracción.' : 'Un infectado te alcanzó en el búnker.';
  ui.endingOverline.textContent = won ? 'EXTRACCIÓN CONFIRMADA · UPN' : 'SEÑAL PERDIDA · OPERACIÓN 07';
  ui.kills.textContent = String(kills);
  ui.ending.hidden = false;
  ui.pause.hidden = true;
  ui.pickup.hidden = true;
  controls.unlock();
}

const keys = new Set();

function resetGame() {
  playerHealth = 100;
  kills = 0;
  ammo[0] = 16;
  ammo[1] = 32;
  activeWeapon = 0;
  gameState = 'paused';
  camera.position.copy(startPosition);
  camera.rotation.set(0, 0, 0);
  keys.clear();
  clockElapsed = 0;
  ui.health.textContent = '100';
  ui.healthFill.style.width = '100%';
  ui.kills.textContent = '0';
  ui.ending.hidden = true;
  ui.pause.hidden = true;
  ui.briefing.hidden = true;
  ui.objective.textContent = 'Llega a la zona de extracción';
  ui.sector.textContent = 'SECTOR 04 · BÚNKER';
  for (const enemy of enemies) {
    enemy.alive = true;
    enemy.hp = 2;
    enemy.active = false;
    enemy.attackAt = 0;
    enemy.group.visible = true;
    enemy.group.position.set(enemy.origin.x, 0, enemy.origin.z);
    enemy.model.position.y = 0;
  }
  for (const pickup of pickups) {
    pickup.active = true;
    pickup.group.visible = true;
    pickup.group.position.y = 0.48;
  }
  updateAmmoUi();
  controls.lock();
}

function updateHud() {
  const distance = Math.max(0, camera.position.distanceTo(new THREE.Vector3(exitPosition.x, camera.position.y, exitPosition.z)));
  ui.distance.textContent = `${Math.ceil(distance)} M`;
  ui.routeFill.style.width = `${Math.max(0, Math.min(100, (1 - distance / 65) * 100))}%`;
  if (camera.position.z < 18) ui.sector.textContent = 'SECTOR 04 · INFESTADO';
  if (camera.position.z < -23) ui.sector.textContent = 'SECTOR 05 · EXTRACCIÓN';
  if (camera.position.z < -34) ui.objective.textContent = 'Entra en la señal verde';
}

const keydown = (event) => {
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) event.preventDefault();
  if (event.repeat) return;
  keys.add(event.code);
  if (event.code === 'Digit1' || event.code === 'Digit2') {
    activeWeapon = event.code === 'Digit1' ? 0 : 1;
    if (weaponModels[activeWeapon]) setupViewWeapon(weaponModels[activeWeapon].scene, activeWeapon);
    updateAmmoUi();
  }
  if (event.code === 'KeyR') collectAmmo();
};
const keyup = (event) => keys.delete(event.code);
window.addEventListener('keydown', keydown);
window.addEventListener('keyup', keyup);
renderer.domElement.addEventListener('mousedown', (event) => {
  if (event.button === 0) fire();
});

controls.addEventListener('lock', () => {
  if (gameState === 'briefing' || gameState === 'paused') gameState = 'playing';
  ui.briefing.hidden = true;
  ui.pause.hidden = true;
  ui.ending.hidden = true;
});
controls.addEventListener('unlock', () => {
  if (gameState === 'playing') {
    gameState = 'paused';
    ui.pause.hidden = false;
  }
});

ui.start.addEventListener('click', () => {
  if (ui.start.disabled) return;
  controls.lock();
});
ui.resume.addEventListener('click', () => controls.lock());
ui.restart.addEventListener('click', resetGame);

function update(dt) {
  clockElapsed += dt;
  if (gameState === 'playing' && controls.isLocked) {
    const moving = movePlayer(dt);
    const bob = moving ? Math.sin(walkPhase) * 0.035 : Math.sin(clockElapsed * 1.15) * 0.008;
    camera.position.y = 1.65 + bob;
    updateEnemies(dt);
    updatePickups();
    if (camera.position.distanceTo(new THREE.Vector3(exitPosition.x, camera.position.y, exitPosition.z)) < 2.55) finishGame(true);
    if (clockElapsed - lastHudAt > 0.1) {
      updateHud();
      checkTarget();
      lastHudAt = clockElapsed;
    }
  }

  if (environment.userData.beacon) {
    const pulse = 1 + Math.sin(clockElapsed * 3.1) * 0.08;
    environment.userData.beacon.scale.setScalar(pulse);
    environment.userData.beaconRing.material.emissiveIntensity = 1.8 + Math.sin(clockElapsed * 3.1) * 0.45;
    environment.userData.beaconLight.intensity = 42 + Math.sin(clockElapsed * 2.8) * 9;
  }

  if (currentViewWeapon) {
    recoil = Math.max(0, recoil - dt * 8);
    currentViewWeapon.position.z += (recoil * 0.055 - (currentViewWeapon.position.z - (activeWeapon === 0 ? -0.64 : -0.7))) * Math.min(1, dt * 14);
    const moving = keys.has('KeyW') || keys.has('KeyS') || keys.has('KeyA') || keys.has('KeyD');
    const sway = moving && gameState === 'playing' ? 1 : 0;
    currentViewWeapon.position.x = (activeWeapon === 0 ? 0.36 : 0.39) + Math.sin(walkPhase * 0.5) * 0.012 * sway;
    currentViewWeapon.position.y = (activeWeapon === 0 ? -0.31 : -0.34) + Math.abs(Math.cos(walkPhase)) * 0.01 * sway;
  }

  if (muzzleFlash) {
    shotFlash = Math.max(0, shotFlash - dt);
    muzzleFlash.material.opacity = shotFlash > 0 ? shotFlash / 0.075 : 0;
    muzzleFlash.scale.setScalar(0.8 + Math.random() * 0.55);
  }

  if (screenShake > 0) {
    screenShake = Math.max(0, screenShake - dt);
    renderer.domElement.style.transform = `translate(${(Math.random() - 0.5) * screenShake * 8}px, ${(Math.random() - 0.5) * screenShake * 8}px)`;
  } else renderer.domElement.style.transform = '';

  for (let i = shotTracers.length - 1; i >= 0; i--) {
    const tracer = shotTracers[i];
    tracer.life -= dt;
    tracer.line.material.opacity = Math.max(0, tracer.life / 0.065) * 0.86;
    if (tracer.life <= 0) {
      scene.remove(tracer.line);
      tracer.line.geometry.dispose();
      tracer.line.material.dispose();
      shotTracers.splice(i, 1);
    }
  }
}

function animate() {
  const dt = Math.min(clock.getDelta(), 0.04);
  update(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

async function initialize() {
  addWorld();
  makeAmmoBox([-5, 0.52, 8], 0);
  makeAmmoBox([5.2, 0.52, -16], 1);
  makeAmmoBox([-5.5, 0.52, -29], 2);
  ui.loading.textContent = 'CARGANDO MODELOS GLB…';

  try {
    const [sidearm, carbine, infected] = await Promise.all(weaponFiles.map(loadGlb).concat([loadGlb('infected.glb')]));
    weaponModels[0] = sidearm;
    weaponModels[1] = carbine;
    setupViewWeapon(sidearm.scene, 0);

    [[-5.2, 3], [4.8, -5], [-4.4, -13], [5.6, -22], [0.8, -33]].forEach(([x, z], index) => createEnemy(infected.scene, x, z, index));

    ui.start.disabled = false;
    ui.startLabel.textContent = 'INICIAR MISIÓN';
    ui.loading.textContent = '';
    updateAmmoUi();
  } catch (error) {
    console.error('No se pudieron cargar los modelos GLB:', error);
    ui.loading.textContent = 'NO SE PUDIERON CARGAR LOS MODELOS. RECARGA LA PÁGINA.';
    ui.startLabel.textContent = 'ERROR DE CARGA';
  }
  animate();
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.7));
});

initialize();
