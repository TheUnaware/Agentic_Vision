import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import Lenis from 'lenis';
import gsap from 'gsap';
import { PhoneScreen } from './phoneScreen.js';

// Setup Lenis Smooth Scroll
const lenis = new Lenis({
  lerp: 0.08,
  smoothWheel: true,
});
function raf(time) {
  lenis.raf(time);
  requestAnimationFrame(raf);
}
requestAnimationFrame(raf);

function smoothstep(min, max, value) {
  const x = Math.max(0, Math.min(1, (value - min) / (max - min)));
  return x * x * (3 - 2 * x);
}

// DOM Elements
const canvas = document.getElementById('webgl');
const loaderEl = document.getElementById('loader');
const loaderFill = document.getElementById('loader-fill');
const loaderPct = document.getElementById('loader-pct');
const progressFill = document.getElementById('progress-fill');
const degCounter = document.getElementById('deg');
const svgLines = document.getElementById('callout-lines');
const calloutsContainer = document.getElementById('callouts');
const chaptersContainer = document.getElementById('chapters');
const storyTrack = document.getElementById('story');
const stagesList = document.getElementById('stages');
const introEl = document.getElementById('intro');

// Panel elements
const panelIds = [
  'p-reveal', 'p-rotate', 'p-cam', 'p-top', 'p-rear',
  'p-up', 'p-pipe', 'p-down', 'p-ear', 'p-outro'
];
const panels = panelIds.map(id => document.getElementById(id));

// Story chapter definitions
const CHAPTERS = [
  { id: 'intro', label: 'Intro' },
  { id: 'reveal', label: 'Overview' },
  { id: 'rotate', label: '360° Vision' },
  { id: 'cam', label: 'Camera & ToF' },
  { id: 'top', label: 'Top Coverage' },
  { id: 'rear', label: 'Internal Hub' },
  { id: 'up', label: 'Uplink' },
  { id: 'pipe', label: 'AI Pipeline' },
  { id: 'down', label: 'Downlink' },
  { id: 'ear', label: 'Open-Ear' },
  { id: 'outro', label: 'The Loop' },
  { id: 'innovation', label: 'Innovation' }
];

// Stage Timeline Configuration
const INTRO_TOTAL_SCROLL = 1000;
const STAGES_CONFIG = [
  { id: 'reveal', label: 'Overview', duration: 1400 },
  { id: 'rotate', label: '360° Vision', duration: 1800 },
  { id: 'cam', label: 'Camera & ToF', duration: 1400 },
  { id: 'top', label: 'Top Coverage', duration: 1400 },
  { id: 'rear', label: 'Internal Hub', duration: 1400 },
  { id: 'up', label: 'Uplink', duration: 1300 },
  { id: 'pipe', label: 'AI Pipeline', duration: 2700 },
  { id: 'down', label: 'Downlink', duration: 1300 },
  { id: 'ear', label: 'Open-Ear', duration: 1400 },
  { id: 'outro', label: 'The Loop', duration: 1500 }
];

let stageOffset = INTRO_TOTAL_SCROLL;
const stageRanges = STAGES_CONFIG.map((cfg, idx) => {
  const start = stageOffset;
  const end = stageOffset + cfg.duration;
  stageOffset = end;
  const pStartRatio = (idx === 1 || idx === 6) ? 0.12 : 0.18;
  const pEndRatio = (idx === 1 || idx === 6) ? 0.82 : 0.72;
  const pStart = start + cfg.duration * pStartRatio;
  const pEnd = start + cfg.duration * pEndRatio;
  return { ...cfg, start, end, pStart, pEnd };
});
const OUTRO_EXIT_GAP = 600;
const TOTAL_STORY_HEIGHT = stageOffset + OUTRO_EXIT_GAP - INTRO_TOTAL_SCROLL;
storyTrack.style.height = `${TOTAL_STORY_HEIGHT}px`;

// Build Chapter Navigation dots
CHAPTERS.forEach((ch, idx) => {
  const btn = document.createElement('button');
  btn.setAttribute('aria-label', ch.label);
  btn.innerHTML = `<span>${ch.label}</span>`;
  btn.addEventListener('click', () => {
    if (idx === 0) {
      lenis.scrollTo(0);
    } else if (idx === CHAPTERS.length - 1) {
      const el = document.getElementById('innovation');
      if (el) lenis.scrollTo(el);
    } else {
      const range = stageRanges[idx - 1];
      const targetScroll = (range.pStart + range.pEnd) * 0.5;
      lenis.scrollTo(targetScroll);
    }
  });
  chaptersContainer.appendChild(btn);
});

// Three.js Scene Setup
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x05070c, 0.45);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.005, 50);
camera.position.set(0.38, 0.32, 0.30);

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: true,
  powerPreference: 'high-performance'
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

// Studio Lighting Rig
const ambientLight = new THREE.AmbientLight(0x0e1726, 1.2);
scene.add(ambientLight);

const keyLight = new THREE.DirectionalLight(0xfff6ea, 4.2);
keyLight.position.set(0.42, 0.38, 0.46);
keyLight.castShadow = true;
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0x90c5ff, 2.0);
fillLight.position.set(-0.55, 0.25, 0.20);
scene.add(fillLight);

const rimLight = new THREE.DirectionalLight(0x70e4ff, 4.0);
rimLight.position.set(0.00, -0.55, 0.40);
scene.add(rimLight);

const topLight = new THREE.DirectionalLight(0xffffff, 2.8);
topLight.position.set(0, 0, 0.70);
scene.add(topLight);

// Floor grid
const gridHelper = new THREE.GridHelper(1.6, 24, 0x22d3ee, 0x142036);
gridHelper.position.set(0, -0.065, 0);
gridHelper.material.opacity = 0.18;
gridHelper.material.transparent = true;
scene.add(gridHelper);

// Model and Helpers
let neckbandGroup = new THREE.Group();
scene.add(neckbandGroup);
let loadedNeckband = null;

// FOV Cones visualization for Top View
const fovConesGroup = new THREE.Group();
fovConesGroup.visible = false;
neckbandGroup.add(fovConesGroup);
const fovMeshes = [];
const fovLines = [];

function createFovCones() {
  const headings = [
    { name: 'FR', angleDeg: 45, color: 0x22d3ee, origin: [0.1088, -0.05, -0.1123] },
    { name: 'RR', angleDeg: 135, color: 0xa78bfa, origin: [0.081, 0.0, 0.081] },
    { name: 'RL', angleDeg: 225, color: 0xf472b6, origin: [-0.081, 0.0, 0.081] },
    { name: 'FL', angleDeg: 315, color: 0x34d399, origin: [-0.1088, -0.05, -0.1123] }
  ];

  headings.forEach(h => {
    const fovRadius = 0.48;
    const halfAngleRad = (60 * Math.PI) / 180;
    const rad = (h.angleDeg * Math.PI) / 180;
    const centerA = Math.atan2(-Math.cos(rad), Math.sin(rad));

    const segs = 32;
    const positions = [];
    const indices = [];

    positions.push(h.origin[0], h.origin[1] + 0.005, h.origin[2]);

    for (let i = 0; i <= segs; i++) {
      const a = (centerA - halfAngleRad) + (i / segs) * (halfAngleRad * 2);
      const px = h.origin[0] + Math.cos(a) * fovRadius;
      const pz = h.origin[2] + Math.sin(a) * fovRadius;
      positions.push(px, h.origin[1] + 0.005, pz);

      if (i > 0) {
        indices.push(0, i, i + 1);
      }
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geom.setIndex(indices);

    const mat = new THREE.MeshBasicMaterial({
      color: h.color,
      transparent: true,
      opacity: 0.28,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const mesh = new THREE.Mesh(geom, mat);

    const wirePts = [new THREE.Vector3(h.origin[0], h.origin[1] + 0.006, h.origin[2])];
    for (let i = 0; i <= segs; i++) {
      const a = (centerA - halfAngleRad) + (i / segs) * (halfAngleRad * 2);
      wirePts.push(new THREE.Vector3(
        h.origin[0] + Math.cos(a) * fovRadius,
        h.origin[1] + 0.006,
        h.origin[2] + Math.sin(a) * fovRadius
      ));
    }
    wirePts.push(new THREE.Vector3(h.origin[0], h.origin[1] + 0.006, h.origin[2]));

    const wireGeom = new THREE.BufferGeometry().setFromPoints(wirePts);
    const wireMat = new THREE.LineBasicMaterial({
      color: h.color,
      transparent: true,
      opacity: 0.85
    });
    const lineMesh = new THREE.Line(wireGeom, wireMat);
    mesh.add(lineMesh);

    fovMeshes.push(mesh);
    fovLines.push(lineMesh);
    fovConesGroup.add(mesh);
  });
}
createFovCones();

// Phone 3D Model with dynamic Canvas Screen
const phoneGroup = new THREE.Group();
phoneGroup.visible = false;
scene.add(phoneGroup);

const phoneScreenRenderer = new PhoneScreen();
const phoneCanvasTexture = new THREE.CanvasTexture(phoneScreenRenderer.canvas);
phoneCanvasTexture.minFilter = THREE.LinearFilter;
phoneCanvasTexture.magFilter = THREE.LinearFilter;
phoneCanvasTexture.generateMipmaps = false;

function createPhoneModel() {
  const pW = 0.16, pH = 0.32, pD = 0.014;
  const bodyGeom = new THREE.BoxGeometry(pW, pH, pD);
  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0x0f1523,
    metalness: 0.85,
    roughness: 0.2
  });
  const phoneBody = new THREE.Mesh(bodyGeom, bodyMat);

  const screenGeom = new THREE.PlaneGeometry(pW * 0.94, pH * 0.94);
  const screenMat = new THREE.MeshBasicMaterial({
    map: phoneCanvasTexture,
    transparent: true
  });
  const screenMesh = new THREE.Mesh(screenGeom, screenMat);
  screenMesh.position.set(0, 0, pD / 2 + 0.0005);
  phoneBody.add(screenMesh);

  phoneGroup.add(phoneBody);
}
createPhoneModel();

// Data Stream Particle Animation
const PARTICLE_COUNT = 75;
const streamParticlesGeom = new THREE.BufferGeometry();
const streamPos = new Float32Array(PARTICLE_COUNT * 3);
for (let i = 0; i < PARTICLE_COUNT * 3; i++) {
  streamPos[i] = 0;
}
streamParticlesGeom.setAttribute('position', new THREE.BufferAttribute(streamPos, 3));
const streamParticlesMat = new THREE.PointsMaterial({
  color: 0x22d3ee,
  size: 0.007,
  transparent: true,
  opacity: 0.85,
  blending: THREE.AdditiveBlending
});
const streamPoints = new THREE.Points(streamParticlesGeom, streamParticlesMat);
streamPoints.visible = false;
scene.add(streamPoints);

// Dynamic 3D Callout Anchors with dead-center mesh locations
const calloutDefs = [
  // Cam FR: Center of Sony IMX708 circular lens glass
  {
    id: 'c-cam-fr',
    pos: [0.1167, -0.0528, -0.1202],
    panelIdx: 2,
    title: 'SONY IMX708 WIDE',
    sub: '120° D FOV · PDAF autofocus',
    side: 'left'
  },
  // ToF FR: Center of ST VL53L5CX multi-zone ToF window aperture
  {
    id: 'c-tof-fr',
    pos: [0.1140, -0.0380, -0.1170],
    panelIdx: 2,
    title: 'VL53L5CX MULTIZONE ToF',
    sub: '64 zones · true metric depth up to 4m',
    side: 'left',
    type: 'warm'
  },
  // Top View 4 Cameras (Panel 3)
  { id: 'c-fov-fr', pos: [0.1088, -0.05, -0.1123], panelIdx: 3, title: 'CAM FR 45°', sub: 'Front Right · 120°', side: 'right' },
  { id: 'c-fov-fl', pos: [-0.1088, -0.05, -0.1123], panelIdx: 3, title: 'CAM FL 315°', sub: 'Front Left · 120°', side: 'left' },
  { id: 'c-fov-rr', pos: [0.081, 0.0, 0.081], panelIdx: 3, title: 'CAM RR 135°', sub: 'Rear Right · 120°', side: 'right' },
  { id: 'c-fov-rl', pos: [-0.081, 0.0, 0.081], panelIdx: 3, title: 'CAM RL 225°', sub: 'Rear Left · 120°', side: 'left' },
  // Rear components on real neckband (Panel 4)
  { id: 'c-hub-soc', pos: [0.0, 0.0149, 0.0950], panelIdx: 4, title: 'ESP32-S3 SENSOR HUB', sub: 'Streams 4 cams + ToF over Wi-Fi / BT', side: 'right' },
  { id: 'c-hub-batt', pos: [0.065, 0.012, 0.065], panelIdx: 4, title: 'DUAL Li-Po LOBES', sub: 'Balanced collar weight distribution', side: 'right' },
  { id: 'c-hub-usbc', pos: [0.0, 0.0, 0.1091], panelIdx: 4, title: 'USB-C CHARGER', sub: 'Power-path & Li-ion protection', side: 'right' },
  // Earbud on real neckband (Panel 8)
  { id: 'c-ear-grille', pos: [0.0692, 0.1682, -0.0059], panelIdx: 8, title: 'OPEN-EAR NOZZLE', sub: 'Aims voice at ear · zero occlusion', side: 'left' },
  { id: 'c-ear-strain', pos: [0.0943, 0.0119, -0.0114], panelIdx: 8, title: 'STRAIN RELIEF PORT', sub: 'Direct wired audio · zero latency', side: 'left' }
];

// Create callout DOM elements & SVG lines
calloutDefs.forEach(def => {
  const el = document.createElement('div');
  el.className = `callout ${def.side === 'left' ? 'flip' : ''} ${def.type || ''}`;
  el.id = def.id;
  el.innerHTML = `
    <div class="label">
      <b>${def.title}</b>
      <small>${def.sub}</small>
    </div>
  `;
  calloutsContainer.appendChild(el);
  def.dom = el;

  const line = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  line.setAttribute('stroke', def.type === 'warm' ? '#fbbf24' : '#22d3ee');
  line.setAttribute('stroke-width', '1.5');
  line.setAttribute('fill', 'none');
  line.setAttribute('stroke-dasharray', '4 4');
  line.setAttribute('opacity', '0');
  svgLines.appendChild(line);
  def.svg = line;
});

// Load GLB model
const gltfLoader = new GLTFLoader();
gltfLoader.load(
  `${import.meta.env.BASE_URL || './'}models/neckband.glb`,
  (gltf) => {
    loadedNeckband = gltf.scene;

    loadedNeckband.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;

        if (child.material) {
          child.material.envMapIntensity = 1.25;
          if (child.material.name === 'NB_Body') {
            child.material.roughness = 0.42;
            child.material.metalness = 0.15;
          }
          if (child.material.name === 'NB_Shell' || child.material.name === 'NB_Bezel') {
            child.material.metalness = 0.9;
            child.material.roughness = 0.25;
          }
        }
      }
    });

    neckbandGroup.add(loadedNeckband);

    loaderFill.style.width = '100%';
    loaderPct.innerText = '100%';
    setTimeout(() => {
      loaderEl.classList.add('done');
    }, 400);
  },
  (xhr) => {
    if (xhr.lengthComputable) {
      const pct = Math.round((xhr.loaded / xhr.total) * 100);
      loaderFill.style.width = `${pct}%`;
      loaderPct.innerText = `${pct}%`;
    }
  },
  (err) => {
    console.error('Error loading GLTF neckband model:', err);
    loaderEl.classList.add('done');
  }
);

// Camera Path Keyframes across scroll progression (0 to 9)
const CAMERA_STATES = [
  // 0: Reveal (Panel left) - Model centered / slightly right
  {
    camPos: new THREE.Vector3(0.38, 0.32, 0.30),
    lookAt: new THREE.Vector3(0.05, 0.02, 0.04),
    modelRotY: 0,
    modelPos: new THREE.Vector3(0.05, 0.0, 0)
  },
  // 1: 360 Rotation (Panel left) - Model shifted right to clear text
  {
    camPos: new THREE.Vector3(0.38, 0.32, 0.30),
    lookAt: new THREE.Vector3(0.14, 0.02, 0.04),
    modelRotY: 0,
    modelPos: new THREE.Vector3(0.14, 0.0, 0)
  },
  // 2: Zoom on Front-Right Camera & ToF (Panel right) - Front view, model slightly left
  {
    camPos: new THREE.Vector3(0.07, -0.02, -0.27),
    lookAt: new THREE.Vector3(0.05, -0.045, -0.11),
    modelRotY: Math.PI * 2,
    modelPos: new THREE.Vector3(-0.06, 0.0, 0)
  },
  // 3: Top View Z-Axis (Panel left) - High overhead top-down view with forward navigation orientation
  {
    camPos: new THREE.Vector3(0.26, 1.25, 0.16),
    lookAt: new THREE.Vector3(0.26, 0.0, -0.02),
    modelRotY: Math.PI * 2,
    modelPos: new THREE.Vector3(0.26, 0.0, 0)
  },
  // 4: Rear Hub Zoom (Panel left) - Pointing directly at rear (+Z side)
  {
    camPos: new THREE.Vector3(0.12, 0.10, 0.28),
    lookAt: new THREE.Vector3(0.12, 0.015, 0.095),
    modelRotY: Math.PI * 2,
    modelPos: new THREE.Vector3(0.12, 0.0, 0)
  },
  // 5: Uplink Animation (Panel bottom) - Neckband left, phone right
  {
    camPos: new THREE.Vector3(0.0, 0.16, 0.44),
    lookAt: new THREE.Vector3(0.0, 0.05, 0.0),
    modelRotY: Math.PI * 2 - 0.35,
    modelPos: new THREE.Vector3(-0.18, 0.06, 0)
  },
  // 6: Phone AI Pipeline Stage (Panel right) - Neckband hidden, phone stationary
  {
    camPos: new THREE.Vector3(0.0, 0.0, 0.46),
    lookAt: new THREE.Vector3(-0.02, 0.0, 0.0),
    modelRotY: Math.PI * 2 - 0.35,
    modelPos: new THREE.Vector3(-0.40, 0.0, 0)
  },
  // 7: Downlink Animation (Panel compact bottom) - Neckband back, wide spread, elevated
  {
    camPos: new THREE.Vector3(0.0, 0.16, 0.44),
    lookAt: new THREE.Vector3(0.0, 0.07, 0.0),
    modelRotY: Math.PI * 2 - 0.35,
    modelPos: new THREE.Vector3(-0.22, 0.08, 0)
  },
  // 8: Earbud Zoom (Panel right) - Generous framing showing both nozzle and collar strain relief
  {
    camPos: new THREE.Vector3(0.04, 0.10, 0.28),
    lookAt: new THREE.Vector3(-0.06, 0.09, -0.01),
    modelRotY: Math.PI * 2 + 0.25,
    modelPos: new THREE.Vector3(-0.14, 0.01, 0)
  },
  // 9: Outro Hero Presentation (Panel center) - The Loop
  {
    camPos: new THREE.Vector3(0.40, 0.36, 0.32),
    lookAt: new THREE.Vector3(0.0, 0.02, 0.04),
    modelRotY: Math.PI * 2 + 0.60,
    modelPos: new THREE.Vector3(0.0, 0.0, 0)
  }
];

// Target Camera & Model states (computed continuously in onScroll)
const targetCamPos = new THREE.Vector3().copy(CAMERA_STATES[0].camPos);
const targetLookAt = new THREE.Vector3().copy(CAMERA_STATES[0].lookAt);
const targetModelPos = new THREE.Vector3().copy(CAMERA_STATES[0].modelPos);
let targetModelRotY = 0;

// Current lerped states (smoothed smoothly in animate() each frame)
const currentCamPos = new THREE.Vector3().copy(CAMERA_STATES[0].camPos);
const currentLookAt = new THREE.Vector3().copy(CAMERA_STATES[0].lookAt);
const currentModelPos = new THREE.Vector3().copy(CAMERA_STATES[0].modelPos);
let currentModelRotY = 0;

// Phone target & current transforms
const targetPhonePos = new THREE.Vector3(0.18, 0.06, 0);
let targetPhoneRotY = -0.3;
const targetPhoneScale = new THREE.Vector3(0.88, 0.88, 0.88);
let targetPhoneVisible = false;

const currentPhonePos = new THREE.Vector3(0.18, 0.06, 0);
let currentPhoneRotY = -0.3;
const currentPhoneScale = new THREE.Vector3(0.88, 0.88, 0.88);

// Active Callouts, FOV Cones, Particles
let activeCalloutIdx = -1;
let activeCalloutAlpha = 0;
let activeConesAlpha = 0;
let particleMode = 'none';
let particleAlpha = 0;

// Update Callout Positions in Screen Space
function updateCallouts(activeStepIdx, stepAlpha) {
  const tempV = new THREE.Vector3();
  const widthHalf = window.innerWidth / 2;
  const heightHalf = window.innerHeight / 2;

  calloutDefs.forEach(def => {
    const isMatching = (def.panelIdx === activeStepIdx);
    if (!isMatching || stepAlpha <= 0.05) {
      def.dom.style.opacity = '0';
      def.dom.style.visibility = 'hidden';
      def.svg.setAttribute('opacity', '0');
      return;
    }

    // World position of the anchor on the neckband
    tempV.set(def.pos[0], def.pos[1], def.pos[2]);
    tempV.applyEuler(neckbandGroup.rotation);
    tempV.add(neckbandGroup.position);

    // Project to 2D Screen
    tempV.project(camera);

    // If behind camera, hide
    if (tempV.z > 1 || tempV.z < -1) {
      def.dom.style.opacity = '0';
      def.dom.style.visibility = 'hidden';
      def.svg.setAttribute('opacity', '0');
      return;
    }

    const sx = (tempV.x * widthHalf) + widthHalf;
    const sy = -(tempV.y * heightHalf) + heightHalf;

    let offsetX = def.side === 'left' ? -150 : 150;
    let offsetY = -25;

    // Custom offsets to guarantee clear sightlines
    if (def.id === 'c-cam-fr') { offsetX = -170; offsetY = 30; }
    if (def.id === 'c-tof-fr') { offsetX = -170; offsetY = -45; }
    if (def.id === 'c-fov-fl') { offsetX = -70; offsetY = -45; }
    if (def.id === 'c-fov-fr') { offsetX = 135; offsetY = -45; }
    if (def.id === 'c-fov-rl') { offsetX = -70; offsetY = 45; }
    if (def.id === 'c-fov-rr') { offsetX = 135; offsetY = 45; }
    if (def.id === 'c-hub-soc') { offsetX = 160; offsetY = -40; }
    if (def.id === 'c-hub-batt') { offsetX = -140; offsetY = -75; }
    if (def.id === 'c-hub-usbc') { offsetX = 160; offsetY = 95; }
    if (def.id === 'c-ear-grille') { offsetX = -170; offsetY = -15; }
    if (def.id === 'c-ear-strain') { offsetX = -170; offsetY = 15; }

    let cardX = sx + offsetX;
    let cardY = sy + offsetY;
    cardX = Math.max(20, Math.min(window.innerWidth - 250, cardX));
    cardY = Math.max(80, Math.min(window.innerHeight - 80, cardY));

    def.dom.style.transform = `translate(${cardX}px, ${cardY}px)`;
    def.dom.style.visibility = 'visible';
    def.dom.style.opacity = `${stepAlpha.toFixed(3)}`;

    // SVG Line: anchor -> card elbow -> card text
    const elbowX = sx + (offsetX * 0.4);
    const elbowY = cardY;
    def.svg.setAttribute('points', `${sx},${sy} ${elbowX},${elbowY} ${cardX},${cardY}`);
    def.svg.setAttribute('opacity', `${(stepAlpha * 0.85).toFixed(3)}`);
  });
}

// Particle stream update
function updateParticles(mode, time) {
  if (mode === 'none') {
    streamPoints.visible = false;
    return;
  }
  streamPoints.visible = true;

  const pStart = mode === 'uplink' ? new THREE.Vector3(-0.14, 0.06, 0) : new THREE.Vector3(0.18, 0.08, 0);
  const pEnd = mode === 'uplink' ? new THREE.Vector3(0.14, 0.06, 0) : new THREE.Vector3(-0.18, 0.08, 0);
  const col = mode === 'uplink' ? 0x22d3ee : 0xfbbf24;
  streamParticlesMat.color.setHex(col);

  const arr = streamParticlesGeom.attributes.position.array;
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const pFrac = ((i / PARTICLE_COUNT) + time * 0.7) % 1.0;
    const x = pStart.x + (pEnd.x - pStart.x) * pFrac;
    const y = pStart.y + Math.sin(pFrac * Math.PI) * 0.04 + Math.sin(time * 6 + i) * 0.005;
    const z = pStart.z + (pEnd.z - pStart.z) * pFrac + Math.cos(time * 5 + i) * 0.005;

    arr[i * 3] = x;
    arr[i * 3 + 1] = y;
    arr[i * 3 + 2] = z;
  }
  streamParticlesGeom.attributes.position.needsUpdate = true;
}

// Main Scroll Handler
let activeStage = 0;
function onScroll(scrollY) {
  const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
  const progress = Math.max(0, Math.min(1, scrollY / (maxScroll || 1)));
  progressFill.style.width = `${progress * 100}%`;

  // === 1. TOP INTRO SECTION ===
  if (scrollY <= INTRO_TOTAL_SCROLL) {
    let introAlpha = 1.0;
    if (scrollY > 450) {
      introAlpha = Math.max(0, 1.0 - ((scrollY - 450) / 400));
    }

    introEl.style.opacity = `${introAlpha.toFixed(3)}`;
    introEl.style.visibility = (introAlpha > 0.01 ? 'visible' : 'hidden');
    introEl.style.pointerEvents = (introAlpha > 0.3 ? 'auto' : 'none');

    // All story panels strictly HIDDEN during Intro
    panels.forEach(p => {
      p.style.opacity = '0';
      p.style.visibility = 'hidden';
      p.style.pointerEvents = 'none';
    });
    svgLines.style.opacity = '0';
    activeCalloutIdx = -1;
    activeCalloutAlpha = 0;
    activeConesAlpha = 0;
    particleMode = 'none';
    particleAlpha = 0;
    targetPhoneVisible = false;

    neckbandGroup.visible = true;
    targetCamPos.copy(CAMERA_STATES[0].camPos);
    targetLookAt.copy(CAMERA_STATES[0].lookAt);
    targetModelPos.set(0.05, 0, 0);
    targetModelRotY = 0;

    activeStage = 0;
    updateChapterActive(0);
    return;
  }

  // Once scrolled past Intro, guarantee Intro is invisible
  introEl.style.opacity = '0';
  introEl.style.visibility = 'hidden';
  introEl.style.pointerEvents = 'none';

  // === 2. OUTRO SECTION PAST STORY TRACK ===
  const storyEnd = stageRanges[9].end;
  if (scrollY >= storyEnd) {
    const exitPx = scrollY - storyEnd;
    const exitAlpha = Math.max(0, 1.0 - (exitPx / 450));

    panels.forEach((p, idx) => {
      if (idx === 9) {
        p.style.opacity = `${exitAlpha.toFixed(3)}`;
        p.style.visibility = (exitAlpha > 0.01 ? 'visible' : 'hidden');
        p.style.pointerEvents = (exitAlpha > 0.5 ? 'auto' : 'none');
      } else {
        p.style.opacity = '0';
        p.style.visibility = 'hidden';
        p.style.pointerEvents = 'none';
      }
    });

    svgLines.style.opacity = '0';
    activeCalloutIdx = -1;
    activeCalloutAlpha = 0;
    activeConesAlpha = 0;
    targetPhoneVisible = false;
    particleMode = 'none';
    particleAlpha = 0;

    neckbandGroup.visible = true;
    targetCamPos.copy(CAMERA_STATES[9].camPos);
    targetLookAt.copy(CAMERA_STATES[9].lookAt);
    targetModelPos.copy(CAMERA_STATES[9].modelPos);
    targetModelRotY = CAMERA_STATES[9].modelRotY;

    activeStage = 9;
    updateChapterActive(11); // Innovation dot
    return;
  }

  // === 3. STORY TRACK (STAGES 0 to 9) ===
  // Find current active stage for panel display
  let curStageIdx = 0;
  for (let i = 0; i < stageRanges.length; i++) {
    if (scrollY >= stageRanges[i].start && scrollY < stageRanges[i].end) {
      curStageIdx = i;
      break;
    }
  }
  activeStage = curStageIdx;
  updateChapterActive(curStageIdx + 1);

  // Smoothly update panel opacities: AT MOST ONE PANEL IS VISIBLE AT A TIME
  panels.forEach((p, idx) => {
    if (idx === curStageIdx) {
      const r = stageRanges[idx];
      let alpha = 1.0;
      if (scrollY < r.pStart) {
        alpha = smoothstep(r.start, r.pStart, scrollY);
      } else if (scrollY > r.pEnd) {
        alpha = 1.0 - smoothstep(r.pEnd, r.end, scrollY);
      }
      p.style.opacity = `${alpha.toFixed(3)}`;
      p.style.visibility = (alpha > 0.01 ? 'visible' : 'hidden');
      p.style.pointerEvents = (alpha > 0.5 ? 'auto' : 'none');
    } else {
      p.style.opacity = '0';
      p.style.visibility = 'hidden';
      p.style.pointerEvents = 'none';
    }
  });

  // CONTINUOUS CAMERA & MODEL TRAJECTORY ACROSS SCROLL
  // Every scroll point smoothly resolves into a continuous position, lookAt, and rotation
  if (scrollY <= stageRanges[0].pStart) {
    targetCamPos.copy(CAMERA_STATES[0].camPos);
    targetLookAt.copy(CAMERA_STATES[0].lookAt);
    targetModelPos.copy(CAMERA_STATES[0].modelPos);
    targetModelRotY = 0;
  } else if (scrollY >= stageRanges[9].pEnd) {
    targetCamPos.copy(CAMERA_STATES[9].camPos);
    targetLookAt.copy(CAMERA_STATES[9].lookAt);
    targetModelPos.copy(CAMERA_STATES[9].modelPos);
    targetModelRotY = CAMERA_STATES[9].modelRotY;
  } else {
    // Check if within a stage plateau or in a transition corridor
    for (let i = 0; i < 10; i++) {
      const r = stageRanges[i];
      if (scrollY >= r.pStart && scrollY <= r.pEnd) {
        // INSIDE PLATEAU OF STAGE i
        targetCamPos.copy(CAMERA_STATES[i].camPos);
        targetLookAt.copy(CAMERA_STATES[i].lookAt);
        targetModelPos.copy(CAMERA_STATES[i].modelPos);

        if (i === 1) {
          // Stage 1 Plateau: 360 rotation continuously driven by scroll!
          const u = (scrollY - r.pStart) / (r.pEnd - r.pStart);
          targetModelRotY = u * Math.PI * 2;
          degCounter.innerText = String(Math.min(360, Math.round(u * 360))).padStart(3, '0');
        } else {
          targetModelRotY = CAMERA_STATES[i].modelRotY;
        }
        break;
      } else if (i < 9 && scrollY > r.pEnd && scrollY < stageRanges[i + 1].pStart) {
        // IN SMOOTH TRANSITION CORRIDOR BETWEEN STAGE i AND STAGE i + 1
        const rNext = stageRanges[i + 1];
        const tCorridor = (scrollY - r.pEnd) / (rNext.pStart - r.pEnd);
        const easeT = smoothstep(0, 1, tCorridor);

        targetCamPos.lerpVectors(CAMERA_STATES[i].camPos, CAMERA_STATES[i + 1].camPos, easeT);
        targetLookAt.lerpVectors(CAMERA_STATES[i].lookAt, CAMERA_STATES[i + 1].lookAt, easeT);
        targetModelPos.lerpVectors(CAMERA_STATES[i].modelPos, CAMERA_STATES[i + 1].modelPos, easeT);

        // Transition from Stage 2 to Stage 3: arc X outward so the flight path over the top has zero vertical singularity
        if (i === 2) {
          const arcOffset = Math.sin(easeT * Math.PI) * 0.22;
          targetCamPos.x += arcOffset;
        }

        let rotStart = CAMERA_STATES[i].modelRotY;
        if (i === 1) {
          rotStart = Math.PI * 2; // completed 360 deg
          degCounter.innerText = '360';
        }
        const rotEnd = (i === 0) ? 0 : CAMERA_STATES[i + 1].modelRotY;
        targetModelRotY = rotStart + (rotEnd - rotStart) * easeT;
        break;
      }
    }
  }

  // === SPECIAL STAGE ELEMENTS & CALLOUTS ===

  // Stage 1 Counter reset if before stage 1 plateau
  if (scrollY < stageRanges[1].pStart) {
    degCounter.innerText = '000';
  }

  // Active callouts & FOV Cones
  activeCalloutIdx = -1;
  activeCalloutAlpha = 0;
  activeConesAlpha = 0;

  // Stage 2: Camera & ToF Callouts
  if (curStageIdx === 2) {
    const r2 = stageRanges[2];
    let a2 = 1.0;
    if (scrollY < r2.pStart) a2 = smoothstep(r2.start, r2.pStart, scrollY);
    else if (scrollY > r2.pEnd) a2 = 1.0 - smoothstep(r2.pEnd, r2.end, scrollY);
    activeCalloutIdx = 2;
    activeCalloutAlpha = a2;
  }

  // Stage 3: Top Coverage FOV Cones & Callouts
  const r3 = stageRanges[3];
  if (scrollY >= r3.start && scrollY <= r3.end) {
    let a3 = 1.0;
    if (scrollY < r3.pStart) a3 = smoothstep(r3.start, r3.pStart, scrollY);
    else if (scrollY > r3.pEnd) a3 = 1.0 - smoothstep(r3.pEnd, r3.end, scrollY);
    activeConesAlpha = a3;
    if (curStageIdx === 3) {
      activeCalloutIdx = 3;
      activeCalloutAlpha = a3;
    }
  }

  // Stage 4: Rear Hub Callouts
  if (curStageIdx === 4) {
    const r4 = stageRanges[4];
    let a4 = 1.0;
    if (scrollY < r4.pStart) a4 = smoothstep(r4.start, r4.pStart, scrollY);
    else if (scrollY > r4.pEnd) a4 = 1.0 - smoothstep(r4.pEnd, r4.end, scrollY);
    activeCalloutIdx = 4;
    activeCalloutAlpha = a4;
  }

  // Stages 5, 6, 7: Phone & Particles orchestration
  particleMode = 'none';
  particleAlpha = 0;

  const r5 = stageRanges[5];
  const r6 = stageRanges[6];
  const r7 = stageRanges[7];

  // Stage 5: Uplink
  if (curStageIdx === 5) {
    let a5 = 1.0;
    if (scrollY < r5.pStart) a5 = smoothstep(r5.start, r5.pStart, scrollY);
    else if (scrollY > r5.pEnd) a5 = 1.0 - smoothstep(r5.pEnd, r5.end, scrollY);

    targetPhoneVisible = true;
    targetPhonePos.set(0.18, 0.06, 0);
    targetPhoneRotY = -0.3;
    targetPhoneScale.set(0.88, 0.88, 0.88);
    neckbandGroup.visible = true;

    particleMode = 'uplink';
    particleAlpha = a5;
  }
  // Transition between Stage 5 and Stage 6
  else if (scrollY > r5.end && scrollY < r6.start) {
    const tP = (scrollY - r5.end) / (r6.start - r5.end);
    const easeP = smoothstep(0, 1, tP);
    targetPhoneVisible = true;
    targetPhonePos.lerpVectors(new THREE.Vector3(0.18, 0.06, 0), new THREE.Vector3(-0.11, 0, 0), easeP);
    targetPhoneRotY = -0.3 + (0 - (-0.3)) * easeP;
    targetPhoneScale.lerpVectors(new THREE.Vector3(0.88, 0.88, 0.88), new THREE.Vector3(1.18, 1.18, 1.18), easeP);
    neckbandGroup.visible = (easeP < 0.8);
  }
  // Stage 6: Phone AI Pipeline
  else if (curStageIdx === 6) {
    targetPhoneVisible = true;
    targetPhonePos.set(-0.11, 0.0, 0.0);
    targetPhoneRotY = 0.0;
    targetPhoneScale.set(1.18, 1.18, 1.18);
    neckbandGroup.visible = false;

    let pStage = 0;
    if (scrollY >= r6.pEnd) {
      pStage = 6;
    } else if (scrollY >= r6.pStart) {
      const u = (scrollY - r6.pStart) / (r6.pEnd - r6.pStart);
      pStage = Math.max(0, Math.min(6, u * 6.99));
    }
    phoneScreenRenderer.setStage(pStage);

    const stageItems = stagesList.querySelectorAll('li');
    const curStageCheck = Math.floor(pStage);
    stageItems.forEach((li, idx) => {
      li.classList.toggle('active', idx === curStageCheck);
      li.classList.toggle('done', idx < curStageCheck);
    });
  }
  // Transition between Stage 6 and Stage 7
  else if (scrollY > r6.end && scrollY < r7.start) {
    const tP = (scrollY - r6.end) / (r7.start - r6.end);
    const easeP = smoothstep(0, 1, tP);
    targetPhoneVisible = true;
    targetPhonePos.lerpVectors(new THREE.Vector3(-0.11, 0, 0), new THREE.Vector3(0.22, 0.08, 0), easeP);
    targetPhoneRotY = 0 + (-0.25 - 0) * easeP;
    targetPhoneScale.lerpVectors(new THREE.Vector3(1.18, 1.18, 1.18), new THREE.Vector3(0.88, 0.88, 0.88), easeP);
    neckbandGroup.visible = true;
    phoneScreenRenderer.setStage(6);
  }
  // Stage 7: Downlink
  else if (curStageIdx === 7) {
    let a7 = 1.0;
    if (scrollY < r7.pStart) a7 = smoothstep(r7.start, r7.pStart, scrollY);
    else if (scrollY > r7.pEnd) a7 = 1.0 - smoothstep(r7.pEnd, r7.end, scrollY);

    targetPhoneVisible = true;
    targetPhonePos.set(0.22, 0.08, 0);
    targetPhoneRotY = -0.25;
    targetPhoneScale.set(0.88, 0.88, 0.88);
    neckbandGroup.visible = true;
    phoneScreenRenderer.setStage(6);

    particleMode = 'downlink';
    particleAlpha = a7;
  }
  // Stages 8 and 9
  else {
    targetPhoneVisible = false;
    neckbandGroup.visible = true;

    if (curStageIdx === 8) {
      const r8 = stageRanges[8];
      let a8 = 1.0;
      if (scrollY < r8.pStart) a8 = smoothstep(r8.start, r8.pStart, scrollY);
      else if (scrollY > r8.pEnd) a8 = 1.0 - smoothstep(r8.pEnd, r8.end, scrollY);
      activeCalloutIdx = 8;
      activeCalloutAlpha = a8;
    }
  }
}

function updateChapterActive(idx) {
  const btns = chaptersContainer.querySelectorAll('button');
  btns.forEach((b, i) => {
    b.classList.toggle('active', i === idx);
  });
}

// Lenis Scroll Event Listener
lenis.on('scroll', (e) => {
  onScroll(e.scroll);
});

// Render Loop
const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);

  const elapsedTime = clock.getElapsedTime();

  // Smooth buttery interpolation (frame damping)
  const LERP_FACTOR = 0.065;
  currentCamPos.lerp(targetCamPos, LERP_FACTOR);
  currentLookAt.lerp(targetLookAt, LERP_FACTOR);
  currentModelPos.lerp(targetModelPos, LERP_FACTOR);
  currentModelRotY += (targetModelRotY - currentModelRotY) * LERP_FACTOR;

  camera.position.copy(currentCamPos);
  camera.lookAt(currentLookAt);
  neckbandGroup.position.copy(currentModelPos);
  neckbandGroup.rotation.y = currentModelRotY;

  // Phone transforms
  if (targetPhoneVisible || phoneGroup.visible) {
    currentPhonePos.lerp(targetPhonePos, LERP_FACTOR);
    currentPhoneRotY += (targetPhoneRotY - currentPhoneRotY) * LERP_FACTOR;
    currentPhoneScale.lerp(targetPhoneScale, LERP_FACTOR);
    phoneGroup.position.copy(currentPhonePos);
    phoneGroup.rotation.y = currentPhoneRotY;
    phoneGroup.scale.copy(currentPhoneScale);
    phoneGroup.visible = targetPhoneVisible;

    if (phoneGroup.visible) {
      phoneScreenRenderer.draw(elapsedTime);
      phoneCanvasTexture.needsUpdate = true;
    }
  }

  // FOV Cones opacity
  if (activeConesAlpha > 0.01) {
    fovConesGroup.visible = true;
    fovMeshes.forEach(m => { m.material.opacity = 0.28 * activeConesAlpha; });
    fovLines.forEach(l => { l.material.opacity = 0.85 * activeConesAlpha; });
  } else {
    fovConesGroup.visible = false;
  }

  // Particles
  if (particleMode !== 'none' && particleAlpha > 0.01) {
    streamPoints.visible = true;
    streamParticlesMat.opacity = 0.85 * particleAlpha;
    updateParticles(particleMode, elapsedTime);
  } else {
    streamPoints.visible = false;
  }

  // Callouts & SVG Lines updated continuously using live smoothed camera
  svgLines.style.opacity = `${activeCalloutAlpha.toFixed(3)}`;
  updateCallouts(activeCalloutIdx, activeCalloutAlpha);

  // Idle gentle breathing float on model only when at rest in intro or outro
  if (activeStage === 0 || activeStage === 9) {
    if (neckbandGroup.visible) {
      neckbandGroup.position.y += Math.sin(elapsedTime * 1.5) * 0.0003;
    }
  }

  renderer.render(scene, camera);
}
animate();

// Window Resize Handling
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  updateCallouts(activeStage, 1.0);
});

// Stat Counters Animation on Intro
const statEl = document.querySelector('[data-count="80"]');
if (statEl) {
  gsap.to({ val: 0 }, {
    val: 80,
    duration: 2.2,
    ease: 'power2.out',
    onUpdate: function () {
      statEl.innerText = Math.floor(this.targets()[0].val);
    }
  });
}
