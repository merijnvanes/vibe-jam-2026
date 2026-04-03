import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

// ============================================================
// SIMPLEX NOISE
// ============================================================
const F2 = 0.5 * (Math.sqrt(3) - 1), G2 = (3 - Math.sqrt(3)) / 6;
const grad3 = [[1,1,0],[-1,1,0],[1,-1,0],[-1,-1,0],[1,0,1],[-1,0,1],[1,0,-1],[-1,0,-1],[0,1,1],[0,-1,1],[0,1,-1],[0,-1,-1]];
const perm = new Uint8Array(512), permMod12 = new Uint8Array(512);
{
  const p = Array.from({length: 256}, (_, i) => i);
  for (let i = 255; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  for (let i = 0; i < 512; i++) { perm[i] = p[i & 255]; permMod12[i] = perm[i] % 12; }
}

function noise2D(x, y) {
  const s = (x + y) * F2;
  const i = Math.floor(x + s), j = Math.floor(y + s);
  const t = (i + j) * G2;
  const x0 = x - (i - t), y0 = y - (j - t);
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
  for (let i = 0; i < octaves; i++) { val += noise2D(x * freq, y * freq) * amp; max += amp; amp *= 0.5; freq *= 2; }
  return val / max;
}

// ============================================================
// SCENE SETUP
// ============================================================
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x101828);
scene.fog = new THREE.FogExp2(0x101828, 0.008);

// Isometric orthographic camera
const aspect = window.innerWidth / window.innerHeight;
const frustumSize = 24;
const camera = new THREE.OrthographicCamera(
  -frustumSize * aspect / 2, frustumSize * aspect / 2,
  frustumSize / 2, -frustumSize / 2,
  0.1, 200
);

// Classic isometric angle: 35.264° pitch, 45° yaw
const isoDistance = 40;
const isoPitch = Math.atan(1 / Math.sqrt(2)); // ~35.264°
const isoYaw = Math.PI / 4; // 45°
camera.position.set(
  isoDistance * Math.cos(isoPitch) * Math.sin(isoYaw),
  isoDistance * Math.sin(isoPitch),
  isoDistance * Math.cos(isoPitch) * Math.cos(isoYaw)
);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 3.5;
document.body.appendChild(renderer.domElement);

// ============================================================
// POST-PROCESSING
// ============================================================
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.9, 0.5, 0.6
);
composer.addPass(bloomPass);

// Tilt-shift + vignette + color grading
const tiltShiftShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform vec2 uResolution;
    varying vec2 vUv;

    vec4 blur(sampler2D tex, vec2 uv, vec2 dir) {
      vec4 sum = vec4(0.0);
      vec2 step = dir / uResolution;
      sum += texture2D(tex, uv - 4.0 * step) * 0.051;
      sum += texture2D(tex, uv - 3.0 * step) * 0.0918;
      sum += texture2D(tex, uv - 2.0 * step) * 0.12245;
      sum += texture2D(tex, uv - 1.0 * step) * 0.1531;
      sum += texture2D(tex, uv) * 0.1633;
      sum += texture2D(tex, uv + 1.0 * step) * 0.1531;
      sum += texture2D(tex, uv + 2.0 * step) * 0.12245;
      sum += texture2D(tex, uv + 3.0 * step) * 0.0918;
      sum += texture2D(tex, uv + 4.0 * step) * 0.051;
      return sum;
    }

    void main() {
      vec4 color = texture2D(tDiffuse, vUv);

      // Tilt-shift: blur top and bottom, sharp in center band
      float focus = smoothstep(0.0, 0.35, vUv.y) * smoothstep(1.0, 0.65, vUv.y);
      float blurAmount = (1.0 - focus) * 4.0;
      if (blurAmount > 0.3) {
        vec4 blurred = blur(tDiffuse, vUv, vec2(blurAmount, 0.0));
        vec4 blurred2 = blur(tDiffuse, vUv, vec2(0.0, blurAmount));
        vec4 finalBlur = (blurred + blurred2) * 0.5;
        color = mix(color, finalBlur, (1.0 - focus) * 0.7);
      }

      // Vignette
      vec2 center = vUv - 0.5;
      float dist = length(center);
      float vig = smoothstep(0.7, 0.25, dist);
      color.rgb *= mix(0.55, 1.0, vig);

      // Color grading: warm highlights, cool shadows
      float lum = dot(color.rgb, vec3(0.299, 0.587, 0.114));
      color.rgb = mix(
        color.rgb * vec3(0.8, 0.85, 1.15),  // cool shadows
        color.rgb * vec3(1.08, 1.02, 0.92),  // warm highlights
        smoothstep(0.0, 0.5, lum)
      );

      // Subtle saturation boost
      vec3 grey = vec3(lum);
      color.rgb = mix(grey, color.rgb, 1.15);

      // Film grain
      float grain = (fract(sin(dot(vUv * uTime * 80.0, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) * 0.025;
      color.rgb += grain;

      gl_FragColor = color;
    }
  `
};
const tiltShiftPass = new ShaderPass(tiltShiftShader);
composer.addPass(tiltShiftPass);

// ============================================================
// LIGHTING — twilight atmosphere with warm/cool contrast
// ============================================================

// Cool blue twilight ambient
const ambientLight = new THREE.AmbientLight(0x3a4a6a, 5.0);
scene.add(ambientLight);

// Moonlight — cool silver-blue directional
const moonLight = new THREE.DirectionalLight(0x8899cc, 4.0);
moonLight.position.set(-15, 25, -10);
moonLight.castShadow = true;
moonLight.shadow.mapSize.set(2048, 2048);
moonLight.shadow.camera.left = -25;
moonLight.shadow.camera.right = 25;
moonLight.shadow.camera.top = 25;
moonLight.shadow.camera.bottom = -25;
moonLight.shadow.camera.near = 0.5;
moonLight.shadow.camera.far = 80;
moonLight.shadow.bias = -0.002;
moonLight.shadow.normalBias = 0.02;
scene.add(moonLight);

// Subtle warm fill from opposite side (sunset remnant)
const fillLight = new THREE.DirectionalLight(0xcc7744, 1.5);
fillLight.position.set(15, 10, 10);
scene.add(fillLight);

// Hemisphere: sky blue top, warm earth bottom
const hemiLight = new THREE.HemisphereLight(0x446688, 0x554433, 2.5);
scene.add(hemiLight);

// ============================================================
// MATERIALS
// ============================================================
const groundMat = new THREE.MeshStandardMaterial({ color: 0x2a3a22, roughness: 0.92, metalness: 0 });
const stoneMat = new THREE.MeshStandardMaterial({ color: 0x6a6a6a, roughness: 0.8, metalness: 0.05 });
const darkStoneMat = new THREE.MeshStandardMaterial({ color: 0x4a4a4a, roughness: 0.85, metalness: 0.05 });
const cobbleMat = new THREE.MeshStandardMaterial({ color: 0x6a6560, roughness: 0.82, metalness: 0.05 });
const woodMat = new THREE.MeshStandardMaterial({ color: 0x6a4422, roughness: 0.85, metalness: 0 });
const darkWoodMat = new THREE.MeshStandardMaterial({ color: 0x4a2a12, roughness: 0.9, metalness: 0 });
const roofMat = new THREE.MeshStandardMaterial({ color: 0x7a3a2a, roughness: 0.8, metalness: 0 });
const roofMat2 = new THREE.MeshStandardMaterial({ color: 0x3a4a5a, roughness: 0.75, metalness: 0.1 });
const plasterMat = new THREE.MeshStandardMaterial({ color: 0xd4c8b0, roughness: 0.85, metalness: 0 });
const plasterMat2 = new THREE.MeshStandardMaterial({ color: 0xc0b89a, roughness: 0.85, metalness: 0 });
const windowGlowMat = new THREE.MeshStandardMaterial({
  color: 0xffdd77, emissive: 0xffbb44, emissiveIntensity: 3.0,
  roughness: 0.2, metalness: 0.1,
});
const leafMat = new THREE.MeshStandardMaterial({ color: 0x2a5a2a, roughness: 0.75, metalness: 0, side: THREE.DoubleSide });
const darkLeafMat = new THREE.MeshStandardMaterial({ color: 0x1a4a1f, roughness: 0.8, metalness: 0, side: THREE.DoubleSide });
const warmLeafMat = new THREE.MeshStandardMaterial({ color: 0x5a6a2a, roughness: 0.75, metalness: 0, side: THREE.DoubleSide });

const lanternGlowMat = new THREE.MeshBasicMaterial({ color: 0xffaa44 });
const playerMat = new THREE.MeshStandardMaterial({ color: 0xccaa77, roughness: 0.7, metalness: 0.2 });
const cloakMat = new THREE.MeshStandardMaterial({ color: 0x3a2838, roughness: 0.85, metalness: 0 });

// ============================================================
// HELPER: get terrain height
// ============================================================
function getGroundHeight(x, z) {
  return fbm(x * 0.06, z * 0.06, 3) * 0.6 + fbm(x * 0.02, z * 0.02, 2) * 0.8;
}

// ============================================================
// GROUND TERRAIN
// ============================================================
function createGround() {
  const size = 50;
  const segments = 180;
  const geo = new THREE.PlaneGeometry(size, size, segments, segments);
  geo.rotateX(-Math.PI / 2);

  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = getGroundHeight(x, z);
    pos.setY(i, h);

    // Color variation
    const n1 = fbm(x * 0.12, z * 0.12, 3) * 0.5 + 0.5;
    const n2 = fbm(x * 0.25 + 100, z * 0.25, 2) * 0.5 + 0.5;
    const n3 = fbm(x * 0.06 + 50, z * 0.06 + 50, 2) * 0.5 + 0.5;

    // Rich greens and earthy browns — brighter
    let r = 0.13 + n1 * 0.08;
    let g = 0.25 + n1 * 0.10;
    let b = 0.10 + n1 * 0.05;

    // Mossy patches
    if (n2 > 0.55) {
      const f = (n2 - 0.55) * 4;
      r = THREE.MathUtils.lerp(r, 0.06, f);
      g = THREE.MathUtils.lerp(g, 0.30, f);
      b = THREE.MathUtils.lerp(b, 0.10, f);
    }

    // Dark earth patches
    if (n3 < 0.35) {
      const f = (0.35 - n3) * 3;
      r = THREE.MathUtils.lerp(r, 0.14, f);
      g = THREE.MathUtils.lerp(g, 0.10, f);
      b = THREE.MathUtils.lerp(b, 0.05, f);
    }

    colors[i * 3] = r;
    colors[i * 3 + 1] = g;
    colors[i * 3 + 2] = b;
  }

  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

// ============================================================
// COBBLESTONE PATHS
// ============================================================
function createPath(points, width = 1.2) {
  // Create a path from a series of points as a raised cobblestone strip
  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i], p2 = points[i + 1];
    const dx = p2.x - p1.x, dz = p2.z - p1.z;
    const len = Math.sqrt(dx * dx + dz * dz);
    const angle = Math.atan2(dx, dz);

    const geo = new THREE.PlaneGeometry(width, len, Math.ceil(width * 3), Math.ceil(len * 3));
    geo.rotateX(-Math.PI / 2);

    // Add cobblestone bumpiness
    const pos = geo.attributes.position;
    for (let j = 0; j < pos.count; j++) {
      const bump = Math.sin(pos.getX(j) * 8) * Math.cos(pos.getZ(j) * 6) * 0.02;
      pos.setY(j, bump);
    }
    geo.computeVertexNormals();

    const mesh = new THREE.Mesh(geo, cobbleMat);
    mesh.position.set(
      (p1.x + p2.x) / 2,
      getGroundHeight((p1.x + p2.x) / 2, (p1.z + p2.z) / 2) + 0.03,
      (p1.z + p2.z) / 2
    );
    mesh.rotation.y = angle;
    mesh.receiveShadow = true;
    scene.add(mesh);
  }
}

// ============================================================
// WATER STREAM
// ============================================================
function createStream() {
  // Winding stream through the scene
  const streamPoints = [
    new THREE.Vector3(-18, 0, -5),
    new THREE.Vector3(-12, 0, -3),
    new THREE.Vector3(-6, 0, -4),
    new THREE.Vector3(0, 0, -2),
    new THREE.Vector3(5, 0, 0),
    new THREE.Vector3(8, 0, 3),
    new THREE.Vector3(12, 0, 5),
    new THREE.Vector3(18, 0, 8),
  ];

  const curve = new THREE.CatmullRomCurve3(streamPoints);
  const tubeGeo = new THREE.TubeGeometry(curve, 60, 1.2, 8, false);

  // Flatten to a ribbon
  const pos = tubeGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const x = pos.getX(i), z = pos.getZ(i);
    pos.setY(i, getGroundHeight(x, z) - 0.15 + Math.abs(y - getGroundHeight(x, z)) * 0.05);
  }

  // Use a plane instead for cleaner water surface
  const waterGeo = new THREE.PlaneGeometry(40, 4, 80, 8);
  waterGeo.rotateX(-Math.PI / 2);

  // Shape into a winding stream
  const wPos = waterGeo.attributes.position;
  for (let i = 0; i < wPos.count; i++) {
    let x = wPos.getX(i);
    let z = wPos.getZ(i);

    // Winding path: z offset based on x
    const wind = Math.sin(x * 0.15) * 4 + Math.sin(x * 0.08) * 2;
    z += wind;
    const gh = getGroundHeight(x, z);
    wPos.setX(i, x);
    wPos.setZ(i, z);
    wPos.setY(i, gh - 0.02);
  }
  waterGeo.computeVertexNormals();

  const waterMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColor1: { value: new THREE.Color(0x2a5a8a) },
      uColor2: { value: new THREE.Color(0x3a7aaa) },
      uHighlight: { value: new THREE.Color(0x8ad0f4) },
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vWorldPos;
      void main() {
        vUv = uv;
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPos = worldPos.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uColor1;
      uniform vec3 uColor2;
      uniform vec3 uHighlight;
      varying vec2 vUv;
      varying vec3 vWorldPos;

      void main() {
        vec2 uv = vUv;

        // Flowing ripples
        float ripple1 = sin(vWorldPos.x * 2.0 + vWorldPos.z * 1.5 + uTime * 1.5) * 0.5 + 0.5;
        float ripple2 = sin(vWorldPos.x * 3.5 - uTime * 2.0 + vWorldPos.z * 0.5) * 0.5 + 0.5;
        float ripple3 = sin(vWorldPos.x * 1.0 + vWorldPos.z * 3.0 + uTime * 0.8) * 0.5 + 0.5;

        // Mix colors based on ripples
        vec3 col = mix(uColor1, uColor2, ripple1 * 0.6);
        col = mix(col, uHighlight, ripple2 * ripple3 * 0.3);

        // Edge foam
        float edge = smoothstep(0.0, 0.15, uv.y) * smoothstep(1.0, 0.85, uv.y);
        col = mix(vec3(0.6, 0.7, 0.8), col, edge);

        // Sparkle highlights — moonlight reflection
        float sparkle = pow(ripple1 * ripple2, 8.0);
        col += sparkle * 0.35;

        // Moonlight reflection on water
        col += vec3(0.04, 0.08, 0.14);

        // Transparency toward edges
        float alpha = edge * 0.9 + 0.15;

        gl_FragColor = vec4(col, alpha);
      }
    `,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  const waterMesh = new THREE.Mesh(waterGeo, waterMat);
  scene.add(waterMesh);

  // Water glow lights along the stream
  for (let wx = -12; wx <= 12; wx += 6) {
    const wz = Math.sin(wx * 0.15) * 4 + Math.sin(wx * 0.08) * 2;
    const waterLight = new THREE.PointLight(0x3366cc, 0.5, 6);
    waterLight.position.set(wx, getGroundHeight(wx, wz) + 0.5, wz);
    scene.add(waterLight);
  }

  return { mesh: waterMesh, material: waterMat };
}

// ============================================================
// BUILDINGS — cozy cottages
// ============================================================
const windowLights = [];

function createCottage(x, z, rotation = 0, variant = 0) {
  const group = new THREE.Group();
  const gy = getGroundHeight(x, z);
  group.position.set(x, gy, z);
  group.rotation.y = rotation;

  const wallMat = variant % 2 === 0 ? plasterMat : plasterMat2;
  const rMat = variant % 2 === 0 ? roofMat : roofMat2;

  // Foundation stones
  const foundGeo = new THREE.BoxGeometry(3.2, 0.3, 2.7);
  const found = new THREE.Mesh(foundGeo, darkStoneMat);
  found.position.y = 0.15;
  found.castShadow = true;
  found.receiveShadow = true;
  group.add(found);

  // Walls
  const wallGeo = new THREE.BoxGeometry(3, 2, 2.5);
  const wall = new THREE.Mesh(wallGeo, wallMat);
  wall.position.y = 1.3;
  wall.castShadow = true;
  wall.receiveShadow = true;
  group.add(wall);

  // Wooden beams (half-timber detail)
  const beamPositions = [
    { x: 0, y: 2.3, z: 1.26, sx: 3, sy: 0.08, sz: 0.05 },
    { x: 0, y: 1.3, z: 1.26, sx: 3, sy: 0.06, sz: 0.05 },
    { x: 0, y: 0.3, z: 1.26, sx: 3, sy: 0.06, sz: 0.05 },
    { x: -1.1, y: 1.3, z: 1.26, sx: 0.06, sy: 2, sz: 0.05 },
    { x: 1.1, y: 1.3, z: 1.26, sx: 0.06, sy: 2, sz: 0.05 },
    // Back side
    { x: 0, y: 2.3, z: -1.26, sx: 3, sy: 0.08, sz: 0.05 },
    { x: 0, y: 1.3, z: -1.26, sx: 3, sy: 0.06, sz: 0.05 },
  ];
  for (const bp of beamPositions) {
    const bg = new THREE.BoxGeometry(bp.sx, bp.sy, bp.sz);
    const beam = new THREE.Mesh(bg, darkWoodMat);
    beam.position.set(bp.x, bp.y, bp.z);
    beam.castShadow = true;
    group.add(beam);
  }

  // Roof — angled
  const roofGeo = new THREE.BoxGeometry(3.6, 0.15, 3.2);
  const roof1 = new THREE.Mesh(roofGeo, rMat);
  roof1.position.set(0, 2.8, 0.3);
  roof1.rotation.x = -0.35;
  roof1.castShadow = true;
  group.add(roof1);

  const roof2 = new THREE.Mesh(roofGeo, rMat);
  roof2.position.set(0, 2.8, -0.3);
  roof2.rotation.x = 0.35;
  roof2.castShadow = true;
  group.add(roof2);

  // Roof ridge
  const ridgeGeo = new THREE.BoxGeometry(3.6, 0.1, 0.2);
  const ridge = new THREE.Mesh(ridgeGeo, darkWoodMat);
  ridge.position.set(0, 3.25, 0);
  group.add(ridge);

  // Windows with warm glow
  const winPositions = [
    { x: -0.6, y: 1.5, z: 1.26, sx: 0.5, sy: 0.6, sz: 0.06 },
    { x: 0.6, y: 1.5, z: 1.26, sx: 0.5, sy: 0.6, sz: 0.06 },
    { x: 1.51, y: 1.5, z: 0, sx: 0.06, sy: 0.6, sz: 0.5 },
  ];
  for (const wp of winPositions) {
    const wg = new THREE.BoxGeometry(wp.sx, wp.sy, wp.sz);
    const win = new THREE.Mesh(wg, windowGlowMat);
    win.position.set(wp.x, wp.y, wp.z);
    group.add(win);

    // Window frame
    const frameGeo = new THREE.BoxGeometry(wp.sx + 0.08, wp.sy + 0.08, wp.sz + 0.02);
    const frame = new THREE.Mesh(frameGeo, darkWoodMat);
    frame.position.copy(win.position);
    group.add(frame);
    // Put window in front of frame
    win.position.z += (wp.sz > 0.05 ? 0 : 0.02) * Math.sign(wp.z || 1);
    win.position.x += wp.sx < 0.1 ? 0.02 * Math.sign(wp.x) : 0;
  }

  // Door
  const doorGeo = new THREE.BoxGeometry(0.5, 0.9, 0.06);
  const door = new THREE.Mesh(doorGeo, woodMat);
  door.position.set(0, 0.75, 1.27);
  group.add(door);

  // Door frame
  const doorFrameGeo = new THREE.BoxGeometry(0.6, 1.0, 0.08);
  const doorFrame = new THREE.Mesh(doorFrameGeo, darkWoodMat);
  doorFrame.position.set(0, 0.8, 1.26);
  group.add(doorFrame);

  // Warm interior light spilling from windows
  const intLight = new THREE.PointLight(0xffaa44, 5, 10);
  intLight.position.set(0, 1.5, 1.5);
  group.add(intLight);
  windowLights.push({ light: intLight, baseIntensity: 5, phase: Math.random() * Math.PI * 2 });

  // Back window light
  const backLight = new THREE.PointLight(0xffaa44, 3, 7);
  backLight.position.set(0, 1.5, -1.5);
  group.add(backLight);
  windowLights.push({ light: backLight, baseIntensity: 3, phase: Math.random() * Math.PI * 2 });

  // VOLUMETRIC LIGHT CONES from windows — the cinematic touch
  const lightConeMat = new THREE.MeshBasicMaterial({
    color: 0xffaa44,
    transparent: true,
    opacity: 0.08,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  // Front windows — light spilling outward
  for (const wp of winPositions.filter(w => w.z > 1)) {
    // Create a trapezoid shape (wider at the far end)
    const coneGeo = new THREE.BufferGeometry();
    const hw = wp.sx * 0.5; // half width of window
    const hh = wp.sy * 0.5; // half height
    const depth = 3.0; // how far the light reaches
    const spread = 1.5; // how much it fans out
    const vertices = new Float32Array([
      // Near face (at window)
      -hw, wp.y - hh, wp.z, hw, wp.y - hh, wp.z, hw, wp.y + hh, wp.z, -hw, wp.y + hh, wp.z,
      // Far face (spread out)
      -hw * spread - 0.5, 0.05, wp.z + depth,
      hw * spread + 0.5, 0.05, wp.z + depth,
      hw * spread + 0.5, wp.y + hh * 0.5, wp.z + depth,
      -hw * spread - 0.5, wp.y + hh * 0.5, wp.z + depth,
    ]);
    const indices = [
      0,1,5, 0,5,4, // bottom
      2,3,7, 2,7,6, // top
      0,4,7, 0,7,3, // left
      1,2,6, 1,6,5, // right
      0,3,2, 0,2,1, // near
      4,5,6, 4,6,7, // far
    ];
    coneGeo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    coneGeo.setIndex(indices);
    coneGeo.computeVertexNormals();

    const cone = new THREE.Mesh(coneGeo, lightConeMat);
    cone.position.x = wp.x;
    group.add(cone);
  }

  // Side window light cone
  for (const wp of winPositions.filter(w => Math.abs(w.x) > 1.2)) {
    const dir = Math.sign(wp.x);
    const coneGeo = new THREE.BufferGeometry();
    const hh = wp.sy * 0.5;
    const hz = wp.sz * 0.5;
    const depth = 3.0;
    const spread = 1.5;
    const vertices = new Float32Array([
      wp.x, wp.y - hh, -hz, wp.x, wp.y - hh, hz, wp.x, wp.y + hh, hz, wp.x, wp.y + hh, -hz,
      wp.x + dir * depth, 0.05, -hz * spread - 0.5,
      wp.x + dir * depth, 0.05, hz * spread + 0.5,
      wp.x + dir * depth, wp.y + hh * 0.5, hz * spread + 0.5,
      wp.x + dir * depth, wp.y + hh * 0.5, -hz * spread - 0.5,
    ]);
    const indices = [0,1,5, 0,5,4, 2,3,7, 2,7,6, 0,4,7, 0,7,3, 1,2,6, 1,6,5, 0,3,2, 0,2,1, 4,5,6, 4,6,7];
    coneGeo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    coneGeo.setIndex(indices);
    coneGeo.computeVertexNormals();
    const cone = new THREE.Mesh(coneGeo, lightConeMat);
    group.add(cone);
  }

  // Door light cone — warm light from doorway
  {
    const coneGeo = new THREE.BufferGeometry();
    const vertices = new Float32Array([
      -0.25, 0.3, 1.27, 0.25, 0.3, 1.27, 0.25, 1.05, 1.27, -0.25, 1.05, 1.27,
      -1.0, 0.05, 3.5, 1.0, 0.05, 3.5, 1.0, 0.5, 3.5, -1.0, 0.5, 3.5,
    ]);
    const indices = [0,1,5, 0,5,4, 2,3,7, 2,7,6, 0,4,7, 0,7,3, 1,2,6, 1,6,5, 0,3,2, 0,2,1, 4,5,6, 4,6,7];
    coneGeo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    coneGeo.setIndex(indices);
    coneGeo.computeVertexNormals();
    const cone = new THREE.Mesh(coneGeo, lightConeMat.clone());
    cone.material.opacity = 0.06;
    group.add(cone);
  }

  // Chimney
  const chimGeo = new THREE.BoxGeometry(0.3, 1.2, 0.3);
  const chimney = new THREE.Mesh(chimGeo, stoneMat);
  chimney.position.set(1.1, 3.2, -0.3);
  chimney.castShadow = true;
  group.add(chimney);

  // Chimney cap
  const capGeo = new THREE.BoxGeometry(0.4, 0.08, 0.4);
  const cap = new THREE.Mesh(capGeo, darkStoneMat);
  cap.position.set(1.1, 3.82, -0.3);
  group.add(cap);

  scene.add(group);
  return group;
}

// ============================================================
// LANTERN POSTS
// ============================================================
const lanterns = [];

function createLantern(x, z) {
  const group = new THREE.Group();
  const gy = getGroundHeight(x, z);
  group.position.set(x, gy, z);

  // Post
  const postGeo = new THREE.CylinderGeometry(0.04, 0.06, 1.8, 6);
  const post = new THREE.Mesh(postGeo, darkWoodMat);
  post.position.y = 0.9;
  post.castShadow = true;
  group.add(post);

  // Arm
  const armGeo = new THREE.BoxGeometry(0.4, 0.03, 0.03);
  const arm = new THREE.Mesh(armGeo, darkWoodMat);
  arm.position.set(0.2, 1.8, 0);
  group.add(arm);

  // Lantern housing
  const housingGeo = new THREE.BoxGeometry(0.18, 0.22, 0.18);
  const housing = new THREE.Mesh(housingGeo, darkWoodMat);
  housing.position.set(0.4, 1.7, 0);
  group.add(housing);

  // Lantern glow
  const glowGeo = new THREE.BoxGeometry(0.12, 0.14, 0.12);
  const glow = new THREE.Mesh(glowGeo, lanternGlowMat);
  glow.position.set(0.4, 1.7, 0);
  group.add(glow);

  // Point light
  const light = new THREE.PointLight(0xffaa44, 4.0, 12);
  light.position.set(0.4, 1.6, 0);
  light.castShadow = true;
  light.shadow.mapSize.set(256, 256);
  light.shadow.bias = -0.01;
  group.add(light);

  // Ground pool of light
  const groundLight = new THREE.PointLight(0xff8833, 2.0, 6);
  groundLight.position.set(0.2, 0.1, 0);
  group.add(groundLight);

  // Light cone downward from lantern
  const lanternConeMat = new THREE.MeshBasicMaterial({
    color: 0xffaa44, transparent: true, opacity: 0.07,
    blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false,
  });
  const coneGeo = new THREE.ConeGeometry(1.2, 1.7, 8, 1, true);
  const cone = new THREE.Mesh(coneGeo, lanternConeMat);
  cone.position.set(0.4, 0.85, 0);
  cone.rotation.x = Math.PI; // Point downward
  group.add(cone);

  scene.add(group);
  lanterns.push({ group, light, groundLight, baseIntensity: 4.0, phase: Math.random() * Math.PI * 2 });
  return group;
}

// ============================================================
// TREES — stylized with sway
// ============================================================
const trees = [];

function createTree(x, z, scale = 1) {
  const group = new THREE.Group();
  const gy = getGroundHeight(x, z);
  group.position.set(x, gy, z);

  // Trunk
  const trunkH = (1.5 + Math.random() * 1.5) * scale;
  const trunkR = (0.1 + Math.random() * 0.06) * scale;
  const trunkGeo = new THREE.CylinderGeometry(trunkR * 0.7, trunkR, trunkH, 6);
  const trunk = new THREE.Mesh(trunkGeo, woodMat);
  trunk.position.y = trunkH / 2;
  trunk.castShadow = true;
  trunk.receiveShadow = true;
  group.add(trunk);

  // Canopy — layered cones for depth
  const canopyGroup = new THREE.Group();
  const canopyCount = 2 + Math.floor(Math.random() * 2);
  for (let i = 0; i < canopyCount; i++) {
    const cH = (1.0 + Math.random() * 1.2) * scale;
    const cR = (0.5 + Math.random() * 0.7) * scale;
    const cGeo = new THREE.ConeGeometry(cR, cH, 6 + Math.floor(Math.random() * 3));
    const mat = [leafMat, darkLeafMat, warmLeafMat][Math.floor(Math.random() * 3)];
    const cone = new THREE.Mesh(cGeo, mat);
    cone.position.y = trunkH + cH * 0.3 + i * cH * 0.3;
    cone.position.x = (Math.random() - 0.5) * 0.2 * scale;
    cone.position.z = (Math.random() - 0.5) * 0.2 * scale;
    cone.rotation.y = Math.random() * Math.PI;
    cone.castShadow = true;
    canopyGroup.add(cone);
  }
  canopyGroup.position.y = 0;
  group.add(canopyGroup);

  scene.add(group);
  trees.push({ group, canopy: canopyGroup, phase: Math.random() * Math.PI * 2, speed: 0.3 + Math.random() * 0.4 });
  return group;
}

// ============================================================
// FLOWER PATCHES
// ============================================================
const flowerStemMat = new THREE.MeshStandardMaterial({ color: 0x2a5a1a, roughness: 0.9 });

function createFlowerPatch(cx, cz, radius = 2, count = 20) {
  const colors = [0xff4455, 0xffcc33, 0xff88aa, 0xffffff, 0xaa66cc, 0xff6644];

  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = Math.random() * radius;
    const x = cx + Math.cos(angle) * dist;
    const z = cz + Math.sin(angle) * dist;
    const gy = getGroundHeight(x, z);

    const group = new THREE.Group();
    group.position.set(x, gy, z);

    // Stem
    const stemGeo = new THREE.CylinderGeometry(0.01, 0.015, 0.2, 3);
    const stem = new THREE.Mesh(stemGeo, flowerStemMat);
    stem.position.y = 0.1;
    group.add(stem);

    // Flower head
    const color = colors[Math.floor(Math.random() * colors.length)];
    const headGeo = new THREE.SphereGeometry(0.06 + Math.random() * 0.04, 5, 4);
    const headMat = new THREE.MeshStandardMaterial({
      color, emissive: color, emissiveIntensity: 0.15, roughness: 0.7,
    });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 0.22;
    head.scale.y = 0.6;
    group.add(head);

    group.rotation.set((Math.random() - 0.5) * 0.2, Math.random() * Math.PI, 0);
    scene.add(group);
  }
}

// ============================================================
// GRASS BLADES (instanced)
// ============================================================
function createGrassField() {
  const bladeGeo = new THREE.PlaneGeometry(0.04, 0.2);
  bladeGeo.translate(0, 0.1, 0);

  const grassMat = new THREE.MeshStandardMaterial({
    color: 0x1a3a1a, roughness: 0.9, metalness: 0, side: THREE.DoubleSide,
  });

  const count = 10000;
  const mesh = new THREE.InstancedMesh(bladeGeo, grassMat, count);
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();

  let idx = 0;
  for (let i = 0; i < count; i++) {
    const x = (Math.random() - 0.5) * 40;
    const z = (Math.random() - 0.5) * 40;

    // Skip near water and buildings
    const streamZ = Math.sin(x * 0.15) * 4 + Math.sin(x * 0.08) * 2;
    if (Math.abs(z - streamZ) < 2) continue;

    const y = getGroundHeight(x, z);
    dummy.position.set(x, y, z);
    dummy.rotation.set(0, Math.random() * Math.PI * 2, (Math.random() - 0.5) * 0.3);
    dummy.scale.set(0.6 + Math.random() * 0.5, 0.4 + Math.random() * 0.8, 1);
    dummy.updateMatrix();
    mesh.setMatrixAt(idx, dummy.matrix);

    const green = 0.1 + Math.random() * 0.12;
    color.setRGB(0.04 + Math.random() * 0.04, green, 0.03 + Math.random() * 0.03);
    mesh.setColorAt(idx, color);
    idx++;
  }

  mesh.count = idx;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  scene.add(mesh);
}

// ============================================================
// ROCKS
// ============================================================
function createRock(x, z, scale = 1) {
  const geo = new THREE.DodecahedronGeometry(0.3 * scale, 0);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.setX(i, pos.getX(i) * (0.7 + Math.random() * 0.6));
    pos.setY(i, pos.getY(i) * (0.4 + Math.random() * 0.4));
    pos.setZ(i, pos.getZ(i) * (0.7 + Math.random() * 0.6));
  }
  geo.computeVertexNormals();

  const mesh = new THREE.Mesh(geo, Math.random() > 0.5 ? stoneMat : darkStoneMat);
  mesh.position.set(x, getGroundHeight(x, z) + 0.05 * scale, z);
  mesh.rotation.set(Math.random() * 0.3, Math.random() * Math.PI * 2, Math.random() * 0.3);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
}

// ============================================================
// BRIDGE
// ============================================================
function createBridge(x, z, rotation = 0) {
  const group = new THREE.Group();
  const gy = getGroundHeight(x, z);
  group.position.set(x, gy + 0.1, z);
  group.rotation.y = rotation;

  // Deck
  const deckGeo = new THREE.BoxGeometry(1.8, 0.1, 3);
  const deck = new THREE.Mesh(deckGeo, woodMat);
  deck.position.y = 0.3;
  deck.receiveShadow = true;
  deck.castShadow = true;
  group.add(deck);

  // Planks detail
  for (let i = 0; i < 8; i++) {
    const plankGeo = new THREE.BoxGeometry(1.7, 0.02, 0.3);
    const plank = new THREE.Mesh(plankGeo, i % 2 === 0 ? woodMat : darkWoodMat);
    plank.position.set(0, 0.36, -1.2 + i * 0.35);
    group.add(plank);
  }

  // Railings
  for (const side of [-1, 1]) {
    // Posts
    for (let i = 0; i < 3; i++) {
      const postGeo = new THREE.BoxGeometry(0.06, 0.5, 0.06);
      const post = new THREE.Mesh(postGeo, darkWoodMat);
      post.position.set(side * 0.85, 0.6, -1.0 + i * 1.0);
      post.castShadow = true;
      group.add(post);
    }
    // Rail
    const railGeo = new THREE.BoxGeometry(0.04, 0.04, 2.8);
    const rail = new THREE.Mesh(railGeo, darkWoodMat);
    rail.position.set(side * 0.85, 0.8, 0);
    group.add(rail);
  }

  scene.add(group);
}

// ============================================================
// WELL
// ============================================================
function createWell(x, z) {
  const group = new THREE.Group();
  const gy = getGroundHeight(x, z);
  group.position.set(x, gy, z);

  // Stone base (circular)
  const baseGeo = new THREE.CylinderGeometry(0.5, 0.55, 0.6, 8);
  const base = new THREE.Mesh(baseGeo, stoneMat);
  base.position.y = 0.3;
  base.castShadow = true;
  base.receiveShadow = true;
  group.add(base);

  // Inner dark
  const innerGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.1, 8);
  const inner = new THREE.Mesh(innerGeo, new THREE.MeshStandardMaterial({ color: 0x111122 }));
  inner.position.y = 0.61;
  group.add(inner);

  // Wooden posts
  for (const side of [-1, 1]) {
    const postGeo = new THREE.CylinderGeometry(0.04, 0.04, 1.2, 4);
    const post = new THREE.Mesh(postGeo, darkWoodMat);
    post.position.set(side * 0.45, 1.2, 0);
    post.castShadow = true;
    group.add(post);
  }

  // Crossbar
  const barGeo = new THREE.CylinderGeometry(0.03, 0.03, 1.0, 4);
  const bar = new THREE.Mesh(barGeo, woodMat);
  bar.position.set(0, 1.8, 0);
  bar.rotation.z = Math.PI / 2;
  group.add(bar);

  // Roof
  const roofGeo = new THREE.ConeGeometry(0.7, 0.4, 4);
  const roof = new THREE.Mesh(roofGeo, roofMat);
  roof.position.y = 2.05;
  roof.rotation.y = Math.PI / 4;
  roof.castShadow = true;
  group.add(roof);

  // Bucket (small box hanging)
  const bucketGeo = new THREE.BoxGeometry(0.12, 0.12, 0.12);
  const bucket = new THREE.Mesh(bucketGeo, darkWoodMat);
  bucket.position.set(0, 1.2, 0);
  group.add(bucket);

  scene.add(group);
}

// ============================================================
// BENCH
// ============================================================
function createBench(x, z, rotation = 0) {
  const group = new THREE.Group();
  const gy = getGroundHeight(x, z);
  group.position.set(x, gy, z);
  group.rotation.y = rotation;

  // Seat
  const seatGeo = new THREE.BoxGeometry(1.0, 0.06, 0.35);
  const seat = new THREE.Mesh(seatGeo, woodMat);
  seat.position.y = 0.4;
  seat.castShadow = true;
  group.add(seat);

  // Legs
  for (const sx of [-0.4, 0.4]) {
    for (const sz of [-0.12, 0.12]) {
      const legGeo = new THREE.BoxGeometry(0.05, 0.4, 0.05);
      const leg = new THREE.Mesh(legGeo, darkWoodMat);
      leg.position.set(sx, 0.2, sz);
      group.add(leg);
    }
  }

  // Back
  const backGeo = new THREE.BoxGeometry(1.0, 0.4, 0.04);
  const back = new THREE.Mesh(backGeo, woodMat);
  back.position.set(0, 0.6, -0.16);
  back.castShadow = true;
  group.add(back);

  scene.add(group);
}

// ============================================================
// STONE FENCE / WALL SEGMENTS
// ============================================================
function createStoneFence(x1, z1, x2, z2) {
  const dx = x2 - x1, dz = z2 - z1;
  const len = Math.sqrt(dx * dx + dz * dz);
  const angle = Math.atan2(dx, dz);
  const cx = (x1 + x2) / 2, cz = (z1 + z2) / 2;

  const group = new THREE.Group();
  group.position.set(cx, getGroundHeight(cx, cz), cz);
  group.rotation.y = angle;

  // Individual stones for organic look
  const stoneCount = Math.floor(len / 0.25);
  for (let i = 0; i < stoneCount; i++) {
    const sz = -len / 2 + (i + 0.5) * (len / stoneCount);
    const sw = 0.2 + Math.random() * 0.1;
    const sh = 0.25 + Math.random() * 0.15;
    const sd = 0.2 + Math.random() * 0.1;
    const geo = new THREE.BoxGeometry(sd, sh, sw);
    const stone = new THREE.Mesh(geo, Math.random() > 0.4 ? stoneMat : darkStoneMat);
    stone.position.set((Math.random() - 0.5) * 0.05, sh / 2, sz);
    stone.rotation.y = (Math.random() - 0.5) * 0.15;
    stone.castShadow = true;
    stone.receiveShadow = true;
    group.add(stone);
  }

  scene.add(group);
}

// ============================================================
// PARTICLE SYSTEMS
// ============================================================

// --- Rain ---
function createRain() {
  const count = 1200;
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const velocities = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 50;
    positions[i * 3 + 1] = Math.random() * 20;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 50;
    velocities[i] = 8 + Math.random() * 4;
  }

  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: `
      varying float vAlpha;
      void main() {
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = 1.0 * (60.0 / -mvPosition.z);
        gl_Position = projectionMatrix * mvPosition;
        vAlpha = smoothstep(0.0, 3.0, position.y) * 0.3;
      }
    `,
    fragmentShader: `
      varying float vAlpha;
      void main() {
        vec2 p = gl_PointCoord - 0.5;
        float d = length(p);
        if (d > 0.5) discard;
        // Elongated raindrop shape
        float alpha = (1.0 - d * 2.0) * vAlpha;
        gl_FragColor = vec4(0.6, 0.7, 0.9, alpha);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  const points = new THREE.Points(geo, mat);
  scene.add(points);
  return { points, positions, velocities, count };
}

// --- Rain splash particles ---
function createRainSplashes() {
  const count = 200;
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const lifetimes = new Float32Array(count);
  const phases = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 30;
    positions[i * 3 + 1] = 0;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 30;
    lifetimes[i] = Math.random();
    phases[i] = Math.random() * Math.PI * 2;
  }

  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('lifetime', new THREE.BufferAttribute(lifetimes, 1));
  geo.setAttribute('phase', new THREE.BufferAttribute(phases, 1));

  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: `
      attribute float lifetime;
      attribute float phase;
      uniform float uTime;
      varying float vAlpha;
      void main() {
        float t = fract(uTime * 0.5 + phase);
        vec3 pos = position;
        pos.y += t * 0.3;
        vAlpha = (1.0 - t) * 0.5;
        vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
        gl_PointSize = (1.0 + t * 3.0) * (60.0 / -mvPosition.z);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      varying float vAlpha;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        if (d > 0.5) discard;
        float ring = smoothstep(0.3, 0.4, d) * smoothstep(0.5, 0.45, d);
        float center = 1.0 - smoothstep(0.0, 0.2, d);
        gl_FragColor = vec4(0.7, 0.8, 1.0, (ring + center * 0.3) * vAlpha);
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

// --- Fireflies ---
function createFireflies() {
  const count = 80;
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const phases = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    // Concentrate near water/vegetation
    positions[i * 3] = (Math.random() - 0.5) * 30;
    positions[i * 3 + 1] = 0.3 + Math.random() * 2.0;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 30;
    sizes[i] = 0.06 + Math.random() * 0.1;
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
        float t = uTime * 0.2 + phase;
        pos.x += sin(t * 1.3 + phase * 3.0) * 0.6;
        pos.y += sin(t * 0.8 + phase * 5.0) * 0.25;
        pos.z += cos(t * 1.0 + phase * 2.0) * 0.6;
        vAlpha = pow(sin(t * 2.5 + phase * 8.0) * 0.5 + 0.5, 3.0);
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
        float glow = exp(-d * 5.0);
        gl_FragColor = vec4(0.5, 1.0, 0.3, glow * vAlpha * 0.8);
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

// --- Cherry blossom petals ---
function createPetals() {
  const count = 150;
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  const sizes = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 40;
    positions[i * 3 + 1] = 1 + Math.random() * 6;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 40;
    phases[i] = Math.random() * Math.PI * 2;
    sizes[i] = 0.08 + Math.random() * 0.08;
  }

  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('phase', new THREE.BufferAttribute(phases, 1));
  geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: `
      attribute float phase;
      attribute float size;
      uniform float uTime;
      varying float vAlpha;
      varying float vColor;
      void main() {
        vec3 pos = position;
        float t = uTime * 0.1 + phase;
        // Gentle drifting
        pos.x += sin(t * 0.7 + phase * 2.0) * 2.0 + uTime * 0.15;
        pos.y -= mod(uTime * 0.3 + phase * 3.0, 8.0);
        pos.z += cos(t * 0.5 + phase * 3.0) * 1.5;
        vAlpha = 0.5 + sin(t * 1.5) * 0.2;
        vColor = phase;
        vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
        gl_PointSize = size * (150.0 / -mvPosition.z);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      varying float vAlpha;
      varying float vColor;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        if (d > 0.45) discard;
        float petal = 1.0 - smoothstep(0.2, 0.45, d);
        // Mix between pink and white petals
        vec3 pink = vec3(1.0, 0.7, 0.8);
        vec3 white = vec3(1.0, 0.95, 0.9);
        vec3 col = mix(pink, white, step(3.0, vColor));
        gl_FragColor = vec4(col, petal * vAlpha);
      }
    `,
    transparent: true,
    depthWrite: false,
  });

  const points = new THREE.Points(geo, mat);
  scene.add(points);
  return { points, mat };
}

// --- Chimney smoke ---
const smokeParticles = [];

function createChimneySmoke(x, y, z) {
  const count = 30;
  const particles = [];

  for (let i = 0; i < count; i++) {
    const geo = new THREE.PlaneGeometry(0.15 + Math.random() * 0.15, 0.15 + Math.random() * 0.15);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x8899aa, transparent: true, opacity: 0,
      blending: THREE.NormalBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
    scene.add(mesh);
    particles.push({
      mesh, life: -Math.random() * 3, // Stagger start
      vx: (Math.random() - 0.5) * 0.15,
      vy: 0.3 + Math.random() * 0.2,
      vz: (Math.random() - 0.5) * 0.15,
      originX: x, originY: y, originZ: z,
    });
  }
  smokeParticles.push(...particles);
}

// ============================================================
// GROUND FOG
// ============================================================
function createGroundFog() {
  const fogGroup = new THREE.Group();
  for (let i = 0; i < 30; i++) {
    const x = (Math.random() - 0.5) * 35;
    const z = (Math.random() - 0.5) * 35;
    const y = getGroundHeight(x, z) + 0.1;
    const size = 2 + Math.random() * 4;
    const geo = new THREE.PlaneGeometry(size, size);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x1a2a3a, transparent: true, opacity: 0.06 + Math.random() * 0.05,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    const fog = new THREE.Mesh(geo, mat);
    fog.position.set(x, y, z);
    fog.rotation.y = Math.random() * Math.PI;
    fog.userData = { phase: Math.random() * Math.PI * 2, speed: 0.08 + Math.random() * 0.15 };
    fogGroup.add(fog);
  }
  scene.add(fogGroup);
  return fogGroup;
}

// ============================================================
// RAIN PUDDLES — reflective patches on the ground
// ============================================================
function createPuddles() {
  const puddlePositions = [
    { x: -2, z: 3, s: 1.0 }, { x: 3, z: 1, s: 0.7 }, { x: 1, z: 6, s: 0.8 },
    { x: -5, z: 1, s: 0.6 }, { x: 6, z: 3, s: 0.9 }, { x: -1, z: 8, s: 0.5 },
    { x: 4, z: 7, s: 0.7 }, { x: -3, z: 5, s: 0.8 }, { x: 8, z: 0, s: 0.6 },
    { x: 0, z: -1, s: 0.5 }, { x: -6, z: 7, s: 0.7 }, { x: 7, z: 5, s: 0.6 },
  ];

  for (const pp of puddlePositions) {
    const geo = new THREE.CircleGeometry(pp.s * (0.3 + Math.random() * 0.4), 12);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x2a4a6a,
      roughness: 0.05,
      metalness: 0.8,
      transparent: true,
      opacity: 0.6,
      emissive: 0x112233,
      emissiveIntensity: 0.1,
    });
    const puddle = new THREE.Mesh(geo, mat);
    puddle.position.set(pp.x, getGroundHeight(pp.x, pp.z) + 0.02, pp.z);
    puddle.receiveShadow = true;
    scene.add(puddle);
  }
}

// ============================================================
// PLAYER CHARACTER
// ============================================================
const player = { x: 0, z: 2, angle: 0, speed: 4 };
const keys = {};

function createPlayer() {
  const group = new THREE.Group();

  // Body
  const bodyGeo = new THREE.CylinderGeometry(0.2, 0.25, 0.7, 8);
  const body = new THREE.Mesh(bodyGeo, playerMat);
  body.position.y = 0.5;
  body.castShadow = true;
  group.add(body);

  // Head
  const headGeo = new THREE.SphereGeometry(0.16, 8, 6);
  const head = new THREE.Mesh(headGeo, playerMat);
  head.position.y = 1.05;
  head.castShadow = true;
  group.add(head);

  // Hat
  const hatGeo = new THREE.ConeGeometry(0.2, 0.3, 6);
  const hat = new THREE.Mesh(hatGeo, cloakMat);
  hat.position.y = 1.3;
  hat.castShadow = true;
  group.add(hat);

  // Hat brim
  const brimGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.03, 8);
  const brim = new THREE.Mesh(brimGeo, cloakMat);
  brim.position.y = 1.15;
  group.add(brim);

  // Cloak
  const cloakGeo = new THREE.ConeGeometry(0.3, 0.8, 8, 1, true);
  const cloak = new THREE.Mesh(cloakGeo, cloakMat);
  cloak.position.y = 0.55;
  cloak.castShadow = true;
  group.add(cloak);

  // Lantern held on a stick
  const lanternGroup = new THREE.Group();
  // Stick
  const stickGeo = new THREE.CylinderGeometry(0.015, 0.02, 0.6, 4);
  const stick = new THREE.Mesh(stickGeo, woodMat);
  stick.position.y = 0.3;
  stick.rotation.z = -0.3;
  lanternGroup.add(stick);
  // Lantern body
  const lGeo = new THREE.BoxGeometry(0.1, 0.13, 0.1);
  const lMesh = new THREE.Mesh(lGeo, lanternGlowMat);
  lMesh.position.y = 0.6;
  lMesh.position.x = -0.15;
  lanternGroup.add(lMesh);
  // Lantern frame
  const lFrameGeo = new THREE.BoxGeometry(0.13, 0.15, 0.13);
  const lFrame = new THREE.Mesh(lFrameGeo, darkWoodMat);
  lFrame.position.copy(lMesh.position);
  lanternGroup.add(lFrame);
  lMesh.position.z += 0.01; // Put glow in front

  const pLight = new THREE.PointLight(0xffaa44, 5, 8);
  pLight.position.set(-0.15, 0.65, 0);
  pLight.castShadow = true;
  pLight.shadow.mapSize.set(256, 256);
  lanternGroup.add(pLight);
  lanternGroup.position.set(0.3, 0.3, 0.1);
  group.add(lanternGroup);

  // Ground glow from player lantern
  const groundGlow = new THREE.PointLight(0xff8833, 2, 5);
  groundGlow.position.set(0, 0.1, 0);
  group.add(groundGlow);

  scene.add(group);
  return { group, light: pLight, lanternGroup };
}

// ============================================================
// AUDIO SYSTEM — ambient soundscape
// ============================================================
let audioCtx = null;
let audioStarted = false;

function initAudio() {
  if (audioStarted) return;
  audioStarted = true;

  audioCtx = new (window.AudioContext || window.webkitAudioContext)();

  // Master volume
  const masterGain = audioCtx.createGain();
  masterGain.gain.value = 0.3;
  masterGain.connect(audioCtx.destination);

  // --- Rain ambient ---
  const rainBuffer = audioCtx.createBuffer(1, audioCtx.sampleRate * 4, audioCtx.sampleRate);
  const rainData = rainBuffer.getChannelData(0);
  for (let i = 0; i < rainData.length; i++) {
    rainData[i] = (Math.random() * 2 - 1) * 0.3;
  }

  const rainSource = audioCtx.createBufferSource();
  rainSource.buffer = rainBuffer;
  rainSource.loop = true;

  const rainFilter = audioCtx.createBiquadFilter();
  rainFilter.type = 'bandpass';
  rainFilter.frequency.value = 3000;
  rainFilter.Q.value = 0.5;

  const rainGain = audioCtx.createGain();
  rainGain.gain.value = 0.15;

  rainSource.connect(rainFilter);
  rainFilter.connect(rainGain);
  rainGain.connect(masterGain);
  rainSource.start();

  // --- Wind ambient ---
  const windBuffer = audioCtx.createBuffer(1, audioCtx.sampleRate * 6, audioCtx.sampleRate);
  const windData = windBuffer.getChannelData(0);
  for (let i = 0; i < windData.length; i++) {
    windData[i] = (Math.random() * 2 - 1) * 0.2;
  }

  const windSource = audioCtx.createBufferSource();
  windSource.buffer = windBuffer;
  windSource.loop = true;

  const windFilter = audioCtx.createBiquadFilter();
  windFilter.type = 'lowpass';
  windFilter.frequency.value = 400;
  windFilter.Q.value = 2;

  // LFO to modulate wind
  const windLFO = audioCtx.createOscillator();
  windLFO.frequency.value = 0.1;
  const windLFOGain = audioCtx.createGain();
  windLFOGain.gain.value = 200;
  windLFO.connect(windLFOGain);
  windLFOGain.connect(windFilter.frequency);
  windLFO.start();

  const windGain = audioCtx.createGain();
  windGain.gain.value = 0.08;

  windSource.connect(windFilter);
  windFilter.connect(windGain);
  windGain.connect(masterGain);
  windSource.start();

  // --- Music box melody ---
  // Pentatonic scale notes (C, D, E, G, A in various octaves)
  const notes = [
    261.63, 293.66, 329.63, 392.00, 440.00, // C4-A4
    523.25, 587.33, 659.25, 783.99, 880.00, // C5-A5
  ];

  function playNote(time, freq, duration = 1.5) {
    const osc = audioCtx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;

    // Second harmonic for richness
    const osc2 = audioCtx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.value = freq * 2;

    const env = audioCtx.createGain();
    env.gain.setValueAtTime(0, time);
    env.gain.linearRampToValueAtTime(0.06, time + 0.05);
    env.gain.exponentialRampToValueAtTime(0.001, time + duration);

    const env2 = audioCtx.createGain();
    env2.gain.setValueAtTime(0, time);
    env2.gain.linearRampToValueAtTime(0.02, time + 0.03);
    env2.gain.exponentialRampToValueAtTime(0.001, time + duration * 0.7);

    osc.connect(env);
    osc2.connect(env2);
    env.connect(masterGain);
    env2.connect(masterGain);

    osc.start(time);
    osc.stop(time + duration + 0.1);
    osc2.start(time);
    osc2.stop(time + duration + 0.1);
  }

  // Generate a gentle, looping melody
  function scheduleMelody() {
    const now = audioCtx.currentTime;
    const beatDuration = 0.8;
    let time = now + 0.5;

    // Create a gentle, wandering melody
    const melody = [];
    let lastIdx = Math.floor(Math.random() * 5) + 5; // Start in upper register
    for (let i = 0; i < 16; i++) {
      // Sometimes rest
      if (Math.random() < 0.25) {
        time += beatDuration;
        continue;
      }
      // Step to nearby note
      const step = Math.floor(Math.random() * 3) - 1;
      lastIdx = Math.max(0, Math.min(notes.length - 1, lastIdx + step));
      melody.push({ time, freq: notes[lastIdx] });
      time += beatDuration * (0.8 + Math.random() * 0.6);
    }

    for (const note of melody) {
      playNote(note.time, note.freq, 1.5 + Math.random() * 1.0);
    }

    // Schedule next phrase
    setTimeout(scheduleMelody, (time - now) * 1000 + 2000);
  }

  scheduleMelody();

  // --- Occasional cricket chirps ---
  function cricketChirp() {
    const now = audioCtx.currentTime;
    const freq = 4000 + Math.random() * 2000;

    for (let i = 0; i < 3 + Math.floor(Math.random() * 4); i++) {
      const osc = audioCtx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const env = audioCtx.createGain();
      env.gain.setValueAtTime(0, now + i * 0.08);
      env.gain.linearRampToValueAtTime(0.015, now + i * 0.08 + 0.01);
      env.gain.exponentialRampToValueAtTime(0.001, now + i * 0.08 + 0.06);
      osc.connect(env);
      env.connect(masterGain);
      osc.start(now + i * 0.08);
      osc.stop(now + i * 0.08 + 0.08);
    }

    setTimeout(cricketChirp, 3000 + Math.random() * 8000);
  }

  setTimeout(cricketChirp, 2000);

  // --- Water stream sound ---
  const streamBuffer = audioCtx.createBuffer(1, audioCtx.sampleRate * 3, audioCtx.sampleRate);
  const streamData = streamBuffer.getChannelData(0);
  for (let i = 0; i < streamData.length; i++) {
    streamData[i] = (Math.random() * 2 - 1) * 0.15;
  }

  const streamSource = audioCtx.createBufferSource();
  streamSource.buffer = streamBuffer;
  streamSource.loop = true;

  const streamFilter = audioCtx.createBiquadFilter();
  streamFilter.type = 'bandpass';
  streamFilter.frequency.value = 1200;
  streamFilter.Q.value = 1;

  const streamGain = audioCtx.createGain();
  streamGain.gain.value = 0.06;

  streamSource.connect(streamFilter);
  streamFilter.connect(streamGain);
  streamGain.connect(masterGain);
  streamSource.start();
}

// ============================================================
// WORLD GENERATION
// ============================================================
let waterSystem, rainSystem, splashSystem, fireflySystem, petalSystem, fogSystem;
let playerObj, starfield;

function generateWorld() {
  createGround();
  createGrassField();

  // Paths — connect the village
  createPath([
    { x: -10, z: 2 }, { x: -5, z: 2 }, { x: 0, z: 2 }, { x: 5, z: 2 }, { x: 10, z: 2 },
  ]);
  createPath([
    { x: 0, z: -5 }, { x: 0, z: 0 }, { x: 0, z: 5 }, { x: 0, z: 10 },
  ]);
  createPath([
    { x: -5, z: 2 }, { x: -6, z: 5 }, { x: -5, z: 8 },
  ]);
  createPath([
    { x: 5, z: 2 }, { x: 6, z: 6 }, { x: 5, z: 9 },
  ]);

  // Water stream winding through
  waterSystem = createStream();

  // Bridge over the stream
  createBridge(0, -2.5, Math.PI / 6);
  createBridge(7, 1.5, -Math.PI / 8);

  // Buildings — cozy village layout
  createCottage(-6, 5, Math.PI * 0.1, 0);
  createCottage(6, 7, -Math.PI * 0.15, 1);
  createCottage(-3, 9, Math.PI * 0.05, 2);
  createCottage(8, -2, Math.PI * 0.7, 3);

  // Well in the village center
  createWell(1, 4);

  // Lanterns along paths
  createLantern(-3, 2);
  createLantern(3, 2);
  createLantern(-1, 6);
  createLantern(5, 4);
  createLantern(-7, 3);
  createLantern(8, 2);
  createLantern(0, -1);
  createLantern(-4, 8);

  // Benches
  createBench(2, 5, Math.PI * 0.3);
  createBench(-4, 3, -Math.PI * 0.1);

  // Stone fences around garden areas
  createStoneFence(-8, 3, -8, 7);
  createStoneFence(9, 0, 9, 5);
  createStoneFence(-8, 7, -4, 10);

  // Trees — scattered around the village edges
  const treePositions = [
    [-12, -5], [-14, 0], [-13, 6], [-10, 10], [-15, 8],
    [12, -4], [14, 2], [13, 8], [10, 12], [15, 6],
    [-11, -8], [-8, -10], [8, -8], [11, -10],
    [-16, -3], [16, -2], [-16, 10], [16, 10],
    [-5, -7], [5, -8], [0, -10], [-3, -12], [3, -12],
    [-12, 12], [12, 12], [0, 14], [-6, 14], [6, 14],
  ];
  for (const [tx, tz] of treePositions) {
    createTree(tx, tz, 0.7 + Math.random() * 0.6);
  }
  // Additional random trees further out
  for (let i = 0; i < 40; i++) {
    const tx = (Math.random() - 0.5) * 45;
    const tz = (Math.random() - 0.5) * 45;
    const distFromCenter = Math.sqrt(tx * tx + tz * tz);
    if (distFromCenter < 10) continue;
    createTree(tx, tz, 0.5 + Math.random() * 0.5);
  }

  // Rocks
  for (let i = 0; i < 40; i++) {
    const rx = (Math.random() - 0.5) * 40;
    const rz = (Math.random() - 0.5) * 40;
    createRock(rx, rz, 0.3 + Math.random() * 1.0);
  }

  // Flower patches near cottages and paths
  createFlowerPatch(-5, 3, 1.5, 15);
  createFlowerPatch(4, 5, 1.5, 12);
  createFlowerPatch(-2, 7, 1.0, 10);
  createFlowerPatch(7, 4, 1.2, 10);
  createFlowerPatch(1, 8, 1.5, 15);
  createFlowerPatch(-7, 8, 1.0, 8);

  // Chimney smoke from cottages
  createChimneySmoke(-6 + 1.1, getGroundHeight(-6, 5) + 3.9, 5 - 0.3);
  createChimneySmoke(6 + 1.1, getGroundHeight(6, 7) + 3.9, 7 - 0.3);
  createChimneySmoke(-3 + 1.1, getGroundHeight(-3, 9) + 3.9, 9 - 0.3);
  createChimneySmoke(8 + 1.1, getGroundHeight(8, -2) + 3.9, -2 - 0.3);

  // Particle systems
  rainSystem = createRain();
  splashSystem = createRainSplashes();
  fireflySystem = createFireflies();
  petalSystem = createPetals();
  fogSystem = createGroundFog();
  createPuddles();

  // Starfield sky
  starfield = createStarfield();
  // Moon removed — felt wrong moving with camera
  createRiverbankStones();

  // NPCs — villagers wandering the paths
  createNPC(-3, 2, 0x6a3030, [
    { x: -3, z: 2 }, { x: -5, z: 2 }, { x: -6, z: 5 }, { x: -5, z: 8 },
    { x: -3, z: 8 }, { x: -3, z: 5 }, { x: -3, z: 2 },
  ]);
  createNPC(5, 2, 0x2a4a2a, [
    { x: 5, z: 2 }, { x: 3, z: 2 }, { x: 0, z: 2 }, { x: 0, z: 5 },
    { x: 3, z: 5 }, { x: 5, z: 4 }, { x: 5, z: 2 },
  ]);
  createNPC(7, 5, 0x3a3a6a, [
    { x: 7, z: 5 }, { x: 6, z: 6 }, { x: 5, z: 9 }, { x: 3, z: 9 },
    { x: 1, z: 6 }, { x: 3, z: 4 }, { x: 5, z: 4 }, { x: 7, z: 5 },
  ]);

  // Player
  playerObj = createPlayer();
}

// ============================================================
// STARFIELD
// ============================================================
function createStarfield() {
  const count = 400;
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const sizes = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.random() * Math.PI * 0.35;
    const r = 80;
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.cos(phi) + 15;
    positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    sizes[i] = 0.3 + Math.random() * 1.2;
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
        vBright = 0.4 + 0.6 * sin(uTime * 0.3 + position.x * 0.15 + position.z * 0.1);
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * (80.0 / -mvPosition.z);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      varying float vBright;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        if (d > 0.5) discard;
        float glow = exp(-d * 7.0);
        gl_FragColor = vec4(0.75, 0.8, 1.0, glow * vBright * 0.5);
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

// ============================================================
// MOON
// ============================================================
function createMoon() {
  const moonGroup = new THREE.Group();

  // Moon as a billboard sprite that follows the camera
  // Position it in the upper-left of the view
  // Position moon in upper-left of view
  // For the isometric camera, "screen up" ≈ (-0.41, 0.82, -0.41) and "screen left" ≈ (-0.71, 0, 0.71)
  // We want the moon 9 units "up" and 6 units "left" from scene center in screen space
  const screenUp = new THREE.Vector3(-0.408, 0.816, -0.408);
  const screenLeft = new THREE.Vector3(-0.707, 0, 0.707);
  const moonPos = new THREE.Vector3(0, 0, 2)
    .addScaledVector(screenUp, 9)
    .addScaledVector(screenLeft, 5);

  // Moon disc
  const moonGeo = new THREE.CircleGeometry(1.4, 24);
  const moonMat = new THREE.MeshBasicMaterial({
    color: 0xeeeeff,
    fog: false,
  });
  const moonMesh = new THREE.Mesh(moonGeo, moonMat);
  moonMesh.position.copy(moonPos);
  scene.add(moonMesh);

  // Moon glow
  const glowGeo = new THREE.CircleGeometry(3, 24);
  const glowMat = new THREE.MeshBasicMaterial({
    color: 0x8899cc,
    transparent: true,
    opacity: 0.12,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
  });
  const glowMesh = new THREE.Mesh(glowGeo, glowMat);
  glowMesh.position.copy(moonPos);
  scene.add(glowMesh);

  // Outer halo
  const haloGeo = new THREE.CircleGeometry(6, 24);
  const haloMat = new THREE.MeshBasicMaterial({
    color: 0x556688,
    transparent: true,
    opacity: 0.05,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
  });
  const haloMesh = new THREE.Mesh(haloGeo, haloMat);
  haloMesh.position.copy(moonPos);
  scene.add(haloMesh);

  // Make moon face the camera
  moonMesh.lookAt(camera.position);
  glowMesh.lookAt(camera.position);
  haloMesh.lookAt(camera.position);

  return { moonMesh, glowMesh, haloMesh };
}

// ============================================================
// NPC VILLAGERS — wandering characters that make the village alive
// ============================================================
const npcs = [];

function createNPC(x, z, cloakColor, pathPoints) {
  const group = new THREE.Group();
  const gy = getGroundHeight(x, z);
  group.position.set(x, gy, z);

  // Body
  const bodyGeo = new THREE.CylinderGeometry(0.15, 0.2, 0.55, 6);
  const bodyMat = new THREE.MeshStandardMaterial({ color: cloakColor, roughness: 0.85, metalness: 0 });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.y = 0.4;
  body.castShadow = true;
  group.add(body);

  // Head
  const headGeo = new THREE.SphereGeometry(0.12, 6, 5);
  const head = new THREE.Mesh(headGeo, playerMat);
  head.position.y = 0.82;
  head.castShadow = true;
  group.add(head);

  // Hood/hat
  const hoodGeo = new THREE.ConeGeometry(0.14, 0.2, 5);
  const hood = new THREE.Mesh(hoodGeo, bodyMat);
  hood.position.y = 0.98;
  group.add(hood);

  scene.add(group);

  npcs.push({
    group,
    path: pathPoints,
    pathIdx: 0,
    speed: 0.8 + Math.random() * 0.5,
    waitTimer: 0,
    phase: Math.random() * Math.PI * 2,
  });
  return group;
}

// ============================================================
// RIVERBANK STONES — along the stream edges
// ============================================================
function createRiverbankStones() {
  for (let wx = -14; wx <= 14; wx += 1.2 + Math.random() * 0.8) {
    const streamZ = Math.sin(wx * 0.15) * 4 + Math.sin(wx * 0.08) * 2;
    for (const side of [-1, 1]) {
      if (Math.random() < 0.4) continue; // skip some for natural look
      const rz = streamZ + side * (1.3 + Math.random() * 0.4);
      const rx = wx + (Math.random() - 0.5) * 0.3;
      createRock(rx, rz, 0.2 + Math.random() * 0.3);
    }
  }
}

// ============================================================
// INPUT
// ============================================================
window.addEventListener('keydown', e => { keys[e.key.toLowerCase()] = true; });
window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });

// Custom cursor
const cursor = document.getElementById('cursor');
window.addEventListener('mousemove', e => {
  cursor.style.left = e.clientX + 'px';
  cursor.style.top = e.clientY + 'px';
});

// ============================================================
// ANIMATION LOOP
// ============================================================
const clock = new THREE.Clock();
let footstepTimer = 0;
const _camTarget = new THREE.Vector3();
const _currentTarget = new THREE.Vector3();
const _moonScreenUp = new THREE.Vector3(-0.408, 0.816, -0.408);
const _moonScreenLeft = new THREE.Vector3(-0.707, 0, 0.707);
const _moonPos = new THREE.Vector3();

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const time = clock.getElapsedTime();

  // --- Player movement (isometric WASD) ---
  let moveX = 0, moveZ = 0;
  // In isometric view, WASD maps to diagonal screen directions
  // W = up-left in world, S = down-right, A = down-left, D = up-right
  if (keys['w'] || keys['arrowup']) { moveX -= 1; moveZ -= 1; }
  if (keys['s'] || keys['arrowdown']) { moveX += 1; moveZ += 1; }
  if (keys['a'] || keys['arrowleft']) { moveX -= 1; moveZ += 1; }
  if (keys['d'] || keys['arrowright']) { moveX += 1; moveZ -= 1; }

  if (moveX !== 0 || moveZ !== 0) {
    const len = Math.sqrt(moveX * moveX + moveZ * moveZ);
    moveX /= len; moveZ /= len;
    player.x += moveX * player.speed * dt;
    player.z += moveZ * player.speed * dt;
    player.angle = Math.atan2(moveX, moveZ);

    // Clamp to world bounds
    player.x = Math.max(-22, Math.min(22, player.x));
    player.z = Math.max(-22, Math.min(22, player.z));
  }

  if (playerObj) {
    const gy = getGroundHeight(player.x, player.z);
    playerObj.group.position.set(player.x, gy, player.z);
    playerObj.group.rotation.y = player.angle;

    // Bobbing while walking
    if (moveX !== 0 || moveZ !== 0) {
      playerObj.group.position.y += Math.sin(time * 8) * 0.03;
      // Lantern sway
      playerObj.lanternGroup.rotation.z = Math.sin(time * 6) * 0.1;
    }

    // Camera follows player smoothly
    _camTarget.set(player.x, 0, player.z);
    _currentTarget.set(
      camera.position.x - isoDistance * Math.cos(isoPitch) * Math.sin(isoYaw),
      0,
      camera.position.z - isoDistance * Math.cos(isoPitch) * Math.cos(isoYaw)
    );
    _currentTarget.lerp(_camTarget, 2 * dt);
    camera.position.set(
      _currentTarget.x + isoDistance * Math.cos(isoPitch) * Math.sin(isoYaw),
      isoDistance * Math.sin(isoPitch),
      _currentTarget.z + isoDistance * Math.cos(isoPitch) * Math.cos(isoYaw)
    );
    camera.lookAt(_currentTarget.x, 0, _currentTarget.z);

    // Shadow camera follows player
    moonLight.position.set(player.x - 15, 25, player.z - 10);
    moonLight.target.position.set(player.x, 0, player.z);
    moonLight.target.updateMatrixWorld();

  }

  // --- Flickering lights ---
  for (const wl of windowLights) {
    wl.light.intensity = wl.baseIntensity * (0.85 + Math.sin(time * 3 + wl.phase) * 0.1 + Math.sin(time * 7 + wl.phase * 2) * 0.05);
  }
  for (const l of lanterns) {
    l.light.intensity = l.baseIntensity * (0.85 + Math.sin(time * 4 + l.phase) * 0.12 + Math.sin(time * 9 + l.phase * 3) * 0.03);
    l.groundLight.intensity = l.light.intensity * 0.4;
  }

  // --- NPC movement ---
  for (const npc of npcs) {
    if (npc.waitTimer > 0) {
      npc.waitTimer -= dt;
      continue;
    }
    const target = npc.path[npc.pathIdx];
    const dx = target.x - npc.group.position.x;
    const dz = target.z - npc.group.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < 0.2) {
      npc.pathIdx = (npc.pathIdx + 1) % npc.path.length;
      npc.waitTimer = 1 + Math.random() * 2; // Pause at waypoints
    } else {
      const mx = (dx / dist) * npc.speed * dt;
      const mz = (dz / dist) * npc.speed * dt;
      npc.group.position.x += mx;
      npc.group.position.z += mz;
      npc.group.position.y = getGroundHeight(npc.group.position.x, npc.group.position.z);
      npc.group.rotation.y = Math.atan2(dx, dz);
      // Walking bob
      npc.group.position.y += Math.sin(time * 6 + npc.phase) * 0.02;
    }
  }

  // --- Tree sway ---
  for (const tree of trees) {
    tree.canopy.rotation.z = Math.sin(time * tree.speed + tree.phase) * 0.03;
    tree.canopy.rotation.x = Math.cos(time * tree.speed * 0.7 + tree.phase) * 0.02;
  }

  // --- Water animation ---
  if (waterSystem) {
    waterSystem.material.uniforms.uTime.value = time;
  }

  // --- Rain update ---
  if (rainSystem) {
    const rPos = rainSystem.points.geometry.attributes.position;
    for (let i = 0; i < rainSystem.count; i++) {
      let y = rPos.getY(i);
      y -= rainSystem.velocities[i] * dt;
      if (y < -0.5) {
        y = 15 + Math.random() * 5;
        rPos.setX(i, player.x + (Math.random() - 0.5) * 40);
        rPos.setZ(i, player.z + (Math.random() - 0.5) * 40);
      }
      // Slight wind drift
      rPos.setX(i, rPos.getX(i) + 0.3 * dt);
      rPos.setY(i, y);
    }
    rPos.needsUpdate = true;
    rainSystem.points.material.uniforms.uTime.value = time;
  }

  // --- Splash update ---
  if (splashSystem) {
    splashSystem.mat.uniforms.uTime.value = time;
  }

  // --- Firefly + petal update ---
  if (fireflySystem) fireflySystem.mat.uniforms.uTime.value = time;
  if (petalSystem) petalSystem.mat.uniforms.uTime.value = time;
  if (starfield) starfield.mat.uniforms.uTime.value = time;

  // --- Chimney smoke ---
  for (const sp of smokeParticles) {
    sp.life += dt;
    if (sp.life > 0) {
      const t = sp.life;
      sp.mesh.position.set(
        sp.originX + sp.vx * t + Math.sin(t * 2 + sp.vx * 10) * 0.1,
        sp.originY + sp.vy * t,
        sp.originZ + sp.vz * t + Math.cos(t * 1.5 + sp.vz * 10) * 0.1
      );
      sp.mesh.material.opacity = Math.max(0, 0.15 * (1 - t / 3));
      sp.mesh.scale.setScalar(1 + t * 0.8);
      sp.mesh.rotation.z += dt * 0.5;

      if (t > 3) {
        sp.life = -Math.random() * 1;
        sp.mesh.material.opacity = 0;
        sp.vx = (Math.random() - 0.5) * 0.15;
        sp.vy = 0.3 + Math.random() * 0.2;
        sp.vz = (Math.random() - 0.5) * 0.15;
      }
    }
  }

  // --- Ground fog drift ---
  if (fogSystem) {
    for (const child of fogSystem.children) {
      child.position.x += Math.sin(time * child.userData.speed + child.userData.phase) * 0.003;
      child.position.z += Math.cos(time * child.userData.speed * 0.7 + child.userData.phase) * 0.003;
      child.material.opacity = (0.04 + Math.sin(time * 0.3 + child.userData.phase) * 0.02) * 1.5;
    }
  }

  // --- Post-processing uniforms ---
  tiltShiftPass.uniforms.uTime.value = time;

  // --- Render ---
  composer.render();
}

// ============================================================
// RESIZE
// ============================================================
window.addEventListener('resize', () => {
  const aspect = window.innerWidth / window.innerHeight;
  camera.left = -frustumSize * aspect / 2;
  camera.right = frustumSize * aspect / 2;
  camera.top = frustumSize / 2;
  camera.bottom = -frustumSize / 2;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
  tiltShiftPass.uniforms.uResolution.value.set(window.innerWidth, window.innerHeight);
});

// ============================================================
// INIT
// ============================================================
function init() {
  generateWorld();

  // Remove loading screen
  setTimeout(() => {
    const loading = document.getElementById('loading');
    loading.classList.add('fade');
    setTimeout(() => {
      loading.style.display = 'none';
      // Show click prompt for audio
      const clickPrompt = document.getElementById('click-prompt');
      clickPrompt.style.display = 'flex';
      clickPrompt.addEventListener('click', () => {
        initAudio();
        clickPrompt.style.display = 'none';
      });
      // Also start on any keypress
      const startAudioOnKey = () => {
        initAudio();
        clickPrompt.style.display = 'none';
      };
      window.addEventListener('keydown', startAudioOnKey, { once: true });
    }, 1500);
  }, 500);

  animate();
}

init();
