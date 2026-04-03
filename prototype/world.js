import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

// ============================================================
// SIMPLEX NOISE (compact implementation)
// ============================================================
const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;
const grad3 = [[1,1,0],[-1,1,0],[1,-1,0],[-1,-1,0],[1,0,1],[-1,0,1],[1,0,-1],[-1,0,-1],[0,1,1],[0,-1,1],[0,1,-1],[0,-1,-1]];
const perm = new Uint8Array(512);
const permMod12 = new Uint8Array(512);
(function() {
  const p = [];
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  for (let i = 0; i < 512; i++) { perm[i] = p[i & 255]; permMod12[i] = perm[i] % 12; }
})();

function noise2D(x, y) {
  const s = (x + y) * F2;
  const i = Math.floor(x + s), j = Math.floor(y + s);
  const t = (i + j) * G2;
  const X0 = i - t, Y0 = j - t;
  const x0 = x - X0, y0 = y - Y0;
  const i1 = x0 > y0 ? 1 : 0, j1 = x0 > y0 ? 0 : 1;
  const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2;
  const x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
  const ii = i & 255, jj = j & 255;
  let n0 = 0, n1 = 0, n2 = 0;
  let t0 = 0.5 - x0*x0 - y0*y0;
  if (t0 > 0) { t0 *= t0; const g = grad3[permMod12[ii + perm[jj]]]; n0 = t0 * t0 * (g[0]*x0 + g[1]*y0); }
  let t1 = 0.5 - x1*x1 - y1*y1;
  if (t1 > 0) { t1 *= t1; const g = grad3[permMod12[ii + i1 + perm[jj + j1]]]; n1 = t1 * t1 * (g[0]*x1 + g[1]*y1); }
  let t2 = 0.5 - x2*x2 - y2*y2;
  if (t2 > 0) { t2 *= t2; const g = grad3[permMod12[ii + 1 + perm[jj + 1]]]; n2 = t2 * t2 * (g[0]*x2 + g[1]*y2); }
  return 70 * (n0 + n1 + n2);
}

function fbm(x, y, octaves = 4) {
  let val = 0, amp = 1, freq = 1, max = 0;
  for (let i = 0; i < octaves; i++) {
    val += noise2D(x * freq, y * freq) * amp;
    max += amp; amp *= 0.5; freq *= 2;
  }
  return val / max;
}

// ============================================================
// SCENE SETUP
// ============================================================
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0c14);
scene.fog = new THREE.FogExp2(0x0a0c14, 0.008);

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(0, 14, 10);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 3.0;
document.body.appendChild(renderer.domElement);

// ============================================================
// POST-PROCESSING
// ============================================================
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.8,   // strength
  0.5,   // radius
  0.7    // threshold
);
composer.addPass(bloomPass);

// Vignette + color grading shader
const vignetteShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    varying vec2 vUv;
    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      // Vignette
      vec2 center = vUv - 0.5;
      float dist = length(center);
      float vig = smoothstep(0.55, 0.15, dist);
      color.rgb *= mix(0.5, 1.0, vig);
      // Slight blue tint in shadows, warm in highlights
      float lum = dot(color.rgb, vec3(0.299, 0.587, 0.114));
      color.rgb = mix(color.rgb * vec3(0.85, 0.9, 1.1), color.rgb * vec3(1.05, 1.0, 0.95), smoothstep(0.0, 0.5, lum));
      // Film grain
      float grain = (fract(sin(dot(vUv * uTime * 100.0, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) * 0.03;
      color.rgb += grain;
      gl_FragColor = color;
    }
  `
};
const vignettePass = new ShaderPass(vignetteShader);
composer.addPass(vignettePass);

// ============================================================
// LIGHTING
// ============================================================

// Dim ambient
const ambientLight = new THREE.AmbientLight(0x445577, 2.5);
scene.add(ambientLight);

// Moonlight — cool blue directional
const moonLight = new THREE.DirectionalLight(0x99aadd, 3.0);
moonLight.position.set(-10, 20, -5);
moonLight.castShadow = true;
moonLight.shadow.mapSize.set(2048, 2048);
moonLight.shadow.camera.left = -30;
moonLight.shadow.camera.right = 30;
moonLight.shadow.camera.top = 30;
moonLight.shadow.camera.bottom = -30;
moonLight.shadow.camera.near = 0.5;
moonLight.shadow.camera.far = 60;
moonLight.shadow.bias = -0.001;
scene.add(moonLight);

// Hemisphere light — subtle sky/ground color
const hemiLight = new THREE.HemisphereLight(0x556688, 0x443318, 2.0);
scene.add(hemiLight);

// ============================================================
// MATERIALS
// ============================================================
const groundMat = new THREE.MeshStandardMaterial({ color: 0x2a3a22, roughness: 0.9, metalness: 0 });
const stoneMat = new THREE.MeshStandardMaterial({ color: 0x5a5a5a, roughness: 0.8, metalness: 0.1 });
const darkStoneMat = new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.85, metalness: 0.05 });
const woodMat = new THREE.MeshStandardMaterial({ color: 0x5a3d22, roughness: 0.85, metalness: 0 });
const leafMat = new THREE.MeshStandardMaterial({ color: 0x2a5a2a, roughness: 0.75, metalness: 0, side: THREE.DoubleSide });
const darkLeafMat = new THREE.MeshStandardMaterial({ color: 0x1a4a1f, roughness: 0.8, metalness: 0, side: THREE.DoubleSide });
const waterMat = new THREE.MeshStandardMaterial({
  color: 0x2a5a6a, roughness: 0.05, metalness: 0.5, transparent: true, opacity: 0.75,
  emissive: 0x112233, emissiveIntensity: 0.15,
});
const glowMushroomMat = new THREE.MeshStandardMaterial({
  color: 0x00ffaa, emissive: 0x00ff88, emissiveIntensity: 0.8, roughness: 0.6, metalness: 0.1,
});
const glowMushroomMat2 = new THREE.MeshStandardMaterial({
  color: 0x8855ff, emissive: 0x6633cc, emissiveIntensity: 0.8, roughness: 0.6, metalness: 0.1,
});
const emberMat = new THREE.MeshBasicMaterial({ color: 0xff6622 });
const playerMat = new THREE.MeshStandardMaterial({ color: 0xccaa77, roughness: 0.7, metalness: 0.2 });
const cloakMat = new THREE.MeshStandardMaterial({ color: 0x2a1a1a, roughness: 0.9, metalness: 0 });

// ============================================================
// STARFIELD SKY
// ============================================================
function createStarfield() {
  const count = 500;
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const sizes = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    // Distribute on a large dome above the scene
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.random() * Math.PI * 0.4; // only upper hemisphere
    const r = 80;
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.cos(phi) + 10;
    positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    sizes[i] = 0.5 + Math.random() * 1.5;
  }

  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: `
      attribute float size;
      uniform float uTime;
      varying float vBright;
      void main() {
        vBright = 0.5 + 0.5 * sin(uTime * 0.5 + position.x * 0.1 + position.z * 0.1);
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * (100.0 / -mvPosition.z);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      varying float vBright;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        if (d > 0.5) discard;
        float glow = exp(-d * 8.0);
        gl_FragColor = vec4(0.8, 0.85, 1.0, glow * vBright * 0.6);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  const stars = new THREE.Points(geo, mat);
  scene.add(stars);
  return { stars, mat };
}

// ============================================================
// GROUND
// ============================================================
function createGround() {
  const size = 80;
  const segments = 200;
  const geo = new THREE.PlaneGeometry(size, size, segments, segments);
  geo.rotateX(-Math.PI / 2);

  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);

    // Height variation
    const h = fbm(x * 0.08, z * 0.08, 3) * 0.5 + fbm(x * 0.03, z * 0.03, 2) * 1.0;
    pos.setY(i, h);

    // Color variation — mix of dark greens, browns, and mossy patches
    const n1 = fbm(x * 0.1, z * 0.1, 3) * 0.5 + 0.5;
    const n2 = fbm(x * 0.3 + 100, z * 0.3, 2) * 0.5 + 0.5;
    const n3 = fbm(x * 0.05 + 50, z * 0.05 + 50, 2) * 0.5 + 0.5;

    // Base earth
    let r = 0.12 + n1 * 0.08;
    let g = 0.18 + n1 * 0.1;
    let b = 0.08 + n1 * 0.05;

    // Mossy green patches
    if (n2 > 0.55) {
      const mossFactor = (n2 - 0.55) * 4;
      r = THREE.MathUtils.lerp(r, 0.08, mossFactor);
      g = THREE.MathUtils.lerp(g, 0.28, mossFactor);
      b = THREE.MathUtils.lerp(b, 0.08, mossFactor);
    }

    // Dark muddy patches
    if (n3 < 0.35) {
      const mudFactor = (0.35 - n3) * 3;
      r = THREE.MathUtils.lerp(r, 0.16, mudFactor);
      g = THREE.MathUtils.lerp(g, 0.12, mudFactor);
      b = THREE.MathUtils.lerp(b, 0.06, mudFactor);
    }

    colors[i * 3] = r;
    colors[i * 3 + 1] = g;
    colors[i * 3 + 2] = b;
  }

  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.95, metalness: 0,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

// ============================================================
// TREES
// ============================================================
function createTree(x, z, scale = 1) {
  const group = new THREE.Group();
  group.position.set(x, getGroundHeight(x, z), z);

  // Trunk
  const trunkH = (1.5 + Math.random() * 1.5) * scale;
  const trunkR = (0.12 + Math.random() * 0.08) * scale;
  const trunkGeo = new THREE.CylinderGeometry(trunkR * 0.7, trunkR, trunkH, 6);
  const trunk = new THREE.Mesh(trunkGeo, woodMat);
  trunk.position.y = trunkH / 2;
  trunk.castShadow = true;
  trunk.receiveShadow = true;
  group.add(trunk);

  // Canopy — irregular clusters of cones
  const canopyCount = 2 + Math.floor(Math.random() * 3);
  for (let i = 0; i < canopyCount; i++) {
    const cH = (1.2 + Math.random() * 1.5) * scale;
    const cR = (0.6 + Math.random() * 0.8) * scale;
    const cGeo = new THREE.ConeGeometry(cR, cH, 6 + Math.floor(Math.random() * 3));
    const mat = Math.random() > 0.4 ? leafMat : darkLeafMat;
    const cone = new THREE.Mesh(cGeo, mat);
    cone.position.y = trunkH + cH * 0.3 + i * cH * 0.35;
    cone.position.x = (Math.random() - 0.5) * 0.3 * scale;
    cone.position.z = (Math.random() - 0.5) * 0.3 * scale;
    cone.rotation.y = Math.random() * Math.PI;
    cone.castShadow = true;
    group.add(cone);
  }

  scene.add(group);
  return group;
}

// ============================================================
// ROCKS
// ============================================================
function createRock(x, z, scale = 1) {
  const geo = new THREE.DodecahedronGeometry(0.4 * scale, 0);
  // Distort vertices for organic feel
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.setX(i, pos.getX(i) * (0.7 + Math.random() * 0.6));
    pos.setY(i, pos.getY(i) * (0.5 + Math.random() * 0.5));
    pos.setZ(i, pos.getZ(i) * (0.7 + Math.random() * 0.6));
  }
  geo.computeVertexNormals();

  const mat = Math.random() > 0.5 ? stoneMat : darkStoneMat;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, getGroundHeight(x, z) + 0.1 * scale, z);
  mesh.rotation.set(Math.random() * 0.3, Math.random() * Math.PI * 2, Math.random() * 0.3);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

// ============================================================
// RUINS — stone walls, pillars, archways
// ============================================================
function createRuinWall(x, z, rotation = 0) {
  const group = new THREE.Group();
  group.position.set(x, getGroundHeight(x, z), z);
  group.rotation.y = rotation;

  // Wall made of individual stone blocks for that crumbling look
  const wallW = 3 + Math.random() * 2;
  const wallH = 1.5 + Math.random() * 1.5;

  for (let row = 0; row < Math.floor(wallH / 0.4); row++) {
    let bx = -wallW / 2;
    while (bx < wallW / 2) {
      // Random chance to skip a block (crumbled away)
      if (Math.random() < 0.15 && row > 0) { bx += 0.5 + Math.random() * 0.3; continue; }

      const bw = 0.4 + Math.random() * 0.3;
      const bh = 0.3 + Math.random() * 0.1;
      const bd = 0.4 + Math.random() * 0.15;
      const geo = new THREE.BoxGeometry(bw, bh, bd);
      const block = new THREE.Mesh(geo, Math.random() > 0.3 ? stoneMat : darkStoneMat);
      block.position.set(bx + bw / 2, row * 0.35 + bh / 2, (Math.random() - 0.5) * 0.1);
      block.rotation.set((Math.random() - 0.5) * 0.05, (Math.random() - 0.5) * 0.1, (Math.random() - 0.5) * 0.05);
      block.castShadow = true;
      block.receiveShadow = true;
      group.add(block);
      bx += bw + 0.02;
    }
  }

  scene.add(group);
  return group;
}

function createPillar(x, z) {
  const group = new THREE.Group();
  const h = 2 + Math.random() * 2;
  const r = 0.2 + Math.random() * 0.1;

  const geo = new THREE.CylinderGeometry(r * 0.85, r, h, 8);
  const pillar = new THREE.Mesh(geo, stoneMat);
  pillar.position.set(x, getGroundHeight(x, z) + h / 2, z);
  pillar.castShadow = true;
  pillar.receiveShadow = true;

  // Broken top
  if (Math.random() > 0.4) {
    const capGeo = new THREE.CylinderGeometry(r * 1.2, r * 0.9, 0.2, 8);
    const cap = new THREE.Mesh(capGeo, darkStoneMat);
    cap.position.y = h / 2 + 0.1;
    cap.rotation.set((Math.random() - 0.5) * 0.2, 0, (Math.random() - 0.5) * 0.2);
    pillar.add(cap);
  }

  scene.add(pillar);
  return pillar;
}

// ============================================================
// CAMPFIRES
// ============================================================
const campfires = [];

function createCampfire(x, z) {
  const group = new THREE.Group();
  const gy = getGroundHeight(x, z);
  group.position.set(x, gy, z);

  // Stone ring
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    const geo = new THREE.DodecahedronGeometry(0.12, 0);
    const stone = new THREE.Mesh(geo, darkStoneMat);
    stone.position.set(Math.cos(angle) * 0.5, 0.06, Math.sin(angle) * 0.5);
    stone.rotation.set(Math.random(), Math.random(), Math.random());
    stone.receiveShadow = true;
    group.add(stone);
  }

  // Logs
  for (let i = 0; i < 3; i++) {
    const logGeo = new THREE.CylinderGeometry(0.04, 0.05, 0.6, 5);
    const log = new THREE.Mesh(logGeo, woodMat);
    log.position.y = 0.1;
    log.rotation.set(0, (i / 3) * Math.PI, Math.PI / 2 + (Math.random() - 0.5) * 0.3);
    group.add(log);
  }

  // Fire light — warm, flickering
  const fireLight = new THREE.PointLight(0xff6622, 5, 15);
  fireLight.position.y = 0.5;
  fireLight.castShadow = true;
  fireLight.shadow.mapSize.set(512, 512);
  fireLight.shadow.bias = -0.005;
  group.add(fireLight);

  // Secondary softer light
  const glowLight = new THREE.PointLight(0xff4400, 2, 10);
  glowLight.position.y = 0.3;
  group.add(glowLight);

  // Fire visual — stacked glowing planes that animate
  const fireGroup = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const fGeo = new THREE.PlaneGeometry(0.25 - i * 0.03, 0.4 - i * 0.05);
    const fMat = new THREE.MeshBasicMaterial({
      color: i < 2 ? 0xff4400 : (i < 4 ? 0xff8800 : 0xffcc44),
      transparent: true, opacity: 0.7 - i * 0.1,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    const fPlane = new THREE.Mesh(fGeo, fMat);
    fPlane.position.y = 0.2 + i * 0.06;
    fPlane.rotation.y = (i / 5) * Math.PI;
    fPlane.userData = { fireIndex: i };
    fireGroup.add(fPlane);
  }
  fireGroup.position.y = 0;
  group.add(fireGroup);

  scene.add(group);
  campfires.push({ group, fireLight, glowLight, baseIntensity: 5, fireGroup });
  return group;
}

// ============================================================
// GLOWING MUSHROOMS
// ============================================================
const mushrooms = [];

function createGlowingMushroom(x, z, color = 'green') {
  const group = new THREE.Group();
  const gy = getGroundHeight(x, z);
  group.position.set(x, gy, z);

  const mat = color === 'green' ? glowMushroomMat : glowMushroomMat2;

  // Stem
  const stemGeo = new THREE.CylinderGeometry(0.02, 0.03, 0.15, 5);
  const stem = new THREE.Mesh(stemGeo, new THREE.MeshStandardMaterial({ color: 0xccccaa, roughness: 0.9 }));
  stem.position.y = 0.075;
  group.add(stem);

  // Cap
  const capGeo = new THREE.SphereGeometry(0.07, 6, 4, 0, Math.PI * 2, 0, Math.PI * 0.6);
  const cap = new THREE.Mesh(capGeo, mat);
  cap.position.y = 0.15;
  group.add(cap);

  // Glow light
  const glowColor = color === 'green' ? 0x00ff88 : 0x6633ff;
  const light = new THREE.PointLight(glowColor, 1.5, 5);
  light.position.y = 0.2;
  group.add(light);

  scene.add(group);
  mushrooms.push({ group, light, baseIntensity: 1.5, phase: Math.random() * Math.PI * 2 });
  return group;
}

// ============================================================
// WATER POND
// ============================================================
function createPond(x, z, radius = 3) {
  const geo = new THREE.CircleGeometry(radius, 32);
  geo.rotateX(-Math.PI / 2);
  const pond = new THREE.Mesh(geo, waterMat);
  pond.position.set(x, getGroundHeight(x, z) - 0.15, z);
  pond.receiveShadow = true;
  scene.add(pond);

  // Subtle water glow
  const waterLight = new THREE.PointLight(0x224466, 0.3, 6);
  waterLight.position.set(x, getGroundHeight(x, z) + 0.5, z);
  scene.add(waterLight);

  // Reeds around the edge
  for (let i = 0; i < 20; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = radius * (0.8 + Math.random() * 0.3);
    const rx = x + Math.cos(angle) * dist;
    const rz = z + Math.sin(angle) * dist;
    const reedH = 0.5 + Math.random() * 0.8;
    const reedGeo = new THREE.CylinderGeometry(0.01, 0.02, reedH, 3);
    const reedMat = new THREE.MeshStandardMaterial({ color: 0x2a4a1a, roughness: 0.9 });
    const reed = new THREE.Mesh(reedGeo, reedMat);
    reed.position.set(rx, getGroundHeight(rx, rz) + reedH / 2, rz);
    reed.rotation.set((Math.random() - 0.5) * 0.2, Math.random() * Math.PI, (Math.random() - 0.5) * 0.2);
    scene.add(reed);
  }

  return pond;
}

// ============================================================
// GRASS BLADES (instanced for performance)
// ============================================================
function createGrassField() {
  const bladeGeo = new THREE.PlaneGeometry(0.05, 0.25);
  bladeGeo.translate(0, 0.125, 0);

  const grassMat = new THREE.MeshStandardMaterial({
    color: 0x1a3a1a, roughness: 0.9, metalness: 0, side: THREE.DoubleSide,
    alphaTest: 0.5,
  });

  const count = 8000;
  const mesh = new THREE.InstancedMesh(bladeGeo, grassMat, count);
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();

  let idx = 0;
  for (let i = 0; i < count; i++) {
    const x = (Math.random() - 0.5) * 60;
    const z = (Math.random() - 0.5) * 60;

    // Skip areas near water or structures
    const distFromCenter = Math.sqrt(x * x + z * z);
    if (distFromCenter < 1.5) continue;

    const y = getGroundHeight(x, z);

    dummy.position.set(x, y, z);
    dummy.rotation.set(0, Math.random() * Math.PI * 2, (Math.random() - 0.5) * 0.3);
    dummy.scale.set(0.8 + Math.random() * 0.4, 0.6 + Math.random() * 0.8, 1);
    dummy.updateMatrix();
    mesh.setMatrixAt(idx, dummy.matrix);

    const green = 0.1 + Math.random() * 0.15;
    color.setRGB(0.05 + Math.random() * 0.05, green, 0.03 + Math.random() * 0.04);
    mesh.setColorAt(idx, color);

    idx++;
  }

  mesh.count = idx;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  scene.add(mesh);
  return mesh;
}

// ============================================================
// FALLEN LEAVES (instanced)
// ============================================================
function createFallenLeaves() {
  const leafGeo = new THREE.PlaneGeometry(0.1, 0.08);
  leafGeo.rotateX(-Math.PI / 2);

  const leafMaterial = new THREE.MeshStandardMaterial({
    color: 0x8a5a2a, roughness: 0.95, metalness: 0, side: THREE.DoubleSide,
  });

  const count = 3000;
  const mesh = new THREE.InstancedMesh(leafGeo, leafMaterial, count);
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();

  for (let i = 0; i < count; i++) {
    const x = (Math.random() - 0.5) * 55;
    const z = (Math.random() - 0.5) * 55;
    const y = getGroundHeight(x, z) + 0.01;

    dummy.position.set(x, y, z);
    dummy.rotation.set((Math.random() - 0.5) * 0.3, Math.random() * Math.PI * 2, (Math.random() - 0.5) * 0.3);
    dummy.scale.set(0.7 + Math.random() * 0.6, 1, 0.7 + Math.random() * 0.6);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);

    // Varied autumn colors
    const leafType = Math.random();
    if (leafType < 0.3) color.setRGB(0.5 + Math.random() * 0.2, 0.25 + Math.random() * 0.1, 0.05);
    else if (leafType < 0.6) color.setRGB(0.4 + Math.random() * 0.1, 0.3 + Math.random() * 0.1, 0.08);
    else color.setRGB(0.3 + Math.random() * 0.1, 0.15 + Math.random() * 0.1, 0.05);
    mesh.setColorAt(i, color);
  }

  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  scene.add(mesh);
}

// ============================================================
// PARTICLE SYSTEMS
// ============================================================

// Fireflies
function createFireflies() {
  const count = 120;
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const phases = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 50;
    positions[i * 3 + 1] = 0.5 + Math.random() * 2.5;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 50;
    sizes[i] = 0.08 + Math.random() * 0.12;
    phases[i] = Math.random() * Math.PI * 2;
  }

  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
  geo.setAttribute('phase', new THREE.BufferAttribute(phases, 1));

  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: `
      attribute float size;
      attribute float phase;
      uniform float uTime;
      varying float vAlpha;
      void main() {
        vec3 pos = position;
        float t = uTime * 0.3 + phase;
        pos.x += sin(t * 1.1 + phase * 3.0) * 0.8;
        pos.y += sin(t * 0.7 + phase * 5.0) * 0.3;
        pos.z += cos(t * 0.9 + phase * 2.0) * 0.8;
        vAlpha = (sin(t * 2.0 + phase * 10.0) * 0.5 + 0.5);
        vAlpha *= vAlpha;
        vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
        gl_PointSize = size * (200.0 / -mvPosition.z);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      varying float vAlpha;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        if (d > 0.5) discard;
        float glow = exp(-d * 6.0);
        gl_FragColor = vec4(0.6, 1.0, 0.3, glow * vAlpha * 0.9);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  const points = new THREE.Points(geo, mat);
  scene.add(points);
  return { points, mat };
}

// Ambient dust/pollen
function createDustParticles() {
  const count = 300;
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const phases = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 40;
    positions[i * 3 + 1] = 0.5 + Math.random() * 5;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 40;
    phases[i] = Math.random() * Math.PI * 2;
  }

  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('phase', new THREE.BufferAttribute(phases, 1));

  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: `
      attribute float phase;
      uniform float uTime;
      varying float vAlpha;
      void main() {
        vec3 pos = position;
        float t = uTime * 0.15 + phase;
        pos.x += sin(t + phase * 2.0) * 1.5;
        pos.y += sin(t * 0.5 + phase) * 0.5;
        pos.z += cos(t * 0.7 + phase * 3.0) * 1.5;
        vAlpha = sin(t * 0.8 + phase * 5.0) * 0.3 + 0.4;
        vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
        gl_PointSize = 2.5 * (150.0 / -mvPosition.z);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      varying float vAlpha;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        if (d > 0.5) discard;
        float glow = 1.0 - d * 2.0;
        gl_FragColor = vec4(0.8, 0.7, 0.5, glow * vAlpha * 0.3);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  const points = new THREE.Points(geo, mat);
  scene.add(points);
  return { points, mat };
}

// Campfire embers
function createEmberParticles() {
  const count = 80;
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const velocities = new Float32Array(count * 3);
  const lifetimes = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    resetEmber(positions, velocities, lifetimes, i);
  }

  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const mat = new THREE.PointsMaterial({
    color: 0xff6622, size: 0.06, transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false, opacity: 0.8,
  });

  const points = new THREE.Points(geo, mat);
  scene.add(points);
  return { points, positions, velocities, lifetimes, count };
}

function resetEmber(positions, velocities, lifetimes, i) {
  // Pick a random campfire
  if (campfires.length === 0) return;
  const fire = campfires[Math.floor(Math.random() * campfires.length)];
  const pos = fire.group.position;

  positions[i * 3] = pos.x + (Math.random() - 0.5) * 0.3;
  positions[i * 3 + 1] = pos.y + 0.2;
  positions[i * 3 + 2] = pos.z + (Math.random() - 0.5) * 0.3;

  velocities[i * 3] = (Math.random() - 0.5) * 0.3;
  velocities[i * 3 + 1] = 1.5 + Math.random() * 2;
  velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.3;

  lifetimes[i] = 1 + Math.random() * 2;
}

// Ground fog
function createGroundFog() {
  const count = 40;
  const fogGroup = new THREE.Group();

  for (let i = 0; i < count; i++) {
    const x = (Math.random() - 0.5) * 50;
    const z = (Math.random() - 0.5) * 50;
    const y = getGroundHeight(x, z) + 0.15;

    const size = 2 + Math.random() * 4;
    const geo = new THREE.PlaneGeometry(size, size);
    geo.rotateX(-Math.PI / 2);

    const mat = new THREE.MeshBasicMaterial({
      color: 0x1a2a3a, transparent: true, opacity: 0.08 + Math.random() * 0.06,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });

    const fog = new THREE.Mesh(geo, mat);
    fog.position.set(x, y, z);
    fog.rotation.y = Math.random() * Math.PI;
    fog.userData = { phase: Math.random() * Math.PI * 2, speed: 0.1 + Math.random() * 0.2 };
    fogGroup.add(fog);
  }

  scene.add(fogGroup);
  return fogGroup;
}

// ============================================================
// PLAYER CHARACTER
// ============================================================
const player = { x: 0, z: 0, targetX: 0, targetZ: 0, angle: 0, speed: 6 };
const cam = { distance: 12, height: 10, angleOffset: 0, smoothAngle: 0 };
const keys = {};

function createPlayer() {
  const group = new THREE.Group();

  // Body
  const bodyGeo = new THREE.CylinderGeometry(0.18, 0.22, 0.7, 8);
  const body = new THREE.Mesh(bodyGeo, playerMat);
  body.position.y = 0.5;
  body.castShadow = true;
  group.add(body);

  // Head
  const headGeo = new THREE.SphereGeometry(0.15, 8, 6);
  const head = new THREE.Mesh(headGeo, playerMat);
  head.position.y = 1.0;
  head.castShadow = true;
  group.add(head);

  // Cloak
  const cloakGeo = new THREE.ConeGeometry(0.3, 0.8, 8, 1, true);
  const cloak = new THREE.Mesh(cloakGeo, cloakMat);
  cloak.position.y = 0.6;
  cloak.castShadow = true;
  group.add(cloak);

  // Torch — held in hand
  const torchGroup = new THREE.Group();
  const stickGeo = new THREE.CylinderGeometry(0.02, 0.025, 0.5, 4);
  const stick = new THREE.Mesh(stickGeo, woodMat);
  stick.position.y = 0.25;
  torchGroup.add(stick);

  // Torch flame light
  const torchLight = new THREE.PointLight(0xff8833, 6, 18);
  torchLight.position.y = 0.55;
  torchLight.castShadow = true;
  torchLight.shadow.mapSize.set(512, 512);
  torchLight.shadow.bias = -0.005;
  torchGroup.add(torchLight);

  // Flame glow
  const flameMat = new THREE.MeshBasicMaterial({ color: 0xff6622 });
  const flameGeo = new THREE.SphereGeometry(0.06, 4, 4);
  const flame = new THREE.Mesh(flameGeo, flameMat);
  flame.position.y = 0.55;
  torchGroup.add(flame);

  torchGroup.position.set(0.25, 0.4, 0.1);
  group.add(torchGroup);

  // Ground glow beneath player
  const groundGlow = new THREE.PointLight(0xff6622, 2, 8);
  groundGlow.position.set(0, 0.1, 0);
  group.add(groundGlow);

  group.position.set(0, 0, 0);
  scene.add(group);

  return { group, torchLight, flame, torchGroup, groundGlow };
}

// ============================================================
// FOOTSTEP PARTICLES
// ============================================================
function createFootstepSystem() {
  const particles = [];
  const maxParticles = 50;
  const geo = new THREE.PlaneGeometry(0.15, 0.15);
  geo.rotateX(-Math.PI / 2);

  return {
    particles,
    emit(x, y, z) {
      if (particles.length >= maxParticles) {
        const old = particles.shift();
        scene.remove(old.mesh);
      }
      const mat = new THREE.MeshBasicMaterial({
        color: 0x2a2a1a, transparent: true, opacity: 0.3, depthWrite: false,
      });
      const mesh = new THREE.Mesh(geo.clone(), mat);
      mesh.position.set(x + (Math.random() - 0.5) * 0.15, y + 0.02, z + (Math.random() - 0.5) * 0.15);
      mesh.rotation.y = Math.random() * Math.PI;
      scene.add(mesh);
      particles.push({ mesh, life: 1 });
    },
    update(dt) {
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life -= dt * 0.5;
        p.mesh.material.opacity = p.life * 0.3;
        if (p.life <= 0) {
          scene.remove(p.mesh);
          particles.splice(i, 1);
        }
      }
    }
  };
}

// ============================================================
// COLLECTIBLE GLOWING ORBS
// ============================================================
const orbs = [];

function createOrb(x, z) {
  const geo = new THREE.IcosahedronGeometry(0.12, 1);
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffcc44, emissive: 0xffaa00, emissiveIntensity: 1.0,
    roughness: 0.3, metalness: 0.5,
  });
  const mesh = new THREE.Mesh(geo, mat);
  const y = getGroundHeight(x, z) + 0.6;
  mesh.position.set(x, y, z);

  const light = new THREE.PointLight(0xffaa00, 0.5, 4);
  light.position.copy(mesh.position);
  light.position.y += 0.1;
  scene.add(light);
  scene.add(mesh);

  orbs.push({ mesh, light, baseY: y, phase: Math.random() * Math.PI * 2, collected: false });
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================
function getGroundHeight(x, z) {
  return fbm(x * 0.08, z * 0.08, 3) * 0.5 + fbm(x * 0.03, z * 0.03, 2) * 1.0;
}

function isNearWater(x, z) {
  // Pond at (8, -6)
  const dx = x - 8, dz = z + 6;
  return Math.sqrt(dx * dx + dz * dz) < 4;
}

// ============================================================
// WORLD GENERATION
// ============================================================
function generateWorld() {
  createGround();
  createGrassField();
  createFallenLeaves();

  // Trees — scattered with noise-based density
  for (let i = 0; i < 120; i++) {
    const x = (Math.random() - 0.5) * 60;
    const z = (Math.random() - 0.5) * 60;
    const distFromCenter = Math.sqrt(x * x + z * z);
    if (distFromCenter < 6) continue; // Clear area around spawn
    if (isNearWater(x, z)) continue;
    const density = fbm(x * 0.05 + 200, z * 0.05 + 200, 2) * 0.5 + 0.5;
    if (Math.random() > density * 0.7) continue;
    createTree(x, z, 0.7 + Math.random() * 0.6);
  }

  // Framing trees around spawn clearing
  createTree(-6, -2, 1.2);
  createTree(-5, 4, 1.0);
  createTree(6, -3, 1.1);
  createTree(7, 3, 0.9);
  createTree(-3, -7, 1.3);
  createTree(4, -7, 1.0);
  createTree(-7, 2, 0.8);
  createTree(0, 7, 1.1);

  // Rocks
  for (let i = 0; i < 60; i++) {
    const x = (Math.random() - 0.5) * 55;
    const z = (Math.random() - 0.5) * 55;
    if (isNearWater(x, z)) continue;
    createRock(x, z, 0.5 + Math.random() * 1.5);
  }

  // Ruins — a few clusters
  createRuinWall(-5, -3, 0);
  createRuinWall(-5, -5, 0.2);
  createRuinWall(-7, -4, Math.PI / 2);
  createPillar(-4, -4);
  createPillar(-8, -3);
  createPillar(-6, -6);

  createRuinWall(10, 8, Math.PI / 4);
  createRuinWall(12, 7, 0);
  createPillar(11, 9);
  createPillar(13, 6);

  createRuinWall(-12, 10, -0.3);
  createPillar(-11, 11);
  createPillar(-13, 9);

  // Campfires — including one near spawn
  createCampfire(3, -3);
  createCampfire(-6, -4);
  createCampfire(11, 8);
  createCampfire(3, 12);
  createCampfire(-10, -12);

  // Glowing mushrooms — clusters near trees and ruins
  // Small ruin arch near spawn
  createPillar(2, -1);
  createPillar(4, -1);
  createRuinWall(3, 1, 0);

  // Rocks near spawn
  createRock(1, 2, 0.8);
  createRock(-2, -1, 1.2);
  createRock(5, 1, 0.6);

  const mushroomPositions = [
    [1, -2], [2, 1], [-1, 3],
    [-4, -2], [-5, -6], [-7, -5], [-3, -5],
    [9, 7], [12, 6], [10, 9],
    [-11, 10], [-13, 11],
    [5, -8], [6, -9], [4, -7],
    [-15, 5], [-14, 4], [-16, 6],
    [2, 15], [3, 14],
    [-8, -13], [-9, -11],
  ];

  for (const [mx, mz] of mushroomPositions) {
    const clusterSize = 2 + Math.floor(Math.random() * 4);
    for (let i = 0; i < clusterSize; i++) {
      const ox = mx + (Math.random() - 0.5) * 1.5;
      const oz = mz + (Math.random() - 0.5) * 1.5;
      createGlowingMushroom(ox, oz, Math.random() > 0.5 ? 'green' : 'purple');
    }
  }

  // Water pond
  createPond(8, -6, 3);

  // Collectible orbs
  const orbPositions = [
    [-6, -5], [12, 8], [-12, 10], [5, -8], [-15, 5],
    [3, 13], [-8, -12], [15, -3], [-18, -5], [0, 18],
    [8, -3], [-3, 8], [18, 12], [-20, -8], [6, 20],
  ];
  for (const [ox, oz] of orbPositions) {
    createOrb(ox, oz);
  }
}

// ============================================================
// PROCEDURAL AMBIENT AUDIO (Web Audio API)
// ============================================================
let audioCtx = null;
let audioStarted = false;

function initAudio() {
  if (audioStarted) return;
  audioStarted = true;

  audioCtx = new (window.AudioContext || window.webkitAudioContext)();

  // Wind — filtered noise
  const windBufferSize = audioCtx.sampleRate * 4;
  const windBuffer = audioCtx.createBuffer(1, windBufferSize, audioCtx.sampleRate);
  const windData = windBuffer.getChannelData(0);
  for (let i = 0; i < windBufferSize; i++) windData[i] = (Math.random() * 2 - 1) * 0.03;

  const windSource = audioCtx.createBufferSource();
  windSource.buffer = windBuffer;
  windSource.loop = true;

  const windFilter = audioCtx.createBiquadFilter();
  windFilter.type = 'lowpass';
  windFilter.frequency.value = 200;
  windFilter.Q.value = 0.5;

  const windGain = audioCtx.createGain();
  windGain.gain.value = 0.6;

  windSource.connect(windFilter).connect(windGain).connect(audioCtx.destination);
  windSource.start();

  // Slowly modulate wind
  function modulateWind() {
    const freq = 120 + Math.sin(Date.now() * 0.0003) * 80;
    windFilter.frequency.setTargetAtTime(freq, audioCtx.currentTime, 0.5);
    const vol = 0.4 + Math.sin(Date.now() * 0.0005) * 0.2;
    windGain.gain.setTargetAtTime(vol, audioCtx.currentTime, 1.0);
    requestAnimationFrame(modulateWind);
  }
  modulateWind();

  // Crickets — periodic chirps
  function chirp() {
    const osc = audioCtx.createOscillator();
    osc.frequency.value = 4000 + Math.random() * 2000;
    osc.type = 'sine';
    const g = audioCtx.createGain();
    g.gain.value = 0;
    g.gain.setTargetAtTime(0.02 + Math.random() * 0.02, audioCtx.currentTime, 0.01);
    g.gain.setTargetAtTime(0, audioCtx.currentTime + 0.05 + Math.random() * 0.05, 0.02);

    const filter = audioCtx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = osc.frequency.value;
    filter.Q.value = 10;

    osc.connect(filter).connect(g).connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.2);

    // Double chirp
    if (Math.random() > 0.5) {
      setTimeout(() => {
        const osc2 = audioCtx.createOscillator();
        osc2.frequency.value = osc.frequency.value * 1.02;
        osc2.type = 'sine';
        const g2 = audioCtx.createGain();
        g2.gain.value = 0;
        g2.gain.setTargetAtTime(0.015, audioCtx.currentTime, 0.01);
        g2.gain.setTargetAtTime(0, audioCtx.currentTime + 0.04, 0.02);
        osc2.connect(filter).connect(g2).connect(audioCtx.destination);
        osc2.start();
        osc2.stop(audioCtx.currentTime + 0.15);
      }, 80);
    }

    setTimeout(chirp, 500 + Math.random() * 3000);
  }
  setTimeout(chirp, 1000);

  // Deep ambient drone
  const droneOsc = audioCtx.createOscillator();
  droneOsc.type = 'sine';
  droneOsc.frequency.value = 55;
  const droneGain = audioCtx.createGain();
  droneGain.gain.value = 0.04;
  const droneFilter = audioCtx.createBiquadFilter();
  droneFilter.type = 'lowpass';
  droneFilter.frequency.value = 100;
  droneOsc.connect(droneFilter).connect(droneGain).connect(audioCtx.destination);
  droneOsc.start();

  // Second drone — fifth above
  const drone2 = audioCtx.createOscillator();
  drone2.type = 'sine';
  drone2.frequency.value = 82;
  const drone2Gain = audioCtx.createGain();
  drone2Gain.gain.value = 0.02;
  drone2.connect(droneFilter).connect(drone2Gain).connect(audioCtx.destination);
  drone2.start();
}

// ============================================================
// INPUT
// ============================================================
window.addEventListener('keydown', e => {
  keys[e.key.toLowerCase()] = true;
  // Start audio on first interaction
  initAudio();
});
window.addEventListener('keyup', e => keys[e.key.toLowerCase()] = false);

// Custom cursor
const cursorEl = document.getElementById('cursor');
window.addEventListener('mousemove', e => {
  cursorEl.style.left = e.clientX + 'px';
  cursorEl.style.top = e.clientY + 'px';
});

// Click to interact — collect orbs
window.addEventListener('click', () => {
  initAudio();

  // Check orb proximity
  for (const orb of orbs) {
    if (orb.collected) continue;
    const dx = player.x - orb.mesh.position.x;
    const dz = player.z - orb.mesh.position.z;
    if (Math.sqrt(dx * dx + dz * dz) < 1.5) {
      orb.collected = true;
      // Animate collection
      orb.collecting = true;
      orb.collectTime = 0;
    }
  }
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});

// ============================================================
// MAIN LOOP
// ============================================================
const clock = new THREE.Clock();
let playerObj = null;
let fireflies = null;
let dustParticles = null;
let embers = null;
let fogGroup = null;
let footsteps = null;
let footstepTimer = 0;
let orbsCollected = 0;
let starfield = null;

// Generate the world
generateWorld();
starfield = createStarfield();

// Moon
const moonGeo = new THREE.CircleGeometry(2.5, 32);
const moonMat = new THREE.MeshBasicMaterial({
  color: 0xddeeff, transparent: true, opacity: 0.15,
  blending: THREE.AdditiveBlending, depthWrite: false,
});
const moon = new THREE.Mesh(moonGeo, moonMat);
moon.position.set(-30, 50, -40);
moon.lookAt(0, 0, 0);
scene.add(moon);

// Moon halo
const haloGeo = new THREE.CircleGeometry(6, 32);
const haloMat = new THREE.MeshBasicMaterial({
  color: 0x556688, transparent: true, opacity: 0.05,
  blending: THREE.AdditiveBlending, depthWrite: false,
});
const halo = new THREE.Mesh(haloGeo, haloMat);
halo.position.copy(moon.position);
halo.lookAt(0, 0, 0);
scene.add(halo);
playerObj = createPlayer();
fireflies = createFireflies();
dustParticles = createDustParticles();
embers = createEmberParticles();
fogGroup = createGroundFog();
footsteps = createFootstepSystem();

// Hide loading screen
setTimeout(() => {
  document.getElementById('loading').classList.add('fade');
  setTimeout(() => document.getElementById('loading').style.display = 'none', 1000);
}, 500);

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const time = clock.getElapsedTime();

  // ---- Read camera sliders ----
  const heightSlider = document.getElementById('camHeight');
  const distSlider = document.getElementById('camDist');
  if (heightSlider) {
    cam.height = parseFloat(heightSlider.value);
    document.getElementById('camHeightVal').textContent = cam.height;
  }
  if (distSlider) {
    cam.distance = parseFloat(distSlider.value);
    document.getElementById('camDistVal').textContent = cam.distance;
  }

  // ---- Player Movement (3rd person: W/S = forward/back, A/D = turn) ----
  const turnSpeed = 3;
  if (keys['a'] || keys['arrowleft']) player.angle += turnSpeed * dt;
  if (keys['d'] || keys['arrowright']) player.angle -= turnSpeed * dt;

  let forward = 0;
  if (keys['w'] || keys['arrowup']) forward = 1;
  if (keys['s'] || keys['arrowdown']) forward = -1;

  const isMoving = forward !== 0;
  if (isMoving) {
    const moveX = Math.sin(player.angle) * forward * player.speed * dt;
    const moveZ = Math.cos(player.angle) * forward * player.speed * dt;

    player.x += moveX;
    player.z += moveZ;

    // Clamp to world bounds
    player.x = THREE.MathUtils.clamp(player.x, -35, 35);
    player.z = THREE.MathUtils.clamp(player.z, -35, 35);

    // Footstep particles
    footstepTimer += dt;
    if (footstepTimer > 0.15) {
      footstepTimer = 0;
      const gy = getGroundHeight(player.x, player.z);
      footsteps.emit(player.x, gy, player.z);
    }
  }

  // Update player position
  const groundY = getGroundHeight(player.x, player.z);
  playerObj.group.position.set(player.x, groundY, player.z);
  playerObj.group.rotation.y = player.angle;

  // Player bob
  if (isMoving) {
    playerObj.group.position.y += Math.sin(time * 8) * 0.03;
  }

  // Torch flicker
  const torchFlicker = 1 + Math.sin(time * 12) * 0.1 + Math.sin(time * 17) * 0.05 + Math.sin(time * 23) * 0.03;
  playerObj.torchLight.intensity = 4 * torchFlicker;
  playerObj.flame.scale.setScalar(0.8 + Math.sin(time * 15) * 0.3);

  // ---- 3rd Person Camera (orbits behind player) ----
  // Smoothly follow the player's facing angle using shortest-path rotation
  let angleDiff = player.angle - cam.smoothAngle;
  // Normalize to [-PI, PI] for shortest rotation path
  while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
  while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
  cam.smoothAngle += angleDiff * (1 - Math.pow(0.02, dt));

  // Camera position: behind the player based on their facing direction
  const camTargetX = player.x - Math.sin(cam.smoothAngle) * cam.distance;
  const camTargetZ = player.z - Math.cos(cam.smoothAngle) * cam.distance;
  const camTargetY = groundY + cam.height;

  const camSmooth = 1 - Math.pow(0.01, dt);
  camera.position.x = THREE.MathUtils.lerp(camera.position.x, camTargetX, camSmooth);
  camera.position.y = THREE.MathUtils.lerp(camera.position.y, camTargetY, camSmooth);
  camera.position.z = THREE.MathUtils.lerp(camera.position.z, camTargetZ, camSmooth);
  camera.lookAt(player.x, groundY + 0.8, player.z);

  // ---- Campfire Flicker ----
  for (const fire of campfires) {
    const flicker = 1 + Math.sin(time * 10 + fire.group.position.x) * 0.15 +
      Math.sin(time * 15.7 + fire.group.position.z) * 0.1 +
      Math.sin(time * 23.3) * 0.05;
    fire.fireLight.intensity = fire.baseIntensity * flicker;
    fire.glowLight.intensity = flicker * 0.8;

    // Animate fire planes
    if (fire.fireGroup) {
      for (const child of fire.fireGroup.children) {
        const fi = child.userData.fireIndex;
        child.rotation.y += dt * (2 + fi * 0.5);
        child.scale.x = 0.8 + Math.sin(time * 8 + fi * 2) * 0.3;
        child.scale.y = 0.8 + Math.sin(time * 10 + fi * 3) * 0.25;
        child.position.y = 0.2 + fi * 0.06 + Math.sin(time * 12 + fi) * 0.03;
      }
    }
  }

  // ---- Mushroom Glow Pulse ----
  for (const m of mushrooms) {
    const pulse = 0.7 + Math.sin(time * 1.5 + m.phase) * 0.3;
    m.light.intensity = m.baseIntensity * pulse;
  }

  // ---- Particle Updates ----
  fireflies.mat.uniforms.uTime.value = time;
  dustParticles.mat.uniforms.uTime.value = time;

  // Embers
  const ePos = embers.positions;
  const eVel = embers.velocities;
  const eLife = embers.lifetimes;
  for (let i = 0; i < embers.count; i++) {
    eLife[i] -= dt;
    if (eLife[i] <= 0) {
      resetEmber(ePos, eVel, eLife, i);
      continue;
    }
    ePos[i * 3] += eVel[i * 3] * dt;
    ePos[i * 3 + 1] += eVel[i * 3 + 1] * dt;
    ePos[i * 3 + 2] += eVel[i * 3 + 2] * dt;
    eVel[i * 3 + 1] -= dt * 0.5; // gravity
    eVel[i * 3] += (Math.random() - 0.5) * dt * 2; // wind
    eVel[i * 3 + 2] += (Math.random() - 0.5) * dt * 2;
  }
  embers.points.geometry.attributes.position.needsUpdate = true;

  // Ground fog drift
  for (const child of fogGroup.children) {
    const ud = child.userData;
    child.position.x += Math.sin(time * ud.speed + ud.phase) * dt * 0.3;
    child.position.z += Math.cos(time * ud.speed * 0.7 + ud.phase) * dt * 0.2;
    child.material.opacity = 0.06 + Math.sin(time * 0.3 + ud.phase) * 0.03;
  }

  // Footstep fade
  footsteps.update(dt);

  // ---- Orb Animation ----
  for (const orb of orbs) {
    if (orb.collected && orb.collecting) {
      orb.collectTime += dt * 3;
      orb.mesh.scale.setScalar(Math.max(0, 1 - orb.collectTime));
      orb.mesh.position.y = orb.baseY + orb.collectTime * 2;
      orb.light.intensity = Math.max(0, 0.5 * (1 - orb.collectTime));
      orb.mesh.rotation.y += dt * 10;
      if (orb.collectTime >= 1) {
        orb.collecting = false;
        scene.remove(orb.mesh);
        scene.remove(orb.light);
        orbsCollected++;
        document.getElementById('ui').textContent = `${orbsCollected} ancient relics collected`;
      }
      continue;
    }
    if (!orb.collected) {
      orb.mesh.position.y = orb.baseY + Math.sin(time * 2 + orb.phase) * 0.15;
      orb.mesh.rotation.y += dt * 1.5;
      orb.light.position.y = orb.mesh.position.y + 0.1;
      orb.light.intensity = 0.3 + Math.sin(time * 3 + orb.phase) * 0.2;
    }
  }

  // ---- Stars twinkle ----
  if (starfield) starfield.mat.uniforms.uTime.value = time;

  // ---- Post-processing uniforms ----
  vignettePass.uniforms.uTime.value = time;

  // ---- Render ----
  composer.render();
}

animate();
