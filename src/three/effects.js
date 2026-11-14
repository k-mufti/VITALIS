import * as THREE from 'three';

/*
  Halftone print look for the 3D twin.

  Body (solid):  pitch black. The silhouette edge breaks up into paper-coloured
                 halftone dots, like a newspaper photo.
  Hover:         the region fills with cyan dots and gets a thin cyan ring.
  Zoomed in:     the body turns into an x-ray of black dots (bigger at the edges),
                 the focused region pulses in cyan dots with the breath / heartbeat.
  Backdrop:      a halftone floor shadow and faint halo behind the body.
*/

const PAPER = '#f5f5f2';
const DOT_PX = 6;   // halftone cell size in CSS pixels

// Extra uniforms the halftone shader needs, merged into the body's uniforms.
export function halftoneUniforms(pixelRatio) {
  return {
    uPaper: { value: new THREE.Color(PAPER) },
    uCell: { value: DOT_PX * pixelRatio },
  };
}

// Pitch-black material with the halftone shader. `uni` must hold the region + halftone uniforms.
export function createHalftoneSkin(uni) {
  const skin = new THREE.MeshBasicMaterial({ color: '#000000', transparent: true });
  skin.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, uni);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vW; varying vec3 vN; varying vec3 vV;')
      .replace('#include <project_vertex>', `#include <project_vertex>
vW = (modelMatrix * vec4(transformed, 1.0)).xyz;
// MeshBasicMaterial only builds objectNormal for skinning / env maps.
#if defined( USE_ENVMAP ) || defined( USE_SKINNING )
vN = normalize(normalMatrix * objectNormal);
#else
vN = normalize(normalMatrix * normal);
#endif
vV = -mvPosition.xyz;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vW; varying vec3 vN; varying vec3 vV;
uniform vec3 uRegionCenter, uCyan, uPaper;
uniform float uRegionRadius, uHighlight, uGhost, uPulse, uCell;
// 1 inside a dot of radius r (cell = 1), 0 outside, with a soft edge.
float dotMask(float d, float r) { return 1.0 - smoothstep(r - .06, r + .06, d); }`)
      .replace('#include <opaque_fragment>', `
// rim: 0 facing the camera, 1 at the silhouette edge.
float rim = 1.0 - clamp(abs(dot(normalize(vN), normalize(vV))), 0.0, 1.0);
// Screen-space halftone grid, rotated 45 degrees like print screens.
vec2 g = mat2(.7071, -.7071, .7071, .7071) * gl_FragCoord.xy / uCell;
float d = length(fract(g) - .5);

// Solid: black, edge dissolves into paper dots.
// Wide edge band of dots, plus halftone "light" from the upper left so the form reads in dots.
float edge = smoothstep(.35, .97, rim);
float htLit = smoothstep(.45, 1.0, dot(normalize(vN), normalize(vec3(-.55, .65, .55))));
float htR = max(edge * .74, htLit * .42);
vec3 col = mix(vec3(0.0), uPaper, dotMask(d, htR) * step(.03, htR));
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

// Halftone backdrop canvas, drawn behind the WebGL canvas inside `host`.
export function createHalftoneBackdrop(host) {
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;transition:opacity .9s;';
  host.prepend(canvas);

  function draw() {
    const { width: w, height: h } = host.getBoundingClientRect();
    if (!w || !h) return;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const c = canvas.getContext('2d');
    c.scale(dpr, dpr);
    c.fillStyle = '#c4c4be';
    const s = 7, cos = Math.SQRT1_2, sin = Math.SQRT1_2, R = Math.hypot(w, h) / s;
    // Distance inside an ellipse: 0 at the centre, 1 on the edge.
    const ell = (x, y, cx, cy, rx, ry) => Math.hypot((x - cx) / rx, (y - cy) / ry);
    for (let i = -R; i < R; i++) {
      for (let j = -R; j < R; j++) {
        const x = w / 2 + (i * cos - j * sin) * s;
        const y = h / 2 + (i * sin + j * cos) * s;
        if (x < -s || y < -s || x > w + s || y > h + s) continue;
        // Body now fills the screen, so the floor shadow sits at the very bottom edge.
        const floor = Math.max(0, 1 - ell(x, y, w / 2, h * 1.02, h * .3, h * .07)) ** .7;
        const halo = Math.max(0, 1 - ell(x, y, w / 2, h * .5, h * .42, h * .62)) ** 1.6 * .55;
        const k = Math.max(floor, halo);
        if (k < .04) continue;
        c.beginPath();
        c.arc(x, y, k * s * .48, 0, Math.PI * 2);
        c.fill();
      }
    }
  }

  new ResizeObserver(draw).observe(host);
  return {
    // Hide the floor shadow while the camera is zoomed into an organ.
    setVisible(on) { canvas.style.opacity = on ? '1' : '0'; },
  };
}

// Fine halftone fill for the flat organ drawings in the Detail view.
export const ORGAN_HALFTONE_DEFS = `<defs><pattern id="ht" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
  <rect width="5" height="5" fill="#ffffff" fill-opacity=".6"/><circle cx="2.5" cy="2.5" r="1" fill="#0e0e0e" fill-opacity=".3"/></pattern></defs>`;
