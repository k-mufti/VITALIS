import * as THREE from 'three';

/*
  Visual styles for the 3D twin (all tunable from the FX panel, devpanel.js).

  uStyle 0  Halftone:   black body, paper-coloured dots on the edge + lit side.
  uStyle 1  Silhouette: flat pitch black.
  uStyle 2  Matte:      soft grey clay shading.
  uStyle 3  Outline:    paper-white body with a black ink edge.
  Aura:                 soft cyan glow shells around the body (any style).

  Hover:      region fills with cyan dots + thin cyan ring.
  Zoomed in:  body turns into an x-ray of black dots; focused region pulses cyan.
  Backdrop:   halftone floor shadow + halo behind the body.
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
  skin.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, uni);
    addVaryings(sh);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vW; varying vec3 vN; varying vec3 vV;
uniform vec3 uRegionCenter, uCyan, uPaper, uOutColor;
uniform float uRegionRadius, uHighlight, uGhost, uPulse, uCell, uStyle, uEdge, uShade;
uniform float uOutWidth, uOutSoft, uOutFill, uOutShade, uOutDots;
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
uniform float uAura, uGhost; uniform vec3 uAuraColor;`)
        .replace('#include <opaque_fragment>', `
float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
outgoingLight = uAuraColor;
diffuseColor.a = pow(f, 1.6) * uAura * (1.0 - uGhost) * ${((1.15 - k) / shells * 1.8).toFixed(3)};
#include <opaque_fragment>`);
    };
    mats.push(m);
  }
  return mats;
}

// Halftone backdrop canvas, drawn behind the WebGL canvas inside `host`.
export function createHalftoneBackdrop(host) {
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;transition:opacity .9s;';
  host.prepend(canvas);
  let strength = .5;

  function draw() {
    const { width: w, height: h } = host.getBoundingClientRect();
    if (!w || !h) return;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const c = canvas.getContext('2d');
    c.scale(dpr, dpr);
    if (strength <= 0) return;
    c.fillStyle = '#c4c4be';
    const s = 7, cos = Math.SQRT1_2, sin = Math.SQRT1_2, R = Math.hypot(w, h) / s;
    // Distance inside an ellipse: 0 at the centre, 1 on the edge.
    const ell = (x, y, cx, cy, rx, ry) => Math.hypot((x - cx) / rx, (y - cy) / ry);
    for (let i = -R; i < R; i++) {
      for (let j = -R; j < R; j++) {
        const x = w / 2 + (i * cos - j * sin) * s;
        const y = h / 2 + (i * sin + j * cos) * s;
        if (x < -s || y < -s || x > w + s || y > h + s) continue;
        const floor = Math.max(0, 1 - ell(x, y, w / 2, h * 1.02, h * .3, h * .07)) ** .7;
        const halo = Math.max(0, 1 - ell(x, y, w / 2, h * .5, h * .42, h * .62)) ** 1.6 * .55;
        const k = Math.max(floor, halo) * strength * 1.6;
        if (k < .04) continue;
        c.beginPath();
        c.arc(x, y, Math.min(k, 1) * s * .48, 0, Math.PI * 2);
        c.fill();
      }
    }
  }

  new ResizeObserver(draw).observe(host);
  return {
    // Hide while the camera is zoomed into an organ.
    setVisible(on) { canvas.style.opacity = on ? '1' : '0'; },
    // 0 = off, 1 = strong.
    setStrength(v) { strength = v; draw(); },
  };
}

// Fine halftone fill for the flat organ drawings in the Detail view.
export const ORGAN_HALFTONE_DEFS = `<defs><pattern id="ht" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
  <rect width="5" height="5" fill="#ffffff" fill-opacity=".6"/><circle cx="2.5" cy="2.5" r="1" fill="#0e0e0e" fill-opacity=".3"/></pattern></defs>`;
