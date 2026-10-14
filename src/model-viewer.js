import * as THREE from 'https://esm.sh/three@0.160.0';
import { STLLoader } from 'https://esm.sh/three@0.160.0/examples/jsm/loaders/STLLoader.js';
import { OBJLoader } from 'https://esm.sh/three@0.160.0/examples/jsm/loaders/OBJLoader.js';
import { PLYLoader } from 'https://esm.sh/three@0.160.0/examples/jsm/loaders/PLYLoader.js';
import { GLTFLoader } from 'https://esm.sh/three@0.160.0/examples/jsm/loaders/GLTFLoader.js';
import { ThreeMFLoader } from 'https://esm.sh/three@0.160.0/examples/jsm/loaders/3MFLoader.js';
import { FBXLoader } from 'https://esm.sh/three@0.160.0/examples/jsm/loaders/FBXLoader.js';
import { OrbitControls } from 'https://esm.sh/three@0.160.0/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'https://esm.sh/three@0.160.0/examples/jsm/environments/RoomEnvironment.js';

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

function sourceMaterialForGeometry(geometry) {
  return new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: Boolean(geometry.getAttribute('color')),
    side: THREE.DoubleSide,
    metalness: 0.06,
    roughness: 0.48
  });
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
  let environmentTarget = null;
  try {
    environmentTarget = pmrem.fromScene(room, 0.04);
    scene.environment = environmentTarget.texture;
  } catch (error) {
    console.warn('Studio reflections are unavailable; using direct lights.', error);
  } finally {
    room.dispose();
    pmrem.dispose();
  }

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
  scene.add(modelRoot);
  let loadedObject = null;
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
    if (preset === 'source') {
      currentPreset = 'source';
      loadedObject?.traverse((object) => {
        if (object.isMesh && object.userData.formaSourceMaterial) object.material = object.userData.formaSourceMaterial;
      });
      renderer.render(scene, camera);
      return { key: currentPreset, label: 'Original file material' };
    }
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
      vertexColors: false
    });
    loadedObject?.traverse((object) => {
      if (!object.isMesh) return;
      object.material = activeMaterial;
    });
    renderer.render(scene, camera);
    return { key: currentPreset, label: spec.label };
  }

  function fitModel(object, isStl = false) {
    if (!object) throw new Error('No mesh found in this file.');
    if (isStl) object.rotation.x = -Math.PI / 2;
    object.traverse((child) => {
      if (!child.isMesh) return;
      if (!child.geometry) throw new Error('Mesh geometry is missing.');
      if (!child.geometry.getAttribute('uv')) addUvs(child.geometry);
      if (!child.geometry.getAttribute('normal')) child.geometry.computeVertexNormals();
      child.userData.formaSourceMaterial = child.material;
      child.castShadow = true;
      child.receiveShadow = true;
    });
    object.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(object);
    if (box.isEmpty()) throw new Error('The model contains no visible geometry.');
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    object.position.sub(center);
    object.scale.multiplyScalar(1.34 / Math.max(size.x, size.y, size.z, 0.001));
    object.position.y += 0.14;
    if (loadedObject) {
      modelRoot.remove(loadedObject);
      loadedObject.traverse((child) => child.geometry?.dispose());
    }
    loadedObject = object;
    modelRoot.add(loadedObject);
    applyMaterial(currentPreset);
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
    async load(buffer, filename = 'model.stl') {
      try {
        const extension = String(filename).split('?')[0].split('.').pop().toLowerCase();
        let object;
        let isStl = false;
        if (extension === 'stl') {
          const geometry = new STLLoader().parse(buffer);
          object = new THREE.Mesh(geometry, sourceMaterialForGeometry(geometry));
          isStl = true;
        } else if (extension === 'obj') {
          object = new OBJLoader().parse(new TextDecoder().decode(buffer));
        } else if (extension === 'ply') {
          const geometry = new PLYLoader().parse(buffer);
          object = new THREE.Mesh(geometry, sourceMaterialForGeometry(geometry));
        } else if (extension === 'glb' || extension === 'gltf') {
          if (extension === 'gltf') {
            const source = new TextDecoder().decode(buffer);
            if (/"uri"\s*:\s*"(?!data:)/i.test(source)) throw new Error('External .gltf files need separate texture and buffer files. Upload a self-contained .glb instead.');
          }
          const gltf = await new GLTFLoader().parseAsync(buffer, '');
          object = gltf.scene;
        } else if (extension === '3mf') {
          object = new ThreeMFLoader().parse(buffer);
        } else if (extension === 'fbx') {
          object = new FBXLoader().parse(buffer, '');
        } else {
          throw new Error('Unsupported format. Use STL, OBJ, PLY, GLB, GLTF, 3MF, or FBX.');
        }
        fitModel(object, isStl);
        return true;
      } catch (error) {
        onStatus('error', error);
        throw error;
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
      modelRoot.rotation.set(0, 0, 0);
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      observer.disconnect();
      controls.dispose();
      loadedObject?.traverse((child) => child.geometry?.dispose());
      activeMaterial?.dispose();
      activeTexture?.dispose();
      environmentTarget?.dispose();
      renderer.dispose();
    }
  };
}

