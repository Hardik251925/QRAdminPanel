import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// ============ VARIABLES ============
let camera, scene, renderer;
let xrSession = null;
let xrRefSpace = null;
let xrHitTestSource = null;
let reticle;              // plane pe dikhne wala ring/indicator
let modelPlaced = false;  // model ek baar hi place hoga
let loadedModel = null;   // preloaded model reference
let tapIndicator = document.getElementById('tap-indicator');
let outlineImg = document.getElementById('outline-img');

// ============ INIT ============
init();

function init() {
  // --- Scene ---
  scene = new THREE.Scene();

  // --- Camera ---
  camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 100);

  // --- Renderer ---
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.xr.enabled = true;   // ← WebXR ON
  document.body.appendChild(renderer.domElement);

  // --- Lights ---
  const ambientLight = new THREE.AmbientLight(0xffffff, 1.0);
  scene.add(ambientLight);

  const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5);
  directionalLight.position.set(5, 10, 7);
  scene.add(directionalLight);

  // --- Reticle (Surface indicator - ring shape) ---
  const ringGeo = new THREE.RingGeometry(0.05, 0.07, 32).rotateX(-Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0x00e5ff, side: THREE.DoubleSide });
  reticle = new THREE.Mesh(ringGeo, ringMat);
  reticle.visible = false;
  reticle.matrixAutoUpdate = false; // hit test se position milega
  scene.add(reticle);

  // --- Preload 3D Model ---
  const loader = new GLTFLoader();
  loader.load(
    'models/your-model.glb',    // ← apna model path yahan daalo
    (gltf) => {
      loadedModel = gltf.scene;
      loadedModel.scale.set(0.5, 0.5, 0.5);  // size adjust karo
      console.log('Model loaded successfully!');
    },
    (progress) => {
      console.log(`Loading: ${(progress.loaded / progress.total * 100).toFixed(0)}%`);
    },
    (error) => {
      console.error('Model load error:', error);
    }
  );

  // --- AR Button ---
  const arButton = document.getElementById('ar-button');
  const statusText = document.getElementById('status-text');

  if (navigator.xr) {
    navigator.xr.isSessionSupported('immersive-ar').then((supported) => {
      if (supported) {
        statusText.textContent = 'AR Supported! Tap to start.';
        arButton.addEventListener('click', startAR);
      } else {
        statusText.textContent = '❌ AR not supported on this device.';
        arButton.disabled = true;
      }
    });
  } else {
    statusText.textContent = '❌ WebXR not available in this browser.';
    arButton.disabled = true;
  }

  // --- Window Resize ---
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}

// ============ START AR SESSION ============
async function startAR() {
  try {
    xrSession = await navigator.xr.requestSession('immersive-ar', {
      requiredFeatures: ['hit-test', 'plane-detection'],
      optionalFeatures: ['dom-overlay'],
      domOverlay: { root: document.body }
    });

    // Overlay hatao
    document.getElementById('overlay').style.display = 'none';

    // Renderer ko session do
    renderer.xr.setReferenceSpaceType('local');
    await renderer.xr.setSession(xrSession);

    // Reference space
    xrRefSpace = await xrSession.requestReferenceSpace('local');

    // Hit test source (camera center se ray)
    const viewerRefSpace = await xrSession.requestReferenceSpace('viewer');
    xrHitTestSource = await xrSession.requestHitTestSource({
      space: viewerRefSpace
    });

    // Select event = Screen Tap
    xrSession.addEventListener('select', onSelect);

    // Session end
    xrSession.addEventListener('end', () => {
      xrHitTestSource = null;
      xrSession = null;
      document.getElementById('overlay').style.display = 'flex';
    });

    // Start render loop
    renderer.setAnimationLoop(onXRFrame);

  } catch (err) {
    console.error('AR session failed:', err);
    alert('AR start nahi ho paya. Check permissions.');
  }
}

// ============ EVERY FRAME (AR LOOP) ============
function onXRFrame(timestamp, frame) {
  if (!frame) return;

  const pose = frame.getViewerPose(xrRefSpace);

  // Hit Test Results
  if (xrHitTestSource && !modelPlaced) {
    const hitResults = frame.getHitTestResults(xrHitTestSource);

    if (hitResults.length > 0) {
      const hit = hitResults[0];
      const hitPose = hit.getPose(xrRefSpace);

      // Reticle ko hit position pe rakho
      reticle.visible = true;
      reticle.matrix.fromArray(hitPose.transform.matrix);

      // Tap indicator show karo (DOM overlay)
      tapIndicator.style.display = 'block';

      // Screen center pe indicator
      tapIndicator.style.left = '50%';
      tapIndicator.style.top = '50%';

    } else {
      reticle.visible = false;
      tapIndicator.style.display = 'none';
    }
  }

  // Render
  renderer.render(scene, camera);
}

// ============ TAP / SELECT EVENT ============
function onSelect(event) {
  if (modelPlaced) return;  // sirf ek baar place hoga
  if (!loadedModel) {
    console.warn('Model abhi load nahi hua!');
    return;
  }
  if (!reticle.visible) return;  // surface detect nahi hua to ignore

  // Model clone karo aur reticle ki position pe rakho
  const model = loadedModel.clone();

  // Reticle ki world position nikalo
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  reticle.matrix.decompose(position, quaternion, scale);

  model.position.copy(position);
  model.quaternion.copy(quaternion);

  scene.add(model);

  // Model placed! Ab aur spawn nahi hoga
  modelPlaced = true;
  reticle.visible = false;
  tapIndicator.style.display = 'none';

  console.log('Model spawned at:', position);
}