import * as THREE from 'https://esm.sh/three@0.160.0';
import { STLLoader } from 'https://esm.sh/three@0.160.0/examples/jsm/loaders/STLLoader.js?external=three';
import { OrbitControls } from 'https://esm.sh/three@0.160.0/examples/jsm/controls/OrbitControls.js?external=three';
import { RoomEnvironment } from 'https://esm.sh/three@0.160.0/examples/jsm/environments/RoomEnvironment.js?external=three';

const MATERIALS = {
  plastic: { label: 'Матовый PETG', color: '#c8c4b8', metalness: 0.02, roughness: 0.72, texture: 'filament', clearcoat: 0.08 },
  resin: { label: 'Фотополимер', color: '#a5956d', metalness: 0.08, roughness: 0.24, texture: 'resin', clearcoat: 0.65 },
  ceramic: { label: 'Керамика', color: '#e7e3d8', metalness: 0.02, roughness: 0.2, texture: 'ceramic', clearcoat: 0.9 },
  metal: { label: 'Алюминий', color: '#9ca3a7', metalness: 0.88, roughness: 0.27, texture: 'metal', clearcoat: 0.25 },
  wood: { label: 'Древесина', color: '#a7754b', metalness: 0, roughness: 0.78, texture: 'wood', clearcoat: 0 }
};

function createSurfaceTexture(kind) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  const bases = { wood: '#bd936b', filament: '#d4d0c4', resin: '#a9a18d', ceramic: '#e6e2d8', metal: '#aab0b3' };
  ctx.fillStyle = bases[kind] || bases.filament;
  ctx.fillRect(0, 0, 512, 512);

  if (kind === 'wood') {
    for (let i = 0; i < 90; i++) {
      ctx.beginPath();
      ctx.strokeStyle = i % 4 ? 'rgba(72,42,20,.12)' : 'rgba(255,231,190,.24)';
      ctx.lineWidth = i % 9 === 0 ? 3 : 1;
      const y = i * 6;
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(140, y - 12, 310, y + 10, 512, y - 4);
      ctx.stroke();
    }
  } else if (kind === 'filament') {
    for (let y = 0; y < 512; y += 5) {
      ctx.fillStyle = y % 10 ? 'rgba(30,29,25,.045)' : 'rgba(255,255,255,.2)';
      ctx.fillRect(0, y, 512, 1.3);
    }
  } else if (kind === 'metal') {
    for (let y = 0; y < 512; y += 3) {
      ctx.fillStyle = y % 6 ? 'rgba(255,255,255,.07)' : 'rgba(20,25,28,.08)';
      ctx.fillRect(0, y, 512, 1);
    }
  } else if (kind === 'resin') {
    for (let i = 0; i < 850; i++) {
      const light = i % 2 === 0;
      ctx.fillStyle = light ? 'rgba(255,249,221,.2)' : 'rgba(30,27,22,.1)';
      ctx.beginPath();
      ctx.arc(Math.random() * 512, Math.random() * 512, Math.random() * 1.5 + 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    for (let i = 0; i < 1100; i++) {
      ctx.fillStyle = i % 2 ? 'rgba(255,255,255,.12)' : 'rgba(80,75,66,.035)';
      ctx.fillRect(Math.random() * 512, Math.random() * 512, 1, 1);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(kind === 'wood' ? 1.2 : 2, 2);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function addUvs(geometry) {
  geometry.computeBoundingBox();
  const { min, max } = geometry.boundingBox;
  const width = Math.max(max.x - min.x, 0.001);
  const height = Math.max(max.y - min.y, 0.001);
  const positions = geometry.attributes.position;
  const uv = new Float32Array(positions.count * 2);
  for (let i = 0; i < positions.count; i++) {
    uv[i * 2] = (positions.getX(i) - min.x) / width;
    uv[i * 2 + 1] = (positions.getY(i) - min.y) / height;
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geometry;
}

export function createModelViewer(canvas, { onStatus = () => {} } = {}) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.01, 100);
  camera.position.set(2.7, 2.15, 3.6);
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const room = new RoomEnvironment();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environmentTarget = pmrem.fromScene(room, 0.04);
  const environment = environmentTarget.texture;
  scene.environment = environment;
  room.dispose();
  pmrem.dispose();

  scene.add(new THREE.HemisphereLight(0xfaf7ec, 0x32352c, 1.5));
  const key = new THREE.DirectionalLight(0xfff7e8, 3.2);
  key.position.set(-3, 5, 4);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -3;
  key.shadow.camera.right = 3;
  key.shadow.camera.top = 3;
  key.shadow.camera.bottom = -3;
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xdff2ad, 1.35);
  fill.position.set(4, 2, -3);
  scene.add(fill);
  const softbox = new THREE.DirectionalLight(0xffffff, 1.8);
  softbox.position.set(2, 4, 3);
  scene.add(softbox);

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.ShadowMaterial({ color: '#13150f', opacity: 0.18 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.64;
  floor.receiveShadow = true;
  scene.add(floor);
  const pedestalMaterial = new THREE.MeshStandardMaterial({ color: '#33352e', metalness: 0.34, roughness: 0.38 });
  const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.82, 0.88, 0.09, 96), pedestalMaterial);
  pedestal.position.y = -0.59;
  pedestal.castShadow = true;
  pedestal.receiveShadow = true;
  scene.add(pedestal);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.79, 0.008, 8, 96), new THREE.MeshStandardMaterial({ color: '#b8e950', metalness: 0.62, roughness: 0.25, emissive: '#253b0e', emissiveIntensity: 0.2 }));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = -0.535;
  scene.add(ring);

  const modelRoot = new THREE.Group();
  modelRoot.rotation.x = -Math.PI / 2;
  scene.add(modelRoot);
  let geometry = null;
  let mesh = null;
  let activeTexture = null;
  let activeMaterial = null;
  let currentPreset = 'plastic';
  let raf = 0;
  let disposed = false;

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, -0.02, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.065;
  controls.minDistance = 1.7;
  controls.maxDistance = 7;
  controls.maxPolarAngle = Math.PI * 0.48;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.85;
  controls.update();

  function applyMaterial(preset) {
    const spec = MATERIALS[preset] || MATERIALS.plastic;
    currentPreset = MATERIALS[preset] ? preset : 'plastic';
    activeTexture?.dispose();
    activeTexture = createSurfaceTexture(spec.texture);
    activeMaterial?.dispose();
    activeMaterial = new THREE.MeshPhysicalMaterial({
      map: activeTexture,
      color: spec.color,
      metalness: spec.metalness,
      roughness: spec.roughness,
      clearcoat: spec.clearcoat,
      clearcoatRoughness: Math.max(0.08, spec.roughness * 0.5),
      side: THREE.DoubleSide,
      vertexColors: Boolean(geometry?.hasColors)
    });
    if (mesh) mesh.material = activeMaterial;
    renderer.render(scene, camera);
    return { key: currentPreset, label: spec.label };
  }

  function fitModel(nextGeometry) {
    geometry?.dispose();
    geometry = addUvs(nextGeometry);
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    const center = geometry.boundingBox.getCenter(new THREE.Vector3());
    geometry.translate(-center.x, -center.y, -center.z);
    geometry.computeBoundingBox();
    const size = geometry.boundingBox.getSize(new THREE.Vector3());
    const scale = 1.34 / Math.max(size.x, size.y, size.z, 0.001);
    geometry.scale(scale, scale, scale);
    if (mesh) {
      modelRoot.remove(mesh);
      mesh = null;
    }
    mesh = new THREE.Mesh(geometry, activeMaterial);
    mesh.position.y = 0.14;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    modelRoot.add(mesh);
    controls.target.set(0, 0.03, 0);
    controls.update();
    canvas.style.display = 'block';
    onStatus('ready');
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height || disposed) return;
    renderer.setSize(rect.width, rect.height, false);
    camera.aspect = rect.width / rect.height;
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
  }

  function render() {
    if (disposed) return;
    controls.update();
    renderer.render(scene, camera);
    raf = requestAnimationFrame(render);
  }

  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  applyMaterial(currentPreset);
  resize();
  render();

  return {
    load(buffer) {
      try {
        const parsed = new STLLoader().parse(buffer);
        fitModel(parsed);
        return true;
      } catch (error) {
        onStatus('error', error);
        return false;
      }
    },
    setMaterial(preset) {
      return applyMaterial(preset);
    },
    getMaterial() {
      return { key: currentPreset, label: MATERIALS[currentPreset].label };
    },
    reset() {
      controls.reset();
      modelRoot.rotation.set(-Math.PI / 2, 0, 0);
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      observer.disconnect();
      controls.dispose();
      geometry?.dispose();
      activeMaterial?.dispose();
      activeTexture?.dispose();
      environmentTarget.dispose();
      renderer.dispose();
    }
  };
}

