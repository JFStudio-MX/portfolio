/* Joshua Flores · Showreel
   Motion graphics en tiempo real, sin video:
   - Objeto 3D en WebGL: una sola malla (cubo subdividido) que el shader proyecta
     sobre una superquádrica. Interpolando sus 5 parámetros hace morphing continuo
     entre punto, esfera, destello, caja, formatos, lona, teléfono y navegador.
   - Tipografía cinética: SplitText + ejes variables de Archivo (wdth / wght),
     split-flap en 3D, odómetros, subtítulos tipo reel y ScrambleText.
   - HUD: MorphSVG (el ícono imita la forma del objeto), DrawSVG, timecode a 24 fps
     y secuenciador al beat.
   Todo cae en una retícula de 120 BPM (1 beat = 0.5 s) y se dibuja al refresco
   nativo de la pantalla: 60, 120 o 144 Hz. */
(function () {
  'use strict';
  var gsap = window.gsap;
  if (!gsap) return;
  var plug = [window.SplitText, window.ScrambleTextPlugin, window.MorphSVGPlugin, window.DrawSVGPlugin, window.CustomEase].filter(Boolean);
  gsap.registerPlugin.apply(gsap, plug);
  var HAS = { split: !!window.SplitText, scr: !!window.ScrambleTextPlugin, morph: !!window.MorphSVGPlugin, draw: !!window.DrawSVGPlugin };
  var EOUT = 'expo.out', EWHIP = 'expo.inOut';
  if (window.CustomEase) {
    CustomEase.create('reelOut', 'M0,0 C0.06,0.74 0.16,1 1,1');
    CustomEase.create('reelWhip', 'M0,0 C0.56,0 0.1,1 1,1');
    EOUT = 'reelOut'; EWHIP = 'reelWhip';
  }

  var B = 0.5;                       // 1 beat a 120 BPM
  var FOV = 30 * Math.PI / 180, CAMZ = 6;
  var TAU = Math.PI * 2;

  /* ---------------- Matemáticas (column-major, como WebGL) ---------------- */
  function persp(f, a, n, fr) { var t = 1 / Math.tan(f / 2), nf = 1 / (n - fr); return [t / a, 0, 0, 0, 0, t, 0, 0, 0, 0, (fr + n) * nf, -1, 0, 0, 2 * fr * n * nf, 0]; }
  function mul(a, b) { var o = new Array(16); for (var i = 0; i < 4; i++) for (var j = 0; j < 4; j++) { var s = 0; for (var k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k]; o[i * 4 + j] = s; } return o; }
  function trans(x, y, z) { return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]; }
  function rotX(r) { var c = Math.cos(r), s = Math.sin(r); return [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]; }
  function rotY(r) { var c = Math.cos(r), s = Math.sin(r); return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]; }
  function rotZ(r) { var c = Math.cos(r), s = Math.sin(r); return [c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; }
  function scl(x, y, z) { return [x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0, 0, 0, 0, 1]; }
  function xf(m, x, y, z) { return [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14], m[3] * x + m[7] * y + m[11] * z + m[15]]; }
  function mix(a, b, t) { return a + (b - a) * t; }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  /* ---------------- Shaders ---------------- */
  // Bloques GLSL compartidos entre la malla y las partículas
  var SHAPE_GLSL = [
    'uniform vec3 uExt; uniform vec2 uExp; uniform float uWave; uniform float uTime;',
    'float lse(float a, float b) { float m = max(a, b); return m + log(exp(a - m) + exp(b - m)); }',
    // Radio de la superquádrica en la dirección d, en espacio logarítmico para no desbordar
    'vec3 shape(vec3 q) {',
    '  vec3 d = normalize(q * uExt);',
    '  vec3 L = log(max(abs(d) / uExt, vec3(1e-5)));',
    '  float k2 = 2.0 / uExp.y;',
    '  float lxz = lse(L.x * k2, L.z * k2);',
    '  float lf = lse(lxz * uExp.y / uExp.x, L.y * 2.0 / uExp.x);',
    '  vec3 p = d * exp(-0.5 * uExp.x * lf);',
    '  if (uWave > 0.0001) {',
    '    p.z += uWave * sin(p.x * 2.1 - uTime * 2.6) * (0.75 + 0.25 * sin(p.y * 2.7 + uTime * 1.3));',
    '    p.y += uWave * 0.12 * sin(p.x * 1.3 - uTime * 1.9);',
    '  }',
    '  return p;',
    '}'
  ].join('\n');
  // Umbral de erosión por punto de la superficie: ruido de valor + barrido direccional.
  // La malla se descarta donde uDis > thr(q) y, en ese mismo punto, nace un grano.
  var NOISE_GLSL = [
    'uniform vec4 uSweep;',
    'float h3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }',
    'float vn(vec3 x) {',
    '  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);',
    '  return mix(mix(mix(h3(i), h3(i + vec3(1.0, 0.0, 0.0)), f.x), mix(h3(i + vec3(0.0, 1.0, 0.0)), h3(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),',
    '             mix(mix(h3(i + vec3(0.0, 0.0, 1.0)), h3(i + vec3(1.0, 0.0, 1.0)), f.x), mix(h3(i + vec3(0.0, 1.0, 1.0)), h3(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z);',
    '}',
    'float thr(vec3 q) {',
    '  float n = vn(q * 2.6 + 3.1) * 0.65 + vn(q * 6.3 + 11.7) * 0.35;',
    '  n = clamp((n - 0.25) / 0.5, 0.0, 1.0);',
    '  float s = clamp(dot(q, uSweep.xyz) * 0.5 + 0.5, 0.0, 1.0);',
    '  return mix(n, s, uSweep.w) * 0.6;',
    '}'
  ].join('\n');

  var VS = [
    'attribute vec3 aQ; attribute vec3 aT1; attribute vec3 aT2;',
    'uniform mat4 uPV; uniform mat4 uM; uniform mat3 uNM;',
    'varying vec3 vN; varying vec3 vW; varying vec3 vQ;',
    SHAPE_GLSL,
    'void main() {',
    '  vec3 p0 = shape(aQ);',
    '  vec3 p1 = shape(aQ + aT1 * 0.0035);',
    '  vec3 p2 = shape(aQ + aT2 * 0.0035);',
    '  vec3 n = cross(p1 - p0, p2 - p0);',
    '  float l = length(n);',
    '  n = l > 1e-12 ? n / l : normalize(p0);',
    '  vec4 w = uM * vec4(p0, 1.0);',
    '  vW = w.xyz; vN = normalize(uNM * n); vQ = aQ;',
    '  gl_Position = uPV * w;',
    '}'
  ].join('\n');

  var FS = [
    'precision highp float;',
    'varying vec3 vN; varying vec3 vW; varying vec3 vQ;',
    'uniform vec3 uCam; uniform vec3 uCol; uniform vec3 uExt;',
    'uniform float uGlow; uniform vec4 uFace; uniform float uAd; uniform float uUI; uniform float uClick; uniform float uTime;',
    'uniform sampler2D uTex; uniform float uDis; uniform vec3 uHot;',
    NOISE_GLSL,
    'float sdBox(vec2 p, vec2 c, vec2 h) { vec2 d = abs(p - c) - h; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }',
    'float fill(float d) { return 1.0 - smoothstep(-0.006, 0.006, d); }',
    'float rev(float k) { return smoothstep(k * 0.13, k * 0.13 + 0.12, uUI); }',
    // Teléfono: video abstracto, play, barra de reproducción
    'vec3 phoneUI(vec2 p, vec2 h, out float m) {',
    '  m = fill(sdBox(p, vec2(0.0), h - vec2(0.05, 0.07)) - 0.035);',
    '  vec2 q = p / h;',
    '  vec3 c = mix(vec3(0.05, 0.05, 0.065), vec3(0.11, 0.1, 0.13), q.y * 0.5 + 0.5);',
    '  float blob = smoothstep(0.95, 0.0, length(q - vec2(0.28 * sin(uTime * 0.7), 0.18 + 0.22 * cos(uTime * 0.5))));',
    '  c = mix(c, vec3(0.62, 0.1, 0.07), blob * 0.85);',
    '  vec2 tp = (p - vec2(0.03, h.y * 0.22)) / 0.14;',
    '  float tri = max(-0.5 - tp.x, abs(tp.y) - 0.5 * (0.62 - tp.x));',
    '  c = mix(c, vec3(1.0), fill(tri * 0.14) * 0.95);',
    '  float by = -h.y + 0.17;',
    '  c = mix(c, vec3(0.32), fill(sdBox(p, vec2(0.0, by), vec2(h.x - 0.13, 0.012))));',
    '  float w = (h.x - 0.13) * uUI;',
    '  c = mix(c, vec3(1.0, 0.23, 0.18), fill(sdBox(p, vec2(-h.x + 0.13 + w, by), vec2(w, 0.012))));',
    '  c = mix(c, vec3(0.0), fill(sdBox(p, vec2(0.0, h.y - 0.13), vec2(0.08, 0.016)) - 0.012));',
    '  return c;',
    '}',
    // Navegador: barra, encabezados, botón, imagen y tarjetas que se construyen con uUI
    'vec3 webUI(vec2 p, vec2 h, out float m) {',
    '  m = fill(sdBox(p, vec2(0.0), h - vec2(0.04)) - 0.012);',
    '  vec3 c = vec3(0.045, 0.045, 0.055);',
    '  float bar = fill(sdBox(p, vec2(0.0, h.y - 0.115), vec2(h.x - 0.04, 0.075)));',
    '  c = mix(c, vec3(0.11, 0.11, 0.13), bar);',
    '  for (int i = 0; i < 3; i++) { c = mix(c, vec3(0.32), fill(length(p - vec2(-h.x + 0.13 + float(i) * 0.075, h.y - 0.115)) - 0.022)); }',
    '  c = mix(c, vec3(0.18), fill(sdBox(p, vec2(0.12, h.y - 0.115), vec2(h.x * 0.42, 0.034)) - 0.01));',
    '  float x0 = -h.x + 0.2;',
    '  c = mix(c, vec3(0.95), fill(sdBox(p, vec2(x0 + 0.1, h.y - 0.3), vec2(0.1, 0.024))) * rev(0.0));',
    '  for (int i = 0; i < 3; i++) { c = mix(c, vec3(0.4), fill(sdBox(p, vec2(h.x - 0.25 - float(i) * 0.2, h.y - 0.3), vec2(0.07, 0.016))) * rev(0.0)); }',
    '  c = mix(c, vec3(0.97), fill(sdBox(p, vec2(x0 + h.x * 0.38, 0.2), vec2(h.x * 0.38, 0.065))) * rev(1.0));',
    '  c = mix(c, vec3(0.97), fill(sdBox(p, vec2(x0 + h.x * 0.27, 0.04), vec2(h.x * 0.27, 0.065))) * rev(2.0));',
    '  c = mix(c, vec3(0.5), fill(sdBox(p, vec2(x0 + h.x * 0.32, -0.11), vec2(h.x * 0.32, 0.02))) * rev(3.0));',
    '  vec2 bc = vec2(x0 + 0.24, -0.3);',
    '  float btn = sdBox(p, bc, vec2(0.24, 0.075));',
    '  float edge = fill(abs(btn) - 0.008);',
    '  c = mix(c, mix(vec3(0.97), vec3(1.0, 0.23, 0.18), uClick), max(edge, fill(btn) * uClick) * rev(4.0));',
    '  vec2 ic = vec2(h.x * 0.47, 0.06);',
    '  vec2 ih = vec2(h.x * 0.4, 0.34);',
    '  vec2 iq = (p - ic) / ih;',
    '  vec3 img = mix(vec3(0.5, 0.07, 0.05), vec3(1.0, 0.35, 0.25), clamp(iq.y * 0.5 + 0.5 + 0.2 * sin(iq.x * 3.0 + uTime), 0.0, 1.0));',
    '  c = mix(c, img, fill(sdBox(p, ic, ih)) * rev(5.0));',
    '  float cy = -h.y + 0.28; float cw = (2.0 * h.x - 0.48) / 6.0;',
    '  for (int i = 0; i < 3; i++) { c = mix(c, vec3(0.13, 0.13, 0.16), fill(sdBox(p, vec2(-h.x + 0.2 + cw + float(i) * (2.0 * cw + 0.04), cy), vec2(cw, 0.12))) * rev(6.0)); }',
    '  return c;',
    '}',
    // Anuncio: el layout se reacomoda en vivo según la proporción del formato (vertical ↔ horizontal)
    'vec3 adUI(vec2 p, vec2 h, out float m) {',
    '  m = fill(sdBox(p, vec2(0.0), h - vec2(0.05)) - 0.02);',
    '  float ls = smoothstep(0.95, 1.45, h.x / h.y);',
    '  vec3 c = vec3(0.075, 0.075, 0.09);',
    '  vec2 pc = mix(vec2(0.0, h.y * 0.27), vec2(h.x * 0.46, 0.0), ls);',
    '  vec2 ph = mix(vec2(h.x * 0.6, h.y * 0.33), vec2(h.x * 0.36, h.y * 0.64), ls);',
    '  vec2 pq = (p - pc) / ph;',
    '  vec3 prod = mix(vec3(0.62), vec3(0.95), clamp(0.6 - pq.y * 0.4 + pq.x * 0.15, 0.0, 1.0));',
    '  prod = mix(prod, vec3(1.0, 0.23, 0.18), fill(sdBox(pq, vec2(0.0, -0.18), vec2(1.0, 0.14)) * 0.2));',
    '  c = mix(c, prod, fill(sdBox(p, pc, ph) - 0.03));',
    '  vec2 h1 = mix(vec2(-h.x * 0.12, -h.y * 0.2), vec2(-h.x * 0.47, h.y * 0.24), ls);',
    '  vec2 w1 = mix(vec2(h.x * 0.7, 0.055), vec2(h.x * 0.4, 0.07), ls);',
    '  c = mix(c, vec3(0.97), fill(sdBox(p, h1, w1)));',
    '  vec2 h2 = mix(vec2(-h.x * 0.27, -h.y * 0.37), vec2(-h.x * 0.57, h.y * 0.04), ls);',
    '  vec2 w2 = mix(vec2(h.x * 0.55, 0.055), vec2(h.x * 0.3, 0.07), ls);',
    '  c = mix(c, vec3(0.97), fill(sdBox(p, h2, w2)));',
    '  vec2 cta = mix(vec2(-h.x + 0.36, -h.y + 0.17), vec2(-h.x + 0.36, -h.y * 0.42), ls);',
    '  c = mix(c, vec3(1.0, 0.23, 0.18), fill(sdBox(p, cta, vec2(0.24, 0.065)) - 0.03));',
    '  vec2 bd = mix(vec2(h.x * 0.55, h.y * 0.62), vec2(h.x * 0.8, h.y * 0.55), ls);',
    '  float disc = length(p - bd) - 0.17;',
    '  c = mix(c, vec3(1.0, 0.23, 0.18), fill(disc));',
    '  c = mix(c, vec3(1.0), fill(sdBox(p, bd, vec2(0.09, 0.025))) * fill(disc));',
    '  return c;',
    '}',
    // Caja: etiqueta blanca con banda roja y código de barras
    'vec3 boxUI(vec2 p, vec2 h, out float m) {',
    '  float lab = sdBox(p, vec2(0.0, -0.04), vec2(h.x * 0.66, h.y * 0.56));',
    '  m = fill(lab);',
    '  vec3 c = vec3(0.95, 0.94, 0.92);',
    '  c = mix(c, vec3(0.1), fill(sdBox(p, vec2(0.0, h.y * 0.32), vec2(h.x * 0.66, h.y * 0.14))));',
    '  c = mix(c, vec3(1.0), fill(sdBox(p, vec2(-h.x * 0.3, h.y * 0.32), vec2(h.x * 0.24, h.y * 0.04))));',
    '  c = mix(c, vec3(0.62), fill(sdBox(p, vec2(-h.x * 0.25, h.y * 0.06), vec2(h.x * 0.34, h.y * 0.03))));',
    '  float st = fract(sin(floor(p.x * 56.0) * 12.9898) * 43758.5453);',
    '  float code = fill(sdBox(p, vec2(0.0, -h.y * 0.26), vec2(h.x * 0.44, h.y * 0.15))) * step(0.42, st);',
    '  c = mix(c, vec3(0.06), code);',
    '  return c;',
    '}',
    'void main() {',
    '  float edge = 0.0;',
    '  if (uDis > 0.0001) {',
    '    float dd = thr(vQ) - uDis;',
    '    if (dd < 0.0) discard;',
    '    edge = (1.0 - smoothstep(0.0, 0.022 + 0.012 * h3(floor(vQ * 140.0)), dd)) * smoothstep(0.0, 0.03, uDis);',
    '  }',
    '  vec3 n = normalize(vN);',
    '  vec3 v = normalize(uCam - vW);',
    '  vec3 L1 = normalize(vec3(-0.55, 0.75, 0.65));',
    '  vec3 L2 = normalize(vec3(0.85, 0.15, -0.5));',
    '  float ndl = dot(n, L1);',
    '  float wrap = clamp((ndl + 0.35) / 1.35, 0.0, 1.0); wrap *= wrap;',
    '  vec3 h1 = normalize(L1 + v);',
    '  float nh = max(dot(n, h1), 0.0);',
    '  float spec = pow(nh, 140.0) * 1.3 + pow(nh, 16.0) * 0.1;',
    '  float nv = clamp(dot(n, v), 0.0, 1.0);',
    '  float fres = pow(1.0 - nv, 4.0);',
    '  vec3 r = reflect(-v, n);',
    '  float soft = smoothstep(0.35, 0.85, r.y) * 0.22;',
    '  float strip = (1.0 - smoothstep(0.0, 0.12, abs(r.x - 0.62))) * smoothstep(-0.2, 0.5, r.y) * 0.35;',
    '  vec3 irid = 0.5 + 0.5 * cos(6.28318 * (vec3(0.0, 0.33, 0.67) + fres * 1.3 + n.y * 0.4));',
    '  float rimL = pow(max(dot(n, L2), 0.0), 2.0);',
    '  vec3 rim = mix(vec3(1.0, 0.9, 0.88), irid, 0.6) * (fres * 0.7 + rimL * 0.3);',
    '  vec3 base = uCol * (0.1 + 0.95 * wrap) + uCol * 0.12 * clamp(-n.y * 0.5 + 0.5, 0.0, 1.0);',
    '  vec3 env = vec3(soft + strip) * (0.35 + 0.65 * fres);',
    '  vec3 col = base + vec3(spec) + env + rim + uCol * uGlow;',
    // Pantallas y etiquetas: solo en la cara frontal del cubo (q.z = 1)
    '  if (vQ.z > 0.9995 && dot(uFace, vec4(1.0)) + uAd > 0.001) {',
    '    vec2 h = uExt.xy; vec2 p = vQ.xy * h;',
    '    vec3 acc = vec3(0.0); float mm = 0.0; float mk; vec3 c;',
    '    if (uFace.x > 0.001) { c = phoneUI(p, h, mk); acc += c * mk * uFace.x; mm += mk * uFace.x; }',
    '    if (uFace.y > 0.001) { c = webUI(p, h, mk); acc += c * mk * uFace.y; mm += mk * uFace.y; }',
    '    if (uFace.z > 0.001) { c = boxUI(p, h, mk); acc += c * mk * uFace.z; mm += mk * uFace.z; }',
    '    if (uAd > 0.001) { c = adUI(p, h, mk); acc += c * mk * uAd; mm += mk * uAd; }',
    '    if (uFace.w > 0.001) { c = texture2D(uTex, vQ.xy * 0.5 + 0.5).rgb; acc += c * uFace.w; mm += uFace.w; }',
    '    vec3 ui = acc / max(mm, 1e-4);',
    '    float lit = 0.72 + 0.28 * wrap;',
    '    vec3 glass = ui * lit + vec3(spec) * 0.7 + env * 0.55;',
    '    col = mix(col, glass, clamp(mm, 0.0, 1.0));',
    '  }',
    '  if (uDis > 0.0001 && dot(n, v) < -0.02) col = uCol * (0.05 + 0.06 * wrap);',
    '  col = mix(col, uHot, edge * 0.9) + uHot * edge * 0.55;',
    '  col = col / (1.0 + 0.12 * col);',
    '  gl_FragColor = vec4(col, 1.0);',
    '}'
  ].join('\n');


  /* ---------------- Arena: partículas que nacen de la superficie ---------------- */
  var PVS = [
    'attribute vec3 aQ; attribute vec3 aT1; attribute vec3 aT2; attribute vec4 aR;',
    'uniform mat4 uPV; uniform mat4 uM; uniform mat3 uNM; uniform mat3 uRot;',
    'uniform float uDis; uniform float uSpread; uniform float uSwirl; uniform vec3 uWind; uniform float uPx;',
    'uniform vec3 uCam; uniform vec3 uCol; uniform vec3 uHot; uniform vec4 uFace;',
    'varying vec3 vC; varying float vA;',
    SHAPE_GLSL,
    NOISE_GLSL,
    'void main() {',
    '  float k = clamp((uDis - thr(aQ)) / 0.4, 0.0, 1.0);',
    '  if (k <= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; vC = vec3(0.0); vA = 0.0; return; }',
    '  vec3 p0 = shape(aQ);',
    '  vec3 p1 = shape(aQ + aT1 * 0.0035);',
    '  vec3 p2 = shape(aQ + aT2 * 0.0035);',
    '  vec3 n = cross(p1 - p0, p2 - p0); float l = length(n);',
    '  n = normalize(uNM * (l > 1e-12 ? n / l : normalize(p0)));',
    '  vec3 c = (uM * vec4(0.0, 0.0, 0.0, 1.0)).xyz;',
    '  vec3 w = (uM * vec4(p0, 1.0)).xyz;',
    '  float e = k * k * (3.0 - 2.0 * k);',
    '  float sd = aR.w;',
    // Hacia afuera + azar, girando con el objeto; viento y remolino en coordenadas del mundo
    '  vec3 dir = normalize(uRot * normalize(p0 + vec3(1e-5)) * 0.9 + aR.xyz);',
    '  vec3 off = dir * uSpread * (0.12 + 0.88 * sd * sd) * e + uWind * e * (0.45 + 0.9 * sd);',
    '  vec3 rel = w + off - c;',
    '  float ang = uSwirl * e * (0.55 + 0.9 * fract(sd * 3.7));',
    '  float ca = cos(ang); float sa = sin(ang);',
    '  rel = vec3(ca * rel.x + sa * rel.z, rel.y, -sa * rel.x + ca * rel.z);',
    '  rel += e * 0.04 * vec3(sin(uTime * 1.7 + sd * 40.0), cos(uTime * 1.3 + aR.x * 30.0), sin(uTime * 1.1 + aR.y * 25.0));',
    '  vec4 cp = uPV * vec4(c + rel, 1.0);',
    '  gl_Position = cp;',
    '  gl_PointSize = uPx * (0.55 + 0.95 * fract(sd * 7.31)) * (6.0 / cp.w);',
    // Cada grano conserva la luz y el color de la superficie de donde salió
    '  vec3 v = normalize(uCam - w);',
    '  vec3 L1 = normalize(vec3(-0.55, 0.75, 0.65));',
    '  float wrap = clamp((dot(n, L1) + 0.35) / 1.35, 0.0, 1.0); wrap *= wrap;',
    '  float spec = pow(max(dot(n, normalize(L1 + v)), 0.0), 40.0);',
    '  vec3 col = uCol * (0.2 + 0.95 * wrap) + vec3(spec) * 0.6;',
    '  if (aQ.z > 0.999) {',
    '    float g = fract(sd * 5.13);',
    '    col = mix(col, vec3(0.07, 0.07, 0.09), clamp(uFace.x + uFace.y, 0.0, 1.0) * 0.85);',
    '    col = mix(col, vec3(0.95, 0.94, 0.92), clamp(uFace.z + uFace.w, 0.0, 1.0) * step(0.7, g));',
    '  }',
    '  col *= 0.7 + 0.55 * fract(sd * 13.71);',
    '  col = mix(col, vec3(1.0, 0.86, 0.74) * (0.55 + 0.5 * wrap), step(0.82, fract(sd * 3.31)) * 0.65);',
    '  float sp = step(0.955, fract(sd * 91.7)) * (0.5 + 0.5 * sin(uTime * 11.0 + sd * 120.0));',
    '  col = mix(col, vec3(1.0, 0.95, 0.9) * 1.4, sp);',
    '  col = mix(uHot * 1.3, col, smoothstep(0.0, 0.35, k));',
    '  vC = col; vA = smoothstep(0.0, 0.1, k) * (1.0 - 0.5 * sd * sd * e);',
    '}'
  ].join('\n');
  var PFS = [
    'precision mediump float;',
    'varying vec3 vC; varying float vA;',
    'void main() {',
    '  vec2 c = gl_PointCoord - 0.5; float r = dot(c, c) * 4.0;',
    '  if (r > 1.0) discard;',
    '  float a = vA * (1.0 - r * 0.55);',
    '  gl_FragColor = vec4(vC * a, a);',
    '}'
  ].join('\n');

  // Granos repartidos sobre las 6 caras del cubo (mismo espacio que la malla); semilla fija
  function sandGrid(n) {
    var Q = new Float32Array(n * 3), T1 = new Float32Array(n * 3), T2 = new Float32Array(n * 3), RR = new Float32Array(n * 4);
    var E = [[1, 0, 0], [0, 1, 0], [0, 0, 1]], seed = 1337;
    function rnd() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
    for (var i = 0; i < n; i++) {
      var f = Math.floor(rnd() * 6), ax = f % 3, sg = f < 3 ? 1 : -1;
      var F = [E[ax][0] * sg, E[ax][1] * sg, E[ax][2] * sg], A2 = E[(ax + 1) % 3], C2 = E[(ax + 2) % 3];
      var a = sg > 0 ? A2 : C2, b = sg > 0 ? C2 : A2, u = rnd() * 2 - 1, v = rnd() * 2 - 1;
      for (var k = 0; k < 3; k++) { Q[i * 3 + k] = F[k] + u * a[k] + v * b[k]; T1[i * 3 + k] = a[k]; T2[i * 3 + k] = b[k]; }
      RR[i * 4] = rnd() * 2 - 1; RR[i * 4 + 1] = rnd() * 2 - 1; RR[i * 4 + 2] = rnd() * 2 - 1; RR[i * 4 + 3] = rnd();
    }
    return { Q: Q, T1: T1, T2: T2, R: RR };
  }

  /* ---------------- Geometría: cubo subdividido (se proyecta en el shader) ---------------- */
  function cubeGrid(N) {
    var pos = [], t1 = [], t2 = [], idx = [];
    var E = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    for (var ax = 0; ax < 3; ax++) for (var sg = -1; sg <= 1; sg += 2) {
      var F = [E[ax][0] * sg, E[ax][1] * sg, E[ax][2] * sg];
      var A = E[(ax + 1) % 3], C = E[(ax + 2) % 3];
      var T1 = sg > 0 ? A : C, T2 = sg > 0 ? C : A;   // cross(T1, T2) = normal de la cara
      var base = pos.length / 3, a, b;
      for (a = 0; a <= N; a++) for (b = 0; b <= N; b++) {
        var s = -1 + 2 * a / N, t = -1 + 2 * b / N;
        pos.push(F[0] + s * T1[0] + t * T2[0], F[1] + s * T1[1] + t * T2[1], F[2] + s * T1[2] + t * T2[2]);
        t1.push(T1[0], T1[1], T1[2]);
        t2.push(T2[0], T2[1], T2[2]);
      }
      for (a = 0; a < N; a++) for (b = 0; b < N; b++) {
        var v = base + a * (N + 1) + b, w = v + N + 1;
        idx.push(v, w, w + 1, v, w + 1, v + 1);
      }
    }
    return { pos: new Float32Array(pos), t1: new Float32Array(t1), t2: new Float32Array(t2), idx: new Uint16Array(idx) };
  }

  function makeGL(canvas) {
    var gl = null;
    try { gl = canvas.getContext('webgl', { antialias: true, alpha: true, premultipliedAlpha: true, powerPreference: 'high-performance' }); } catch (e) { gl = null; }
    if (!gl) return null;
    function sh(type, src) {
      var o = gl.createShader(type); gl.shaderSource(o, src); gl.compileShader(o);
      if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) { if (window.console) console.warn('reel shader', gl.getShaderInfoLog(o)); return null; }
      return o;
    }
    function prog(vsrc, fsrc, names) {
      var vs = sh(gl.VERTEX_SHADER, vsrc), fs = sh(gl.FRAGMENT_SHADER, fsrc);
      if (!vs || !fs) return null;
      var pr = gl.createProgram();
      gl.attachShader(pr, vs); gl.attachShader(pr, fs);
      ['aQ', 'aT1', 'aT2', 'aR'].forEach(function (a, k) { gl.bindAttribLocation(pr, k, a); });
      gl.linkProgram(pr);
      if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) { if (window.console) console.warn('reel link', gl.getProgramInfoLog(pr)); return null; }
      var U = {}; names.forEach(function (n) { U[n] = gl.getUniformLocation(pr, n); });
      return { p: pr, U: U };
    }
    var COMMON = ['uPV', 'uM', 'uNM', 'uExt', 'uExp', 'uWave', 'uTime', 'uCam', 'uCol', 'uFace', 'uDis', 'uSweep', 'uHot'];
    var mesh = prog(VS, FS, COMMON.concat(['uGlow', 'uAd', 'uUI', 'uClick', 'uTex']));
    if (!mesh) return null;
    var sand = prog(PVS, PFS, COMMON.concat(['uRot', 'uSpread', 'uSwirl', 'uWind', 'uPx']));  // si falla, el reel sigue sin arena
    function buf(data) { var b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW); return b; }
    var g = cubeGrid(52);
    var R = { gl: gl, mesh: mesh, sand: sand, U: mesh.U, count: g.idx.length, mb: [buf(g.pos), buf(g.t1), buf(g.t2)], sb: null, sn: 0 };
    R.ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, R.ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, g.idx, gl.STATIC_DRAW);
    R.setSand = function (n) {
      if (!sand || R.sn === n) return;
      var d = sandGrid(n);
      R.sb = [buf(d.Q), buf(d.T1), buf(d.T2), buf(d.R)]; R.sn = n;
    };
    gl.useProgram(mesh.p);
    var tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 59, 47, 255]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.uniform1i(mesh.U.uTex, 0);
    gl.enable(gl.DEPTH_TEST);
    gl.clearColor(0, 0, 0, 0);
    R.tex = tex;
    return R;
  }

  // Lona: textura de tela con ojillos y el texto de marca
  function drawBanner(R) {
    if (!R) return;
    var c = document.createElement('canvas'); c.width = 2048; c.height = 376;
    var x = c.getContext('2d');
    x.fillStyle = '#FF3B2F'; x.fillRect(0, 0, c.width, c.height);
    x.fillStyle = 'rgba(0,0,0,0.07)';
    for (var i = 0; i < c.height; i += 4) x.fillRect(0, i, c.width, 1);
    x.fillStyle = '#F3F4F6';
    for (var e = 46; e < c.width; e += 122) { x.beginPath(); x.arc(e, 26, 8, 0, TAU); x.fill(); x.beginPath(); x.arc(e, c.height - 26, 8, 0, TAU); x.fill(); }
    var txt = 'SCREEN TO STADIUM', size = 220;
    try { x.fontStretch = 'expanded'; } catch (er) {}
    x.font = '900 ' + size + 'px Archivo, "Arial Black", sans-serif';
    size = Math.min(size, size * (c.width * 0.86) / x.measureText(txt).width);
    x.font = '900 ' + size + 'px Archivo, "Arial Black", sans-serif';
    x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#F3F4F6';
    x.fillText(txt, c.width / 2, c.height / 2 + size * 0.05);
    var gl = R.gl;
    gl.bindTexture(gl.TEXTURE_2D, R.tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
  }

  /* ---------------- Formas (ext = semiejes, e1 = exponente vertical, e2 = horizontal) ---------------- */
  var SH = {
    sphere: { ex: 1, ey: 1, ez: 1, e1: 1, e2: 1 },
    star: { ex: 1.05, ey: 1.05, ez: 0.42, e1: 3.0, e2: 3.0 },
    box: { ex: 0.82, ey: 0.82, ez: 0.82, e1: 0.22, e2: 0.22 },
    f45: { ex: 0.8, ey: 1.0, ez: 0.08, e1: 0.16, e2: 0.16 },
    f169: { ex: 1.6, ey: 0.9, ez: 0.08, e1: 0.16, e2: 0.16 },
    f916: { ex: 0.56, ey: 1.0, ez: 0.08, e1: 0.16, e2: 0.16 },
    banner: { ex: 3.0, ey: 0.55, ez: 0.022, e1: 0.12, e2: 0.12 },
    phone: { ex: 0.52, ey: 1.05, ez: 0.07, e1: 0.16, e2: 0.2 },
    web: { ex: 1.55, ey: 1.0, ez: 0.06, e1: 0.15, e2: 0.15 }
  };
  // El ícono del HUD sigue al objeto 3D (MorphSVG)
  var ICON = {
    dot: 'M50,36 C57.73,36 64,42.27 64,50 C64,57.73 57.73,64 50,64 C42.27,64 36,57.73 36,50 C36,42.27 42.27,36 50,36 Z',
    star: 'M50,8 C52,36 64,48 92,50 C64,52 52,64 50,92 C48,64 36,52 8,50 C36,48 48,36 50,8 Z',
    box: 'M24,24 L76,24 L76,76 L24,76 Z',
    banner: 'M4,38 L96,38 L96,62 L4,62 Z',
    phone: 'M33,8 L67,8 L67,92 L33,92 Z',
    web: 'M8,22 L92,22 L92,78 L8,78 Z'
  };

  function init(root) {
    var q = function (s) { return root.querySelector('[data-r="' + s + '"]'); };
    var qa = function (s) { return Array.prototype.slice.call(root.querySelectorAll('[data-r="' + s + '"]')); };
    var canvas = root.querySelector('.reel__gl');
    var R = makeGL(canvas);
    if (!R) root.classList.add('no-gl');
    var glowEl = root.querySelector('.reel__glow'), obj2d = root.querySelector('.reel__obj2d');
    var layer = root.querySelector('.reel__layer'), flash = root.querySelector('.reel__flash');
    var progEl = root.querySelector('.intro__progress i');
    var tcEl = q('tc'), seqEls = Array.prototype.slice.call(q('seq').children);
    var iconPath = root.querySelector('#reelIcon');

    // Estado animable del objeto (lo mueve la línea de tiempo, lo lee el render)
    var st = {
      ex: 1, ey: 1, ez: 1, e1: 1, e2: 1,
      x: 0, y: 0, side: 0, fit: 0, s: 0.13, sx: 1, sy: 1,
      rx: 0, ry: 0, rz: 0, float: 0, wave: 0, glow: 0.25, shadow: 0, shake: 0,
      fPhone: 0, fWeb: 0, fBox: 0, fBanner: 0, fAd: 0, ui: 0, click: 0,
      tags: 0, orb: 0, cur: 0, wr: 0, wp: 0,
      // arena: avance de la erosión, dispersión, remolino, viento y barrido
      dis: 0, sp: 1, sw: 0, wx: 0, wy: 0, wz: 0, dx: 0, dy: 1, dz: 0, dw: 0
    };

    /* ---------- Layout ---------- */
    var W = 1, H = 1, L = {}, dot = { x: 0, y: 0, s: 0.05 }, A = null, NAME = {};
    function box(el) { var m = el.parentNode; return (m && m.classList && m.classList.contains('kc-mask') ? m : el).getBoundingClientRect(); }
    function measure() {
      var d = root.querySelector('.k-name__dot');
      if (!d) return;
      var r = d.getBoundingClientRect(), b = root.getBoundingClientRect();
      if (!r.width) return;
      var wx = function (x) { return ((x - b.left) / W * 2 - 1) * L.halfW; };
      var wy = function (y) { return (1 - (y - b.top) / H * 2) * L.halfH; };
      var rad = r.width / 2;
      dot.x = wx(r.left + rad); dot.y = wy(r.top + rad); dot.s = rad / L.ppw;
      if (!NAME.c1 || !NAME.c1.length) return;
      var a = box(NAME.c1[0]), z = box(NAME.c1[NAME.c1.length - 1]), a2 = box(NAME.c2[0]);
      var gap = a2.top - a.top, base2 = r.top + rad, base1 = base2 - gap, under = rad * 2.2;
      // Puntos en pantalla: inicio y fin de la línea 1, inicio de la línea 2 y el punto final
      L.Ppx = [[a.left - rad * 2.2, base1 + under], [z.right + rad * 2.2, base1 + under], [a2.left - rad * 2.2, base2 + under], [r.left + rad, base2]];
      L.P = L.Ppx.map(function (q) { return [wx(q[0]), wy(q[1])]; });
      // Control del retorno de carro: baja en arco entre las dos líneas
      L.P.push([(L.P[1][0] + L.P[2][0]) / 2, (L.P[1][1] + L.P[2][1]) / 2 - (gap / L.ppw) * 0.4]);
    }
    function pathAt(w) {
      var P = L.P;
      if (!P) return [dot.x, dot.y];
      if (w <= 1) return [mix(P[0][0], P[1][0], w), mix(P[0][1], P[1][1], w)];
      if (w <= 2) {
        var t = w - 1, u = 1 - t;
        return [u * u * P[1][0] + 2 * u * t * P[4][0] + t * t * P[2][0], u * u * P[1][1] + 2 * u * t * P[4][1] + t * t * P[2][1]];
      }
      var k = Math.min(w - 2, 1);
      return [mix(P[2][0], P[3][0], k), mix(P[2][1], P[3][1], k)];
    }
    // Qué tan avanzado va el punto cuando pasa por cada letra (proporcional, no depende del tamaño)
    function charFractions() {
      var P = L.Ppx;
      function f(list, x0, x1) { return list.map(function (c) { var r = box(c); return Math.max(0, Math.min(1, (r.left + r.width / 2 - x0) / (x1 - x0))); }); }
      if (!P) return { f1: NAME.c1.map(function (c, i) { return i / NAME.c1.length; }), f2: NAME.c2.map(function (c, i) { return i / NAME.c2.length; }) };
      return { f1: f(NAME.c1, P[0][0], P[1][0]), f2: f(NAME.c2, P[2][0], P[3][0]) };
    }
    function layout() {
      var r = root.getBoundingClientRect();
      W = Math.max(r.width, 1); H = Math.max(r.height, 1);
      L.desk = W >= 900;
      var dpr = Math.min(window.devicePixelRatio || 1, L.desk ? 2 : 1.75);
      if (R) { canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); R.setSand(L.desk ? 72000 : 26000); }
      L.dpr = dpr;
      L.halfH = Math.tan(FOV / 2) * CAMZ;
      L.halfW = L.halfH * W / H;
      L.sx = L.desk ? L.halfW * 0.42 : 0;
      L.sy = L.desk ? 0.03 : L.halfH * 0.28;
      L.unit = L.desk ? 0.72 : Math.min(0.6, L.halfW * 0.62);
      L.ppw = H / (2 * L.halfH);
      if (A) { A.tagW = A.tags.map(function (el) { return (el.firstElementChild || el).offsetWidth / 2 + 14; }); A.mNumW = A.mNum.offsetWidth; }
      measure();
    }
    layout();
    if (window.ResizeObserver) new ResizeObserver(function () { layout(); render(); }).observe(root);
    else window.addEventListener('resize', function () { layout(); render(); });
    drawBanner(R);
    if (R && document.fonts && document.fonts.load) document.fonts.load('900 100px Archivo').then(function () { drawBanner(R); render(); });

    /* ---------- Anclas DOM ---------- */
    A = {
      pulse: q('pulse'), tags: qa('tag'), chip: q('chip'), measure: q('measure'), mSvg: q('measure').querySelector('svg'), mNum: q('measure').querySelector('.k-measure__n'), mNumW: 0,
      caps: q('caps'), cursor: q('cursor'), ripple: q('ripple'), live: q('live')
    };
    layout();
    function put(el, x, y) { el.style.transform = 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0)'; }

    /* ---------- Render (cada cuadro del ticker de GSAP) ---------- */
    var clock = 0, lastBeat = -1, lastTc = '', lastLayer = '', tl = null;
    function render() {
      var t = clock;
      var S = st.s * L.unit;
      var px = st.side * L.sx + st.x;
      var py = st.side * L.sy + st.y + Math.sin(t * 1.3) * 0.03 * st.float;
      if (st.fit > 0) {
        var lim = Math.min((L.halfW * (L.desk ? 0.92 : 0.8) - Math.abs(px)) / st.ex, L.halfH * 0.82 / st.ey);
        if (lim < S) S = mix(S, Math.max(lim, 0.01), st.fit);
      }
      if (st.wr > 0) { var wpos = pathAt(st.wp); px = mix(px, wpos[0], st.wr); py = mix(py, wpos[1], st.wr); S = mix(S, dot.s, st.wr); }
      var shx = st.shake ? Math.sin(t * 93) * st.shake * 0.035 : 0, shy = st.shake ? Math.cos(t * 71) * st.shake * 0.035 : 0;
      var ry = st.ry + Math.sin(t * 0.6) * 0.08 * st.float, rx = st.rx + Math.sin(t * 0.8) * 0.05 * st.float;
      var Rm = mul(rotY(ry), mul(rotX(rx), rotZ(st.rz)));
      var sx = S * st.sx, sy = S * st.sy, sz = S * st.sx;
      var M = mul(trans(px, py, 0), mul(Rm, scl(sx, sy, sz)));
      var PV = mul(persp(FOV, W / H, 0.1, 40), trans(-shx, -shy, -CAMZ));
      function scr(wx, wy, wz) { var c = xf(PV, wx, wy, wz); return [(c[0] / c[3] * 0.5 + 0.5) * W, (0.5 - c[1] / c[3] * 0.5) * H, c[3]]; }
      function obj(ox, oy, oz) { var w = xf(M, ox, oy, oz); return scr(w[0], w[1], w[2]); }

      if (R) {
        var gl = R.gl, MP = R.mesh, SP = R.sand;
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        if (S > 0.002) {
          var NM = [Rm[0] / sx, Rm[1] / sx, Rm[2] / sx, Rm[4] / sy, Rm[5] / sy, Rm[6] / sy, Rm[8] / sz, Rm[9] / sz, Rm[10] / sz];
          var common = function (U) {
            gl.uniformMatrix4fv(U.uPV, false, PV);
            gl.uniformMatrix4fv(U.uM, false, M);
            gl.uniformMatrix3fv(U.uNM, false, NM);
            gl.uniform3f(U.uExt, st.ex, st.ey, st.ez);
            gl.uniform2f(U.uExp, st.e1, st.e2);
            gl.uniform1f(U.uWave, st.wave);
            gl.uniform1f(U.uTime, t);
            gl.uniform3f(U.uCam, shx, shy, CAMZ);
            gl.uniform3f(U.uCol, 1.0, 0.231, 0.184);
            gl.uniform4f(U.uFace, st.fPhone, st.fWeb, st.fBox, st.fBanner);
            gl.uniform1f(U.uDis, st.dis);
            gl.uniform4f(U.uSweep, st.dx, st.dy, st.dz, st.dw);
            gl.uniform3f(U.uHot, 1.0, 0.46, 0.24);
          };
          var bind = function (bufs) {
            for (var k = 0; k < 4; k++) {
              if (bufs[k]) { gl.bindBuffer(gl.ARRAY_BUFFER, bufs[k]); gl.enableVertexAttribArray(k); gl.vertexAttribPointer(k, k === 3 ? 4 : 3, gl.FLOAT, false, 0, 0); }
              else gl.disableVertexAttribArray(k);
            }
          };
          // Malla (se erosiona cuando dis > 0)
          gl.useProgram(MP.p);
          bind(R.mb);
          common(MP.U);
          gl.uniform1f(MP.U.uGlow, st.glow);
          gl.uniform1f(MP.U.uAd, st.fAd);
          gl.uniform1f(MP.U.uUI, st.ui);
          gl.uniform1f(MP.U.uClick, st.click);
          gl.drawElements(gl.TRIANGLES, R.count, gl.UNSIGNED_SHORT, 0);
          // Arena: solo se dibuja durante las transiciones
          if (SP && R.sn && st.dis > 0.0005) {
            var k2 = L.unit / 0.72;
            gl.useProgram(SP.p);
            bind(R.sb);
            common(SP.U);
            gl.uniformMatrix3fv(SP.U.uRot, false, [Rm[0], Rm[1], Rm[2], Rm[4], Rm[5], Rm[6], Rm[8], Rm[9], Rm[10]]);
            gl.uniform1f(SP.U.uSpread, st.sp * k2);
            gl.uniform1f(SP.U.uSwirl, st.sw);
            gl.uniform3f(SP.U.uWind, st.wx * k2, st.wy * k2, st.wz * k2);
            gl.uniform1f(SP.U.uPx, 1.55 * L.dpr);
            gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
            gl.drawArrays(gl.POINTS, 0, R.sn);
            gl.depthMask(true); gl.disable(gl.BLEND);
          }
        }
      } else {
        var w2 = st.ex * sx * L.ppw * 2, h2 = st.ey * sy * L.ppw * 2, c2 = scr(px, py, 0);
        var round = st.e1 >= 0.9 ? '50%' : Math.round(mix(6, 50, st.e1 / 0.9)) + '%';
        obj2d.style.width = w2 + 'px'; obj2d.style.height = h2 + 'px'; obj2d.style.borderRadius = round;
        obj2d.style.transform = 'translate3d(' + (c2[0] - w2 / 2) + 'px,' + (c2[1] - h2 / 2) + 'px,0) rotate(' + st.rz + 'rad)';
      }

      // Brillo en el piso
      var g = scr(px, py - st.ey * sy - 0.04, 0), gw = Math.max(st.ex * sx * L.ppw * 3.2, 1) / 200;
      glowEl.style.transform = 'translate3d(' + g[0] + 'px,' + g[1] + 'px,0) scale(' + gw + ',' + (gw * 0.32) + ')';
      glowEl.style.opacity = st.shadow;

      // Anclas
      var c0 = scr(px, py, 0);
      put(A.pulse, c0[0], c0[1]);
      if (st.tags > 0.001) {
        var Rr = 1.55 * S;
        A.tags.forEach(function (el, i) {
          var a = st.orb + i * Math.PI / 2;
          var wz = Math.sin(a) * Rr;
          var p2 = scr(px + Math.cos(a) * Rr, py + Math.sin(a) * Rr * 0.28 - 0.04, wz);
          var k = CAMZ / (CAMZ - wz), front = wz >= 0;
          var hw = A.tagW && A.tagW[i] || 60;
          el.style.transform = 'translate3d(' + Math.max(hw, Math.min(W - hw, p2[0])).toFixed(1) + 'px,' + p2[1].toFixed(1) + 'px,0) translate(-50%,-50%) scale(' + (0.86 * k).toFixed(3) + ')';
          el.style.opacity = (st.tags * (front ? 1 : 0.3)).toFixed(3);
          el.style.zIndex = front ? 2 : 1;
        });
      } else if (A.tags[0].style.opacity !== '0') A.tags.forEach(function (el) { el.style.opacity = '0'; });
      var top = scr(px, py + st.ey * sy + 0.1, 0);
      put(A.chip, top[0], top[1]);
      var bl = obj(-st.ex, -st.ey, 0), br = obj(st.ex, -st.ey, 0);
      if (st.fBanner > 0.001 || st.wave > 0) {
        var mw = Math.max(br[0] - bl[0], 1);
        A.measure.style.transform = 'translate3d(' + bl[0].toFixed(1) + 'px,' + (Math.max(bl[1], br[1]) + 22).toFixed(1) + 'px,0)';
        A.mSvg.style.transform = 'scaleX(' + (mw / 1000).toFixed(4) + ')';
        A.mNum.style.transform = 'translate3d(' + (mw - A.mNumW).toFixed(1) + 'px,0,0)';
      }
      // Los subtítulos van pegados a la pantalla del teléfono: siguen su giro y su escala en cada corte
      var cap = obj(0, -st.ey * 0.42, st.ez);
      A.caps.style.transform = 'translate3d(' + cap[0].toFixed(1) + 'px,' + cap[1].toFixed(1) + 'px,0) rotate(' + (-st.rz).toFixed(4) + 'rad) scale(' + st.sx.toFixed(4) + ')';
      var btn = obj(-st.ex + 0.44, -0.3, st.ez);
      put(A.ripple, btn[0], btn[1]);
      var k2 = st.cur, sx0 = W * 0.92, sy0 = H * 0.96;
      put(A.cursor, mix(sx0, btn[0] - 5, k2), mix(sy0, btn[1] - 3, k2) - Math.sin(k2 * Math.PI) * H * 0.12);
      var lv = obj(st.ex, st.ey, st.ez);
      put(A.live, lv[0], lv[1]);
      var lt = st.shake ? 'translate3d(' + (-shx * L.ppw).toFixed(1) + 'px,' + (shy * L.ppw).toFixed(1) + 'px,0)' : '';
      if (lt !== lastLayer) { layer.style.transform = lt; lastLayer = lt; }

      // HUD: timecode a 24 fps, secuenciador al beat y progreso
      if (tl) {
        var tt = tl.time(), sec = Math.floor(tt);
        var tc = '00:00:' + pad2(sec) + ':' + pad2(Math.floor((tt - sec) * 24));
        if (tc !== lastTc) { tcEl.textContent = tc; lastTc = tc; }
        var beat = Math.floor(tt / B) % 4;
        if (beat !== lastBeat) { lastBeat = beat; seqEls.forEach(function (el, i) { el.classList.toggle('on', i === beat); }); }
        progEl.style.transform = 'scaleX(' + tl.progress().toFixed(4) + ')';
      }
    }

    /* ---------- Utilidades de tipografía ---------- */
    function splitChars(el, mask) {
      if (!HAS.split) return [el];
      var s = new SplitText(el, mask ? { type: 'chars', charsClass: 'kc', mask: 'chars' } : { type: 'chars', charsClass: 'kc' });
      return s.chars;
    }
    function odo(el) {
      var digits = el.getAttribute('data-odo').split(''), cols = [];
      el.innerHTML = '';
      digits.forEach(function (d) {
        var c = document.createElement('span'); c.className = 'odo__c';
        for (var r = 0; r < 3; r++) for (var k = 0; k < 10; k++) { var i = document.createElement('i'); i.textContent = k; c.appendChild(i); }
        el.appendChild(c);
        cols.push({ el: c, n: 20 + parseInt(d, 10) });
      });
      return cols;
    }
    function flapInit(el, len, text) {
      el.innerHTML = '';
      var cells = [];
      for (var i = 0; i < len; i++) { var s = document.createElement('span'); s.textContent = ' '; el.appendChild(s); cells.push(s); }
      el._cells = cells; el._txt = '';
      if (text) { for (i = 0; i < len; i++) cells[i].textContent = text[i] && text[i] !== ' ' ? text[i] : ' '; el._txt = text; }
      return el;
    }

    /* ---------- Línea de tiempo ---------- */
    tl = gsap.timeline({ repeat: -1, paused: true });

    function morph(name, at, dur, ease) {
      var s = SH[name];
      tl.to(st, { ex: s.ex, ey: s.ey, ez: s.ez, e1: s.e1, e2: s.e2, duration: dur || 1, ease: ease || EWHIP }, at);
    }
    function icon(name, at) { if (HAS.morph) tl.to(iconPath, { morphSVG: ICON[name], duration: 0.7, ease: EWHIP }, at); }
    function flap(el, text, at) {
      var cells = el._cells, prev = el._txt || '';
      for (var i = 0; i < cells.length; i++) {
        var ch = text[i] || ' ';
        if (ch === (prev[i] || ' ')) continue;
        var t0 = at + i * 0.035;
        tl.to(cells[i], { rotationX: -90, duration: 0.08, ease: 'power1.in' }, t0)
          .set(cells[i], { textContent: ch === ' ' ? ' ' : ch, rotationX: 90 }, t0 + 0.08)
          .to(cells[i], { rotationX: 0, duration: 0.18, ease: 'back.out(2.2)' }, t0 + 0.08);
      }
      el._txt = text;
    }
    function type(el, text, at, dur) {
      var o = { n: 0 };
      tl.fromTo(o, { n: 0 }, { n: text.length, duration: dur, ease: 'none', immediateRender: false, onUpdate: function () { el.textContent = text.slice(0, Math.round(o.n)); } }, at);
    }
    function roll(cols, at, dur) {
      cols.forEach(function (c, i) { tl.fromTo(c.el, { yPercent: 0 }, { yPercent: -c.n / 30 * 100, duration: dur + i * 0.18, ease: EOUT, immediateRender: false }, at); });
    }
    function shake(at, amt) { tl.set(st, { shake: amt || 1 }, at).to(st, { shake: 0, duration: 0.55, ease: 'power2.out' }, at + 0.01); }
    function squash(at, sx, sy) {
      tl.to(st, { sx: sx, sy: sy, duration: 0.1, ease: 'power2.out' }, at)
        .to(st, { sx: 1, sy: 1, duration: 0.7, ease: 'elastic.out(1, 0.38)' }, at + 0.1);
    }

    // Escenas: título con letras que suben en 3D y se estiran (eje wdth), verbos al beat
    // Modo ligero (teléfonos/tabletas): títulos en 2D y sin animar el eje de ancho
    var LITE = !L.desk || (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
    var groups = {};
    ['s0', 's1', 's2', 's3', 's4', 's5'].forEach(function (k) {
      var g = q(k), title = g.querySelector('.ks__title');
      groups[k] = { el: g, title: title, chars: splitChars(title, true), num: g.querySelector('.ks__num'), bar: g.querySelector('.ks__num i'), verbs: Array.prototype.slice.call(g.querySelectorAll('.ks__verbs span')) };
      gsap.set(title, { '--w': 118 });
    });
    function titleIn(k, at) {
      var g = groups[k];
      tl.set(g.el, { autoAlpha: 1 }, at)
        .call(function () { g.verbs.forEach(function (v) { v.classList.remove('on'); }); }, null, at);
      if (LITE) tl.fromTo(g.chars, { yPercent: 122, skewY: 7 }, { yPercent: 0, skewY: 0, duration: 0.9, ease: EOUT, stagger: 0.016, force3D: false }, at);
      else tl.fromTo(g.chars, { yPercent: 122, rotationX: -80, transformOrigin: '50% 100%' }, { yPercent: 0, rotationX: 0, duration: 0.95, ease: EOUT, stagger: 0.018 }, at)
        .fromTo(g.title, { '--w': 62 }, { '--w': 118, duration: 1.3, ease: 'power3.out' }, at);
      if (g.num) tl.fromTo(g.num, { opacity: 0, x: -18 }, { opacity: 1, x: 0, duration: 0.5, ease: EOUT }, at).fromTo(g.bar, { scaleX: 0 }, { scaleX: 1, duration: 0.8, ease: EOUT }, at + 0.1);
      if (g.verbs.length) tl.fromTo(g.verbs, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.5, ease: EOUT, stagger: 0.07 }, at + 0.35);
    }
    function titleOut(k, at) {
      var g = groups[k];
      tl.to(g.chars, { yPercent: -122, duration: 0.45, ease: 'power3.in', stagger: 0.01, force3D: !LITE }, at);
      if (!LITE) tl.to(g.title, { '--w': 62, duration: 0.45, ease: 'power3.in' }, at);
      if (g.num) tl.to(g.num, { opacity: 0, duration: 0.3 }, at);
      if (g.verbs.length) tl.to(g.verbs, { opacity: 0, duration: 0.3 }, at);
      tl.set(g.el, { autoAlpha: 0 }, at + 0.62);
    }
    function verb(k, i, at) {
      var g = groups[k];
      tl.call(function () { g.verbs.forEach(function (v, j) { v.classList.toggle('on', j === i); }); }, null, at);
    }
    function show(el, at, dur) { tl.fromTo(el, { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: dur || 0.5, ease: EOUT }, at); }
    function hide(el, at) { tl.to(el, { autoAlpha: 0, y: -10, duration: 0.35, ease: 'power2.in' }, at); }

    var idx = flapInit(q('idx'), 2, '00');

    /* ===== GANCHO (0 a 5 s): 6 pulgadas → 80 metros ===== */
    var tiny = q('tiny'), tinyT = tiny.querySelector('.k-tiny__t'), tinyL = tiny.querySelector('polyline');
    var giant = q('giant'), giantC = splitChars(giant, false);
    tl.to(st, { s: 0.17, duration: 0.18, ease: 'power2.out', yoyo: true, repeat: 1 }, 0.05)
      .to(st, { s: 0.17, duration: 0.18, ease: 'power2.out', yoyo: true, repeat: 1 }, 0.55)
      .set(tiny, { autoAlpha: 1 }, 0.3);
    if (HAS.draw) tl.fromTo(tinyL, { drawSVG: '0%' }, { drawSVG: '100%', duration: 0.45, ease: 'power2.inOut' }, 0.3);
    if (HAS.scr) tl.set(tinyT, { textContent: '' }, 0.3).to(tinyT, { duration: 0.6, scrambleText: { text: '6-INCH SCREEN', chars: 'XO01/', speed: 0.9 }, ease: 'none' }, 0.55);
    else tl.fromTo(tinyT, { opacity: 0 }, { opacity: 1, duration: 0.3 }, 0.55);
    tl.to(tiny, { autoAlpha: 0, duration: 0.25 }, 1.22);
    squash(1.2, 1.25, 0.72);
    tl.to(st, { s: 3.4, glow: 0, duration: 0.8, ease: EWHIP }, 1.42);
    tl.set(giant, { autoAlpha: 1, '--w': 62 }, 1.5)
      .fromTo(giantC, { xPercent: 140, scaleX: 2.4, opacity: 0 }, { xPercent: 0, scaleX: 1, opacity: 1, duration: 0.7, ease: EOUT, stagger: 0.035 }, 1.5)
      .to(giant, { '--w': 125, duration: 1.4, ease: 'power2.inOut' }, 1.95);
    shake(1.58, 1);
    tl.to(giantC, { yPercent: -130, opacity: 0, duration: 0.5, ease: 'power3.in', stagger: 0.02 }, 3.1)
      .set(giant, { autoAlpha: 0 }, 3.85)
      .to(st, { s: 1, side: 1, fit: 1, float: 1, shadow: 1, duration: 1.0, ease: EWHIP }, 3.1);
    titleIn('s0', 3.55);
    titleOut('s0', 4.55);

    /* ===== 01 · IA (5 a 10.5 s) ===== */
    var prompt = q('prompt'), promptT = prompt.querySelector('.k-type'), promptTxt = promptT.textContent;
    var pulse = A.pulse.querySelectorAll('i');
    flap(idx, '01', 4.9); icon('star', 4.85);
    morph('star', 4.85, 1.1);
    tl.set(st, { sp: 0.7, sw: 3.0, wx: 0, wy: 0.14, wz: 0, dx: 0, dy: 1, dz: 0, dw: 0.3 }, 4.8)
      .to(st, { dis: 1, duration: 0.95, ease: 'power1.inOut' }, 4.85)
      .to(st, { dis: 0, duration: 0.75, ease: 'power3.in' }, 6.3);
    tl.to(st, { ry: TAU, duration: 1.4, ease: EWHIP }, 4.85)
      .to(st, { ry: TAU + 1.4, duration: 3.5, ease: 'none' }, 6.3);
    titleIn('s1', 5.15);
    show(prompt, 5.6); verb('s1', 0, 5.65);
    tl.set(promptT, { textContent: '' }, 5.6);
    type(promptT, promptTxt, 5.75, 1.15);
    verb('s1', 1, 7.05);
    tl.to(st, { glow: 1.1, duration: 0.12, ease: 'power2.out' }, 7.05).to(st, { glow: 0, duration: 0.8, ease: 'power2.out' }, 7.17);
    squash(7.05, 1.18, 0.85);
    tl.to(st, { rz: Math.PI / 2, duration: 0.55, ease: 'back.out(2)' }, 7.08)
      .fromTo(pulse, { scale: 0.5, opacity: 0.9 }, { scale: 2.4, opacity: 0, duration: 1.0, ease: 'power2.out', stagger: 0.18, immediateRender: false }, 7.08);
    tl.to(st, { tags: 1, duration: 0.6, ease: 'power2.out' }, 7.35)
      .fromTo(st, { orb: 0 }, { orb: 3.4, duration: 2.6, ease: 'none', immediateRender: false }, 7.3);
    verb('s1', 2, 8.35);
    titleOut('s1', 9.7); hide(prompt, 9.7);
    tl.to(st, { tags: 0, duration: 0.4 }, 9.75);

    /* ===== 02 · Campañas y e-commerce (10.5 a 16 s) ===== */
    var stat2 = q('stat2'), cols2 = odo(stat2.querySelector('.odo'));
    var chipS = A.chip.querySelector('span');
    var fmt = q('fmt'), fmtFlap = flapInit(q('fmtflap'), 4, ''), rollEl = q('roll');
    flap(idx, '02', 10.4); icon('box', 10.35);
    morph('box', 10.3, 1.0);
    tl.to(st, { ry: 2 * TAU + 0.55, rz: 0, rx: -0.35, duration: 1.0, ease: EWHIP }, 10.3)
      .to(st, { ry: 2 * TAU + 0.95, duration: 1.6, ease: 'none' }, 11.3)
      .to(st, { fBox: 1, duration: 0.5 }, 10.8);
    titleIn('s2', 10.6); verb('s2', 0, 10.9);
    show(stat2, 10.9); roll(cols2, 10.95, 1.5);
    // La caja rebota como un producto que cae al carrito
    tl.to(st, { y: 0.55, duration: 0.3, ease: 'power2.out' }, 11.55)
      .to(st, { y: 0, duration: 0.32, ease: 'power2.in' }, 11.85);
    squash(12.17, 1.22, 0.78); shake(12.17, 0.6);
    tl.fromTo(chipS, { opacity: 0, scale: 0.6, y: 10 }, { opacity: 1, scale: 1, y: 0, duration: 0.45, ease: 'back.out(2.4)' }, 12.2)
      .to(chipS, { opacity: 0, y: -8, duration: 0.3 }, 12.95);
    verb('s2', 1, 11.9);
    // Formatos: 4:5 → 16:9 → 9:16
    tl.to(st, { fBox: 0, duration: 0.3 }, 12.85)
      .to(st, { fAd: 1, duration: 0.35 }, 13.05)
      .to(st, { fAd: 0, duration: 0.3 }, 15.75)
      .to(st, { ry: 3 * TAU, rx: 0, duration: 0.6, ease: EWHIP }, 12.9);
    morph('f45', 12.9, 0.6);
    show(fmt, 12.95); verb('s2', 2, 12.95);
    flap(fmtFlap, '4:5 ', 13.0);
    tl.set(rollEl, { yPercent: 0 }, 12.95);
    morph('f169', 13.7, 0.5, 'back.out(1.4)'); flap(fmtFlap, '16:9', 13.72);
    tl.to(rollEl, { yPercent: -100 / 3, duration: 0.45, ease: EWHIP }, 13.72);
    morph('f916', 14.5, 0.5, 'back.out(1.4)'); flap(fmtFlap, '9:16', 14.52);
    tl.to(rollEl, { yPercent: -200 / 3, duration: 0.45, ease: EWHIP }, 14.52);
    titleOut('s2', 15.35); hide(stat2, 15.35); hide(fmt, 15.35);

    /* ===== 03 · Gran formato y eventos (16 a 21.5 s) ===== */
    var meas = q('measure'), measL = meas.querySelector('.k-measure__l'), measT = meas.querySelector('.k-measure__t');
    var cols3 = odo(meas.querySelector('.odo'));
    var board = q('board'), city = flapInit(q('city'), 9, '');
    flap(idx, '03', 15.9); icon('banner', 15.85);
    morph('banner', 15.8, 1.1);
    tl.to(st, { side: 0, y: 0.32, rx: -0.12, ry: 3 * TAU - 0.32, duration: 1.1, ease: EWHIP }, 15.8)
      .to(st, { fBanner: 1, duration: 0.5 }, 16.05)
      .to(st, { wave: 0.09, duration: 1.0, ease: 'power2.inOut' }, 16.4)
      .to(st, { s: 1.07, duration: 4.5, ease: 'none' }, 16.2);
    titleIn('s3', 16.2); verb('s3', 0, 16.5);
    tl.set(meas, { autoAlpha: 1 }, 16.85);
    if (HAS.draw) tl.fromTo(measL, { drawSVG: '0%' }, { drawSVG: '100%', duration: 0.9, ease: 'power3.inOut' }, 16.85);
    tl.fromTo(measT, { opacity: 0 }, { opacity: 1, duration: 0.6 }, 17.1);
    roll(cols3, 17.0, 1.4);
    tl.call(function () { A.mNumW = A.mNum.offsetWidth; }, null, 16.9);
    verb('s3', 1, 17.5);
    show(board, 17.35);
    flap(city, 'CDMX', 17.45);
    flap(city, 'ATLANTA', 18.2);
    flap(city, 'NEW YORK', 18.95);
    flap(city, 'MIAMI', 19.7);
    flap(city, 'VANCOUVER', 20.4);
    verb('s3', 2, 18.5);
    titleOut('s3', 20.9); hide(board, 20.9);
    tl.to(meas, { autoAlpha: 0, duration: 0.35 }, 20.9)
      .to(st, { wave: 0, duration: 0.6, ease: 'power2.inOut' }, 20.95);

    /* ===== 04 · Video y motion (21.5 a 27 s) ===== */
    var stat4 = q('stat4'), cols4 = odo(stat4.querySelector('.odo'));
    var caps = Array.prototype.slice.call(A.caps.querySelectorAll('span'));
    flap(idx, '04', 21.4); icon('phone', 21.35);
    morph('phone', 21.3, 1.0);
    tl.set(st, { sp: 0.75, sw: 0.5, wx: 1.5, wy: 0.45, wz: 0.2, dx: 1, dy: 0, dz: 0, dw: 0.7 }, 20.8)
      .to(st, { dis: 1, duration: 0.8, ease: 'power1.in' }, 20.85)
      .to(st, { wx: 0.2, wy: 0.15, duration: 0.6, ease: 'power1.inOut' }, 21.55)
      .to(st, { dis: 0, duration: 0.7, ease: 'power2.inOut' }, 21.75);
    tl.to(st, { side: 1, y: 0, rx: 0, s: 1, ry: 3 * TAU + 0.22, duration: 1.0, ease: EWHIP }, 21.3)
      .to(st, { fBanner: 0, duration: 0.3 }, 21.4)
      .to(st, { fPhone: 1, duration: 0.5 }, 21.9)
      .fromTo(st, { ui: 0 }, { ui: 1, duration: 4.2, ease: 'none', immediateRender: false }, 22.0);
    titleIn('s4', 21.7);
    show(stat4, 22.1); roll(cols4, 22.15, 1.3);
    // Subtítulos tipo reel: cada palabra entra con su corte de cámara, exacto en el beat (22.5, 23.0, 23.5)
    // [tiempo, palabra, giro, escala, destello, sacudida]
    [[22.5, 0, 0.06, 1.06, 0.16, 0], [23.0, 1, -0.06, 1.06, 0.16, 0], [23.5, 2, 0.09, 1.11, 0.28, 0.4]].forEach(function (h) {
      var at = h[0];
      verb('s4', h[1], at);
      tl.fromTo(caps[h[1]], { opacity: 0, scale: 1.6 }, { opacity: 1, scale: 1, duration: 0.32, ease: 'back.out(2.6)' }, at)
        .set(st, { rz: h[2], sx: h[3], sy: h[3] }, at)
        .to(st, { rz: 0, sx: 1, sy: 1, duration: 0.42, ease: EOUT }, at + 0.01)
        .fromTo(flash, { opacity: h[4] }, { opacity: 0, duration: 0.3, ease: 'power2.out', immediateRender: false }, at);
      if (h[5]) shake(at, h[5]);
    });
    tl.to(caps, { opacity: 0, duration: 0.3 }, 25.7);
    titleOut('s4', 26.35); hide(stat4, 26.35);

    /* ===== 05 · Diseño web (27 a 32.5 s) ===== */
    var url = q('url'), urlT = url.querySelector('.k-type'), urlTxt = urlT.textContent;
    var cursorSvg = A.cursor.querySelector('svg'), ripple = A.ripple.querySelector('i'), liveS = A.live.querySelector('span');
    flap(idx, '05', 26.9); icon('web', 26.85);
    // El teléfono gira una vuelta y aterriza convertido en navegador
    morph('web', 26.8, 1.1);
    tl.to(st, { ry: 4 * TAU, rx: -0.08, duration: 1.1, ease: EWHIP }, 26.8)
      .to(st, { fPhone: 0, duration: 0.25 }, 26.95)
      .set(st, { ui: 0 }, 27.3)
      .to(st, { fWeb: 1, duration: 0.4 }, 27.5)
      .to(st, { ui: 1, duration: 1.9, ease: 'power1.inOut' }, 27.6);
    titleIn('s5', 27.2); verb('s5', 0, 27.6);
    show(url, 27.5);
    tl.set(urlT, { textContent: '' }, 27.5);
    type(urlT, urlTxt, 27.65, 0.8);
    verb('s5', 1, 28.6);
    tl.to(cursorSvg, { opacity: 1, duration: 0.2 }, 29.3)
      .fromTo(st, { cur: 0 }, { cur: 1, duration: 0.8, ease: 'power3.inOut', immediateRender: false }, 29.3)
      .to(cursorSvg, { scale: 0.82, duration: 0.08, yoyo: true, repeat: 1 }, 30.1)
      .fromTo(ripple, { scale: 0.3, opacity: 1 }, { scale: 1.8, opacity: 0, duration: 0.6, ease: 'power2.out', immediateRender: false }, 30.12)
      .to(st, { click: 1, duration: 0.15 }, 30.12);
    squash(30.12, 0.97, 0.97);
    verb('s5', 2, 30.12);
    tl.fromTo(liveS, { opacity: 0, scale: 0.5 }, { opacity: 1, scale: 1, duration: 0.45, ease: 'back.out(2.4)' }, 30.3)
      .to(st, { rx: -0.3, ry: 4 * TAU - 0.4, duration: 1.0, ease: EWHIP }, 30.4);
    titleOut('s5', 31.6); hide(url, 31.6);
    tl.to([cursorSvg, liveS], { opacity: 0, duration: 0.3 }, 31.6)
      .to(st, { click: 0, duration: 0.3 }, 32.0)
      .set(st, { cur: 0 }, 32.0);

    /* ===== Cierre (32.25 a 38 s): supercut de formas; el punto escribe el nombre y aterriza como punto final ===== */
    var nameEl = q('name'), nameT = q('nameT'), dim = q('dim');
    var dimL = dim.querySelector('.k-dim__l'), dimT = dim.querySelector('.k-dim__t');
    var dimA = dim.querySelector('.k-dim__a'), dimB = dim.querySelector('.k-dim__b');
    var nameLines = Array.prototype.slice.call(nameT.querySelectorAll('.kn'));
    NAME.c1 = splitChars(nameLines[0], true);
    NAME.c2 = splitChars(nameLines[1], true);
    measure();

    // Supercut: el objeto repasa a tiempo todas las formas que tomó (corcheas, 0.25 s)
    tl.to(st, { fWeb: 0, duration: 0.2 }, 32.2)
      .to(st, { side: 0, x: 0, y: 0, rx: 0, s: 0.78, fit: 1, float: 0, shadow: 1, duration: 0.45, ease: EWHIP }, 32.2);
    [['star', '01'], ['box', '02'], ['banner', '03'], ['phone', '04'], ['web', '05']].forEach(function (f, i) {
      var at = 32.25 + i * 0.25;
      morph(f[0], at, 0.24, EOUT);
      icon(f[0], at);
      flap(idx, f[1], at);
      tl.to(st, { ry: '+=' + (Math.PI / 2), duration: 0.24, ease: EOUT }, at)
        .fromTo(st, { sx: 1.14, sy: 0.88 }, { sx: 1, sy: 1, duration: 0.22, ease: 'power2.out', immediateRender: false }, at);
    });

    // Se encoge a punto y viaja al inicio de la primera línea
    var T0 = 33.5, LAND = 35.5, D1 = 0.6, CR = 0.26, D2 = 0.62;
    var W1 = LAND - (D1 + CR + D2), W2 = W1 + D1 + CR;
    morph('sphere', T0, 0.35, EWHIP);
    tl.set(st, { sp: 1.25, sw: 3.2, wx: 0, wy: 0.1, wz: 0, dx: -1, dy: 0, dz: 0, dw: 0.35 }, T0 - 0.2)
      .to(st, { dis: 1, duration: 0.42, ease: 'power2.in' }, T0 - 0.12)
      .to(st, { dis: 0, duration: 0.3, ease: 'power3.in' }, W1 - 0.3);
    flap(idx, '00', T0); icon('dot', T0);
    tl.call(measure, null, T0 - 0.05)
      .to(st, { s: 0.13, fit: 0, shadow: 0, rx: 0, duration: 0.35, ease: EWHIP }, T0)
      .set(nameEl, { autoAlpha: 1 }, T0)
      .set(NAME.c1.concat(NAME.c2), { yPercent: 120 }, T0)
      .set(st, { wp: 0 }, T0)
      .to(st, { wr: 1, duration: W1 - T0 - 0.04, ease: EWHIP }, T0 + 0.04);

    // Escritura: línea 1, retorno de carro en arco, línea 2 y aterrizaje en el punto
    tl.to(st, { wp: 1, duration: D1, ease: 'none' }, W1)
      .to(st, { wp: 2, duration: CR, ease: 'power2.inOut' }, W1 + D1)
      .to(st, { wp: 3, duration: D2, ease: 'none' }, W2);
    var FR = charFractions();
    function pop(c, at) {
      tl.fromTo(c, { yPercent: 120, scaleY: 1.55, transformOrigin: '50% 100%' }, { yPercent: 0, scaleY: 1, duration: 0.42, ease: 'back.out(2.2)', immediateRender: false, force3D: !LITE }, at);
    }
    NAME.c1.forEach(function (c, i) { pop(c, W1 + FR.f1[i] * D1 - 0.05); });
    NAME.c2.forEach(function (c, i) { pop(c, W2 + FR.f2[i] * D2 - 0.05); });
    squash(LAND, 1.38, 0.68);
    shake(LAND, 0.45);
    tl.to(st, { glow: 1.1, duration: 0.08, ease: 'power2.out' }, LAND)
      .to(st, { glow: 0.25, duration: 0.6, ease: 'power2.out' }, LAND + 0.08);

    // Cota técnica: 6 IN a 80 M, del tamaño exacto del nombre
    tl.set(dim, { autoAlpha: 1 }, LAND + 0.05);
    if (HAS.draw) tl.fromTo(dimL, { drawSVG: '50% 50%' }, { drawSVG: '0% 100%', duration: 0.6, ease: EOUT, immediateRender: false }, LAND + 0.05);
    tl.fromTo(dimT, { opacity: 0 }, { opacity: 1, duration: 0.3, immediateRender: false }, LAND + 0.4);
    function scramble(el, text, at) {
      tl.set(el, { textContent: '' }, at - 0.01);
      if (HAS.scr) tl.to(el, { duration: 0.4, scrambleText: { text: text, chars: '0123456789', speed: 1 }, ease: 'none' }, at);
      else tl.set(el, { textContent: text }, at);
    }
    scramble(dimA, '6 IN', LAND + 0.15);
    scramble(dimB, '80 M', LAND + 0.25);
    // El punto respira con el beat mientras se lee la firma
    [36.0, 36.5].forEach(function (b) {
      tl.to(st, { glow: 0.65, duration: 0.08 }, b).to(st, { glow: 0.25, duration: 0.4, ease: 'power2.out' }, b + 0.08);
    });

    // Salida: la cota se recoge, las letras bajan y el punto vuelve al centro (inicio del bucle)
    var OUT = 37.0;
    tl.to([dimA, dimB, dimT], { opacity: 0, duration: 0.25 }, OUT);
    if (HAS.draw) tl.to(dimL, { drawSVG: '50% 50%', duration: 0.35, ease: 'power3.in' }, OUT);
    tl.to(NAME.c2.slice().reverse().concat(NAME.c1.slice().reverse()), { yPercent: 120, duration: 0.36, ease: 'power3.in', stagger: 0.025, force3D: !LITE }, OUT + 0.05)
      .to(st, { wr: 0, duration: 0.55, ease: EWHIP }, OUT + 0.3)
      .set([nameEl, dim], { autoAlpha: 0 }, OUT + 0.8)
      .set([dimA, dimB, dimT], { opacity: 1 }, OUT + 0.8)
      .set([dimA, dimB], { textContent: '' }, OUT + 0.8)
      .to({}, { duration: 0.15 }, OUT + 0.85);

    gsap.ticker.add(function (time, dt) { if (running) { clock += Math.min(dt, 50) / 1000; render(); } });
    var running = false;
    render();

    var api = {
      tl: tl, st: st,
      play: function () { running = true; tl.play(); },
      pause: function () { running = false; tl.pause(); },
      seek: function (t) { tl.seek(t, false); clock = t; render(); }
    };
    return api;
  }

  window.JFReel = { init: init };
})();
