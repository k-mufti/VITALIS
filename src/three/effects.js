import * as THREE from 'three';

/*
  Visual styles for the 3D twin (values are set in look.js).

  uStyle 0  Halftone:   black body, paper-coloured dots on the edge + lit side.
  uStyle 1  Silhouette: flat pitch black.
  uStyle 2  Matte:      soft grey clay shading.
  uStyle 3  Outline:    paper-white body with a black ink edge.
  Aura:                 soft cyan glow shells around the body (any style).

  Hover:      region fills with cyan dots + thin cyan ring (systems with no organ model).
  Needs a look: the organ model itself shows through the body (organs.js, x-ray pass).
  Zoomed in:  body turns into an x-ray of black dots; focused region pulses cyan.
  Backdrop:   halftone glow + floor shadow behind the body (adaptive to health).
*/

const PAPER = '#f5f5f2';
export const STYLES = ['Halftone', 'Silhouette', 'Matte', 'Outline'];

// Extra uniforms for the body + aura shaders, merged into the body's uniforms.
export function halftoneUniforms(pixelRatio) {
  return {
    uPaper: { value: new THREE.Color(PAPER) },
    uCell: { value: 6 * pixelRatio },  // halftone cell size in device pixels
    uStyle: { value: 0 },
    uEdge: { value: .55 },             // 0..1 edge dot band
    uShade: { value: .2 },             // 0..1 dots on the lit side
    uAura: { value: 0 },               // 0..1 aura strength (0 = off)
    uAuraSize: { value: .06 },         // aura thickness in world units
    uAuraColor: { value: new THREE.Color('#0aa5bd') },
    // Outline style
    uOutWidth: { value: .45 },         // 0..1 how far the line reaches in from the edge
    uOutSoft: { value: .2 },           // 0..1 crisp ink -> soft charcoal
    uOutColor: { value: new THREE.Color('#0e0e0e') },
    uOutFill: { value: 0 },            // 0 paper white -> 1 black body
    uOutShade: { value: 0 },           // 0..1 soft light/shadow inside the body
    uOutDots: { value: 0 },            // 0..1 halftone dots in the shadows
    uTime: { value: 0 },
  };
}

// Shared vertex chunk: world position, view normal, view vector.
function addVaryings(sh) {
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vW; varying vec3 vN; varying vec3 vV;')
    .replace('#include <project_vertex>', `#include <project_vertex>
vW = (modelMatrix * vec4(transformed, 1.0)).xyz;
vN = normalize(normalMatrix * normal);
vV = -mvPosition.xyz;`);
}

// Body material. `uni` must hold the region + halftone uniforms.
export function createHalftoneSkin(uni) {
  const skin = new THREE.MeshBasicMaterial({ color: '#000000', transparent: true });
  // Mark the body's silhouette in the stencil buffer (organs shown through the body stay inside it).
  Object.assign(skin, { stencilWrite: true, stencilRef: 1, stencilFunc: THREE.AlwaysStencilFunc, stencilZPass: THREE.ReplaceStencilOp });
  skin.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, uni);
    addVaryings(sh);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vW; varying vec3 vN; varying vec3 vV;
uniform vec3 uRegionCenter, uCyan, uPaper, uOutColor;
uniform float uRegionRadius, uHighlight, uGhost, uPulse, uCell, uStyle, uEdge, uShade, uFade;
uniform float uOutWidth, uOutSoft, uOutFill, uOutShade, uOutDots;
uniform float uTime;
// 1 inside a dot of radius r (cell = 1), 0 outside, with a soft edge.
float dotMask(float d, float r) { return 1.0 - smoothstep(r - .06, r + .06, d); }`)
      .replace('#include <opaque_fragment>', `
vec3 n = normalize(vN);
// rim: 0 facing the camera, 1 at the silhouette edge.
float rim = 1.0 - clamp(abs(dot(n, normalize(vV))), 0.0, 1.0);
float lam = clamp(dot(n, normalize(vec3(-.55, .65, .55))), 0.0, 1.0);
// Screen-space halftone grid, rotated 45 degrees like print screens.
vec2 g = mat2(.7071, -.7071, .7071, .7071) * gl_FragCoord.xy / uCell;
float d = length(fract(g) - .5);

vec3 col = vec3(0.0);
if (uStyle < .5) {
  float htR = max(uEdge * smoothstep(.35, .97, rim) * .74, uShade * smoothstep(.45, 1.0, lam) * .45);
  col = mix(vec3(0.0), uPaper, dotMask(d, htR) * step(.03, htR));
} else if (uStyle < 1.5) {
  col = vec3(0.0);
} else if (uStyle < 2.5) {
  float l = .15 + .85 * lam;
  col = mix(vec3(.02), vec3(.5), l * l);
} else {
  // Outline: fill tone + optional shading + shadow dots, then the edge line on top.
  col = mix(uPaper * .93, vec3(.01), uOutFill);
  col *= mix(1.0, .3 + .7 * lam, uOutShade);
  float shadowR = uOutDots * smoothstep(.15, 1.0, 1.0 - lam) * .45;
  col = mix(col, uOutColor, dotMask(d, shadowR) * step(.03, shadowR));
  float lineLo = 1.0 - uOutWidth;
  col = mix(col, uOutColor, smoothstep(lineLo, min(lineLo + .02 + uOutSoft * .5, 1.0), rim));
}
col = mix(col, vec3(0.0), uGhost);

// Region highlight: cyan dots inside, thin cyan ring at the border.
float dR = distance(vW, uRegionCenter);
float region = (1.0 - smoothstep(uRegionRadius * .55, uRegionRadius, dR)) * uHighlight;
float ring = (1.0 - smoothstep(0.0, .035, abs(dR / uRegionRadius - .92))) * uHighlight;
float rDot = dotMask(d, mix(.26, .30 + .16 * uPulse, uGhost));
col = mix(col, uCyan, region * rDot * mix(.75, 1.0, uGhost));
col = mix(col, uCyan, ring);
outgoingLight = col;

// Zoomed in: only the dots stay visible (x-ray look).
float ink = dotMask(d, .09 + .42 * pow(rim, 1.6));
diffuseColor.a *= mix(1.0, clamp(ink * .6 + ring + region * rDot, 0.0, 1.0), uGhost);
// uFade: the écorché (muscle layer) crossfades in over the skin.
diffuseColor.a *= uFade;
#include <opaque_fragment>`);
  };
  return skin;
}

// Aura: a few soft glow shells pushed out along the normals. Returns one material per shell.
export function createAuraMaterials(uni, shells = 4) {
  const mats = [];
  for (let i = 1; i <= shells; i++) {
    const k = i / shells;
    const m = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false });
    m.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, uni);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uAuraSize;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>\ntransformed += normalize(normal) * uAuraSize * ${k.toFixed(3)};`);
      addVaryings(sh);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
varying vec3 vW; varying vec3 vN; varying vec3 vV;
uniform float uAura, uGhost, uFade; uniform vec3 uAuraColor;`)
        .replace('#include <opaque_fragment>', `
float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
outgoingLight = uAuraColor;
diffuseColor.a = pow(f, 1.6) * uAura * (1.0 - uGhost) * uFade * ${((1.15 - k) / shells * 1.8).toFixed(3)};
#include <opaque_fragment>`);
    };
    mats.push(m);
  }
  return mats;
}

// Halftone backdrop: a full-screen quad drawn behind the body (GPU, so it can animate).
// Adaptive mode follows plan.md 5.2: healthy = pale cyan, severe = deep navy,
// dots get denser and pulse faster as severity rises.
export function createHalftoneBackdrop(scene, renderer) {
  const u = {
    uRes: { value: new THREE.Vector2(1, 1) }, uDpr: { value: 1 }, uTime: { value: 0 }, uFade: { value: 1 },
    uIntensity: { value: 1 }, uCell: { value: 7 }, uDotScale: { value: .48 }, uShape: { value: 0 }, uAngle: { value: 45 },
    uGlowW: { value: 1 }, uGlowH: { value: 1 }, uGlowY: { value: .5 }, uFloor: { value: 1 },
    uGradient: { value: 0 }, uColA: { value: new THREE.Color('#c4c4be') }, uColB: { value: new THREE.Color('#0aa5bd') },
    uPulse: { value: 0 }, uPulseSpeed: { value: .25 },
    uAdaptive: { value: 0 }, uSeverity: { value: 0 },
    uHealthy: { value: new THREE.Color('#7FE9FF') }, uSevere: { value: new THREE.Color('#0A1F6B') },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms: u, transparent: true, depthTest: true, depthWrite: false,
    // Sits on the far plane with depth test on, so solid things inside the body (3D organs) stay in front of it.
    vertexShader: `void main() { gl_Position = vec4(position.xy, 1.0, 1.0); }`,
    fragmentShader: `
uniform vec2 uRes;
uniform float uDpr, uTime, uFade, uIntensity, uCell, uDotScale, uShape, uAngle, uGlowW, uGlowH, uGlowY, uFloor;
uniform float uGradient, uPulse, uPulseSpeed, uAdaptive, uSeverity;
uniform vec3 uColA, uColB, uHealthy, uSevere;
// Distance inside an ellipse: 0 at the centre, 1 on the edge.
float ell(vec2 p, vec2 c, vec2 r) { return length((p - c) / r); }
void main() {
  vec2 res = uRes / uDpr;                       // CSS pixels
  vec2 p = gl_FragCoord.xy / uDpr;
  p.y = res.y - p.y;                            // y down, like the page
  float h = res.y;
  float a = radians(uAngle);
  mat2 R = mat2(cos(a), sin(a), -sin(a), cos(a));
  vec2 g = R * p / uCell;
  vec2 pc = transpose(R) * ((floor(g) + .5) * uCell);   // centre of this dot's cell
  vec2 f = fract(g) - .5;
  float d = length(f);
  if (uShape > .5) d = max(abs(f.x), abs(f.y));
  if (uShape > 1.5) d = abs(f.y);

  vec2 glowC = vec2(res.x * .5, h * uGlowY);
  vec2 glowR = vec2(h * .42 * uGlowW, h * .62 * uGlowH);
  float gd = ell(pc, glowC, glowR);
  float glow = pow(max(0.0, 1.0 - gd), 1.6) * .55;
  float floorK = pow(max(0.0, 1.0 - ell(pc, vec2(res.x * .5, h * 1.02), vec2(h * .3, h * .07))), .7) * uFloor;

  float sev = uSeverity * uAdaptive;
  float speed = uPulseSpeed + 1.5 * sev;
  float pulseAmt = max(uPulse, sev * .6);
  float pulse = 1.0 + pulseAmt * .35 * sin(uTime * 6.2832 * speed - gd * 4.0);   // ripples outward
  float k = max(floorK, glow) * uIntensity * 1.6 * pulse * (1.0 + sev * .6);
  if (k < .04) discard;
  float r = min(k, 1.0) * uDotScale;
  float m = 1.0 - smoothstep(r - .04, r + .04, d);

  float t = 0.0;
  if (uGradient > .5) t = clamp(gd, 0.0, 1.0);
  if (uGradient > 1.5) t = clamp(pc.y / h, 0.0, 1.0);
  vec3 health = mix(uHealthy, uSevere, sev);
  vec3 colA = mix(uColA, health, uAdaptive);
  vec3 colB = mix(uColB, mix(health, uColB, .5), uAdaptive);
  gl_FragColor = vec4(mix(colA, colB, t), m * uFade);
  #include <colorspace_fragment>
}`,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  quad.frustumCulled = false;
  quad.renderOrder = -10;   // always first, behind the body
  scene.add(quad);

  let fadeTarget = 1;
  const size = new THREE.Vector2();
  return {
    uni: u,
    // Hide while the camera is zoomed into an organ.
    setVisible(on) { fadeTarget = on ? 1 : 0; },
    // Called every frame. severity 0..1 = how the astronaut is doing.
    update(now, severity) {
      renderer.getDrawingBufferSize(size);
      u.uRes.value.copy(size);
      u.uDpr.value = renderer.getPixelRatio();
      u.uTime.value = now / 1000;
      u.uFade.value += (fadeTarget - u.uFade.value) * .06;
      u.uSeverity.value += (severity - u.uSeverity.value) * .04;
    },
  };
}

// Fine halftone fill for the flat organ drawings in the Detail view.
export const ORGAN_HALFTONE_DEFS = `<defs><pattern id="ht" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
  <rect width="5" height="5" fill="#ffffff" fill-opacity=".6"/><circle cx="2.5" cy="2.5" r="1" fill="#0e0e0e" fill-opacity=".3"/></pattern></defs>`;
