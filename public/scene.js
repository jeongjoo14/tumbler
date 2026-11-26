// 카페 장면: 사진 한 장(public/images/cafe-tumbler.jpg)을 Three.js 셰이더로 움직입니다.
// - 몇 초마다 텀블러를 든 손과 머리가 살짝 올라가며 커피를 마시는 동작
// - 숨 쉬듯 몸이 아주 조금 움직임
// - 텀블러 입구에서 피어오르는 김, 창가 햇살 속 먼지, 따뜻한 빛
// - 마우스를 움직이면 살짝 깊이감(시차)
// 로그인 화면에서는 화면 전체 배경, 로그인한 홈(품질 현황)에서는 위쪽 띠에 나옵니다.

const IMAGE_URL = '/images/cafe-tumbler.jpg';
const IMAGE_ASPECT = 1376 / 768;

const bgHost = document.querySelector('#scene-bg');
const bannerHost = document.querySelector('#home-scene');
const loginBox = document.querySelector('#login-box');
const homeView = document.querySelector('#home-view');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

function useStaticFallback() {
  for (const host of [bgHost, bannerHost]) {
    if (host) host.classList.add('scene-fallback');
  }
}

function currentMode() {
  if (loginBox && !loginBox.hidden) return 'login';
  if (homeView && !homeView.hidden) return 'banner';
  return 'none';
}

function updateBodyClass(mode) {
  document.body.classList.toggle('scene-login', mode === 'login');
}

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uTex;
  uniform vec2 uRes;
  uniform float uImgAspect;
  uniform vec2 uFocus;
  uniform vec2 uMouse;
  uniform float uTime;
  uniform float uSip;
  uniform float uMotion;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0; float a = 0.5;
    for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
    return v;
  }
  vec2 rotateAround(vec2 p, vec2 pivot, float a) {
    vec2 d = p - pivot;
    float c = cos(a); float s = sin(a);
    return pivot + vec2(c * d.x - s * d.y, s * d.x + c * d.y);
  }
  float ellipseMask(vec2 p, vec2 c, vec2 r, float soft) {
    return smoothstep(1.0, soft, length((p - c) / r));
  }

  void main() {
    // 화면 비율에 맞춰 사진을 꽉 채우기(cover). p는 사진 좌표(x 오른쪽, y 아래, 0~1)
    vec2 screen = vec2(vUv.x, 1.0 - vUv.y);
    float ca = uRes.x / uRes.y;
    vec2 s = ca > uImgAspect ? vec2(1.0, uImgAspect / ca) : vec2(ca / uImgAspect, 1.0);
    s *= 0.97; // 시차로 움직일 여유
    vec2 off = (vec2(1.0) - s) * uFocus + (uMouse - 0.5) * (vec2(1.0) - s) * 0.6 * uMotion;
    vec2 p = off + screen * s;

    // 숨쉬기: 몸통이 아주 조금 위아래로
    float breath = sin(uTime * 1.25) * 0.0022 * uMotion;
    float body = ellipseMask(p, vec2(0.60, 0.78), vec2(0.24, 0.36), 0.3);
    p.y += breath * body;

    // 마시는 동작: 손·텀블러·머리가 함께 조금 올라가고, 머리가 살짝 뒤로 젖혀짐
    float sipArea = ellipseMask(p, vec2(0.545, 0.47), vec2(0.115, 0.30), 0.45);
    p.y += 0.016 * uSip * sipArea;
    p.x += 0.003 * uSip * sipArea;
    float head = ellipseMask(p, vec2(0.59, 0.27), vec2(0.09, 0.16), 0.4);
    p = mix(p, rotateAround(p, vec2(0.62, 0.45), -0.035 * uSip), head);

    vec3 col = texture2D(uTex, vec2(p.x, 1.0 - p.y)).rgb;

    // 창가 햇살: 천천히 숨 쉬는 따뜻한 빛
    float sun = smoothstep(0.75, 0.0, length((p - vec2(0.18, 0.12)) * vec2(1.0, 1.4)));
    col += vec3(1.0, 0.82, 0.55) * sun * (0.09 + 0.035 * sin(uTime * 0.6)) * uMotion;

    // 햇살 속 먼지
    float dust = 0.0;
    for (int layer = 0; layer < 3; layer++) {
      float fl = float(layer);
      vec2 grid = vec2(22.0, 13.0) * (1.0 + fl * 0.6);
      vec2 q = p * grid + vec2(uTime * (0.05 + fl * 0.02), -uTime * (0.12 + fl * 0.05));
      vec2 cell = floor(q);
      vec2 rnd = vec2(hash(cell + fl * 17.0), hash(cell + fl * 31.0 + 4.0));
      vec2 pos = cell + 0.2 + 0.6 * rnd;
      float d = length((q - pos) / grid * vec2(uImgAspect, 1.0)) * 300.0;
      float tw = 0.5 + 0.5 * sin(uTime * (1.0 + rnd.x * 2.0) + rnd.y * 6.28);
      dust += smoothstep(1.4, 0.0, d) * step(0.72, hash(cell + 9.0 + fl)) * tw;
    }
    float window = smoothstep(0.50, 0.25, p.x) * smoothstep(0.95, 0.4, p.y);
    col += vec3(1.0, 0.9, 0.7) * dust * window * 0.55 * uMotion;

    // 텀블러 입구에서 피어오르는 김(마시는 동안은 옅어짐)
    vec2 cupTop = vec2(0.515, 0.425 - 0.016 * uSip);
    vec2 sq = p - cupTop;
    float rise = clamp(-sq.y / 0.20, 0.0, 1.0);
    float sway = sin(uTime * 0.9 + rise * 5.0) * 0.012 * rise - rise * 0.03;
    float column = smoothstep(0.035 + rise * 0.03, 0.0, abs(sq.x - sway));
    float wisp = fbm(vec2(sq.x * 38.0, sq.y * 16.0 + uTime * 0.9));
    float steam = column * smoothstep(0.0, 0.03, -sq.y) * (1.0 - rise) * smoothstep(0.35, 0.75, wisp);
    col = mix(col, vec3(1.0), steam * 0.38 * (1.0 - 0.8 * uSip) * uMotion);

    gl_FragColor = vec4(col, 1.0);
  }
`;

// 마시는 동작의 세기(0~1): 8초마다 한 모금
function sipAmount(t) {
  const period = 8;
  const x = t % period;
  const ease = (v) => v * v * (3 - 2 * v);
  if (x < 1.3) return ease(x / 1.3);
  if (x < 3.0) return 1;
  if (x < 4.3) return 1 - ease((x - 3.0) / 1.3);
  return 0;
}

async function start() {
  if (!bgHost && !bannerHost) return;
  let THREE;
  try {
    THREE = await import('https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js');
  } catch {
    useStaticFallback();
    return;
  }

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: 'low-power' });
  } catch {
    useStaticFallback();
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.domElement.className = 'scene-canvas';

  const texture = await new THREE.TextureLoader().loadAsync(IMAGE_URL).catch(() => null);
  if (!texture) {
    useStaticFallback();
    return;
  }
  // 셰이더가 사진 색을 그대로 화면에 내보내도록 색 변환을 하지 않습니다(변환하면 사진이 어둡게 보입니다).
  texture.colorSpace = THREE.NoColorSpace;
  texture.minFilter = THREE.LinearFilter;

  const uniforms = {
    uTex: { value: texture },
    uRes: { value: new THREE.Vector2(1, 1) },
    uImgAspect: { value: IMAGE_ASPECT },
    uFocus: { value: new THREE.Vector2(0.5, 0.5) },
    uMouse: { value: new THREE.Vector2(0.5, 0.5) },
    uTime: { value: 0 },
    uSip: { value: 0 },
    uMotion: { value: reduceMotion.matches ? 0 : 1 },
  };
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader })));

  const mouseTarget = new THREE.Vector2(0.5, 0.5);
  window.addEventListener('pointermove', (event) => {
    mouseTarget.set(event.clientX / window.innerWidth, event.clientY / window.innerHeight);
  });

  let host = null;
  let lastMode = '';
  let width = 0;
  let height = 0;
  const clock = new THREE.Clock();

  function attach(mode) {
    const next = mode === 'login' ? bgHost : mode === 'banner' ? bannerHost : null;
    if (next !== host) {
      host = next;
      if (host) host.append(renderer.domElement);
      else renderer.domElement.remove();
      width = 0;
    }
    // 로그인 화면은 로그인 상자가 왼쪽 창가 쪽에 있으므로 사진 가운데를, 홈 띠는 얼굴과 텀블러가 보이게 맞춥니다.
    if (mode === 'login') uniforms.uFocus.value.set(window.innerWidth < 760 ? 0.62 : 0.5, 0.5);
    if (mode === 'banner') uniforms.uFocus.value.set(0.6, 0.3);
  }

  function frame() {
    const mode = currentMode();
    if (mode !== lastMode) {
      updateBodyClass(mode);
      attach(mode);
      lastMode = mode;
    }
    if (host && !document.hidden) {
      const w = host.clientWidth;
      const h = host.clientHeight;
      if (w > 0 && h > 0) {
        if (w !== width || h !== height) {
          width = w;
          height = h;
          renderer.setSize(w, h, false);
          uniforms.uRes.value.set(w, h);
        }
        const motion = reduceMotion.matches ? 0 : 1;
        uniforms.uMotion.value = motion;
        const t = clock.getElapsedTime();
        uniforms.uTime.value = motion ? t : 0;
        uniforms.uSip.value = motion ? sipAmount(t) : 0;
        uniforms.uMouse.value.lerp(motion ? mouseTarget : new THREE.Vector2(0.5, 0.5), 0.04);
        renderer.render(scene, camera);
      }
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

updateBodyClass(currentMode());
start();
