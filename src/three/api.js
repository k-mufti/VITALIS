import * as THREE from 'three';
import { $, $$, ease } from '../util.js';
import { scene, camera, renderer, host, pivot, HOME, cam, twin, flyTo, initScene, backdrop } from './scene.js';
import { REGIONS, uni, skin, loadBody, pt } from './body.js';
import { initDevPanel } from './devpanel.js';

/* The ONLY 3D functions the rest of the app should call (plan.md section 5.4).
   Anything inside src/three/ can change as long as these keep working. */

export function initTwin() {
  initScene();
  loadBody();
  initDevPanel();
}

// Highlight a region while the mouse is over its spot (null to clear).
export function setHoverOrgan(organId) {
  twin.hover = organId;
}

// Fly the camera into an organ and turn the body to glass.
export function focusOrgan(organId) {
  twin.focus = organId;
  twin.hover = null;
  twin.rotTarget = 0;
  twin.rot = 0;
  $('#spots').classList.add('hide');
  if (twin.body) {
    pivot.updateMatrixWorld();
    const p = pt(organId, 'core');
    flyTo({ pos: new THREE.Vector3(p.x, p.y, p.z + REGIONS[organId].dist + .6), look: p });
  }
  twin.ghostTarget = 1;
  backdrop.setVisible(false);
}

// Back to the full body. instant = jump with no camera flight.
export function resetView(instant) {
  twin.focus = null;
  twin.ghostTarget = 0;
  backdrop.setVisible(true);
  if (instant) {
    twin.fly = null;
    cam.pos.copy(HOME.pos);
    cam.look.copy(HOME.look);
    uni.uGhost.value = 0;
    $('#spots').classList.remove('hide');
    return;
  }
  flyTo({ pos: HOME.pos.clone(), look: HOME.look.clone(), done: () => twin.body && $('#spots').classList.remove('hide') }, 1200);
}

// Severity 0..1 per organ (plan.md 5.2). The worst organ drives the background halftone.
// TODO(3d): also tint the organ itself on the blue scale.
export function setOrganSeverity(organId, severity) {
  twin.severity[organId] = Math.min(1, Math.max(0, severity));
}

// TODO(3d): play a fix animation, resolve when it ends.
export function playFix(organId, fixId) {
  return Promise.resolve();
}

// TODO(3d): heart beats in sync with live data.
export function setHeartRate(bpm) {}

// TODO(3d): call callback(organId) when an organ mesh is clicked.
export function onOrganClick(callback) {}

// Called every frame from main.js. pulse = 0..1 from the open organ's animation.
const v = new THREE.Vector3();
export function renderTwin(now, pulse) {
  if (twin.autoTurn && !twin.focus) twin.rotTarget += .004;
  backdrop.update(now, Math.max(twin.testSeverity, ...Object.values(twin.severity)));
  twin.rot += (twin.rotTarget - twin.rot) * .08;
  pivot.rotation.y = twin.rot;
  if (twin.fly) {
    const k = ease(Math.min(1, (now - twin.fly.t0) / twin.fly.dur));
    cam.pos.lerpVectors(twin.fly.fromPos, twin.fly.pos, k);
    cam.look.lerpVectors(twin.fly.fromLook, twin.fly.look, k);
    if (k >= 1) { twin.fly.done?.(); twin.fly = null; }
  }
  const focus = twin.focus || twin.hover;
  uni.uHighlight.value += ((focus ? 1 : 0) - uni.uHighlight.value) * .1;
  uni.uGhost.value += (twin.ghostTarget - uni.uGhost.value) * .05;
  uni.uPulse.value = pulse;
  skin.depthWrite = uni.uGhost.value < .05;
  if (twin.body && focus) { uni.uRegionCenter.value.copy(pt(focus)); uni.uRegionRadius.value = REGIONS[focus].radius; }
  camera.position.copy(cam.pos); camera.lookAt(cam.look);
  renderer.render(scene, camera);
  if (twin.body) {
    pivot.updateMatrixWorld();
    const { width: w, height: h } = host.getBoundingClientRect();
    const show = Math.cos(twin.rot) > .5;
    $$('.spot').forEach(s => {
      v.copy(pt(s.dataset.sys)).project(camera);
      s.style.transform = `translate(${(v.x + 1) / 2 * w}px, ${(1 - v.y) / 2 * h}px)`;
      s.style.opacity = show ? '' : 0;
      s.style.pointerEvents = show ? '' : 'none';
    });
  }
}
