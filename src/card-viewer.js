import * as THREE from 'https://esm.sh/three@0.160.0';
import { STLLoader } from 'https://esm.sh/three@0.160.0/examples/jsm/loaders/STLLoader.js';

const materialSpecs = {
  print: { color: '#d7d3c6', metalness: 0.08, roughness: 0.56, texture: 'filament' },
  resin: { color: '#b8a36f', metalness: 0.72, roughness: 0.24, texture: 'resin' },
  laser: { color: '#a8794d', metalness: 0.02, roughness: 0.84, texture: 'wood' }
};

function makeMaterialTexture(kind) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const base = kind === 'wood' ? '#a47750' : kind === 'resin' ? '#37342f' : '#d4d0c4';
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 256, 256);
  if (kind === 'wood') {
    for (let i = 0; i < 42; i++) {
      ctx.strokeStyle = i % 3 ? 'rgba(55,34,19,.12)' : 'rgba(238,203,153,.2)';
      ctx.lineWidth = i % 7 === 0 ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(0, i * 7 + Math.sin(i) * 5);
      ctx.bezierCurveTo(72, i * 7 - 9, 164, i * 7 + 11, 256, i * 7 - 3);
      ctx.stroke();
    }
  } else if (kind === 'filament') {
    for (let y = 0; y < 256; y += 5) {
      ctx.fillStyle = y % 10 ? 'rgba(45,43,37,.045)' : 'rgba(255,255,255,.12)';
      ctx.fillRect(0, y, 256, 2);
    }
  } else {
    for (let i = 0; i < 900; i++) {
      const v = Math.random() > .5 ? '255,226,157' : '15,14,13';
      ctx.fillStyle = `rgba(${v},${Math.random() * .2})`;
      ctx.beginPath();
      ctx.arc(Math.random() * 256, Math.random() * 256, Math.random() * 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 2);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function withGeneratedUv(geometry) {
  geometry.computeBoundingBox();
  const { min, max } = geometry.boundingBox;
  const spanX = Math.max(max.x - min.x, 0.001);
  const spanZ = Math.max(max.z - min.z, 0.001);
  const positions = geometry.attributes.position;
  const uv = new Float32Array(positions.count * 2);
  for (let i = 0; i < positions.count; i++) {
    uv[i * 2] = (positions.getX(i) - min.x) / spanX;
    uv[i * 2 + 1] = (positions.getZ(i) - min.z) / spanZ;
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geometry;
}

function fitGeometry(geometry) {
  geometry.computeBoundingBox();
  const center = geometry.boundingBox.getCenter(new THREE.Vector3());
  geometry.translate(-center.x, -center.y, -center.z);
  geometry.computeBoundingBox();
  const size = geometry.boundingBox.getSize(new THREE.Vector3());
  geometry.scale(1.7 / Math.max(size.x, size.y, size.z, 0.001), 1.7 / Math.max(size.x, size.y, size.z, 0.001), 1.7 / Math.max(size.x, size.y, size.z, 0.001));
  return geometry;
}

function createFallback(group, spec) {
  const material = new THREE.MeshStandardMaterial({ map: makeMaterialTexture(spec.texture), color: spec.color, metalness: spec.metalness, roughness: spec.roughness });
  const bodyGeometry = spec.texture === 'wood'
    ? new THREE.BoxGeometry(1.45, 0.9, 0.16, 1, 1, 1)
    : spec.texture === 'resin'
      ? new THREE.IcosahedronGeometry(0.77, 2)
      : new THREE.BoxGeometry(0.95, 1.15, 0.32, 1, 1, 1);
  const body = new THREE.Mesh(bodyGeometry, material);
  body.position.y = 0.05;
  group.add(body);

  const imageUrl = group.userData.image;
  if (imageUrl) {
    new THREE.TextureLoader().load(imageUrl, (texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      const imageAspect = texture.image.width / texture.image.height || 1;
      const w = imageAspect >= 1 ? 1.22 : 1.22 * imageAspect;
      const h = imageAspect >= 1 ? 1.22 / imageAspect : 1.22;
      const plate = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide, toneMapped: false }));
      plate.position.set(0, 0.05, spec.texture === 'resin' ? 0.78 : 0.17);
      group.add(plate);
    });
  }
}

function buildViewer(canvas) {
  if (!canvas.isConnected || canvas.dataset.ready === 'true') return;
  canvas.dataset.ready = 'true';
  const type = canvas.dataset.material || 'print';
  const spec = materialSpecs[type] || materialSpecs.print;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
  camera.position.set(0, 0.2, 4.2);
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;

  scene.add(new THREE.HemisphereLight(0xf8f4e8, 0x292923, 2.2));
  const key = new THREE.DirectionalLight(0xffffff, 3.2);
  key.position.set(-2.5, 3.5, 4);
  scene.add(key);
  const rim = new THREE.DirectionalLight(type === 'resin' ? 0xd9bc74 : 0xd7fa76, 2.1);
  rim.position.set(2, 1, -3);
  scene.add(rim);

  const group = new THREE.Group();
  group.userData.image = canvas.dataset.texture || '';
  group.rotation.set(-0.12, -0.42, 0);
  scene.add(group);
  const platform = new THREE.Mesh(new THREE.CylinderGeometry(0.82, 0.9, 0.08, 48), new THREE.MeshStandardMaterial({ color: '#33342f', metalness: 0.32, roughness: 0.42 }));
  platform.position.y = -0.91;
  scene.add(platform);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(0.88, 48), new THREE.MeshBasicMaterial({ color: '#99a18a', transparent: true, opacity: 0.24 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.86;
  scene.add(ground);

  const texture = makeMaterialTexture(spec.texture);
  const material = new THREE.MeshStandardMaterial({ map: texture, color: spec.color, metalness: spec.metalness, roughness: spec.roughness });
  const modelUrl = canvas.dataset.model;
  const modelExtension = modelUrl ? new URL(modelUrl, location.href).pathname.split('.').pop().toLowerCase() : '';
  if (modelUrl && modelExtension !== 'stl') {
    canvas.style.display = 'none';
    return;
  }
  if (modelUrl) {
    new STLLoader().load(modelUrl, (raw) => {
      const geometry = fitGeometry(withGeneratedUv(raw));
      const mesh = new THREE.Mesh(geometry, material);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = 0.02;
      group.add(mesh);
      resize();
    }, undefined, () => createFallback(group, spec));
  } else createFallback(group, spec);

  function resize() {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    renderer.setSize(rect.width, rect.height, false);
    camera.aspect = rect.width / rect.height;
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
  }
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  let drag = null;
  let frame = 0;
  let active = true;
  function animate() {
    if (!active) return;
    if (!drag) group.rotation.y += 0.003;
    renderer.render(scene, camera);
    frame = requestAnimationFrame(animate);
  }
  animate();
  canvas.addEventListener('pointerdown', (event) => { event.preventDefault(); event.stopPropagation(); drag = [event.clientX, event.clientY]; canvas.setPointerCapture(event.pointerId); });
  canvas.addEventListener('pointermove', (event) => {
    if (!drag) return;
    group.rotation.y += (event.clientX - drag[0]) * 0.009;
    group.rotation.x += (event.clientY - drag[1]) * 0.007;
    drag = [event.clientX, event.clientY];
  });
  canvas.addEventListener('pointerup', () => { drag = null; });
  canvas.addEventListener('pointercancel', () => { drag = null; });
  canvas.addEventListener('wheel', (event) => {
    event.preventDefault();
    camera.position.z = Math.max(2.7, Math.min(5.2, camera.position.z + Math.sign(event.deltaY) * 0.18));
    camera.updateProjectionMatrix();
  }, { passive: false });
  const visibility = new IntersectionObserver(([entry]) => {
    active = entry.isIntersecting;
    if (active && !frame) animate();
    else if (!active && frame) { cancelAnimationFrame(frame); frame = 0; }
  }, { threshold: 0.05 });
  visibility.observe(canvas);
  canvas.style.display = 'block';
  const image = canvas.parentElement.querySelector('img');
  if (image) image.style.opacity = '0';
  resize();
}

export function mountProductCards() {
  const canvases = document.querySelectorAll('canvas.product-3d:not([data-ready])');
  const lazy = new IntersectionObserver((entries, observer) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      buildViewer(entry.target);
      observer.unobserve(entry.target);
    }
  }, { rootMargin: '160px' });
  canvases.forEach((canvas) => lazy.observe(canvas));
}

