// Makers' Side — one 3D scene (Three.js): jelly logo + tagline, marquee drum, black hole, the pal, and the tunnel ride.
// Everything is a pure function of the times it is given, so the intro stays seekable.
import * as THREE from 'three';

const LW = 1400, LH = 1386;
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const smooth = (u) => u * u * (3 - 2 * u);
const BLACK = 0x030303;

export async function initScene({ W, H, lr, marquee }) {
  const canvas = document.createElement('canvas');
  canvas.id = 'l3';
  canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:15;pointer-events:none';
  document.body.appendChild(canvas);

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, stencil: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
  renderer.setSize(W, H, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const FOV = 26;
  const camera = new THREE.PerspectiveCamera(FOV, W / H, 50, 30000);
  let camD = 0;
  const placeCamera = () => {
    camD = (H / 2) / Math.tan(THREE.MathUtils.degToRad(FOV / 2));   // 1 world unit == 1 screen px at z=0
    camera.position.set(0, 0, camD);
    camera.rotation.set(0, 0, 0);
    camera.aspect = W / H; camera.updateProjectionMatrix();
  };
  placeCamera();

  // ---- light: soft key from the upper left, pink rim from the right, and a "sun" that only draws the wall shadow ----
  const key = new THREE.DirectionalLight(0xffffff, 3.2); key.position.set(-1100, 1300, 520); scene.add(key);
  const rim = new THREE.DirectionalLight(0xffc6e6, 1.6); rim.position.set(1200, -300, 700); scene.add(rim);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x2a0a1c, 0.25));
  const sun = new THREE.DirectionalLight(0xffffff, 0.02);
  sun.position.set(-240, 380, 1900);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.radius = 8; sun.shadow.bias = -0.0004;
  Object.assign(sun.shadow.camera, { left: -1400, right: 1400, top: 1400, bottom: -1400, near: 100, far: 4000 });
  scene.add(sun);
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(W * 4, H * 4), new THREE.ShadowMaterial({ opacity: 0.3, color: 0x4a1030 }));
  wall.position.z = -60; wall.receiveShadow = true;
  scene.add(wall);

  const stage = new THREE.Group(); scene.add(stage);          // everything that belongs to the pink hero
  const group = new THREE.Group(); stage.add(group);          // the logo + tagline (tilts with the pointer)

  // ---- jelly material: a vertex stretch / squash / wobble that acts on a whole letter body ----
  const mkMaterial = (halfH, color = BLACK) => {
    const m = new THREE.MeshPhysicalMaterial({ color, roughness: 0.38, metalness: 0, clearcoat: 0.7, clearcoatRoughness: 0.22, specularIntensity: 0.9 });
    const u = { uSY: { value: 1 }, uSX: { value: 1 }, uWave: { value: 0 }, uPh: { value: 0 }, uBot: { value: -halfH }, uH: { value: halfH * 2 } };
    m.userData.u = u;
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, u);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uSY,uSX,uWave,uPh,uBot,uH;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          float hy = clamp((transformed.y - uBot) / uH, 0.0, 1.0);
          transformed.y = (transformed.y - uBot) * uSY + uBot;
          transformed.x = transformed.x * uSX + uWave * sin(transformed.y * 0.011 + uPh) * (0.25 + hy);
          transformed.z *= uSX;`);
    };
    return m;
  };
  const toShape = (s, cx, cy) => {
    const v = (p) => new THREE.Vector2(p[0] - cx, -(p[1] - cy));
    const sh = new THREE.Shape(s.outer.map(v));
    for (const h of s.holes) sh.holes.push(new THREE.Path(h.map(v)));
    return sh;
  };

  // ---- logo letters ----
  const [logoData, tagData, palData] = await Promise.all(['assets/logo-shapes.json', 'assets/tag-shapes.json', 'assets/pal-shapes.json'].map((u) => fetch(u).then((r) => r.json())));
  const meshes = [];
  const DEPTH = 80, BEV_T = 34, BEV_S = 14;
  for (const s of logoData.shapes) {
    const [x0, y0, x1, y1] = s.bbox, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const geo = new THREE.ExtrudeGeometry(toShape(s, cx, cy), { depth: DEPTH, bevelEnabled: true, bevelThickness: BEV_T, bevelSize: BEV_S, bevelOffset: -BEV_S, bevelSegments: 6, curveSegments: 10 });
    geo.translate(0, 0, -DEPTH / 2); geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, mkMaterial((y1 - y0) / 2));
    mesh.castShadow = true;
    mesh.position.set(cx - LW / 2, -(cy - LH / 2), 0);
    mesh.userData = { base: mesh.position.clone(), delay: (x1 - x0) < 260 ? (x0 > 1000 ? 0.07 : 0.11) : 0 };
    group.add(mesh); meshes.push(mesh);
  }
  // ---- tagline: real extruded letters, they fall a beat after the logo ----
  {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const s of tagData.shapes) for (const p of s.outer) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const geo = new THREE.ExtrudeGeometry(tagData.shapes.map((s) => toShape(s, cx, cy)), { depth: 46, bevelEnabled: true, bevelThickness: 7, bevelSize: 2.2, bevelOffset: -2.2, bevelSegments: 2, curveSegments: 5 });
    geo.translate(0, 0, -23); geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, mkMaterial((y1 - y0) / 2));
    mesh.castShadow = false;
    mesh.position.set(cx - LW / 2, -(cy - LH / 2), 0);
    mesh.userData = { base: mesh.position.clone(), delay: 0.2 };
    group.add(mesh); meshes.push(mesh);
  }

  // ---- the pal ----
  const palGeo = (() => {
    const s = palData.shapes[0];
    const xs = s.outer.map((p) => p[0]), ys = s.outer.map((p) => p[1]);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const geo = new THREE.ExtrudeGeometry(toShape(s, cx, cy), { depth: 110, bevelEnabled: true, bevelThickness: 34, bevelSize: 12, bevelOffset: -12, bevelSegments: 5, curveSegments: 8 });
    geo.translate(0, 0, -55); geo.computeVertexNormals();
    return geo;
  })();
  const pal = new THREE.Mesh(palGeo, new THREE.MeshPhysicalMaterial({ color: BLACK, roughness: 0.38, clearcoat: 0.7, clearcoatRoughness: 0.22 }));
  pal.castShadow = true; pal.visible = false; scene.add(pal);
  const palBlob = new THREE.Mesh(new THREE.CircleGeometry(1, 40), new THREE.MeshBasicMaterial({ color: 0x4a1030, transparent: true, opacity: 0.28, depthWrite: false }));
  palBlob.position.z = -40; palBlob.visible = false; stage.add(palBlob);
  const PAL_W = palData.w;

  // ---- marquee: a black drum that really turns, text printed on it ----
  const drumTex = (() => {
    const c = document.createElement('canvas'); c.width = 4096; c.height = 80;
    const g = c.getContext('2d');
    g.fillStyle = '#0b0b0b'; g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = '#eabbda'; g.font = '800 44px "Pretendard Variable", Pretendard, system-ui, sans-serif'; g.textBaseline = 'middle';
    const unit = 'Creation gets weird together   \u273A   ';
    const uw = g.measureText(unit).width, n = Math.max(1, Math.round(c.width / uw));
    const step = c.width / n;                                   // whole number of repeats => the seam is invisible
    for (let i = 0; i < n; i++) g.fillText(unit, i * step, c.height / 2 + 2);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.anisotropy = 8;
    return t;
  })();
  const R = W * 1.5;
  let drum = null, drumRims = null;
  const makeDrum = (mq) => {
    if (drum) { stage.remove(drum); drum.geometry.dispose(); stage.remove(drumRims); }
    const bandH = mq.height;
    drumTex.repeat.x = Math.max(2, Math.round((2 * Math.PI * R) / 2900));
    const geo = new THREE.CylinderGeometry(R, R, bandH, 200, 1, true);
    const mat = new THREE.MeshStandardMaterial({ map: drumTex, roughness: 0.5, metalness: 0, side: THREE.FrontSide });
    drum = new THREE.Mesh(geo, mat);
    const cy0 = H / 2 - (mq.top + mq.height / 2);
    drum.position.set(0, cy0, -R);
    stage.add(drum);
    drumRims = new THREE.Group(); drumRims.position.set(0, cy0, -R); stage.add(drumRims);
    for (const s of [-1, 1]) {                                  // thin pink rims (front arc only) so the drum has a visible edge
      const rimM = new THREE.Mesh(new THREE.TorusGeometry(R + 1, 3, 8, 160, Math.PI), new THREE.MeshStandardMaterial({ color: 0xff4fa0, roughness: 0.4 }));
      rimM.rotation.x = Math.PI / 2; rimM.position.y = s * bandH / 2; drumRims.add(rimM);
    }
  };
  makeDrum(marquee);

  // ---- the black hole: a pink lip around a funnel that spirals down into the dark ----
  const holeG = new THREE.Group(); stage.add(holeG);
  const holeU = { uTime: { value: 0 } };
  let holeR = 150;
  const buildHole = (r) => {
    holeR = r;
    while (holeG.children.length) { const c = holeG.children.pop(); c.geometry && c.geometry.dispose(); }
    // a deep, plain black pit: a wall that is only faintly lit right under the pink lip, then pure black
    const D = r * 2.4;
    const wallGeo = new THREE.CylinderGeometry(r, r, D, 72, 1, true); wallGeo.rotateX(Math.PI / 2); wallGeo.translate(0, 0, -D / 2);
    const wall = new THREE.Mesh(wallGeo, new THREE.ShaderMaterial({
      side: THREE.BackSide,
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `varying vec3 vP;
        void main(){
          float dd = -vP.z;
          float a = atan(vP.y, vP.x);
          float lit = 0.75 + 0.25 * sin(a * 2.0 + 0.6);
          vec3 col = vec3(0.30, 0.04, 0.16) * exp(-dd / ${(r * 0.2).toFixed(1)}) * lit;
          gl_FragColor = vec4(col, 1.0);
        }`,
    }));
    // portal trick: the opening writes a stencil mark, the pit is only drawn where that mark is (so nothing hangs out under the lip)
    const opening = new THREE.Mesh(new THREE.CircleGeometry(r, 96), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }));
    Object.assign(opening.material, { stencilWrite: true, stencilRef: 1, stencilFunc: THREE.AlwaysStencilFunc, stencilZPass: THREE.ReplaceStencilOp });
    opening.renderOrder = 1; holeG.add(opening);
    const cap = new THREE.Mesh(new THREE.CircleGeometry(r * 1.01, 48), new THREE.MeshBasicMaterial({ color: 0x000000 }));
    cap.position.z = -D;
    for (const m of [wall, cap]) { Object.assign(m.material, { stencilWrite: true, stencilRef: 1, stencilFunc: THREE.EqualStencilFunc, stencilZPass: THREE.KeepStencilOp }); m.renderOrder = 2; }
    holeG.add(wall, cap);
    const lipA = new THREE.Mesh(new THREE.TorusGeometry(r, r * 0.07, 24, 120), new THREE.MeshPhysicalMaterial({ color: 0xff4fa0, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.12 }));
    const lipB = new THREE.Mesh(new THREE.TorusGeometry(r * 1.09, r * 0.045, 16, 120), new THREE.MeshPhysicalMaterial({ color: 0xffd0ea, roughness: 0.4, clearcoat: 0.6 }));
    holeG.add(lipA, lipB);
    holeG.rotation.x = -1.25;                                     // lies on the floor, seen from the front
  };
  buildHole(holeR);
  holeG.visible = false;
  let holeT0 = -1;

  // ---- tunnel: a ribbed tube with real lit rings; the camera dives in with a widening lens ----
  const tun = new THREE.Group(); tun.visible = false; scene.add(tun);
  const ringCols = [0xff4fa0, 0x2a0a20, 0xeabbda, 0xffffff];
  const RING_N = 48, RING_GAP = 170, RING_R = 300, TUN_L = RING_N * RING_GAP;
  const ringGeo = new THREE.TorusGeometry(RING_R, 12, 16, 80);
  const rings = [];
  for (let i = 0; i < RING_N; i++) {
    const c = ringCols[i % 4];
    const m = new THREE.Mesh(ringGeo, new THREE.MeshStandardMaterial({ color: c, roughness: 0.35, metalness: 0.1, emissive: c, emissiveIntensity: 0.28 }));
    m.position.z = -i * RING_GAP; m.rotation.z = i * 0.35; tun.add(m); rings.push(m);
  }
  const wallU = { uCam: { value: 0 } };
  const tubeGeo = new THREE.CylinderGeometry(RING_R + 6, RING_R + 6, TUN_L + 2400, 72, 1, true); tubeGeo.rotateX(Math.PI / 2); tubeGeo.translate(0, 0, -TUN_L / 2);
  tun.add(new THREE.Mesh(tubeGeo, new THREE.ShaderMaterial({
    uniforms: wallU, side: THREE.BackSide,
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `varying vec3 vP; uniform float uCam;
      void main(){
        float a = atan(vP.y, vP.x);
        float rib = pow(max(cos(a * 12.0), 0.0), 22.0);
        float band = pow(max(cos(vP.z * 0.037), 0.0), 28.0);
        vec3 col = vec3(0.07, 0.01, 0.05) + vec3(1.0, 0.31, 0.63) * (rib * 0.55 + band * 0.4);
        float dist = uCam - vP.z;
        col *= clamp(1.0 - dist / 3800.0, 0.0, 1.0) * smoothstep(-100.0, 450.0, dist);
        gl_FragColor = vec4(col, 1.0);
      }`,
  })));
  {
    const pts = [], cols = [];
    for (let i = 0; i < 260; i++) {
      const a = Math.random() * Math.PI * 2, rr = 90 + Math.random() * 230, z = -Math.random() * TUN_L, len = 120 + Math.random() * 400;
      pts.push(Math.cos(a) * rr, Math.sin(a) * rr, z, Math.cos(a) * rr, Math.sin(a) * rr, z - len);
      const c = new THREE.Color([0xff4fa0, 0xeabbda, 0xffffff][i % 3]); cols.push(c.r, c.g, c.b, c.r, c.g, c.b);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    tun.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.7 })));
  }
  const glow = new THREE.Mesh(new THREE.CircleGeometry(900, 48), new THREE.MeshBasicMaterial({ color: 0xff4fa0, fog: false }));
  glow.position.z = -TUN_L - 900; tun.add(glow);

  // ---- layout ----
  let sc = 1, cxs = 0, cys = 0, fall = 0;
  const layout = (rect, w, h, mq) => {
    if (w && h) { W = w; H = h; renderer.setSize(W, H, false); placeCamera(); }
    sc = rect.width / LW;
    cxs = rect.left + rect.width / 2 - W / 2;
    cys = H / 2 - (rect.top + rect.height / 2);
    fall = (rect.top + rect.height) / sc + 260;
    if (mq) makeDrum(mq);
  };
  layout(lr, W, H, null);

  // ---- the logo's motion: a drop under gravity, three bounces, squash/stretch, a tumble that resolves by the first landing ----
  const T0 = 0.2, G_TIME = 0.78;
  const g = 2 * fall / (G_TIME * G_TIME), v1 = g * G_TIME;
  const impacts = [{ t: T0 + G_TIME, v: v1 }];
  let rest = 0.36, vv = v1, tt = T0 + G_TIME;
  const flights = [];
  for (let i = 0; i < 3; i++) { vv *= rest; const air = 2 * vv / g; flights.push([tt, tt + air, vv * vv / (2 * g)]); tt += air; impacts.push({ t: tt, v: vv }); rest = 0.42; }
  const END = tt;
  function pose(t) {
    const p = { y: 0, z: 0, rx: 0, ry: 0, rz: 0, sy: 1, sx: 1, wave: 0, ph: 0, vis: true };
    if (t < T0) { p.y = fall; p.vis = false; return p; }
    const tau = t - T0;
    if (t < T0 + G_TIME) {
      const u = tau / G_TIME;
      p.y = fall - 0.5 * g * tau * tau;
      p.sy = 1 + 0.2 * clamp(g * tau / v1);
      const k = Math.pow(1 - u, 3);
      p.rx = -0.85 * k; p.rz = 0.2 * k; p.ry = 0.3 * k;
      p.z = 600 * Math.pow(1 - u, 2);
    } else {
      for (const f of flights) if (t >= f[0] && t < f[1]) {
        const u = (t - f[0]) / (f[1] - f[0]);
        p.y = f[2] * 4 * u * (1 - u);
        p.sy = 1 + 0.12 * (f[2] / (v1 * v1 / (2 * g))) * Math.pow(Math.abs(1 - 2 * u), 2);
      }
    }
    let squash = 0, wob = 0;
    impacts.forEach((im, i) => {
      const d = t - im.t; if (d < 0) return;
      const a = clamp(im.v / v1) * (i === 0 ? 0.36 : 0.26), e = Math.exp(-6.5 * d);
      squash += a * e * Math.cos(20 * d); wob += a * e * Math.sin(17 * d);
    });
    p.sy -= squash; p.sx = 1 / Math.sqrt(Math.max(0.4, p.sy));
    p.wave = 46 * wob; p.ph = t * 18; p.rz += 0.045 * wob; p.rx += 0.06 * squash;
    return p;
  }

  // ---- per-frame ----
  const ptr = { sx: 0, sy: 0 };
  const pk = { t0: -1, amp: 0, dx: 0, dy: 0 };
  const suckS = { on: false, t0: 0, hx: 0, hy: 0 };
  let palState = null, visible = true;
  const clock0 = performance.now();
  function setPal(p) { palState = p; }
  function frame({ t, state, mouse, now, ready, hole, near, tunT }) {
    if (!visible) return;
    const secs = (now - clock0) / 1000;
    holeU.uTime.value = secs;
    const tunneling = state === 'tunnel';
    if (!tunneling && camera.fov !== FOV) { camera.fov = FOV; camera.updateProjectionMatrix(); }
    stage.visible = !tunneling; pal.visible = !tunneling && !!palState; tun.visible = tunneling;
    if (tunneling) {
      renderer.setClearColor(0x000000, 1); canvas.style.zIndex = 41; scene.fog = new THREE.Fog(0x000000, 500, 4200);
      const k = smooth(clamp(tunT / 0.75));
      const trav = 2100 * Math.pow(Math.max(0, tunT - 0.15), 1.5);          // starts calm, then whooshes
      camera.fov = FOV + 36 * smooth(clamp(tunT / 0.7)) * (1 - 0.55 * smooth(clamp((tunT - 1.3) / 0.7)));
      camera.updateProjectionMatrix();
      const cx = (suckS.hx - W / 2) * (1 - k), cy = (H / 2 - suckS.hy) * (1 - k);
      camera.position.set(cx * 0.2 + Math.sin(tunT * 3.1) * 9 * k, cy * 0.2 + Math.cos(tunT * 2.3) * 7 * k, camD * (1 - k) + 260 * k - trav);
      camera.rotation.set(0, 0, 0); camera.lookAt(0, 0, camera.position.z - 1000); camera.rotateZ(tunT * 0.55);
      wallU.uCam.value = camera.position.z;
      rings.forEach((m, i) => { m.rotation.z = i * 0.35 + tunT * (i % 2 ? 0.6 : -0.6); });
      renderer.render(scene, camera); return;
    }
    // pointer parallax (springy)
    const live = state === 'play' && mouse.active;
    ptr.sx += ((live ? mouse.x / W - 0.5 : 0) - ptr.sx) * 0.06; ptr.sy += ((live ? mouse.y / H - 0.5 : 0) - ptr.sy) * 0.06;
    group.rotation.y = ptr.sx * 0.5; group.rotation.x = ptr.sy * 0.32;
    const pd = pk.t0 >= 0 ? (now - pk.t0) / 1000 : 99, pe = pk.amp * Math.exp(-5.2 * pd);
    group.position.set(cxs + pk.dx * 30 * pe * Math.cos(15 * pd), cys + pk.dy * 30 * pe * Math.cos(15 * pd), 0); group.scale.setScalar(sc);
    group.rotation.z = -pk.dx * 0.07 * pe * Math.sin(14 * pd);
    if (suckS.on) {
      const u = clamp((now - suckS.t0) / 1250), e = smooth(u);
      const hx = suckS.hx - W / 2, hy = H / 2 - suckS.hy;
      group.position.set(cxs + (hx - cxs) * e, cys + (hy - cys) * e, -1100 * e);
      group.scale.setScalar(sc * Math.pow(1 - e, 1.6) + 0.0001);
      group.rotation.z = e * Math.PI * 3.2;
    }
    for (const m of meshes) {
      const p = pose(t - m.userData.delay);
      m.visible = p.vis;
      if (pe > 0.002 && !suckS.on) {                            // the bump travels through the jelly
        p.wave += 42 * pe * Math.sin(17 * pd + m.userData.base.x * 0.012);
        p.sy -= 0.09 * pe * Math.cos(20 * pd); p.sx = 1 / Math.sqrt(Math.max(0.4, p.sy));
        p.rz += 0.04 * pe * Math.sin(15 * pd + m.userData.base.x * 0.01);
      }
      m.position.set(m.userData.base.x, m.userData.base.y + p.y, p.z);
      m.rotation.set(p.rx, p.ry, p.rz);
      const u = m.material.userData.u;
      u.uSY.value = p.sy; u.uSX.value = p.sx; u.uWave.value = p.wave; u.uPh.value = p.ph;
    }
    if (drum) drum.rotation.y = -secs * 60 / R;                 // the drum turns
    if (hole) { holeG.position.set(hole.x - W / 2, H / 2 - hole.y, 0); if (Math.abs(hole.r - holeR) > 4) buildHole(hole.r); }
    if (ready && holeT0 < 0) holeT0 = secs;                      // the hole rises out of the floor once the intro is over
    holeG.visible = holeT0 >= 0;
    if (holeT0 >= 0) {
      const u = clamp((secs - holeT0) / 0.9), e = 1 - Math.pow(1 - u, 3) * Math.cos(u * 9);
      holeG.scale.setScalar(Math.max(0.001, e) * (near ? 1.1 : 1));
    }
    if (palState && pal.visible) {                               // the pal
      const P = palState, s = (P.size / PAL_W) * (P.s ?? 1);
      pal.scale.set(s * P.sx, s * P.sy, s * (P.sx + P.sy) / 2);
      pal.position.set(P.x - W / 2, H / 2 - P.y, P.z ?? 130);
      pal.rotation.set(0.12, clamp((P.vx || 0) * 0.05, -0.6, 0.6), -(P.rot || 0));
      const lift = Math.max(0, P.lift || 0), k = 1 / (1 + lift / (P.size * 1.6));
      palBlob.visible = (P.s ?? 1) > 0.05;
      palBlob.position.set(P.x - W / 2, H / 2 - P.ground, -40);
      palBlob.scale.set(P.size * 0.46 * k, P.size * 0.1 * k, 1);
      palBlob.material.opacity = 0.28 * k;
    } else palBlob.visible = false;
    renderer.render(scene, camera);
  }
  return {
    frame, layout, END, setPal,
    poke(now, dx, dy, amp) { pk.t0 = now; pk.amp = amp; pk.dx = dx; pk.dy = dy; },
    suck(now, hx, hy) { suckS.on = true; suckS.t0 = now; suckS.hx = hx; suckS.hy = hy; },
    hide() { visible = false; canvas.style.display = 'none'; },
    canvas,
  };
}
