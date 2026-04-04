import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
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
const MAX_ENGINE_FORCE = 800;
const MAX_SPEED = 33; // m/s (~120 km/h)
const MAX_STEER = 0.4;
const BOOST_IMPULSE = 500;
const BOOST_COOLDOWN = 3.0;
const RESPAWN_DELAY = 2.0;
const DAMAGE_THRESHOLD_HEAVY = 15;

// ============================================================
// GLOBALS
// ============================================================
let scene, camera, renderer, composer, clock;
let world, eventQueue;
let playerVehicleController, playerChassis, playerMesh;
let playerWheelMeshes = [];
let botVehicles = [];
let carModel = null;
let wheelModel = null;
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
let audioCtx;
let audioStarted = false;
let audioLoading = false;
let engineBuffers = []; // 6 engine loops at different pitches
let engineSources = []; // currently playing engine loop sources
let engineGains = [];   // per-loop gain nodes
let crashMetalBuffers = [];  // metallic crunch layer
let crashBoomBuffer;         // heavy bass boom layer (explosion)
let crashCarBuffer;          // real car crash sample
let boostStartBuffer, boostLoopBuffer, boostEndBuffer;
let screechBuffer;
let crowdBuffer;
let crowdSource, crowdGain;
let masterGain;
let lastCrashIndex = -1;
let screechSource = null;
let screechGainNode = null;
let arenaProps = [];
let botDamage = [];
let botRespawnTimers = [];
let botWrecked = [];

// Map collider handles to body references for collision lookup
let colliderToVehicle = new Map(); // handle -> { type: 'player' } | { type: 'bot', index }

// HUD elements
let speedValueEl, boostFillEl, scoreEl, healthFillEl;

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
  healthFillEl = document.getElementById('health-fill');
}

// ============================================================
// PHYSICS WORLD
// ============================================================
async function initPhysics() {
  await RAPIER.init();
  world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  eventQueue = new RAPIER.EventQueue(true);

  // Ground — flat cuboid
  const groundBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(ARENA_SIZE, 0.25, ARENA_SIZE)
      .setTranslation(0, -0.25, 0)
      .setFriction(0.8)
      .setRestitution(0.1),
    groundBody
  );

  // Heightfield with subtle noise for bumps
  const rows = 64;
  const cols = 64;
  const heights = new Float32Array((rows + 1) * (cols + 1));
  for (let i = 0; i <= rows; i++) {
    for (let j = 0; j <= cols; j++) {
      const x = (j / cols - 0.5) * ARENA_SIZE * 2;
      const z = (i / rows - 0.5) * ARENA_SIZE * 2;
      // Simple noise approximation
      heights[i * (cols + 1) + j] =
        Math.sin(x * 0.3) * Math.cos(z * 0.2) * 0.02 +
        Math.sin(x * 0.7 + z * 0.5) * 0.015;
    }
  }
  const heightBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  world.createCollider(
    RAPIER.ColliderDesc.heightfield(
      rows, cols, heights,
      { x: ARENA_SIZE * 2, y: 1, z: ARENA_SIZE * 2 }
    )
      .setTranslation(0, 0.0, 0)
      .setFriction(0.8)
      .setRestitution(0.1),
    heightBody
  );
}

// ============================================================
// ARENA
// ============================================================
function createArena() {
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
    const wallBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(w.sx / 2, w.sy / 2, w.sz / 2)
        .setTranslation(w.x, w.sy / 2, w.z)
        .setFriction(0.1)
        .setRestitution(0.3),
      wallBody
    );

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

  createArenaProps();
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

function createArenaProps() {
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
    const tireHeight = numTires * 0.5 + 0.5;
    tireGroup.position.set(pos.x, tireHeight / 2, pos.z);
    scene.add(tireGroup);

    const tireBody = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(pos.x, tireHeight / 2, pos.z)
        .setLinearDamping(0.5)
        .setAngularDamping(0.5)
    );
    world.createCollider(
      RAPIER.ColliderDesc.cylinder(tireHeight / 2, 0.7)
        .setMass(5)
        .setFriction(0.3)
        .setRestitution(0.4),
      tireBody
    );
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

    const barrelBody = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(pos.x, 0.6, pos.z)
        .setLinearDamping(0.3)
        .setAngularDamping(0.3)
    );
    world.createCollider(
      RAPIER.ColliderDesc.cylinder(0.6, 0.5)
        .setMass(10)
        .setFriction(0.3)
        .setRestitution(0.6),
      barrelBody
    );
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

  // Ramp physics — angled static collider
  const rampAngle = Math.atan2(rampHeight, rampLength);
  const rampBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  const rampQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(rampAngle, 0, 0));
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(rampWidth / 2, 0.15, rampLength / 2)
      .setTranslation(12, rampHeight / 2, 12)
      .setRotation({ x: rampQ.x, y: rampQ.y, z: rampQ.z, w: rampQ.w })
      .setFriction(0.5)
      .setRestitution(0.1),
    rampBody
  );

  // Second ramp on opposite side
  const rampMesh2 = rampMesh.clone();
  rampMesh2.position.set(-12, rampHeight / 2, -12);
  rampMesh2.rotation.x = Math.atan2(rampHeight, rampLength);
  rampMesh2.rotation.y = Math.PI;
  scene.add(rampMesh2);

  const rampBody2 = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  const rampQ2 = new THREE.Quaternion().setFromEuler(new THREE.Euler(rampAngle, Math.PI, 0));
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(rampWidth / 2, 0.15, rampLength / 2)
      .setTranslation(-12, rampHeight / 2, -12)
      .setRotation({ x: rampQ2.x, y: rampQ2.y, z: rampQ2.z, w: rampQ2.w })
      .setFriction(0.5)
      .setRestitution(0.1),
    rampBody2
  );

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
function createVehicle(x, y, z) {
  // Chassis rigid body
  const chassisDesc = RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(x, y, z)
    .setCcdEnabled(true)
    .setLinearDamping(0.05)
    .setAngularDamping(0.7);
  const chassis = world.createRigidBody(chassisDesc);

  const chassisCollider = world.createCollider(
    RAPIER.ColliderDesc.cuboid(1.0, 0.45, 2.1)
      .setMass(CAR_MASS)
      .setFriction(0.5)
      .setRestitution(0.25)
      .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
    chassis
  );

  // Lower center of mass for stability (no anti-flip hacks)
  chassisCollider.setMassProperties(
    CAR_MASS,
    { x: 0, y: -0.3, z: 0 },       // center of mass — lowered
    { x: 50, y: 20, z: 80 },         // principal inertia
    { x: 0, y: 0, z: 0, w: 1 }      // inertia rotation
  );

  // Vehicle controller
  const vc = world.createVehicleController(chassis);

  // Wheel positions from wheel-tuner.html (connection points pre-compensated for suspension)
  // Front wheels (steering)
  vc.addWheel({x: -0.8, y: 0.1, z: -1.35}, {x:0,y:-1,z:0}, {x:-1,y:0,z:0}, 0.6, 0.32);
  vc.addWheel({x: 0.8, y: 0.1, z: -1.35}, {x:0,y:-1,z:0}, {x:-1,y:0,z:0}, 0.6, 0.32);
  // Rear wheels (drive)
  vc.addWheel({x: -0.8, y: 0.1, z: 1.05}, {x:0,y:-1,z:0}, {x:-1,y:0,z:0}, 0.6, 0.32);
  vc.addWheel({x: 0.8, y: 0.1, z: 1.05}, {x:0,y:-1,z:0}, {x:-1,y:0,z:0}, 0.6, 0.32);

  // Suspension tuning
  for (let i = 0; i < 4; i++) {
    vc.setWheelSuspensionStiffness(i, 30.0);
    vc.setWheelSuspensionCompression(i, 8.0);
    vc.setWheelSuspensionRelaxation(i, 5.0);
    vc.setWheelMaxSuspensionTravel(i, 0.4);
    vc.setWheelFrictionSlip(i, 5.0);
  }

  // Wheel meshes — animated for steering and spin
  const wheelMeshes = [];
  for (let i = 0; i < 4; i++) {
    let wheelMesh;
    if (wheelModel) {
      wheelMesh = wheelModel.clone();
    } else {
      const wheelGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.3, 16);
      wheelGeo.rotateZ(Math.PI / 2);
      wheelMesh = new THREE.Mesh(wheelGeo, new THREE.MeshStandardMaterial({
        color: 0x222222, roughness: 0.8, metalness: 0.2,
      }));
    }
    wheelMesh.castShadow = true;
    scene.add(wheelMesh);
    wheelMeshes.push(wheelMesh);
  }

  return { vehicleController: vc, chassis, chassisCollider, wheelMeshes };
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
async function loadAudioBuffer(url) {
  const resp = await fetch(url);
  const arrayBuf = await resp.arrayBuffer();
  return audioCtx.decodeAudioData(arrayBuf);
}

async function initAudio() {
  if (audioLoading) return;
  audioLoading = true;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  masterGain = audioCtx.createGain();
  masterGain.gain.value = 0.8;
  masterGain.connect(audioCtx.destination);

  // Load engine loops (6 pitches — low to high RPM)
  const enginePromises = [];
  for (let i = 0; i < 6; i++) {
    enginePromises.push(loadAudioBuffer(`assets/sounds/engine/engine_loop_${i}.wav`));
  }

  // Load crash layers — metal crunches + bass boom + real car crash
  const crashMetalFiles = [
    'crash/bfh1_metal_hit_01.ogg', 'crash/bfh1_metal_hit_02.ogg',
    'crash/bfh1_metal_hit_03.ogg', 'crash/bfh1_metal_hit_04.ogg',
    'crash/bfh1_metal_hit_05.ogg', 'crash/bfh1_metal_hit_06.ogg',
  ];
  const crashMetalPromises = crashMetalFiles.map(f => loadAudioBuffer(`assets/sounds/${f}`));
  const crashBoomP = loadAudioBuffer('assets/sounds/crash/explosion.wav');
  const crashCarP = loadAudioBuffer('assets/sounds/crash/car-crash-sound-eefect.mp3');

  // Load boost sounds (start / loop / end)
  const boostStartP = loadAudioBuffer('assets/sounds/boost/boost-start.ogg');
  const boostLoopP = loadAudioBuffer('assets/sounds/boost/boost-loop.ogg');
  const boostEndP = loadAudioBuffer('assets/sounds/boost/boost-end.ogg');

  // Load tire screech
  const screechP = loadAudioBuffer('assets/sounds/screech/tire_screech.wav');

  // Load crowd ambience
  const crowdP = loadAudioBuffer('assets/sounds/crowd/ambience_cheering.mp3');

  // Await all loads in parallel
  const [engines, crashMetals, crashBoom, crashCar, bStart, bLoop, bEnd, screech, crowd] = await Promise.all([
    Promise.all(enginePromises),
    Promise.all(crashMetalPromises),
    crashBoomP, crashCarP,
    boostStartP, boostLoopP, boostEndP,
    screechP, crowdP,
  ]);

  engineBuffers = engines;
  crashMetalBuffers = crashMetals;
  crashBoomBuffer = crashBoom;
  crashCarBuffer = crashCar;
  boostStartBuffer = bStart;
  boostLoopBuffer = bLoop;
  boostEndBuffer = bEnd;
  screechBuffer = screech;
  crowdBuffer = crowd;

  // Start engine loops — all play simultaneously, volume-crossfaded by speed
  for (let i = 0; i < engineBuffers.length; i++) {
    const src = audioCtx.createBufferSource();
    src.buffer = engineBuffers[i];
    src.loop = true;
    const gain = audioCtx.createGain();
    gain.gain.value = i === 0 ? 0.15 : 0; // idle loop audible at start
    src.connect(gain);
    gain.connect(masterGain);
    src.start();
    engineSources.push(src);
    engineGains.push(gain);
  }

  // Start crowd ambience loop
  crowdSource = audioCtx.createBufferSource();
  crowdSource.buffer = crowdBuffer;
  crowdSource.loop = true;
  crowdGain = audioCtx.createGain();
  crowdGain.gain.value = 0.12;
  crowdSource.connect(crowdGain);
  crowdGain.connect(masterGain);
  crowdSource.start();

  audioStarted = true;
}

function updateEngineSound(speed, accelerating) {
  if (!audioStarted || engineGains.length === 0) return;
  const n = engineGains.length; // 6 loops
  const speedNorm = Math.min(Math.abs(speed) / 40, 1);
  // Map speed to a float index across the 6 loops
  const idx = speedNorm * (n - 1);
  const baseVol = accelerating ? 0.22 : 0.10;
  const t = audioCtx.currentTime;
  for (let i = 0; i < n; i++) {
    // Triangular crossfade — each loop peaks at its index, fades to neighbors
    const dist = Math.abs(i - idx);
    const vol = Math.max(0, 1 - dist) * baseVol;
    engineGains[i].gain.setTargetAtTime(vol, t, 0.08);
  }
}

function playCrashSound(intensity) {
  if (!audioStarted) return;
  const t = audioCtx.currentTime;
  const vol = Math.min(intensity, 1);

  // Layer 1: Synthesized sub-bass thump (the "weight" of the impact)
  const bassOsc = audioCtx.createOscillator();
  bassOsc.type = 'sine';
  bassOsc.frequency.setValueAtTime(60 + intensity * 30, t);
  bassOsc.frequency.exponentialRampToValueAtTime(20, t + 0.3);
  const bassGain = audioCtx.createGain();
  bassGain.gain.setValueAtTime(vol * 0.5, t);
  bassGain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
  bassOsc.connect(bassGain);
  bassGain.connect(masterGain);
  bassOsc.start(t);
  bassOsc.stop(t + 0.4);

  // Layer 2: Metal crunch sample (random from pool)
  if (crashMetalBuffers.length > 0) {
    let idx;
    do { idx = Math.floor(Math.random() * crashMetalBuffers.length); }
    while (idx === lastCrashIndex && crashMetalBuffers.length > 1);
    lastCrashIndex = idx;
    const metalSrc = audioCtx.createBufferSource();
    metalSrc.buffer = crashMetalBuffers[idx];
    metalSrc.playbackRate.value = 0.7 + Math.random() * 0.4;
    const metalGain = audioCtx.createGain();
    metalGain.gain.value = vol * 0.45;
    metalSrc.connect(metalGain);
    metalGain.connect(masterGain);
    metalSrc.start(t);
  }

  // Layer 3: For heavy hits, add the real car crash sample or explosion boom
  if (intensity > 0.5 && crashBoomBuffer) {
    const boomSrc = audioCtx.createBufferSource();
    boomSrc.buffer = intensity > 0.8 && crashCarBuffer ? crashCarBuffer : crashBoomBuffer;
    boomSrc.playbackRate.value = 0.8 + Math.random() * 0.3;
    const boomGain = audioCtx.createGain();
    boomGain.gain.value = (vol - 0.3) * 0.4;
    boomSrc.connect(boomGain);
    boomGain.connect(masterGain);
    boomSrc.start(t);
  }
}

function playBoostSound() {
  if (!audioStarted) return;
  const t = audioCtx.currentTime;

  // Layer 1: Synthesized rising whoosh (filtered noise sweep)
  const whooshSize = audioCtx.sampleRate * 0.8;
  const whooshBuf = audioCtx.createBuffer(1, whooshSize, audioCtx.sampleRate);
  const whooshData = whooshBuf.getChannelData(0);
  for (let i = 0; i < whooshSize; i++) {
    const p = i / whooshSize;
    whooshData[i] = (Math.random() * 2 - 1) * Math.sin(p * Math.PI) * 0.5;
  }
  const whooshSrc = audioCtx.createBufferSource();
  whooshSrc.buffer = whooshBuf;
  const whooshFilter = audioCtx.createBiquadFilter();
  whooshFilter.type = 'bandpass';
  whooshFilter.Q.value = 3;
  whooshFilter.frequency.setValueAtTime(200, t);
  whooshFilter.frequency.exponentialRampToValueAtTime(3000, t + 0.6);
  const whooshGain = audioCtx.createGain();
  whooshGain.gain.value = 0.3;
  whooshSrc.connect(whooshFilter);
  whooshFilter.connect(whooshGain);
  whooshGain.connect(masterGain);
  whooshSrc.start(t);

  // Layer 2: Sample-based boost (start -> loop -> end)
  if (boostStartBuffer) {
    const sampleGain = audioCtx.createGain();
    sampleGain.gain.value = 0.35;
    sampleGain.connect(masterGain);

    const startSrc = audioCtx.createBufferSource();
    startSrc.buffer = boostStartBuffer;
    startSrc.connect(sampleGain);
    startSrc.start(t);

    if (boostLoopBuffer) {
      const loopSrc = audioCtx.createBufferSource();
      loopSrc.buffer = boostLoopBuffer;
      loopSrc.loop = true;
      loopSrc.connect(sampleGain);
      const startDur = boostStartBuffer.duration;
      loopSrc.start(t + startDur);
      loopSrc.stop(t + startDur + 0.5);

      if (boostEndBuffer) {
        const endSrc = audioCtx.createBufferSource();
        endSrc.buffer = boostEndBuffer;
        endSrc.connect(sampleGain);
        endSrc.start(t + startDur + 0.5);
      }
    }
  }
}

function playScreechSound(intensity) {
  if (!audioStarted || !screechBuffer) return;
  const vol = Math.min(intensity * 0.05, 0.10);
  // If already screeching, just adjust volume smoothly
  if (screechSource && screechGainNode) {
    screechGainNode.gain.setTargetAtTime(vol, audioCtx.currentTime, 0.05);
    return;
  }
  screechSource = audioCtx.createBufferSource();
  screechSource.buffer = screechBuffer;
  screechSource.loop = true;
  // Vary pitch so it doesn't sound identical every turn
  screechSource.playbackRate.value = 0.9 + Math.random() * 0.3;
  // Add a filter to tame harsh highs
  const screechFilter = audioCtx.createBiquadFilter();
  screechFilter.type = 'lowpass';
  screechFilter.frequency.value = 4000;
  screechGainNode = audioCtx.createGain();
  screechGainNode.gain.value = vol;
  screechSource.connect(screechFilter);
  screechFilter.connect(screechGainNode);
  screechGainNode.connect(masterGain);
  screechSource.start();
  screechSource.onended = () => { screechSource = null; screechGainNode = null; };
}

function stopScreechSound() {
  if (screechSource && screechGainNode) {
    screechGainNode.gain.setTargetAtTime(0, audioCtx.currentTime, 0.05);
    const src = screechSource;
    setTimeout(() => { try { src.stop(); } catch(e) {} }, 100);
    screechSource = null;
    screechGainNode = null;
  }
}

// ============================================================
// CONTROLS
// ============================================================
function initControls() {
  window.addEventListener('keydown', e => {
    keys[e.key.toLowerCase()] = true;
    if (e.key === ' ') e.preventDefault();
    if (!audioStarted && !audioLoading) initAudio();
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  });
  window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });
  window.addEventListener('click', () => {
    if (!audioStarted && !audioLoading) initAudio();
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  });
}

// ============================================================
// HELPER: get forward direction from a Rapier rigid body
// ============================================================
function getForwardDir(chassis) {
  const rot = chassis.rotation();
  const q = new THREE.Quaternion(rot.x, rot.y, rot.z, rot.w);
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
  return fwd;
}

function getRightDir(chassis) {
  const rot = chassis.rotation();
  const q = new THREE.Quaternion(rot.x, rot.y, rot.z, rot.w);
  return new THREE.Vector3(1, 0, 0).applyQuaternion(q);
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

  const pos = bot.chassis.translation();
  const vel = bot.chassis.linvel();
  const speed = Math.sqrt(vel.x * vel.x + vel.z * vel.z);

  // Find nearest target
  let nearestDist = Infinity;
  let targetPos = { x: 0, y: 0, z: 0 };

  if (!playerWrecked) {
    const pp = playerChassis.translation();
    const dx = pp.x - pos.x;
    const dz = pp.z - pos.z;
    const d = dx * dx + dz * dz;
    if (d < nearestDist) {
      nearestDist = d;
      targetPos = { x: pp.x, y: pp.y, z: pp.z };
    }
  }

  for (let j = 0; j < botVehicles.length; j++) {
    if (j === index || botWrecked[j]) continue;
    const op = botVehicles[j].chassis.translation();
    const dx = op.x - pos.x;
    const dz = op.z - pos.z;
    const d = dx * dx + dz * dz;
    if (d < nearestDist) {
      nearestDist = d;
      targetPos = { x: op.x, y: op.y, z: op.z };
    }
  }

  // Bias toward center when far out
  if (Math.sqrt(pos.x * pos.x + pos.z * pos.z) > ARENA_SIZE * 0.6) {
    targetPos = { x: 0, y: 0, z: 0 };
  }

  // Steering — forward is -Z in local space
  const worldForward = getForwardDir(bot.chassis);
  const toTargetX = targetPos.x - pos.x;
  const toTargetZ = targetPos.z - pos.z;
  const toTargetLen = Math.sqrt(toTargetX * toTargetX + toTargetZ * toTargetZ) || 1;
  const toTargetNX = toTargetX / toTargetLen;
  const toTargetNZ = toTargetZ / toTargetLen;

  const cross = worldForward.x * toTargetNZ - worldForward.z * toTargetNX;
  const dot = worldForward.x * toTargetNX + worldForward.z * toTargetNZ;

  let steerValue = Math.max(-MAX_STEER, Math.min(MAX_STEER, -cross * 2.5));

  // Wall avoidance
  const wallMargin = ARENA_SIZE - 8;
  if (pos.x > wallMargin) steerValue -= 0.3;
  if (pos.x < -wallMargin) steerValue += 0.3;
  if (pos.z > wallMargin) steerValue -= Math.sign(worldForward.x) * 0.3;
  if (pos.z < -wallMargin) steerValue += Math.sign(worldForward.x) * 0.3;

  // Steering (front wheels)
  const currentSteer = bot.vehicleController.wheelSteering(0) || 0;
  const botSteerRate = 1 - Math.pow(0.001, dt);
  const smoothSteer = THREE.MathUtils.lerp(currentSteer, steerValue, botSteerRate);
  bot.vehicleController.setWheelSteering(0, smoothSteer);
  bot.vehicleController.setWheelSteering(1, smoothSteer);

  // Engine force (rear wheels, RWD)
  const botMaxSpeed = 13;
  let force = 0;
  if (dot > -0.3 && speed < botMaxSpeed) {
    force = -MAX_ENGINE_FORCE * 0.6;
  } else if (dot <= -0.3) {
    force = MAX_ENGINE_FORCE * 0.3;
  }
  bot.vehicleController.setWheelEngineForce(2, force);
  bot.vehicleController.setWheelEngineForce(3, force);

  // Braking when going wrong direction
  const brake = (dot <= -0.3 && speed > 3) ? 2.0 : 0;
  for (let i = 0; i < 4; i++) bot.vehicleController.setWheelBrake(i, brake);

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

  const spawnX = Math.cos(angle) * dist;
  const spawnZ = Math.sin(angle) * dist;
  bot.chassis.setTranslation({ x: spawnX, y: 2, z: spawnZ }, true);
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, angle + Math.PI, 0));
  bot.chassis.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
  bot.chassis.setLinvel({ x: 0, y: 0, z: 0 }, true);
  bot.chassis.setAngvel({ x: 0, y: 0, z: 0 }, true);
  bot.chassis.wakeUp();

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
function processCollisions() {
  eventQueue.drainCollisionEvents((handle1, handle2, started) => {
    if (!started) return;

    const c1 = world.getCollider(handle1);
    const c2 = world.getCollider(handle2);
    if (!c1 || !c2) return;
    const b1 = c1.parent();
    const b2 = c2.parent();
    if (!b1 || !b2) return;

    // Calculate impact from velocity difference
    const v1 = b1.linvel();
    const v2 = b2.linvel();
    const p1 = b1.translation();
    const p2 = b2.translation();

    // Collision normal from positions
    let nx = p2.x - p1.x;
    let nz = p2.z - p1.z;
    const dist = Math.sqrt(nx * nx + nz * nz);
    if (dist > 0) { nx /= dist; nz /= dist; }

    // Project relative velocity onto collision normal
    const relVelX = v1.x - v2.x;
    const relVelZ = v1.z - v2.z;
    const normalImpact = Math.abs(relVelX * nx + relVelZ * nz);

    if (normalImpact < 3) return;

    const intensity = Math.min((normalImpact - 3) / 20, 1);
    const contactPoint = new THREE.Vector3(
      (p1.x + p2.x) / 2,
      (p1.y + p2.y) / 2,
      (p1.z + p2.z) / 2,
    );
    const normal = new THREE.Vector3(nx, 0.5, nz).normalize();

    // Light bump — just a few sparks
    if (normalImpact < 8) {
      sparkPool.emit(contactPoint,
        { x: normal.x * 5, y: 3, z: normal.z * 5 },
        0.15, Math.floor(intensity * 8) + 2
      );
      if (normalImpact > 5) playCrashSound(intensity * 0.4);
      return;
    }

    // Solid hit and above — full effects
    sparkPool.emit(contactPoint,
      { x: normal.x * 10, y: 5 + Math.random() * 5, z: normal.z * 10 },
      0.2 + Math.random() * 0.2, Math.floor(intensity * 20) + 5
    );
    debrisPool.emit(contactPoint,
      { x: (Math.random() - 0.5) * 8, y: 3 + Math.random() * 5, z: (Math.random() - 0.5) * 8 },
      0.5 + Math.random() * 0.3, Math.floor(intensity * 8)
    );

    // Determine which vehicles are involved
    const h1 = c1.handle;
    const h2 = c2.handle;
    const v1info = colliderToVehicle.get(h1);
    const v2info = colliderToVehicle.get(h2);

    // Player damage
    if ((v1info && v1info.type === 'player') || (v2info && v2info.type === 'player')) {
      cameraShakeIntensity = Math.max(cameraShakeIntensity, intensity * 1.2);
      playerDamage += normalImpact > DAMAGE_THRESHOLD_HEAVY ? 2 : 1;
      checkPlayerDamageState();
    }

    // Bot damage
    for (const vinfo of [v1info, v2info]) {
      if (vinfo && vinfo.type === 'bot') {
        botDamage[vinfo.index] += normalImpact > DAMAGE_THRESHOLD_HEAVY ? 2 : 1;
        checkBotDamageState(vinfo.index);
      }
    }

    // Knockback only on heavy crashes
    if (normalImpact > 12) {
      const knockForce = (normalImpact - 12) * 8;
      if (b2.isDynamic()) {
        b2.applyImpulse({ x: nx * knockForce, y: 0, z: nz * knockForce }, true);
      }
      if (b1.isDynamic()) {
        b1.applyImpulse({ x: -nx * knockForce, y: 0, z: -nz * knockForce }, true);
      }
    }

    playCrashSound(intensity);
  });
}

function checkPlayerDamageState() {
  if (playerDamage >= 35 && !playerWrecked) {
    playerWrecked = true;
    playerRespawnTimer = RESPAWN_DELAY;
    document.getElementById('wrecked-overlay').classList.add('show');
    const pos = playerChassis.translation();
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

    const pos = bot.chassis.translation();
    firePool.emit({ x: pos.x, y: pos.y + 0.5, z: pos.z }, { x: 0, y: 5, z: 0 }, 1.0, 25);
    sparkPool.emit({ x: pos.x, y: pos.y + 0.5, z: pos.z }, { x: 0, y: 8, z: 0 }, 0.5, 30);

    if (bot.mesh) bot.mesh.visible = false;
    bot.chassis.setLinvel({ x: 0, y: 0, z: 0 }, true);
    bot.chassis.setAngvel({ x: 0, y: 0, z: 0 }, true);
    playCrashSound(1.0);
    cameraShakeIntensity = Math.max(cameraShakeIntensity, 0.5);
  }
}

function respawnPlayer() {
  playerChassis.setTranslation({ x: 0, y: 2, z: 0 }, true);
  playerChassis.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
  playerChassis.setLinvel({ x: 0, y: 0, z: 0 }, true);
  playerChassis.setAngvel({ x: 0, y: 0, z: 0 }, true);
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

  // 4 sides: each defined explicitly with spread axis and outward axis
  // spreadAxis = direction dots spread along the stand face
  // outAxis = direction tiers step outward (away from arena)
  const sideConfigs = [
    { cx: 0, cz: -standOffset, spreadX: 1, spreadZ: 0, outX: 0, outZ: -1, ry: 0 },         // north
    { cx: 0, cz: standOffset,  spreadX: 1, spreadZ: 0, outX: 0, outZ: 1,  ry: Math.PI },    // south
    { cx: -standOffset, cz: 0, spreadX: 0, spreadZ: 1, outX: -1, outZ: 0, ry: Math.PI / 2 },// west
    { cx: standOffset,  cz: 0, spreadX: 0, spreadZ: 1, outX: 1, outZ: 0,  ry: -Math.PI / 2 }, // east
  ];

  const crowdColors = [0xff3333, 0x3333ff, 0xffff33, 0x33ff33, 0xff6600, 0xffffff];
  const dotGeo = new THREE.SphereGeometry(0.2, 4, 4);
  const standWidth = ARENA_SIZE * 1.8;

  sideConfigs.forEach(side => {
    for (let tier = 0; tier < 3; tier++) {
      const tierMesh = new THREE.Mesh(
        new THREE.BoxGeometry(standWidth, 1.5, standDepth / 3),
        standMat
      );
      const yOffset = tier * 2.5 + 1;
      tierMesh.position.set(
        side.cx + side.outX * tier * 2,
        yOffset,
        side.cz + side.outZ * tier * 2
      );
      tierMesh.rotation.y = side.ry;
      tierMesh.receiveShadow = true;
      scene.add(tierMesh);
    }

    for (let c = 0; c < 200; c++) {
      const dot = new THREE.Mesh(dotGeo, new THREE.MeshBasicMaterial({
        color: crowdColors[Math.floor(Math.random() * crowdColors.length)]
      }));
      const tier = Math.floor(Math.random() * 3);
      const along = (Math.random() - 0.5) * standWidth;
      dot.position.set(
        side.cx + side.spreadX * along + side.outX * tier * 2,
        tier * 2.5 + 2.2,
        side.cz + side.spreadZ * along + side.outZ * tier * 2
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
    // The Tripo model's front faces +X, so rotate +90 around Y
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

async function loadWheelModel() {
  const loader = new GLTFLoader();
  try {
    const gltf = await loader.loadAsync('assets/wheel.glb');
    wheelModel = gltf.scene;
    // Scale to match wheel radius (0.4 units)
    const box = new THREE.Box3().setFromObject(wheelModel);
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const scale = 0.64 / maxDim; // diameter = 0.64 (radius 0.32)
    wheelModel.scale.setScalar(scale);
    // Center it
    const box2 = new THREE.Box3().setFromObject(wheelModel);
    const center = box2.getCenter(new THREE.Vector3());
    wheelModel.position.sub(center);
    wheelModel.traverse(child => {
      if (child.isMesh) { child.castShadow = true; child.receiveShadow = true; }
    });
    return true;
  } catch (e) {
    console.log('No wheel.glb found, using cylinder wheels');
    return false;
  }
}

// ============================================================
// CAMERA
// ============================================================
let camAngle = 0;

function updateCamera(dt) {
  if (!playerChassis) return;
  const pos = playerChassis.translation();
  const worldForward = getForwardDir(playerChassis);
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
    playerVehicleController.setWheelEngineForce(2, 0);
    playerVehicleController.setWheelEngineForce(3, 0);
    playerVehicleController.setWheelSteering(0, 0);
    playerVehicleController.setWheelSteering(1, 0);
    return;
  }

  const vel = playerChassis.linvel();
  const speed = Math.sqrt(vel.x * vel.x + vel.y * vel.y + vel.z * vel.z);
  const accelerating = keys['w'] || keys['arrowup'];
  const braking = keys['s'] || keys['arrowdown'];
  const steerLeft = keys['a'] || keys['arrowleft'];
  const steerRight = keys['d'] || keys['arrowright'];
  const boost = keys[' '];

  // Forward direction
  const fwd = getForwardDir(playerChassis);
  const forwardSpeed = fwd.x * vel.x + fwd.z * vel.z;

  // Steering (front wheels 0,1)
  // Steering narrows at speed: full at 0, 20% at 120km/h — prevents high-speed oscillation
  const speedFactor = Math.max(0.2, 1 - speed / 40);
  let steerInput = 0;
  if (steerLeft) steerInput = 1;
  if (steerRight) steerInput = -1;
  const steerAngle = MAX_STEER * speedFactor * steerInput;
  const currentSteer = playerVehicleController.wheelSteering(0) || 0;
  // Frame-rate independent steering smoothing — slower response at high speed for stability
  const steerLerpRate = 1 - Math.pow(0.001, dt); // ~95% per second, dt-independent
  const smoothSteer = THREE.MathUtils.lerp(currentSteer, steerAngle, steerLerpRate);
  playerVehicleController.setWheelSteering(0, smoothSteer);
  playerVehicleController.setWheelSteering(1, smoothSteer);

  // Engine force (rear wheels 2,3 for RWD)
  // Car faces -Z, so negative engine force = forward
  let force = 0;
  if (accelerating) force = -MAX_ENGINE_FORCE;
  if (braking) {
    if (forwardSpeed > 1) {
      force = MAX_ENGINE_FORCE * 0.4;
    } else {
      force = MAX_ENGINE_FORCE * 0.4; // reverse
    }
  }
  playerVehicleController.setWheelEngineForce(2, force);
  playerVehicleController.setWheelEngineForce(3, force);

  // Braking (all wheels)
  const brakeForce = (braking && forwardSpeed > 1) ? 1.0 : 0;
  for (let i = 0; i < 4; i++) playerVehicleController.setWheelBrake(i, brakeForce);

  // Boost
  boostCooldown = Math.max(0, boostCooldown - dt);
  if (boost && boostCooldown <= 0) {
    playerChassis.applyImpulse(
      { x: fwd.x * BOOST_IMPULSE, y: 50, z: fwd.z * BOOST_IMPULSE },
      true
    );
    boostCooldown = BOOST_COOLDOWN;
    playBoostSound();
    const pos = playerChassis.translation();
    firePool.emit(
      { x: pos.x - fwd.x * 2, y: pos.y + 0.3, z: pos.z - fwd.z * 2 },
      { x: -fwd.x * 15, y: 2, z: -fwd.z * 15 }, 0.4, 15
    );
  }

  // Tire screech
  if (Math.abs(smoothSteer) > 0.3 && speed > 10) {
    playScreechSound(Math.abs(smoothSteer) * speed / 30);
  } else {
    stopScreechSound();
  }

  // Dust
  const pos = playerChassis.translation();
  if (speed > 5) {
    dustPool.emit(
      { x: pos.x, y: 0.2, z: pos.z },
      { x: (Math.random() - 0.5) * 3, y: 1 + Math.random() * 2, z: (Math.random() - 0.5) * 3 },
      0.8 + Math.random() * 0.5, Math.floor(speed / 10)
    );
  }

  // Damage smoke/fire
  if (playerDamage >= 10 && playerDamage < 20) {
    smokePool.emit(
      { x: pos.x, y: pos.y + 0.8, z: pos.z },
      { x: (Math.random() - 0.5), y: 2 + Math.random(), z: (Math.random() - 0.5) }, 1.0, 1
    );
  }
  if (playerDamage >= 20) {
    firePool.emit(
      { x: pos.x, y: pos.y + 0.5, z: pos.z },
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
  const hullPct = Math.max(0, (1 - playerDamage / 35) * 100);
  healthFillEl.style.width = hullPct + '%';
  // Engine sound based on actual speed and whether ANY throttle/brake is pressed
  updateEngineSound(speed, accelerating || braking);
}

// ============================================================
// SYNC VISUALS
// ============================================================
function syncVehicleVisuals(chassis, vehicleController, mesh, wheelMeshes) {
  if (!chassis) return;
  const pos = chassis.translation();
  const rot = chassis.rotation();

  if (mesh) {
    mesh.position.set(pos.x, pos.y, pos.z);
    mesh.quaternion.set(rot.x, rot.y, rot.z, rot.w);
  }

  // Wheel visual sync
  for (let i = 0; i < 4; i++) {
    if (!wheelMeshes[i]) continue;
    const conn = vehicleController.wheelChassisConnectionPointCs(i);
    const susLen = vehicleController.wheelSuspensionLength(i);
    const steering = vehicleController.wheelSteering(i);
    const rotation = vehicleController.wheelRotation(i);

    // Position wheel relative to chassis in world space
    const chassisQ = new THREE.Quaternion(rot.x, rot.y, rot.z, rot.w);
    const localPos = new THREE.Vector3(conn.x, conn.y - (susLen != null ? susLen : 0.3), conn.z);
    localPos.applyQuaternion(chassisQ);

    wheelMeshes[i].position.set(pos.x + localPos.x, pos.y + localPos.y, pos.z + localPos.z);

    // Combine chassis rotation + steering + spin
    const steerQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), steering);
    const spinQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(-1, 0, 0), rotation);
    const wheelLocalQ = new THREE.Quaternion().multiplyQuaternions(steerQ, spinQ);
    wheelMeshes[i].quaternion.multiplyQuaternions(chassisQ, wheelLocalQ);
  }
}

function syncMeshes() {
  syncVehicleVisuals(playerChassis, playerVehicleController, playerMesh, playerWheelMeshes);

  for (let i = 0; i < botVehicles.length; i++) {
    const bot = botVehicles[i];
    syncVehicleVisuals(bot.chassis, bot.vehicleController, bot.mesh, bot.wheelMeshes);
  }

  arenaProps.forEach(prop => {
    if (prop.mesh && prop.body) {
      const pos = prop.body.translation();
      const rot = prop.body.rotation();
      prop.mesh.position.set(pos.x, pos.y, pos.z);
      prop.mesh.quaternion.set(rot.x, rot.y, rot.z, rot.w);
    }
  });
}

function updateBotEffects() {
  for (let i = 0; i < botVehicles.length; i++) {
    if (botWrecked[i]) continue;
    const pos = botVehicles[i].chassis.translation();
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
  const time = clock.elapsedTime;

  // Fixed timestep sub-stepping at 120Hz for stability at high speed
  const fixedStep = 1 / 180;
  const numSteps = Math.min(Math.ceil(dt / fixedStep), 6); // cap at 6 substeps
  for (let s = 0; s < numSteps; s++) {
    playerVehicleController.updateVehicle(fixedStep);
    for (let i = 0; i < botVehicles.length; i++) {
      botVehicles[i].vehicleController.updateVehicle(fixedStep);
    }
    world.timestep = fixedStep;
    world.step(eventQueue);
  }

  // Process collision events
  processCollisions();

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

  await initPhysics();
  loadBar.style.width = '20%';

  createSky();
  createArena();
  loadBar.style.width = '30%';

  createStadium();
  loadBar.style.width = '40%';

  await Promise.all([loadCarModel(), loadWheelModel()]);
  loadBar.style.width = '60%';

  initParticles();
  initControls();
  loadBar.style.width = '70%';

  // Player
  const playerData = createVehicle(0, 2, 0);
  playerVehicleController = playerData.vehicleController;
  playerChassis = playerData.chassis;
  playerWheelMeshes = playerData.wheelMeshes;
  playerMesh = createCarMesh(0xff2200);
  colliderToVehicle.set(playerData.chassisCollider.handle, { type: 'player' });
  loadBar.style.width = '80%';

  // Bots
  const botColors = [0x2266ff, 0x22cc44, 0xffaa00, 0xff44ff, 0x00cccc, 0xff6600, 0x8833ff, 0xcccc00];
  for (let i = 0; i < NUM_BOTS; i++) {
    const angle = (i / NUM_BOTS) * Math.PI * 2;
    const dist = ARENA_SIZE * 0.7;
    const bx = Math.cos(angle) * dist;
    const bz = Math.sin(angle) * dist;
    const botData = createVehicle(bx, 2, bz);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, angle + Math.PI, 0));
    botData.chassis.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
    botData.mesh = createCarMesh(botColors[i]);
    botVehicles.push(botData);
    botDamage.push(0);
    botWrecked.push(false);
    botRespawnTimers.push(0);
    colliderToVehicle.set(botData.chassisCollider.handle, { type: 'bot', index: i });
  }
  loadBar.style.width = '90%';

  loadBar.style.width = '100%';

  setTimeout(() => {
    document.getElementById('loading').classList.add('fade');
    setTimeout(() => { document.getElementById('loading').style.display = 'none'; }, 1500);
  }, 500);

  setTimeout(() => { document.getElementById('controls-hint').style.opacity = '0'; }, 8000);

  // Debug access (remove for production)
  window._debug = { playerChassis, playerVehicleController, keys, botVehicles };

  animate();
}

init();
