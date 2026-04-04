import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// ============================================================
// CONSTANTS
// ============================================================
const ARENA_SIZE = 50;
const WALL_HEIGHT = 6;
const WALL_THICKNESS = 2;
const NUM_BOTS = 8;
const CAR_MASS = 150;
const CAR_HALF_EXTENTS = new CANNON.Vec3(1.0, 0.45, 2.1);
const MAX_ENGINE_FORCE = 1500;
const MAX_SPEED = 16; // m/s (~58 km/h)
const ACCELERATION = 22; // m/s² — punchy arcade feel
const BRAKE_DECEL = 25;
const MAX_STEER = 0.6;
const BRAKE_FORCE = 50;
const BOOST_IMPULSE = 500;
const BOOST_COOLDOWN = 3.0;
const RESPAWN_DELAY = 2.0;
const DAMAGE_THRESHOLD_HEAVY = 15;

// ============================================================
// GLOBALS
// ============================================================
let scene, camera, renderer, composer, clock;
let world, groundBody;
let playerVehicle, playerChassis, playerMesh;
let botVehicles = [];
let carModel = null;
let keys = {};
let boostCooldown = 0;
let cameraShake = new THREE.Vector3();
let cameraShakeIntensity = 0;
let score = 0;
let playerDamage = 0;
let playerWrecked = false;
let playerRespawnTimer = 0;
let baseFov = 60;
let currentFov = 60;
let sparkPool, smokePool, firePool, dustPool, debrisPool;
let audioCtx, engineOsc1, engineOsc2, engineFilter, engineGain;
let audioStarted = false;
let arenaProps = [];
let botDamage = [];
let botRespawnTimers = [];
let botWrecked = [];

// HUD elements
let speedValueEl, boostFillEl, scoreEl;

// ============================================================
// SCENE SETUP
// ============================================================
function initScene() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x5a4a2e);
  scene.fog = new THREE.FogExp2(0x8a7a50, 0.006);

  camera = new THREE.PerspectiveCamera(baseFov, window.innerWidth / window.innerHeight, 0.1, 300);
  camera.position.set(0, 10, 15);

  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 2.5;
  document.body.appendChild(renderer.domElement);

  // Post-processing
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.5, 0.4, 0.85
  );
  composer.addPass(bloomPass);

  const vignetteShader = {
    uniforms: {
      tDiffuse: { value: null },
      uTime: { value: 0 },
      uShakeIntensity: { value: 0 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: `
      uniform sampler2D tDiffuse;
      uniform float uTime;
      uniform float uShakeIntensity;
      varying vec2 vUv;
      void main() {
        float aberration = uShakeIntensity * 0.005;
        vec4 color;
        color.r = texture2D(tDiffuse, vUv + vec2(aberration, 0.0)).r;
        color.g = texture2D(tDiffuse, vUv).g;
        color.b = texture2D(tDiffuse, vUv - vec2(aberration, 0.0)).b;
        color.a = 1.0;
        vec2 center = vUv - 0.5;
        float dist = length(center);
        float vig = smoothstep(0.7, 0.2, dist);
        color.rgb *= mix(0.5, 1.0, vig);
        float lum = dot(color.rgb, vec3(0.299, 0.587, 0.114));
        color.rgb = mix(color.rgb * vec3(1.1, 0.9, 0.7), color.rgb * vec3(1.05, 1.0, 0.95), smoothstep(0.0, 0.5, lum));
        float grain = (fract(sin(dot(vUv * uTime * 100.0, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) * 0.04;
        color.rgb += grain;
        gl_FragColor = color;
      }
    `
  };
  const vignettePass = new ShaderPass(vignetteShader);
  composer.addPass(vignettePass);

  clock = new THREE.Clock();

  // Lighting
  const ambientLight = new THREE.AmbientLight(0x998877, 2.5);
  scene.add(ambientLight);

  const hemiLight = new THREE.HemisphereLight(0xffeedd, 0x887755, 1.5);
  scene.add(hemiLight);

  const sunLight = new THREE.DirectionalLight(0xffddaa, 4.0);
  sunLight.position.set(30, 40, 20);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);
  sunLight.shadow.camera.left = -ARENA_SIZE;
  sunLight.shadow.camera.right = ARENA_SIZE;
  sunLight.shadow.camera.top = ARENA_SIZE;
  sunLight.shadow.camera.bottom = -ARENA_SIZE;
  sunLight.shadow.camera.near = 1;
  sunLight.shadow.camera.far = 100;
  sunLight.shadow.bias = -0.001;
  scene.add(sunLight);
  scene.add(sunLight.target);

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
  });

  // Cache HUD elements
  speedValueEl = document.getElementById('speed-value');
  boostFillEl = document.getElementById('boost-fill');
  scoreEl = document.getElementById('score');
}

// ============================================================
// PHYSICS WORLD
// ============================================================
function initPhysics() {
  world = new CANNON.World();
  world.gravity.set(0, -10, 0);
  world.broadphase = new CANNON.SAPBroadphase(world);
  const solver = new CANNON.GSSolver();
  solver.iterations = 10;
  solver.tolerance = 0.01;
  world.solver = new CANNON.SplitSolver(solver);
  world.defaultContactMaterial.friction = 0.3;
  world.defaultContactMaterial.restitution = 0.4;

  const groundMat = new CANNON.Material('ground');
  groundBody = new CANNON.Body({ mass: 0, material: groundMat });
  groundBody.addShape(new CANNON.Plane());
  groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  world.addBody(groundBody);

  const carMat = new CANNON.Material('car');
  world.addContactMaterial(new CANNON.ContactMaterial(carMat, groundMat, {
    friction: 0.5, restitution: 0.1,
  }));
  world.addContactMaterial(new CANNON.ContactMaterial(carMat, carMat, {
    friction: 0.3, restitution: 0.6,
  }));

  const wallMat = new CANNON.Material('wall');
  world.addContactMaterial(new CANNON.ContactMaterial(carMat, wallMat, {
    friction: 0.5, restitution: 0.5,
  }));

  return { carMat, wallMat, groundMat };
}

// ============================================================
// ARENA
// ============================================================
function createArena(wallMat) {
  // Ground plane
  const groundGeo = new THREE.PlaneGeometry(ARENA_SIZE * 2, ARENA_SIZE * 2, 64, 64);
  const colors = new Float32Array(groundGeo.attributes.position.count * 3);
  for (let i = 0; i < groundGeo.attributes.position.count; i++) {
    const x = groundGeo.attributes.position.getX(i);
    const y = groundGeo.attributes.position.getY(i);
    const noise = Math.random() * 0.1;
    colors[i * 3] = 0.35 + noise + Math.sin(x * 0.3) * 0.03;
    colors[i * 3 + 1] = 0.28 + noise * 0.8 + Math.cos(y * 0.2) * 0.02;
    colors[i * 3 + 2] = 0.18 + noise * 0.5;
  }
  groundGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const groundMesh = new THREE.Mesh(groundGeo, new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.95, metalness: 0.0,
  }));
  groundMesh.rotation.x = -Math.PI / 2;
  groundMesh.receiveShadow = true;
  scene.add(groundMesh);

  addGroundDetails();

  // Walls
  const wallPositions = [
    { x: 0, z: -ARENA_SIZE, sx: ARENA_SIZE * 2, sy: WALL_HEIGHT, sz: WALL_THICKNESS },
    { x: 0, z: ARENA_SIZE, sx: ARENA_SIZE * 2, sy: WALL_HEIGHT, sz: WALL_THICKNESS },
    { x: -ARENA_SIZE, z: 0, sx: WALL_THICKNESS, sy: WALL_HEIGHT, sz: ARENA_SIZE * 2 },
    { x: ARENA_SIZE, z: 0, sx: WALL_THICKNESS, sy: WALL_HEIGHT, sz: ARENA_SIZE * 2 },
  ];

  wallPositions.forEach(w => {
    const wallBody = new CANNON.Body({ mass: 0, material: wallMat });
    wallBody.addShape(new CANNON.Box(new CANNON.Vec3(w.sx / 2, w.sy / 2, w.sz / 2)));
    wallBody.position.set(w.x, w.sy / 2, w.z);
    world.addBody(wallBody);

    const wallMesh = new THREE.Mesh(
      new THREE.BoxGeometry(w.sx, w.sy, w.sz),
      new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.9, metalness: 0.1 })
    );
    wallMesh.position.set(w.x, w.sy / 2, w.z);
    wallMesh.castShadow = true;
    wallMesh.receiveShadow = true;
    scene.add(wallMesh);

    // Red stripe on top
    const stripeMesh = new THREE.Mesh(
      new THREE.BoxGeometry(w.sx + 0.1, 0.3, w.sz + 0.1),
      new THREE.MeshStandardMaterial({ color: 0xff3333, roughness: 0.6, emissive: 0x330000 })
    );
    stripeMesh.position.set(w.x, w.sy + 0.15, w.z);
    scene.add(stripeMesh);
  });

  // Corner pylons
  [[-ARENA_SIZE, -ARENA_SIZE], [-ARENA_SIZE, ARENA_SIZE],
   [ARENA_SIZE, -ARENA_SIZE], [ARENA_SIZE, ARENA_SIZE]].forEach(([cx, cz]) => {
    const pylon = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.6, WALL_HEIGHT + 2, 8),
      new THREE.MeshStandardMaterial({ color: 0xffaa00, roughness: 0.4, metalness: 0.6, emissive: 0x332200 })
    );
    pylon.position.set(cx, (WALL_HEIGHT + 2) / 2, cz);
    pylon.castShadow = true;
    scene.add(pylon);
  });

  createArenaProps(wallMat);
}

function addGroundDetails() {
  // Center circle
  const circle = new THREE.Mesh(
    new THREE.RingGeometry(8, 8.3, 64),
    new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.8, side: THREE.DoubleSide })
  );
  circle.rotation.x = -Math.PI / 2;
  circle.position.y = 0.01;
  scene.add(circle);

  // Cross lines
  for (let i = 0; i < 2; i++) {
    const line = new THREE.Mesh(
      new THREE.PlaneGeometry(ARENA_SIZE * 1.8, 0.2),
      new THREE.MeshStandardMaterial({ color: 0x999999, roughness: 0.8 })
    );
    line.rotation.x = -Math.PI / 2;
    line.rotation.z = i * Math.PI / 2;
    line.position.y = 0.01;
    scene.add(line);
  }

  // Skid marks
  for (let i = 0; i < 20; i++) {
    const skid = new THREE.Mesh(
      new THREE.PlaneGeometry(0.3, 5 + Math.random() * 15),
      new THREE.MeshStandardMaterial({
        color: 0x111111, roughness: 1.0, transparent: true, opacity: 0.15 + Math.random() * 0.15
      })
    );
    skid.rotation.x = -Math.PI / 2;
    skid.rotation.z = Math.random() * Math.PI;
    skid.position.set((Math.random() - 0.5) * ARENA_SIZE * 1.5, 0.005, (Math.random() - 0.5) * ARENA_SIZE * 1.5);
    scene.add(skid);
  }
}

function createArenaProps(wallMat) {
  // Tire stacks
  const tirePositions = [
    { x: -20, z: -20 }, { x: 20, z: -20 }, { x: -20, z: 20 }, { x: 20, z: 20 },
    { x: 0, z: -30 }, { x: 0, z: 30 }, { x: -30, z: 0 }, { x: 30, z: 0 },
    { x: -18, z: -8 }, { x: 18, z: 8 }, { x: -8, z: -18 }, { x: 8, z: 18 },
  ];

  tirePositions.forEach(pos => {
    const numTires = 2 + Math.floor(Math.random() * 3);
    const tireGroup = new THREE.Group();
    for (let t = 0; t < numTires; t++) {
      const tire = new THREE.Mesh(
        new THREE.TorusGeometry(0.6, 0.25, 8, 16),
        new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.95 })
      );
      tire.position.set((Math.random() - 0.5) * 0.5, 0.25 + t * 0.5 - (numTires * 0.5 + 0.5) / 2, (Math.random() - 0.5) * 0.5);
      tire.rotation.x = Math.PI / 2 + (Math.random() - 0.5) * 0.2;
      tire.castShadow = true;
      tire.receiveShadow = true;
      tireGroup.add(tire);
    }
    tireGroup.position.set(pos.x, (numTires * 0.5 + 0.5) / 2, pos.z);
    scene.add(tireGroup);

    const tireBody = new CANNON.Body({ mass: 5, material: wallMat });
    tireBody.addShape(new CANNON.Cylinder(0.7, 0.7, numTires * 0.5 + 0.5, 8));
    tireBody.position.set(pos.x, (numTires * 0.5 + 0.5) / 2, pos.z);
    tireBody.linearDamping = 0.5;
    tireBody.angularDamping = 0.5;
    world.addBody(tireBody);
    arenaProps.push({ body: tireBody, mesh: tireGroup });
  });

  // Oil barrels
  const barrelPositions = [
    { x: -10, z: -25 }, { x: 10, z: -25 }, { x: -10, z: 25 }, { x: 10, z: 25 },
    { x: -25, z: -10 }, { x: 25, z: 10 },
  ];
  const barrelColors = [0xff4400, 0x0066ff, 0xffaa00, 0x00aa44];

  barrelPositions.forEach(pos => {
    const barrelMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.5, 1.2, 12),
      new THREE.MeshStandardMaterial({
        color: barrelColors[Math.floor(Math.random() * barrelColors.length)],
        roughness: 0.5, metalness: 0.4,
      })
    );
    barrelMesh.position.set(pos.x, 0.6, pos.z);
    barrelMesh.castShadow = true;
    barrelMesh.receiveShadow = true;
    scene.add(barrelMesh);

    const barrelBody = new CANNON.Body({ mass: 10, material: wallMat });
    barrelBody.addShape(new CANNON.Cylinder(0.5, 0.5, 1.2, 12));
    barrelBody.position.set(pos.x, 0.6, pos.z);
    barrelBody.linearDamping = 0.3;
    barrelBody.angularDamping = 0.3;
    world.addBody(barrelBody);
    arenaProps.push({ body: barrelBody, mesh: barrelMesh });
  });

  // Center ramp — launches cars into the air!
  const rampWidth = 6, rampLength = 8, rampHeight = 1.8;
  const rampGeo = new THREE.BoxGeometry(rampWidth, 0.3, rampLength);
  const rampMat = new THREE.MeshStandardMaterial({
    color: 0xddaa44, roughness: 0.6, metalness: 0.3,
  });
  const rampMesh = new THREE.Mesh(rampGeo, rampMat);
  rampMesh.position.set(12, rampHeight / 2, 12);
  rampMesh.rotation.x = Math.atan2(rampHeight, rampLength);
  rampMesh.castShadow = true;
  rampMesh.receiveShadow = true;
  scene.add(rampMesh);

  // Ramp physics — angled box
  const rampBody = new CANNON.Body({ mass: 0, material: wallMat });
  rampBody.addShape(new CANNON.Box(new CANNON.Vec3(rampWidth / 2, 0.15, rampLength / 2)));
  rampBody.position.set(12, rampHeight / 2, 12);
  rampBody.quaternion.setFromEuler(Math.atan2(rampHeight, rampLength), 0, 0);
  world.addBody(rampBody);

  // Second ramp on opposite side
  const rampMesh2 = rampMesh.clone();
  rampMesh2.position.set(-12, rampHeight / 2, -12);
  rampMesh2.rotation.x = Math.atan2(rampHeight, rampLength);
  rampMesh2.rotation.y = Math.PI;
  scene.add(rampMesh2);

  const rampBody2 = new CANNON.Body({ mass: 0, material: wallMat });
  rampBody2.addShape(new CANNON.Box(new CANNON.Vec3(rampWidth / 2, 0.15, rampLength / 2)));
  rampBody2.position.set(-12, rampHeight / 2, -12);
  const rampQ2 = new CANNON.Quaternion();
  rampQ2.setFromEuler(Math.atan2(rampHeight, rampLength), Math.PI, 0);
  rampBody2.quaternion.copy(rampQ2);
  world.addBody(rampBody2);

  // Warning stripes on ramps
  const stripeGeo = new THREE.PlaneGeometry(rampWidth - 0.5, 0.3);
  const stripeMat = new THREE.MeshStandardMaterial({
    color: 0xff6600, emissive: 0x331100, roughness: 0.5
  });
  for (let s = 0; s < 4; s++) {
    const stripe = new THREE.Mesh(stripeGeo, stripeMat);
    stripe.position.set(12, rampHeight / 2 + 0.2 + s * 0.1, 12 - rampLength / 2 + 1 + s * 1.8);
    stripe.rotation.x = -Math.PI / 2 + Math.atan2(rampHeight, rampLength);
    scene.add(stripe);
  }
}

// ============================================================
// CAR CREATION
// ============================================================
function createVehicle(position, carMat) {
  const chassisShape = new CANNON.Box(CAR_HALF_EXTENTS);
  const chassisBody = new CANNON.Body({ mass: CAR_MASS, material: carMat });
  chassisBody.addShape(chassisShape, new CANNON.Vec3(0, -0.3, 0));
  chassisBody.position.copy(position);
  chassisBody.angularDamping = 0.9;
  chassisBody.linearDamping = 0.05;

  const vehicle = new CANNON.RaycastVehicle({
    chassisBody,
    indexRightAxis: 0,
    indexForwardAxis: 2,
    indexUpAxis: 1,
  });

  const wheelOpts = {
    radius: 0.4,
    directionLocal: new CANNON.Vec3(0, -1, 0),
    suspensionStiffness: 200,
    suspensionRestLength: 0.35,
    frictionSlip: 5.0,
    dampingRelaxation: 4.0,
    dampingCompression: 6.0,
    maxSuspensionForce: 100000,
    rollInfluence: 0.05,
    axleLocal: new CANNON.Vec3(1, 0, 0),
    maxSuspensionTravel: 0.4,
    customSlidingRotationalSpeed: -30,
    useCustomSlidingRotationalSpeed: true,
  };

  // Front wheels (steering) — at -Z end (car faces -Z)
  vehicle.addWheel({ ...wheelOpts, chassisConnectionPointLocal: new CANNON.Vec3(-0.85, -0.1, -1.3) });
  vehicle.addWheel({ ...wheelOpts, chassisConnectionPointLocal: new CANNON.Vec3(0.85, -0.1, -1.3) });
  // Rear wheels (drive) — at +Z end (behind the car)
  vehicle.addWheel({ ...wheelOpts, chassisConnectionPointLocal: new CANNON.Vec3(-0.9, -0.1, 1.4), frictionSlip: 3.5 });
  vehicle.addWheel({ ...wheelOpts, chassisConnectionPointLocal: new CANNON.Vec3(0.9, -0.1, 1.4), frictionSlip: 3.5 });

  vehicle.addToWorld(world);

  const wheelMeshes = [];
  for (let i = 0; i < 4; i++) {
    const wheelGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.3, 16);
    wheelGeo.rotateZ(Math.PI / 2);
    const wheelMesh = new THREE.Mesh(wheelGeo, new THREE.MeshStandardMaterial({
      color: 0x222222, roughness: 0.8, metalness: 0.2,
    }));
    wheelMesh.castShadow = true;
    scene.add(wheelMesh);
    wheelMeshes.push(wheelMesh);
  }

  return { vehicle, chassisBody, wheelMeshes };
}

function createCarMesh(color) {
  const group = new THREE.Group();

  if (carModel) {
    const clone = carModel.clone();
    const tint = new THREE.Color(color);
    clone.traverse(child => {
      if (child.isMesh) {
        child.material = child.material.clone();
        // Blend original color with tint (40% tint, 60% original)
        child.material.color.lerp(tint, 0.4);
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    group.add(clone);
  } else {
    // Procedural car
    const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.6 });

    // Main body
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.7, 4.0), bodyMat);
    body.position.y = 0.35;
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    // Cabin
    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 0.6, 1.8),
      new THREE.MeshStandardMaterial({ color: 0x333344, roughness: 0.2, metalness: 0.8 })
    );
    cabin.position.set(0, 0.85, -0.2);
    cabin.castShadow = true;
    group.add(cabin);

    // Roll cage
    const cageMat = new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.3, metalness: 0.9 });
    const barGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.7, 6);
    [[-0.75, 0.7, 0.5], [0.75, 0.7, 0.5], [-0.75, 0.7, -0.9], [0.75, 0.7, -0.9]].forEach(([x, y, z]) => {
      const bar = new THREE.Mesh(barGeo, cageMat);
      bar.position.set(x, y, z);
      group.add(bar);
    });
    const topBarGeo = new THREE.CylinderGeometry(0.04, 0.04, 1.5, 6);
    topBarGeo.rotateZ(Math.PI / 2);
    [0.5, -0.9].forEach(z => {
      const bar = new THREE.Mesh(topBarGeo, cageMat);
      bar.position.set(0, 1.05, z);
      group.add(bar);
    });

    // Bumpers
    const bumperMat = new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.3, metalness: 0.8 });
    const bumperGeo = new THREE.BoxGeometry(2.2, 0.3, 0.3);
    const fb = new THREE.Mesh(bumperGeo, bumperMat);
    fb.position.set(0, 0.2, 2.1);
    fb.castShadow = true;
    group.add(fb);
    const rb = new THREE.Mesh(bumperGeo, bumperMat);
    rb.position.set(0, 0.2, -2.1);
    group.add(rb);

    // Headlights
    const hlMat = new THREE.MeshStandardMaterial({ color: 0xffffcc, emissive: 0xffffcc, emissiveIntensity: 2.0 });
    [[-0.6, 0.4, 2.01], [0.6, 0.4, 2.01]].forEach(([x, y, z]) => {
      const hl = new THREE.Mesh(new THREE.CircleGeometry(0.12, 8), hlMat);
      hl.position.set(x, y, z);
      group.add(hl);
    });

    // Exhaust pipes
    const exhGeo = new THREE.CylinderGeometry(0.08, 0.1, 0.4, 8);
    exhGeo.rotateX(Math.PI / 2);
    const exhMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.2, metalness: 0.9 });
    [[-0.5, 0.15, -2.2], [0.5, 0.15, -2.2]].forEach(([x, y, z]) => {
      group.add(new THREE.Mesh(exhGeo, exhMat).translateX(x).translateY(y).translateZ(z));
    });

    // Racing number
    const num = Math.floor(Math.random() * 99) + 1;
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'white';
    ctx.font = 'bold 48px Impact';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(num), 64, 32);
    const numTex = new THREE.CanvasTexture(canvas);
    const numMat = new THREE.MeshBasicMaterial({ map: numTex, transparent: true });
    const numGeo = new THREE.PlaneGeometry(0.8, 0.4);
    const numL = new THREE.Mesh(numGeo, numMat);
    numL.position.set(-1.01, 0.5, 0);
    numL.rotation.y = -Math.PI / 2;
    group.add(numL);
    const numR = new THREE.Mesh(numGeo, numMat);
    numR.position.set(1.01, 0.5, 0);
    numR.rotation.y = Math.PI / 2;
    group.add(numR);
  }

  scene.add(group);
  return group;
}

// ============================================================
// PARTICLE SYSTEMS
// ============================================================
class ParticlePool {
  constructor(count, material, size = 0.2) {
    this.count = count;
    this.geometry = new THREE.BufferGeometry();
    this.positions = new Float32Array(count * 3);
    this.velocities = new Float32Array(count * 3);
    this.lifetimes = new Float32Array(count);
    this.maxLifetimes = new Float32Array(count);
    this.sizes = new Float32Array(count);
    this.active = new Uint8Array(count);

    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('size', new THREE.BufferAttribute(this.sizes, 1));

    this.points = new THREE.Points(this.geometry, material);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.baseSize = size;
  }

  emit(pos, vel, lifetime, count = 1) {
    let emitted = 0;
    for (let i = 0; i < this.count && emitted < count; i++) {
      if (!this.active[i]) {
        this.positions[i * 3] = pos.x + (Math.random() - 0.5) * 0.3;
        this.positions[i * 3 + 1] = pos.y + (Math.random() - 0.5) * 0.3;
        this.positions[i * 3 + 2] = pos.z + (Math.random() - 0.5) * 0.3;
        this.velocities[i * 3] = vel.x + (Math.random() - 0.5) * vel.x * 0.5;
        this.velocities[i * 3 + 1] = vel.y + (Math.random() - 0.5) * vel.y * 0.5;
        this.velocities[i * 3 + 2] = vel.z + (Math.random() - 0.5) * vel.z * 0.5;
        this.lifetimes[i] = lifetime;
        this.maxLifetimes[i] = lifetime;
        this.sizes[i] = this.baseSize * (0.5 + Math.random());
        this.active[i] = 1;
        emitted++;
      }
    }
  }

  update(dt, gravity = -5) {
    for (let i = 0; i < this.count; i++) {
      if (!this.active[i]) continue;
      this.lifetimes[i] -= dt;
      if (this.lifetimes[i] <= 0) {
        this.active[i] = 0;
        this.sizes[i] = 0;
        continue;
      }
      const t = this.lifetimes[i] / this.maxLifetimes[i];
      this.velocities[i * 3 + 1] += gravity * dt;
      this.positions[i * 3] += this.velocities[i * 3] * dt;
      this.positions[i * 3 + 1] += this.velocities[i * 3 + 1] * dt;
      this.positions[i * 3 + 2] += this.velocities[i * 3 + 2] * dt;
      this.sizes[i] = this.baseSize * t;
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.size.needsUpdate = true;
  }
}

function initParticles() {
  sparkPool = new ParticlePool(500, new THREE.PointsMaterial({
    color: 0xffaa33, size: 0.15, transparent: true, opacity: 0.9,
    blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
  }), 0.15);

  smokePool = new ParticlePool(300, new THREE.PointsMaterial({
    color: 0x444444, size: 0.8, transparent: true, opacity: 0.4,
    depthWrite: false, sizeAttenuation: true,
  }), 0.8);

  firePool = new ParticlePool(200, new THREE.PointsMaterial({
    color: 0xff4400, size: 0.5, transparent: true, opacity: 0.7,
    blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
  }), 0.5);

  dustPool = new ParticlePool(400, new THREE.PointsMaterial({
    color: 0x998866, size: 0.4, transparent: true, opacity: 0.3,
    depthWrite: false, sizeAttenuation: true,
  }), 0.4);

  debrisPool = new ParticlePool(200, new THREE.PointsMaterial({
    color: 0x333333, size: 0.2, transparent: true, opacity: 0.8,
    sizeAttenuation: true,
  }), 0.2);
}

// ============================================================
// AUDIO
// ============================================================
function initAudio() {
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();

  engineOsc1 = audioCtx.createOscillator();
  engineOsc2 = audioCtx.createOscillator();
  engineOsc1.type = 'sawtooth';
  engineOsc2.type = 'sawtooth';
  engineOsc1.frequency.value = 80;
  engineOsc2.frequency.value = 82;

  engineFilter = audioCtx.createBiquadFilter();
  engineFilter.type = 'lowpass';
  engineFilter.frequency.value = 400;
  engineFilter.Q.value = 5;

  engineGain = audioCtx.createGain();
  engineGain.gain.value = 0;

  const distortion = audioCtx.createWaveShaper();
  const curve = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const x = (i / 128) - 1;
    curve[i] = (Math.PI + 20) * x / (Math.PI + 20 * Math.abs(x));
  }
  distortion.curve = curve;

  engineOsc1.connect(engineFilter);
  engineOsc2.connect(engineFilter);
  engineFilter.connect(distortion);
  distortion.connect(engineGain);
  engineGain.connect(audioCtx.destination);

  engineOsc1.start();
  engineOsc2.start();

  // Crowd ambience — filtered noise with slow modulation
  const crowdBufferSize = audioCtx.sampleRate * 4;
  const crowdBuffer = audioCtx.createBuffer(1, crowdBufferSize, audioCtx.sampleRate);
  const crowdData = crowdBuffer.getChannelData(0);
  for (let i = 0; i < crowdBufferSize; i++) {
    crowdData[i] = (Math.random() * 2 - 1) * 0.3;
  }
  const crowdSource = audioCtx.createBufferSource();
  crowdSource.buffer = crowdBuffer;
  crowdSource.loop = true;
  const crowdFilter = audioCtx.createBiquadFilter();
  crowdFilter.type = 'bandpass';
  crowdFilter.frequency.value = 600;
  crowdFilter.Q.value = 0.5;
  const crowdGain = audioCtx.createGain();
  crowdGain.gain.value = 0.06;
  crowdSource.connect(crowdFilter);
  crowdFilter.connect(crowdGain);
  crowdGain.connect(audioCtx.destination);
  crowdSource.start();

  audioStarted = true;
}

function updateEngineSound(speed, accelerating) {
  if (!audioStarted) return;
  const speedNorm = Math.min(Math.abs(speed) / 40, 1);
  const baseFreq = 60 + speedNorm * 250;
  engineOsc1.frequency.setTargetAtTime(baseFreq, audioCtx.currentTime, 0.1);
  engineOsc2.frequency.setTargetAtTime(baseFreq * 1.01, audioCtx.currentTime, 0.1);
  engineFilter.frequency.setTargetAtTime(300 + speedNorm * 2000, audioCtx.currentTime, 0.1);
  const targetVol = accelerating ? 0.12 + speedNorm * 0.08 : 0.04 + speedNorm * 0.04;
  engineGain.gain.setTargetAtTime(targetVol, audioCtx.currentTime, 0.1);
}

function playCrashSound(intensity) {
  if (!audioStarted) return;
  const bufferSize = audioCtx.sampleRate * 0.3;
  const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    const t = i / bufferSize;
    data[i] = (Math.random() * 2 - 1) * Math.exp(-t * 8) * intensity;
  }
  const source = audioCtx.createBufferSource();
  source.buffer = buffer;
  const filter = audioCtx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = intensity > 0.7 ? 3000 : 1500;
  const gain = audioCtx.createGain();
  gain.gain.value = Math.min(intensity * 0.5, 0.4);
  source.connect(filter);
  filter.connect(gain);
  gain.connect(audioCtx.destination);
  source.start();
}

function playBoostSound() {
  if (!audioStarted) return;
  const bufferSize = audioCtx.sampleRate * 0.5;
  const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    const t = i / bufferSize;
    data[i] = (Math.random() * 2 - 1) * Math.sin(t * Math.PI) * 0.3;
  }
  const source = audioCtx.createBufferSource();
  source.buffer = buffer;
  const filter = audioCtx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 800;
  filter.Q.value = 2;
  filter.frequency.setValueAtTime(400, audioCtx.currentTime);
  filter.frequency.linearRampToValueAtTime(2000, audioCtx.currentTime + 0.5);
  const gain = audioCtx.createGain();
  gain.gain.value = 0.3;
  source.connect(filter);
  filter.connect(gain);
  gain.connect(audioCtx.destination);
  source.start();
}

function playScreechSound(intensity) {
  if (!audioStarted) return;
  const osc = audioCtx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.value = 800 + Math.random() * 400;
  const filter = audioCtx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 2000;
  filter.Q.value = 10;
  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(intensity * 0.06, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
  osc.connect(filter);
  filter.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + 0.3);
}

// ============================================================
// CONTROLS
// ============================================================
function initControls() {
  window.addEventListener('keydown', e => {
    keys[e.key.toLowerCase()] = true;
    if (e.key === ' ') e.preventDefault();
    if (!audioStarted) initAudio();
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  });
  window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });
  window.addEventListener('click', () => {
    if (!audioStarted) initAudio();
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  });
}

// ============================================================
// AI BOT LOGIC
// ============================================================
function updateBot(index, dt) {
  const bot = botVehicles[index];
  if (!bot) return;

  if (botWrecked[index]) {
    botRespawnTimers[index] -= dt;
    if (botRespawnTimers[index] <= 0) respawnBot(index);
    return;
  }

  const pos = bot.chassisBody.position;
  const vel = bot.chassisBody.velocity;
  const speed = Math.sqrt(vel.x * vel.x + vel.z * vel.z);

  // Find nearest target
  let nearestDist = Infinity;
  let targetPos = new CANNON.Vec3(0, 0, 0);

  if (!playerWrecked) {
    const dx = playerChassis.position.x - pos.x;
    const dz = playerChassis.position.z - pos.z;
    const d = dx * dx + dz * dz;
    if (d < nearestDist) {
      nearestDist = d;
      targetPos.copy(playerChassis.position);
    }
  }

  for (let j = 0; j < botVehicles.length; j++) {
    if (j === index || botWrecked[j]) continue;
    const op = botVehicles[j].chassisBody.position;
    const dx = op.x - pos.x;
    const dz = op.z - pos.z;
    const d = dx * dx + dz * dz;
    if (d < nearestDist) {
      nearestDist = d;
      targetPos.copy(op);
    }
  }

  // Bias toward center when far out
  if (Math.sqrt(pos.x * pos.x + pos.z * pos.z) > ARENA_SIZE * 0.6) {
    targetPos.set(0, 0, 0);
  }

  // Steering — forward is -Z in local space (RaycastVehicle convention)
  const forward = new CANNON.Vec3(0, 0, -1);
  const worldForward = bot.chassisBody.quaternion.vmult(forward);
  const toTarget = new CANNON.Vec3(targetPos.x - pos.x, 0, targetPos.z - pos.z);
  toTarget.normalize();

  const cross = worldForward.x * toTarget.z - worldForward.z * toTarget.x;
  const dot = worldForward.x * toTarget.x + worldForward.z * toTarget.z;

  let steerValue = Math.max(-MAX_STEER, Math.min(MAX_STEER, -cross * 2.5));

  // Wall avoidance
  const wallMargin = ARENA_SIZE - 8;
  if (pos.x > wallMargin) steerValue -= 0.3;
  if (pos.x < -wallMargin) steerValue += 0.3;
  if (pos.z > wallMargin) steerValue -= Math.sign(worldForward.x) * 0.3;
  if (pos.z < -wallMargin) steerValue += Math.sign(worldForward.x) * 0.3;

  // Direct velocity control for bots (same arcade approach as player)
  const botFwd = bot.chassisBody.quaternion.vmult(new CANNON.Vec3(0, 0, -1));
  const botVel = bot.chassisBody.velocity;
  const botForwardSpeed = botFwd.x * botVel.x + botFwd.z * botVel.z;
  const botMaxSpeed = 13;
  if (dot > -0.3 && botForwardSpeed < botMaxSpeed) {
    botVel.x += botFwd.x * 18 * dt;
    botVel.z += botFwd.z * 18 * dt;
  } else if (dot <= -0.3) {
    botVel.x -= botFwd.x * 10 * dt;
    botVel.z -= botFwd.z * 10 * dt;
  }

  bot.vehicle.setSteeringValue(steerValue, 0);
  bot.vehicle.setSteeringValue(steerValue, 1);
  bot.vehicle.applyEngineForce(dot > -0.3 ? -80 : 80, 2);
  bot.vehicle.applyEngineForce(dot > -0.3 ? -80 : 80, 3);

  // Also apply steering torque for bots
  if (Math.abs(steerValue) > 0.1) {
    bot.chassisBody.angularVelocity.y += -steerValue * 50 * dt * Math.min(speed / 5, 1);
  }


  if (speed > 3) {
    dustPool.emit(
      { x: pos.x, y: 0.2, z: pos.z },
      { x: (Math.random() - 0.5) * 2, y: 1 + Math.random(), z: (Math.random() - 0.5) * 2 },
      0.5 + Math.random() * 0.5, 1
    );
  }
}

function respawnBot(index) {
  const angle = Math.random() * Math.PI * 2;
  const dist = ARENA_SIZE * 0.7;
  const bot = botVehicles[index];
  bot.chassisBody.position.set(Math.cos(angle) * dist, 2, Math.sin(angle) * dist);
  bot.chassisBody.quaternion.setFromEuler(0, angle + Math.PI, 0);
  bot.chassisBody.velocity.setZero();
  bot.chassisBody.angularVelocity.setZero();
  bot.chassisBody.wakeUp();

  botDamage[index] = 0;
  botWrecked[index] = false;
  botRespawnTimers[index] = 0;

  if (bot.mesh) {
    bot.mesh.visible = true;
    bot.mesh.traverse(child => {
      if (child.isMesh && child.material) {
        child.material.emissive = new THREE.Color(0);
        child.material.emissiveIntensity = 0;
      }
    });
  }
}

// ============================================================
// COLLISION HANDLING
// ============================================================
function setupCollisions() {
  world.addEventListener('beginContact', (event) => {
    const { bodyA, bodyB } = event;
    const relVel = new CANNON.Vec3();
    bodyA.velocity.vsub(bodyB.velocity, relVel);
    const impactSpeed = relVel.length();
    if (impactSpeed < 6) return;

    const intensity = Math.min(impactSpeed / 25, 1);
    const contactPoint = new THREE.Vector3(
      (bodyA.position.x + bodyB.position.x) / 2,
      (bodyA.position.y + bodyB.position.y) / 2,
      (bodyA.position.z + bodyB.position.z) / 2,
    );

    const normal = new THREE.Vector3(
      bodyA.position.x - bodyB.position.x, 0.5,
      bodyA.position.z - bodyB.position.z
    ).normalize();

    sparkPool.emit(contactPoint,
      { x: normal.x * 10, y: 5 + Math.random() * 5, z: normal.z * 10 },
      0.2 + Math.random() * 0.2, Math.floor(intensity * 20) + 5
    );
    debrisPool.emit(contactPoint,
      { x: (Math.random() - 0.5) * 8, y: 3 + Math.random() * 5, z: (Math.random() - 0.5) * 8 },
      0.5 + Math.random() * 0.3, Math.floor(intensity * 8)
    );

    if (bodyA === playerChassis || bodyB === playerChassis) {
      cameraShakeIntensity = Math.max(cameraShakeIntensity, intensity * 1.5);
      playerDamage += impactSpeed > DAMAGE_THRESHOLD_HEAVY ? 2 : 1;
      checkPlayerDamageState();
    }

    for (let i = 0; i < botVehicles.length; i++) {
      if (bodyA === botVehicles[i].chassisBody || bodyB === botVehicles[i].chassisBody) {
        botDamage[i] += impactSpeed > DAMAGE_THRESHOLD_HEAVY ? 2 : 1;
        checkBotDamageState(i);
      }
    }

    // Extra knockback for satisfying demolition feel
    if (impactSpeed > 8) {
      const knockbackDir = new CANNON.Vec3(
        bodyB.position.x - bodyA.position.x, 0.3,
        bodyB.position.z - bodyA.position.z
      );
      knockbackDir.normalize();
      const knockForce = impactSpeed * 12;
      if (bodyB.mass > 0) bodyB.applyImpulse(knockbackDir.scale(knockForce));
      if (bodyA.mass > 0) bodyA.applyImpulse(knockbackDir.scale(-knockForce));
    }

    playCrashSound(intensity);
  });
}

// Anti-flip corrective torque
function preventFlip(chassisBody) {
  const up = new CANNON.Vec3(0, 1, 0);
  const worldUp = chassisBody.quaternion.vmult(up);

  // Always apply stabilizing torque — stronger the more tilted
  const tiltAmount = 1 - worldUp.y; // 0 = upright, 1 = sideways
  const stabilizeForce = 15 + tiltAmount * 30;
  chassisBody.torque.x -= chassisBody.angularVelocity.x * stabilizeForce;
  chassisBody.torque.z -= chassisBody.angularVelocity.z * stabilizeForce;
  // Hard reset if fully flipped — extract yaw and rebuild quaternion
  if (worldUp.y < 0.1) {
    const q = chassisBody.quaternion;
    const yaw = Math.atan2(2 * (q.w * q.y), 1 - 2 * q.y * q.y);
    chassisBody.quaternion.setFromEuler(0, yaw, 0);
    chassisBody.angularVelocity.set(0, chassisBody.angularVelocity.y * 0.5, 0);
    chassisBody.position.y += 1.5;
  }
}

function checkPlayerDamageState() {
  if (playerDamage >= 35 && !playerWrecked) {
    playerWrecked = true;
    playerRespawnTimer = RESPAWN_DELAY;
    document.getElementById('wrecked-overlay').classList.add('show');
    const pos = playerChassis.position;
    firePool.emit({ x: pos.x, y: pos.y + 0.5, z: pos.z }, { x: 0, y: 5, z: 0 }, 1.0, 30);
    sparkPool.emit({ x: pos.x, y: pos.y + 0.5, z: pos.z }, { x: 0, y: 8, z: 0 }, 0.5, 40);
    cameraShakeIntensity = 2.0;
  }
}

function checkBotDamageState(index) {
  const bot = botVehicles[index];
  if (botDamage[index] >= 4 && botDamage[index] < 8 && bot.mesh) {
    bot.mesh.traverse(child => {
      if (child.isMesh && child.material) {
        child.material.emissive = new THREE.Color(0x331100);
        child.material.emissiveIntensity = 0.3;
      }
    });
  }
  if (botDamage[index] >= 15 && !botWrecked[index]) {
    botWrecked[index] = true;
    botRespawnTimers[index] = RESPAWN_DELAY;
    score++;
    scoreEl.textContent = String(score);

    const pos = bot.chassisBody.position;
    firePool.emit({ x: pos.x, y: pos.y + 0.5, z: pos.z }, { x: 0, y: 5, z: 0 }, 1.0, 25);
    sparkPool.emit({ x: pos.x, y: pos.y + 0.5, z: pos.z }, { x: 0, y: 8, z: 0 }, 0.5, 30);

    if (bot.mesh) bot.mesh.visible = false;
    bot.chassisBody.velocity.setZero();
    bot.chassisBody.angularVelocity.setZero();
    playCrashSound(1.0);
    cameraShakeIntensity = Math.max(cameraShakeIntensity, 0.5);
  }
}

function respawnPlayer() {
  playerChassis.position.set(0, 2, 0);
  playerChassis.quaternion.setFromEuler(0, 0, 0);
  playerChassis.velocity.setZero();
  playerChassis.angularVelocity.setZero();
  playerChassis.wakeUp();
  playerDamage = 0;
  playerWrecked = false;
  document.getElementById('wrecked-overlay').classList.remove('show');
  if (playerMesh) {
    playerMesh.traverse(child => {
      if (child.isMesh && child.material) {
        child.material.emissive = new THREE.Color(0);
        child.material.emissiveIntensity = 0;
      }
    });
  }
}

// ============================================================
// SKY + STADIUM
// ============================================================
function createSky() {
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(200, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: {},
      vertexShader: `
        varying vec3 vWorldPosition;
        void main() {
          vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vWorldPosition;
        void main() {
          float h = normalize(vWorldPosition).y;
          vec3 skyTop = vec3(0.4, 0.6, 0.9);
          vec3 skyHorizon = vec3(0.85, 0.75, 0.6);
          vec3 ground = vec3(0.3, 0.25, 0.15);
          vec3 color = mix(skyHorizon, skyTop, max(h, 0.0));
          color = mix(ground, color, smoothstep(-0.1, 0.05, h));
          float sunDot = max(dot(normalize(vWorldPosition), normalize(vec3(30.0, 40.0, 20.0))), 0.0);
          color += vec3(1.0, 0.8, 0.4) * pow(sunDot, 32.0) * 0.5;
          color += vec3(1.0, 0.9, 0.7) * pow(sunDot, 8.0) * 0.2;
          gl_FragColor = vec4(color, 1.0);
        }
      `
    })
  );
  scene.add(sky);
}

function createStadium() {
  const standMat = new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.9, metalness: 0.1 });
  const standDepth = 15;
  const standOffset = ARENA_SIZE + standDepth / 2 + WALL_THICKNESS;

  const sides = [
    { x: 0, z: -standOffset, ry: 0 },
    { x: 0, z: standOffset, ry: Math.PI },
    { x: -standOffset, z: 0, ry: Math.PI / 2 },
    { x: standOffset, z: 0, ry: -Math.PI / 2 },
  ];

  const crowdColors = [0xff3333, 0x3333ff, 0xffff33, 0x33ff33, 0xff6600, 0xffffff];
  const dotGeo = new THREE.SphereGeometry(0.2, 4, 4);

  sides.forEach(side => {
    for (let tier = 0; tier < 3; tier++) {
      const tierMesh = new THREE.Mesh(
        new THREE.BoxGeometry(ARENA_SIZE * 1.8, 1.5, standDepth / 3),
        standMat
      );
      const yOffset = tier * 2.5 + 1;
      const dir = new THREE.Vector3(-Math.sin(side.ry), 0, -Math.cos(side.ry));
      tierMesh.position.set(side.x + dir.x * tier * 2, yOffset, side.z + dir.z * tier * 2);
      tierMesh.rotation.y = side.ry;
      tierMesh.receiveShadow = true;
      scene.add(tierMesh);
    }

    for (let c = 0; c < 200; c++) {
      const dot = new THREE.Mesh(dotGeo, new THREE.MeshBasicMaterial({
        color: crowdColors[Math.floor(Math.random() * crowdColors.length)]
      }));
      const tier = Math.floor(Math.random() * 3);
      const spread = (Math.random() - 0.5) * ARENA_SIZE * 1.6;
      const dir = new THREE.Vector3(-Math.sin(side.ry), 0, -Math.cos(side.ry));
      dot.position.set(
        side.x + spread * Math.cos(side.ry) + dir.x * tier * 2,
        tier * 2.5 + 2.2,
        side.z + spread * Math.sin(side.ry + Math.PI / 2) + dir.z * tier * 2
      );
      scene.add(dot);
    }
  });

  // Floodlight poles
  [[-ARENA_SIZE - 5, -ARENA_SIZE - 5], [ARENA_SIZE + 5, -ARENA_SIZE - 5],
   [-ARENA_SIZE - 5, ARENA_SIZE + 5], [ARENA_SIZE + 5, ARENA_SIZE + 5]].forEach(([x, z]) => {
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.4, 20, 8),
      new THREE.MeshStandardMaterial({ color: 0x777777, roughness: 0.5, metalness: 0.7 })
    );
    pole.position.set(x, 10, z);
    pole.castShadow = true;
    scene.add(pole);

    const fix = new THREE.Mesh(
      new THREE.BoxGeometry(2, 1, 2),
      new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffcc, emissiveIntensity: 1.5 })
    );
    fix.position.set(x, 20.5, z);
    scene.add(fix);
  });
}

// ============================================================
// LOAD CAR MODEL
// ============================================================
async function loadCarModel() {
  const loader = new GLTFLoader();
  try {
    const gltf = await loader.loadAsync('assets/car.glb');
    carModel = gltf.scene;
    // Scale to fit car dimensions
    const box = new THREE.Box3().setFromObject(carModel);
    const size = box.getSize(new THREE.Vector3());
    const scale = 4.2 / Math.max(size.x, size.z);
    carModel.scale.setScalar(scale);
    // Rotate model so its front faces -Z (matching physics forward direction)
    // The Tripo model's front faces +X, so rotate +90° around Y
    carModel.rotation.y = Math.PI / 2;
    // Recompute bounds after scaling + rotation, then center
    const box2 = new THREE.Box3().setFromObject(carModel);
    const center = box2.getCenter(new THREE.Vector3());
    carModel.position.sub(center);
    carModel.traverse(child => {
      if (child.isMesh) { child.castShadow = true; child.receiveShadow = true; }
    });
    return true;
  } catch (e) {
    console.log('No car.glb found, using procedural car');
    return false;
  }
}

// ============================================================
// CAMERA
// ============================================================
let camAngle = 0;

function updateCamera(dt) {
  if (!playerChassis) return;
  const pos = playerChassis.position;
  const worldForward = playerChassis.quaternion.vmult(new CANNON.Vec3(0, 0, -1));
  const targetAngle = Math.atan2(worldForward.x, worldForward.z);

  let angleDiff = targetAngle - camAngle;
  while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
  while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

  const camSmooth = 1 - Math.pow(0.003, dt);
  camAngle += angleDiff * camSmooth;

  const camX = pos.x - Math.sin(camAngle) * 12;
  const camZ = pos.z - Math.cos(camAngle) * 12;
  const camY = pos.y + 6;

  camera.position.lerp(new THREE.Vector3(camX, camY, camZ), camSmooth);

  const lookTarget = new THREE.Vector3(
    pos.x + worldForward.x * 3, pos.y + 1.5, pos.z + worldForward.z * 3
  );
  camera.lookAt(lookTarget);

  if (cameraShakeIntensity > 0.01) {
    cameraShake.set(
      (Math.random() - 0.5) * cameraShakeIntensity,
      (Math.random() - 0.5) * cameraShakeIntensity * 0.5,
      (Math.random() - 0.5) * cameraShakeIntensity
    );
    camera.position.add(cameraShake);
    cameraShakeIntensity *= Math.pow(0.01, dt);
  }

  const targetFov = baseFov + (boostCooldown > BOOST_COOLDOWN - 0.5 ? 15 : 0);
  currentFov += (targetFov - currentFov) * Math.min(dt * 5, 1);
  camera.fov = currentFov;
  camera.updateProjectionMatrix();
}

// ============================================================
// PLAYER UPDATE
// ============================================================
function updatePlayer(dt) {
  if (playerWrecked) {
    playerRespawnTimer -= dt;
    if (playerRespawnTimer <= 0) respawnPlayer();
    playerVehicle.applyEngineForce(0, 2);
    playerVehicle.applyEngineForce(0, 3);
    playerVehicle.setSteeringValue(0, 0);
    playerVehicle.setSteeringValue(0, 1);
    return;
  }

  const vel = playerChassis.velocity;
  const speed = vel.length();
  const accelerating = keys['w'] || keys['arrowup'];
  const braking = keys['s'] || keys['arrowdown'];
  const steerLeft = keys['a'] || keys['arrowleft'];
  const steerRight = keys['d'] || keys['arrowright'];
  const boost = keys[' '];

  // Car forward direction: RaycastVehicle negative engine force drives in -Z local,
  // but the model faces +Z, so the actual movement forward is -Z in local space
  const fwd = playerChassis.quaternion.vmult(new CANNON.Vec3(0, 0, -1));
  const forwardSpeed = fwd.x * vel.x + fwd.z * vel.z;

  // Direct velocity control for arcade feel
  const reverseMaxSpeed = MAX_SPEED * 0.4; // reverse is slower than forward

  if (accelerating && forwardSpeed < MAX_SPEED) {
    vel.x += fwd.x * ACCELERATION * dt;
    vel.z += fwd.z * ACCELERATION * dt;
  }
  if (braking) {
    if (forwardSpeed > 1) {
      // Braking
      vel.x -= fwd.x * BRAKE_DECEL * dt;
      vel.z -= fwd.z * BRAKE_DECEL * dt;
    } else if (forwardSpeed > -reverseMaxSpeed) {
      // Reverse — capped at reverseMaxSpeed
      vel.x -= fwd.x * ACCELERATION * 0.4 * dt;
      vel.z -= fwd.z * ACCELERATION * 0.4 * dt;
    }
  }

  // Natural deceleration when not pressing gas
  if (!accelerating && !braking) {
    vel.x *= Math.pow(0.3, dt);
    vel.z *= Math.pow(0.3, dt);
  }

  // Minimal engine force — just enough for wheel spin visual, not enough to cause pitch torque
  const visualForce = accelerating ? -80 : (braking ? 80 : 0);
  playerVehicle.applyEngineForce(visualForce, 2);
  playerVehicle.applyEngineForce(visualForce, 3);

  // Steering — applied via torque for snappy arcade feel
  const speedFactor = Math.max(0.3, 1 - speed / 50);
  let steerValue = 0;
  if (steerLeft) steerValue = MAX_STEER * speedFactor;
  if (steerRight) steerValue = -MAX_STEER * speedFactor;
  playerVehicle.setSteeringValue(steerValue, 0);
  playerVehicle.setSteeringValue(steerValue, 1);

  // Additional steering torque for snappier turns
  if (steerLeft || steerRight) {
    const turnDir = steerLeft ? 1 : -1;
    const turnTorque = turnDir * 80 * Math.min(speed / 5, 1);
    playerChassis.angularVelocity.y += turnTorque * dt;
  }

  // Boost
  boostCooldown = Math.max(0, boostCooldown - dt);
  if (boost && boostCooldown <= 0) {
    vel.x += fwd.x * 20; // instant speed boost
    vel.z += fwd.z * 20;
    vel.y += 1.5; // slight hop
    boostCooldown = BOOST_COOLDOWN;
    playBoostSound();
    const pos = playerChassis.position;
    firePool.emit(
      { x: pos.x - fwd.x * 2, y: pos.y + 0.3, z: pos.z - fwd.z * 2 },
      { x: -fwd.x * 15, y: 2, z: -fwd.z * 15 }, 0.4, 15
    );
  }

  // Clamp max speed (allow boost to exceed briefly)
  const maxSpeedCap = MAX_SPEED * 2; // 40 m/s = 144 km/h hard cap
  if (speed > maxSpeedCap) {
    const scale = maxSpeedCap / speed;
    vel.x *= scale;
    vel.z *= scale;
  }

  // Tire screech
  if (Math.abs(steerValue) > 0.3 && speed > 10) {
    playScreechSound(Math.abs(steerValue) * speed / 30);
  }

  // Dust
  if (speed > 5) {
    dustPool.emit(
      { x: playerChassis.position.x, y: 0.2, z: playerChassis.position.z },
      { x: (Math.random() - 0.5) * 3, y: 1 + Math.random() * 2, z: (Math.random() - 0.5) * 3 },
      0.8 + Math.random() * 0.5, Math.floor(speed / 10)
    );
  }

  // Damage smoke/fire
  if (playerDamage >= 10 && playerDamage < 20) {
    smokePool.emit(
      { x: playerChassis.position.x, y: playerChassis.position.y + 0.8, z: playerChassis.position.z },
      { x: (Math.random() - 0.5), y: 2 + Math.random(), z: (Math.random() - 0.5) }, 1.0, 1
    );
  }
  if (playerDamage >= 20) {
    firePool.emit(
      { x: playerChassis.position.x, y: playerChassis.position.y + 0.5, z: playerChassis.position.z },
      { x: (Math.random() - 0.5), y: 3 + Math.random(), z: (Math.random() - 0.5) }, 0.6, 2
    );
    if (playerMesh) {
      playerMesh.traverse(child => {
        if (child.isMesh && child.material) {
          child.material.emissive = new THREE.Color(0x331100);
          child.material.emissiveIntensity = 0.5;
        }
      });
    }
  }

  // HUD
  speedValueEl.textContent = String(Math.round(speed * 3.6));
  boostFillEl.style.width = Math.max(0, (1 - boostCooldown / BOOST_COOLDOWN) * 100) + '%';
  // Engine sound based on actual speed and whether ANY throttle/brake is pressed
  updateEngineSound(speed, accelerating || braking);
}

// ============================================================
// SYNC VISUALS
// ============================================================
function syncMeshes() {
  if (playerMesh && playerChassis) {
    playerMesh.position.copy(playerChassis.position);
    playerMesh.quaternion.copy(playerChassis.quaternion);
  }

  if (playerVehicle) {
    for (let i = 0; i < 4; i++) {
      playerVehicle.updateWheelTransform(i);
      const t = playerVehicle.wheelInfos[i].worldTransform;
      if (playerVehicle.wheelMeshes && playerVehicle.wheelMeshes[i]) {
        playerVehicle.wheelMeshes[i].position.copy(t.position);
        playerVehicle.wheelMeshes[i].quaternion.copy(t.quaternion);
      }
    }
  }

  for (let i = 0; i < botVehicles.length; i++) {
    const bot = botVehicles[i];
    if (bot.mesh) {
      bot.mesh.position.copy(bot.chassisBody.position);
      bot.mesh.quaternion.copy(bot.chassisBody.quaternion);
    }
    for (let j = 0; j < 4; j++) {
      bot.vehicle.updateWheelTransform(j);
      const t = bot.vehicle.wheelInfos[j].worldTransform;
      if (bot.wheelMeshes[j]) {
        bot.wheelMeshes[j].position.copy(t.position);
        bot.wheelMeshes[j].quaternion.copy(t.quaternion);
      }
    }
  }

  arenaProps.forEach(prop => {
    if (prop.mesh) {
      prop.mesh.position.copy(prop.body.position);
      prop.mesh.quaternion.copy(prop.body.quaternion);
    }
  });
}

function updateBotEffects() {
  for (let i = 0; i < botVehicles.length; i++) {
    if (botWrecked[i]) continue;
    const pos = botVehicles[i].chassisBody.position;
    if (botDamage[i] >= 4 && botDamage[i] < 8) {
      smokePool.emit({ x: pos.x, y: pos.y + 0.8, z: pos.z },
        { x: (Math.random() - 0.5), y: 2, z: (Math.random() - 0.5) }, 0.8, 1);
    }
    if (botDamage[i] >= 8) {
      firePool.emit({ x: pos.x, y: pos.y + 0.5, z: pos.z },
        { x: (Math.random() - 0.5), y: 3, z: (Math.random() - 0.5) }, 0.5, 1);
    }
  }
}

// ============================================================
// GAME LOOP
// ============================================================
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const time = clock.elapsedTime; // read property directly, avoid double-consuming getDelta

  world.step(1 / 60, dt, 3);

  // Anti-flip for all vehicles
  preventFlip(playerChassis);
  for (let i = 0; i < botVehicles.length; i++) preventFlip(botVehicles[i].chassisBody);

  // Bounds check — keep all cars in arena
  const bound = ARENA_SIZE - 2;
  function clampToArena(body) {
    if (Math.abs(body.position.x) > bound) {
      body.position.x = Math.sign(body.position.x) * bound;
      body.velocity.x *= -0.5;
    }
    if (Math.abs(body.position.z) > bound) {
      body.position.z = Math.sign(body.position.z) * bound;
      body.velocity.z *= -0.5;
    }
  }
  clampToArena(playerChassis);
  for (let i = 0; i < botVehicles.length; i++) clampToArena(botVehicles[i].chassisBody);

  updatePlayer(dt);
  for (let i = 0; i < NUM_BOTS; i++) updateBot(i, dt);
  syncMeshes();

  sparkPool.update(dt, -15);
  smokePool.update(dt, -1);
  firePool.update(dt, -3);
  dustPool.update(dt, -2);
  debrisPool.update(dt, -12);
  updateBotEffects();

  updateCamera(dt);

  const vigPass = composer.passes[2];
  if (vigPass && vigPass.uniforms) {
    vigPass.uniforms.uTime.value = time;
    vigPass.uniforms.uShakeIntensity.value = cameraShakeIntensity;
  }

  composer.render();
}

// ============================================================
// INIT
// ============================================================
async function init() {
  const loadBar = document.getElementById('load-bar');

  initScene();
  loadBar.style.width = '10%';

  const materials = initPhysics();
  loadBar.style.width = '20%';

  createSky();
  createArena(materials.wallMat);
  loadBar.style.width = '30%';

  createStadium();
  loadBar.style.width = '40%';

  await loadCarModel();
  loadBar.style.width = '60%';

  initParticles();
  initControls();
  loadBar.style.width = '70%';

  // Player
  const playerData = createVehicle(new CANNON.Vec3(0, 2, 0), materials.carMat);
  playerVehicle = playerData.vehicle;
  playerChassis = playerData.chassisBody;
  playerVehicle.wheelMeshes = playerData.wheelMeshes;
  playerMesh = createCarMesh(0xff2200);
  loadBar.style.width = '80%';

  // Bots
  const botColors = [0x2266ff, 0x22cc44, 0xffaa00, 0xff44ff, 0x00cccc, 0xff6600, 0x8833ff, 0xcccc00];
  for (let i = 0; i < NUM_BOTS; i++) {
    const angle = (i / NUM_BOTS) * Math.PI * 2;
    const dist = ARENA_SIZE * 0.7;
    const botData = createVehicle(
      new CANNON.Vec3(Math.cos(angle) * dist, 2, Math.sin(angle) * dist),
      materials.carMat
    );
    botData.chassisBody.quaternion.setFromEuler(0, angle + Math.PI, 0);
    botData.mesh = createCarMesh(botColors[i]);
    botVehicles.push(botData);
    botDamage.push(0);
    botWrecked.push(false);
    botRespawnTimers.push(0);
  }
  loadBar.style.width = '90%';

  setupCollisions();
  loadBar.style.width = '100%';

  setTimeout(() => {
    document.getElementById('loading').classList.add('fade');
    setTimeout(() => { document.getElementById('loading').style.display = 'none'; }, 1500);
  }, 500);

  setTimeout(() => { document.getElementById('controls-hint').style.opacity = '0'; }, 8000);

  // Debug access (remove for production)
  window._debug = { playerChassis, playerVehicle, keys, botVehicles };

  animate();
}

init();
