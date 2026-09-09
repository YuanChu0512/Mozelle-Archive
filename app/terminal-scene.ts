import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { dampSpring, nearestOccurrence, selectionWave } from "./terminal-motion.mjs";
import { nextFrameDeadline } from "./motion-math.mjs";

export type TerminalSceneState = { lane: number; row: number; detail: boolean; night: boolean; title: string; code: string; reduced: boolean };
export type TerminalScene = { update: (state: TerminalSceneState) => void; dispose: () => void };

export function mountTerminalScene(host: HTMLElement, initial: TerminalSceneState, onSelect: (lane: number, row: number) => void, onOpen: () => void): TerminalScene {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.35));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.transmissionResolutionScale = .5;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  host.append(renderer.domElement);
  renderer.domElement.setAttribute("aria-hidden", "true");
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 1, 180);
  const environment = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const env = environment.fromScene(room, .025);
  scene.environment = env.texture;
  scene.environmentIntensity = .55;
  room.dispose(); environment.dispose();
  const ambient = new THREE.HemisphereLight(0xfffbef, 0xb5b3a5, 2.1);
  const keyLight = new THREE.DirectionalLight(0xfff8eb, 3.2);
  keyLight.position.set(-12, 18, 10);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(1024, 1024);
  Object.assign(keyLight.shadow.camera, { left: -25, right: 25, top: 25, bottom: -25, near: 1, far: 75 });
  keyLight.shadow.bias = -.0004;
  keyLight.shadow.normalBias = .025;
  const fill = new THREE.DirectionalLight(0xffffff, .4);
  fill.position.set(12, 8, -10);
  scene.add(ambient, keyLight, fill);

  const floorMaterial = new THREE.MeshStandardMaterial({ color: 0xe8e5df, roughness: 1 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(180, 180), floorMaterial);
  floor.rotation.x = -Math.PI / 2; floor.position.y = -.06; floor.receiveShadow = true; scene.add(floor);
  const baseMaterial = new THREE.MeshStandardMaterial({ color: 0xd9d5ca, roughness: .58, metalness: .12 });
  const frameMaterial = new THREE.MeshStandardMaterial({ color: 0xe9e6db, roughness: .42, metalness: .2 });
  const amberMaterial = new THREE.MeshStandardMaterial({ color: 0xc5a275, roughness: .3, metalness: .28 });
  const frostMaterial = new THREE.MeshStandardMaterial({ color: 0xf0eee7, roughness: .5, metalness: .09, transparent: true, opacity: .62, depthWrite: false });
  const glassMaterial = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: .3, transmission: .58, thickness: .14, ior: 1.18, metalness: 0, clearcoat: .9, envMapIntensity: .85 });
  const darkMaterial = new THREE.MeshStandardMaterial({ color: 0x8c8e81, roughness: .5, metalness: .55 });
  const materials = [baseMaterial, frameMaterial, amberMaterial, frostMaterial, glassMaterial, darkMaterial, floorMaterial];
  const shapes: { geometry: THREE.BufferGeometry; material: THREE.Material; position: THREE.Vector3 }[] = [];
  const part = (geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number) => shapes.push({ geometry, material, position: new THREE.Vector3(x, y, z) });
  part(new THREE.BoxGeometry(4.5, 3.4, .2), baseMaterial, 0, 1.7, 0);
  part(new THREE.BoxGeometry(4.6, .07, .32), frameMaterial, 0, 3.44, .03);
  part(new THREE.BoxGeometry(4.6, .07, .32), frameMaterial, 0, .025, .03);
  part(new THREE.BoxGeometry(.06, 3.4, .32), frameMaterial, -2.28, 1.7, .03);
  part(new THREE.BoxGeometry(.06, 3.4, .32), frameMaterial, 2.28, 1.7, .03);
  part(new THREE.BoxGeometry(.09, 2.75, .1), amberMaterial, -2.12, 1.55, .18);
  part(new THREE.TorusGeometry(.86, .12, 8, 48), frameMaterial, -.48, 1.62, .14);
  part(new THREE.TorusGeometry(.67, .038, 6, 48), amberMaterial, -.48, 1.62, .2);
  part(new THREE.TorusGeometry(.49, .095, 8, 40), frameMaterial, 1.03, 2.06, .14);
  part(new THREE.TorusGeometry(.34, .045, 6, 40), amberMaterial, 1.03, 2.06, .21);
  part(new THREE.BoxGeometry(.83, .035, .045), amberMaterial, .54, 1.52, .2);
  part(new THREE.BoxGeometry(.24, .09, .055), amberMaterial, 1.83, 3.31, .21);
  for (const x of [-2.08, 2.08]) for (const y of [.2, 3.16]) part(new THREE.CylinderGeometry(.046, .046, .025, 8).rotateX(Math.PI / 2), darkMaterial, x, y, .2);
  const coverGeometry = new THREE.BoxGeometry(4.46, 3.32, .045);
  part(coverGeometry, frostMaterial, 0, 1.7, .26);

  const rows = 24, columns = 7, count = rows * columns;
  const cells = Array.from({ length: count }, (_, i) => ({ lane: Math.floor(i / rows) - 3, row: i % rows - 12, lift: { value: 0, velocity: 0 } }));
  const batches = shapes.map(({ geometry, material }, index) => {
    const mesh = new THREE.InstancedMesh(geometry, material, count);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.castShadow = index === 0;
    mesh.receiveShadow = index === 0;
    scene.add(mesh); return mesh;
  });
  const selected = new THREE.Group();
  for (const shape of shapes) {
    const mesh = new THREE.Mesh(shape.geometry, shape.material === frostMaterial ? glassMaterial : shape.material);
    mesh.castShadow = shape.material === baseMaterial;
    mesh.receiveShadow = shape.material !== frostMaterial;
    mesh.position.copy(shape.position); selected.add(mesh);
  }
  scene.add(selected);

  const labelCanvas = document.createElement("canvas"); labelCanvas.width = 640; labelCanvas.height = 112;
  const labelTexture = new THREE.CanvasTexture(labelCanvas); labelTexture.colorSpace = THREE.SRGBColorSpace;
  const labelMaterial = new THREE.MeshBasicMaterial({ map: labelTexture, transparent: true, depthWrite: false });
  const label = new THREE.Mesh(new THREE.PlaneGeometry(3.85, .67), labelMaterial);
  label.position.set(-.1, 2.92, .31); selected.add(label);
  const scanMaterial = new THREE.MeshBasicMaterial({ color: 0x30372f, transparent: true, opacity: 0, depthWrite: false });
  const scan = new THREE.Mesh(new THREE.PlaneGeometry(4.3, .018), scanMaterial); scan.position.set(0, 3.3, .34); selected.add(scan);

  const dummy = new THREE.Object3D();
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const lane = { value: initial.lane, velocity: 0 }, row = { value: initial.row, velocity: 0 };
  const detail = { value: 0, velocity: 0 }, rotation = { value: 0, velocity: 0 };
  const aim = new THREE.Vector3();
  let state = initial, frame = 0, last = 0, deadline = 0, disposed = false;
  let lastInput = performance.now(), openingAt = 0, hoverId = -1;
  let bounds = host.getBoundingClientRect();
  let pointerDown: { x: number; y: number } | null = null;
  let rotationTarget = 0;
  let wheelSum = 0, wheelTime = 0;
  let pendingPointer: { x: number; y: number } | null = null;
  const pulses: { lane: number; row: number; started: number }[] = [];
  const updateLabel = () => {
    const ctx = labelCanvas.getContext("2d"); if (!ctx) return;
    ctx.clearRect(0, 0, 640, 112);
    ctx.fillStyle = state.night ? "#d4d9c9" : "#262d25";
    ctx.font = "600 20px Arial, sans-serif"; ctx.fillText("MOZELLE ARCHIVE", 12, 25);
    ctx.font = "15px Arial, sans-serif"; ctx.fillText("FIELD RECORD / " + state.code, 12, 50);
    ctx.fillRect(12, 61, 598, 1);
    ctx.font = "500 24px Arial, sans-serif";
    const clipped = state.title.length > 28 ? state.title.slice(0, 27) + "…" : state.title;
    ctx.fillText(clipped, 12, 95, 598); labelTexture.needsUpdate = true;
  };
  const applyPalette = () => {
    const bg = state.night ? 0x1b2423 : 0xe8e5df;
    scene.background = new THREE.Color(bg); scene.fog = new THREE.Fog(bg, 34, 80);
    floorMaterial.color.setHex(bg);
    baseMaterial.color.setHex(state.night ? 0x25352e : 0xc7c2b5);
    frameMaterial.color.setHex(state.night ? 0x475c4e : 0xd6d1c4);
    frostMaterial.color.setHex(state.night ? 0x35453a : 0xe6e1d7);
    amberMaterial.color.setHex(state.night ? 0xc3ad77 : 0xc5a275);
    renderer.toneMappingExposure = state.night ? .9 : .95;
    ambient.intensity = state.night ? .65 : .75;
    keyLight.intensity = state.night ? 1.6 : 1.8;
    updateLabel();
  };

  const pickPointer = () => {
    if (!pendingPointer || state.detail) return;
    pointer.set((pendingPointer.x - bounds.left) / bounds.width * 2 - 1, -(pendingPointer.y - bounds.top) / bounds.height * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObject(batches[0], false)[0];
    hoverId = hit?.instanceId ?? -1;
    host.style.cursor = hoverId >= 0 ? "pointer" : "default";
    pendingPointer = null;
  };

  const render = (now: number) => {
    frame = 0;
    if (disposed || document.hidden) return;
    const dt = Math.min(.05, last ? (now - last) / 1000 : 1 / 60); last = now;
    dampSpring(lane, state.lane, 8, dt); dampSpring(row, state.row, 9, dt);
    dampSpring(rotation, state.detail ? rotationTarget : 0, 9, dt);
    // Hold the extracted file above its neighbours until it has faced forward.
    const holdForAlignment = !state.detail && Math.abs(rotation.value) > .015;
    dampSpring(detail, state.detail || holdForAlignment ? 1 : 0, 5.5, dt);
    if (state.reduced) { lane.value = state.lane; row.value = state.row; detail.value = Number(state.detail); rotation.value = rotationTarget; }
    const blend = detail.value;
    for (let i = pulses.length - 1; i >= 0; i--) if (now - pulses[i].started > 2500) pulses.splice(i, 1);
    let selectedIndex = -1;
    for (let i = 0; i < count; i++) {
      const cell = cells[i];
      cell.lane = nearestOccurrence(Math.floor(i / rows) - 3, state.lane, columns);
      cell.row = nearestOccurrence(i % rows - 12, state.row, rows);
      const active = cell.lane === state.lane && cell.row === state.row;
      let wave = 0;
      if (!state.reduced) for (const pulse of pulses) wave += selectionWave(Math.abs(cell.row - pulse.row) + Math.abs(cell.lane - pulse.lane) * 1.9, (now - pulse.started) / 1000);
      const shoulder = .38 * Math.exp(-Math.pow((cell.row - state.row) / 4.4, 2)) * Math.exp(-Math.pow((cell.lane - state.lane) / 2.5, 2));
      const targetLift = active ? .8 + blend * 3.15 : (shoulder + wave) * (1 - blend * .7);
      dampSpring(cell.lift, targetLift, active ? 7 : 6, dt);
      if (state.reduced) cell.lift.value = targetLift;
      const x = (cell.lane - lane.value) * 4.85;
      const z = (cell.row - row.value) * .68;
      if (active) {
        selectedIndex = i;
        selected.position.set(x, cell.lift.value, z);
        selected.rotation.set(0, rotation.value + blend * .18, 0);
      }
      for (let p = 0; p < shapes.length; p++) {
        const pos = shapes[p].position;
        dummy.position.set(x + pos.x, cell.lift.value + pos.y, z + pos.z);
        dummy.scale.setScalar(active ? 0 : 1);
        dummy.updateMatrix(); batches[p].setMatrixAt(i, dummy.matrix);
      }
    }
    selected.visible = selectedIndex >= 0;
    for (const batch of batches) batch.instanceMatrix.needsUpdate = true;
    glassMaterial.roughness = .38 - blend * .24;
    glassMaterial.transmission = state.reduced ? 0 : .24 + blend * .48;
    const age = (now - openingAt) / 1000;
    scan.visible = state.detail && age < 1.2 && !state.reduced;
    scan.position.y = 3.35 - Math.min(1, age / 1.1) * 3.15;
    scanMaterial.opacity = Math.min(1, age * 5) * .65;
    const portrait = bounds.width / bounds.height < 1;
    camera.aspect = bounds.width / bounds.height;
    camera.fov = portrait ? 43 : 30;
    camera.position.set(THREE.MathUtils.lerp(-22, -3.5, blend), THREE.MathUtils.lerp(18, 9, blend), THREE.MathUtils.lerp(24, 16, blend));
    aim.set(THREE.MathUtils.lerp(1.5, portrait ? 0 : 4.4, blend), THREE.MathUtils.lerp(1.2, 4.5, blend), 0);
    camera.lookAt(aim); camera.updateProjectionMatrix();
    renderer.render(scene, camera);
    pickPointer();
    const moving = Math.abs(lane.value - state.lane) + Math.abs(row.value - state.row) + Math.abs(detail.value - Number(state.detail)) + Math.abs(rotation.value - rotationTarget) > .0002;
    host.dataset.sceneState = moving || now - lastInput < 2500 ? "moving" : "idle";
    host.dataset.drawCalls = String(renderer.info.render.calls);
    if (!state.reduced && (moving || now - lastInput < 2500)) request();
  };
  const tick = (now: number) => {
    frame = 0;
    if (pendingPointer && host.dataset.sceneState === "idle" && now - lastInput >= 2500) { pickPointer(); return; }
    if (now + .25 < deadline) { request(); return; }
    deadline = nextFrameDeadline(now, deadline, 1000 / 144); render(now);
  };
  const request = () => { if (!frame && !document.hidden && !disposed) frame = requestAnimationFrame(tick); };
  const resize = () => {
    bounds = host.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return;
    const dpr = Math.min(devicePixelRatio, 1.35, Math.sqrt(2_400_000 / (bounds.width * bounds.height)));
    renderer.setPixelRatio(Math.max(.65, dpr)); renderer.setSize(bounds.width, bounds.height, false); request();
    lastInput = performance.now();
  };
  const observer = new ResizeObserver(resize); observer.observe(host);
  const onVisibility = () => { if (document.hidden) { cancelAnimationFrame(frame); frame = 0; } else { last = 0; deadline = 0; request(); } };
  const onPointerMove = (event: PointerEvent) => {
    if (pointerDown && state.detail) {
      rotationTarget = THREE.MathUtils.clamp(rotationTarget + (event.clientX - pointerDown.x) * .007, -.7, .7);
      pointerDown = { x: event.clientX, y: event.clientY }; lastInput = performance.now(); request();
    } else { pendingPointer = { x: event.clientX, y: event.clientY }; request(); }
  };
  const onPointerDown = (event: PointerEvent) => { pointerDown = { x: event.clientX, y: event.clientY }; if (state.detail) renderer.domElement.setPointerCapture(event.pointerId); };
  const onPointerUp = (event: PointerEvent) => {
    if (!state.detail && pointerDown && Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y) > 35) {
      const dx = event.clientX - pointerDown.x, dy = event.clientY - pointerDown.y;
      if (Math.abs(dx) > Math.abs(dy)) onSelect(state.lane - Math.sign(dx), state.row);
      else onSelect(state.lane, state.row - Math.sign(dy));
    }
    if (!state.detail && pointerDown && Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y) < 7) {
      pointer.set((event.clientX - bounds.left) / bounds.width * 2 - 1, -(event.clientY - bounds.top) / bounds.height * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      if (raycaster.intersectObject(selected, true).length) onOpen();
      else {
        const hit = raycaster.intersectObject(batches[0], false)[0];
        const cell = hit?.instanceId !== undefined ? cells[hit.instanceId] : null;
        if (cell) onSelect(cell.lane, cell.row);
      }
    }
    pointerDown = null;
    if (renderer.domElement.hasPointerCapture(event.pointerId)) renderer.domElement.releasePointerCapture(event.pointerId);
  };
  const onWheel = (event: WheelEvent) => {
    if (state.detail) return;
    event.preventDefault(); wheelSum += event.deltaY * (event.deltaMode === 1 ? 18 : event.deltaMode === 2 ? bounds.height : 1);
    if (Math.abs(wheelSum) > 35 && performance.now() - wheelTime > 140) {
      onSelect(state.lane, state.row + Math.sign(wheelSum)); wheelSum = 0; wheelTime = performance.now();
    }
  };
  renderer.domElement.addEventListener("pointermove", onPointerMove);
  renderer.domElement.addEventListener("pointerdown", onPointerDown);
  renderer.domElement.addEventListener("pointerup", onPointerUp);
  renderer.domElement.addEventListener("pointercancel", onPointerUp);
  renderer.domElement.addEventListener("wheel", onWheel, { passive: false });
  document.addEventListener("visibilitychange", onVisibility);
  applyPalette(); resize();

  return {
    update(next) {
      if (next.lane !== state.lane || next.row !== state.row) {
        pulses.push({ lane: next.lane, row: next.row, started: performance.now() });
        if (pulses.length > 3) pulses.shift();
      }
      if (next.detail && !state.detail) openingAt = performance.now();
      const paletteChanged = next.night !== state.night;
      const labelChanged = next.title !== state.title || next.code !== state.code;
      state = next;
      if (!state.detail) rotationTarget = 0;
      if (paletteChanged) applyPalette(); else if (labelChanged) updateLabel();
      lastInput = performance.now(); request();
    },
    dispose() {
      disposed = true; cancelAnimationFrame(frame); observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      renderer.domElement.removeEventListener("pointercancel", onPointerUp);
      renderer.domElement.removeEventListener("wheel", onWheel);
      for (const shape of shapes) shape.geometry.dispose();
      for (const material of materials) material.dispose();
      label.geometry.dispose(); labelTexture.dispose(); labelMaterial.dispose();
      scan.geometry.dispose(); scanMaterial.dispose(); floor.geometry.dispose();
      keyLight.shadow.map?.dispose();
      env.dispose(); renderer.dispose(); renderer.domElement.remove();
      delete host.dataset.sceneState; delete host.dataset.drawCalls;
    },
  };
}
