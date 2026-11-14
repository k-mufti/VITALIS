import * as THREE from 'three';
import { $, $$, ease } from '../util.js';
import { scene, camera, renderer, host, pivot, HOME, cam, twin, flyTo, initScene, backdrop } from './scene.js';
import { REGIONS, uni, skin, loadBody, pt } from './body.js';
import { organs, loadOrgan, prefetchOrgans, updateOrgans, has3dOrgan } from './organs.js';
import { DRAWINGS } from './organ-drawings.js';
import { initAnatomyPanel } from './anatomy-panel.js';
import { initDevPanel } from './devpanel.js';

/* The ONLY 3D functions the rest of the app should call (plan.md section 5.4).
   Anything inside src/three/ can change as long as these keep working. */

export function initTwin() {
  initScene();
  loadBody();
  initAnatomyPanel(setHoverOrgan);
  initDevPanel();
}

// Layers that show the body as glass, so what's inside can be seen.
const GLASS_LAYERS = ['skeleton', 'organs'];

// Highlight a region while the mouse is over its spot (null to clear).
export function setHoverOrgan(organId) {
  twin.hover = organId;
}

// Fly the camera into an organ and turn the body to glass.
// If the organ has a 3D model it scans in once loaded; until then the camera frames the body region.
export function focusOrgan(organId) {
  twin.focus = organId;
  twin.focusAt = performance.now();
  twin.hover = null;
  twin.rotTarget = 0;
  twin.rot = 0;
  pivot.rotation.y = 0;
  $('#spots').classList.add('hide');
  if (twin.body) {
    pivot.updateMatrixWorld();
    frameOrgan(organId, 1500);
  }
  twin.ghostTarget = 1;
  backdrop.setVisible(false);
  if (has3dOrgan(organId) && !organs[organId]?.group) {
    loadOrgan(organId).then(o => {
      if (twin.focus !== organId) return;
      if (o.failed) { $('#organ').innerHTML = DRAWINGS[organId]; return; }
      $('#organ').innerHTML = '<svg viewBox="0 0 400 400"></svg>';
      frameOrgan(organId, 1100);
    });
  }
}

// Camera flight to the organ model (or the body region if there is no model yet), then orbit there.
function frameOrgan(organId, dur) {
  const o = organs[organId];
  let point, dist;
  if (o?.frame) {
    point = o.frame.point.clone();
    dist = o.frame.dist;
  } else {
    point = pt(organId, 'core');
    dist = REGIONS[organId].dist + .6;
  }
  Object.assign(twin.orbit, { on: true, base: dist, dist, distT: dist, yaw: 0, yawT: 0, pitch: 0, pitchT: 0 });
  twin.orbit.focus.copy(point);
  flyTo({ pos: point.clone().add(new THREE.Vector3(0, 0, dist)), look: point.clone() }, dur);
}

// Back to the full body. instant = jump with no camera flight.
export function resetView(instant) {
  twin.focus = null;
  twin.ghostTarget = 0;
  twin.orbit.on = false;
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
let lastNow = performance.now(), prefetched = false;
export function renderTwin(now, pulse) {
  const dt = Math.min(.05, (now - lastNow) / 1000);
  lastNow = now;
  const follow = rate => 1 - Math.exp(-dt * rate);
  // Start loading the heart and lungs once sign-in is over, so the parse doesn't stutter the fingerprint screen.
  if (!prefetched && twin.body && !$('#signin')) { prefetched = true; prefetchOrgans(); }

  if (twin.autoTurn && !twin.focus) twin.rotTarget += .004;
  backdrop.update(now, Math.max(twin.testSeverity, ...Object.values(twin.severity)));
  twin.rot += (twin.rotTarget - twin.rot) * .08;
  pivot.rotation.y = twin.rot;
  const orbit = twin.orbit;
  if (twin.fly) {
    const k = ease(Math.min(1, (now - twin.fly.t0) / twin.fly.dur));
    cam.pos.lerpVectors(twin.fly.fromPos, twin.fly.pos, k);
    cam.look.lerpVectors(twin.fly.fromLook, twin.fly.look, k);
    if (k >= 1) { twin.fly.done?.(); twin.fly = null; }
  } else if (orbit.on) {
    orbit.yaw += (orbit.yawT - orbit.yaw) * .1;
    orbit.pitch += (orbit.pitchT - orbit.pitch) * .1;
    orbit.dist += (orbit.distT - orbit.dist) * .1;
    cam.look.copy(orbit.focus);
    cam.pos.set(Math.sin(orbit.yaw) * Math.cos(orbit.pitch), Math.sin(orbit.pitch), Math.cos(orbit.yaw) * Math.cos(orbit.pitch))
      .multiplyScalar(orbit.dist).add(orbit.focus);
  }
  updateOrgans(now, dt);

  // Wherever the écorché is showing, it replaces the skin.
  let fadeTarget = 1;
  if (organs.muscles?.group?.visible && organs.muscles.reveal > .25) fadeTarget = 0;
  uni.uFade.value += (fadeTarget - uni.uFade.value) * follow(3.5);
  if (twin.body) twin.body.visible = uni.uFade.value > .01;

  const focus = twin.focus || twin.hover;
  // Once a 3D organ is showing, the skin's own cyan region glow steps aside.
  const skinGlow = twin.hover || (twin.focus && !organs[twin.focus]?.group?.visible);
  uni.uHighlight.value += ((skinGlow ? 1 : 0) - uni.uHighlight.value) * follow(6);
  let ghostGoal = twin.ghostTarget;
  if (!twin.focus && GLASS_LAYERS.includes(twin.layer)) ghostGoal = 1;
  uni.uGhost.value += (ghostGoal - uni.uGhost.value) * follow(3);
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
