import * as THREE from 'three';
import { twin } from './scene.js';

/* Injury drill: turn the hurt part itself red, instead of a round glow.

   Bones    the skeleton model is made of separate bones, so the bone (or bones) at the hurt spot
            turn red. At a joint, only the ends of the bones that meet there do.
   Muscles  the muscle model is one fused surface with no separate muscles, so each muscle is a
            hand-drawn zone (MUSCLES below) painted onto it.
   Organs   each organ is its own model, so all of it turns red.

   markHurt() writes a per-vertex `aHurt` attribute that the organ shader (organs.js) reads:
   x = this vertex is red, y = red only close to the hurt spot. */

/* Muscle zones, measured on the muscle model seen from the front or the back.
   at   = the body spot that picks this zone: [x, v] as in src/ui/injury-library.js
          (x = world units from the centre line, v = height from the feet 0..1)
   back = the zone is on the back of the body
   caps = the muscle's shape, one or more thick lines: [x1, v1, x2, v2, radius, taper]
          taper 0 = same width all along, 1 = pointed ends (default .45, like a muscle belly)
   One-sided zones are written for the astronaut's left (+x) and mirrored for the right. */
const SIDE_MUSCLES = [
  { name: 'deltoid',  at: [.6, .805],  caps: [[.56, .825, .67, .765, .115, .25]] },
  { name: 'bicep',    at: [.7, .735],  caps: [[.58, .762, .84, .685, .115, .4]] },
  { name: 'tricep',   at: [.7, .735],  back: true, caps: [[.6, .752, .86, .682, .115, .4]] },
  { name: 'forearm',  at: [1.0, .62],  caps: [[.92, .69, 1.2, .6, .1, .35]] },
  { name: 'side',     at: [.26, .7],   caps: [[.34, .715, .36, .62, .085, .3]] },
  { name: 'hip',      at: [.3, .52],   caps: [[.3, .535, .34, .47, .1, .3]] },
  { name: 'thigh',    at: [.32, .4],   caps: [[.29, .46, .37, .31, .14]] },
  { name: 'shin',     at: [.42, .19],  caps: [[.44, .24, .53, .08, .07]] },
  { name: 'calf',     at: [.42, .21],  back: true, caps: [[.4, .27, .43, .15, .14, .35]] },
];
const MID_MUSCLES = [
  { name: 'chest',      at: [0, .775], caps: [[.1, .775, .36, .768, .12, .3], [-.1, .775, -.36, .768, .12, .3]] },
  { name: 'abs',        at: [0, .6],   caps: [[0, .695, 0, .52, .2, .2]] },
  { name: 'neck',       at: [0, .885], caps: [[0, .875, 0, .845, .09, 0]] },
  { name: 'hips',       at: [0, .5],   caps: [[-.2, .5, .2, .5, .1, .2]] },
  { name: 'upper back', at: [0, .78],  back: true, caps: [[-.3, .79, .3, .79, .15, .15]] },
  { name: 'lower back', at: [0, .6],   back: true, caps: [[0, .67, 0, .55, .16, .2]] },
];

// The zone for a body spot, mirrored to its side. Null if no zone is drawn for that spot.
function muscleZone(spot) {
  const side = spot.x < 0 ? -1 : 1;
  const fits = z => !!z.back === !!spot.back && Math.abs(z.at[0] - Math.abs(spot.x)) < .02 && Math.abs(z.at[1] - spot.v) < .012;
  const mid = MID_MUSCLES.find(fits);
  if (mid) return mid.caps;
  const one = SIDE_MUSCLES.find(fits);
  if (!one) return null;
  return one.caps.map(([x1, v1, x2, v2, r, t]) => [x1 * side, v1, x2 * side, v2, r, t]);
}

// Every zone on the front (or back) at once, both sides. Only for checking the zones against the model.
export function allMuscleCaps(back) {
  const pick = list => list.filter(z => !!z.back === !!back).flatMap(z => z.caps);
  const one = pick(SIDE_MUSCLES);
  return [...pick(MID_MUSCLES), ...one, ...one.map(([x1, v1, x2, v2, r, t]) => [-x1, v1, -x2, v2, r, t])];
}

/* Where every vertex really is, in the body's own space. The skeleton's and muscle model's limbs are
   bent in the vertex shader (organs.js LIMB_GLSL) to match the body's pose; this is the same maths on
   the CPU. Worked out once per pose and kept. */
function posedPositions(o) {
  if (o.posed && o.posedFor === o.rigDone) return o.posed;
  const g = o.graph, out = new Float32Array(g.total * 3);
  const B = twin.bodyBox, H = B.max.y - B.min.y, cx = (B.min.x + B.max.x) / 2, cz = (B.min.z + B.max.z) / 2;
  const t = [0, 0, 0];
  const turn = (e, x, y, z) => { t[0] = e[0] * x + e[3] * y + e[6] * z; t[1] = e[1] * x + e[4] * y + e[7] * z; t[2] = e[2] * x + e[5] * y + e[8] * z; };
  for (const m of g.meshes) {
    const base = m.userData.armBase, n = m.geometry.attributes.position.count;
    const arm = m.geometry.getAttribute('aArm')?.array, leg = m.geometry.getAttribute('aLeg')?.array;
    for (let i = 0; i < n; i++) {
      const gi = base + i;
      let x = g.px[gi], y = g.py[gi], z = g.pz[gi];
      const isLeg = !!leg && leg[i * 4] > (arm ? arm[i * 4] : 0);
      const a = isLeg ? leg : arm;
      const on = isLeg ? o.u.uLegOn.value : o.u.uArmOn.value;
      if (a && a[i * 4] > 0 && on > .5) {
        const w = a[i * 4], side = a[i * 4 + 1], wMid = a[i * 4 + 2], wEnd = a[i * 4 + 3];
        const l = isLeg ? 'Leg' : 'Arm', sd = side < 0 ? 'L' : 'R';
        const R = o.u[`u${l}Rot${sd}`].value, J = o.u[`u${l}Joint${sd}`].value;
        const px = side * (x - cx) / H, py = (y - B.min.y) / H, pz = (z - cz) / H;
        // end: turned by all three joints
        turn(R[2].elements, px - J[2].x, py - J[2].y, pz - J[2].z);
        turn(R[1].elements, J[2].x - J[1].x + t[0], J[2].y - J[1].y + t[1], J[2].z - J[1].z + t[2]);
        turn(R[0].elements, J[1].x - J[0].x + t[0], J[1].y - J[0].y + t[1], J[1].z - J[0].z + t[2]);
        const ex = J[0].x + t[0], ey = J[0].y + t[1], ez = J[0].z + t[2];
        // mid: turned by the first two
        turn(R[1].elements, px - J[1].x, py - J[1].y, pz - J[1].z);
        turn(R[0].elements, J[1].x - J[0].x + t[0], J[1].y - J[0].y + t[1], J[1].z - J[0].z + t[2]);
        const mx = J[0].x + t[0], my = J[0].y + t[1], mz = J[0].z + t[2];
        // top: turned by the first joint only
        turn(R[0].elements, px - J[0].x, py - J[0].y, pz - J[0].z);
        let qx = J[0].x + t[0], qy = J[0].y + t[1], qz = J[0].z + t[2];
        qx += (mx - qx) * wMid; qy += (my - qy) * wMid; qz += (mz - qz) * wMid;
        qx += (ex - qx) * wEnd; qy += (ey - qy) * wEnd; qz += (ez - qz) * wEnd;
        x = cx + side * (px + (qx - px) * w) * H;
        y = B.min.y + (py + (qy - py) * w) * H;
        z = cz + (pz + (qz - pz) * w) * H;
      }
      out[gi * 3] = x; out[gi * 3 + 1] = y; out[gi * 3 + 2] = z;
    }
  }
  o.posed = out;
  o.posedFor = o.rigDone;
  return out;
}

// Write the per-vertex red into each mesh. fill(i) returns [whole, nearSpot] for graph vertex i.
function writeHurt(g, fill) {
  for (const m of g.meshes) {
    const n = m.geometry.attributes.position.count, base = m.userData.armBase;
    let attr = m.geometry.getAttribute('aHurt');
    if (!attr) {
      attr = new THREE.BufferAttribute(new Float32Array(n * 2), 2);
      m.geometry.setAttribute('aHurt', attr);
    }
    for (let i = 0; i < n; i++) {
      const h = fill(base + i);
      attr.array[i * 2] = h[0];
      attr.array[i * 2 + 1] = h[1];
    }
    attr.needsUpdate = true;
  }
}

/* Bones: every bone that reaches the hurt spot. A bone hit near its middle (or a small bone) turns
   red all over; a long bone hit at its end (a joint) turns red only near the spot. */
function markBones(o, spot) {
  const g = o.graph, P = posedPositions(o), { root } = o.boneStats, c = spot.center;
  const reach = Math.max(.07, spot.radius * .55);
  const bones = new Map();   // root -> stats
  for (let i = 0; i < g.total; i++) {
    const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
    let b = bones.get(root[i]);
    if (!b) bones.set(root[i], b = { n: 0, sx: 0, sy: 0, sz: 0, near: Infinity, min: [x, y, z], max: [x, y, z] });
    b.n++; b.sx += x; b.sy += y; b.sz += z;
    b.near = Math.min(b.near, Math.hypot(x - c.x, y - c.y, z - c.z));
    b.min[0] = Math.min(b.min[0], x); b.min[1] = Math.min(b.min[1], y); b.min[2] = Math.min(b.min[2], z);
    b.max[0] = Math.max(b.max[0], x); b.max[1] = Math.max(b.max[1], y); b.max[2] = Math.max(b.max[2], z);
  }
  let hit = [...bones.values()].filter(b => b.near < reach);
  if (!hit.length) hit = [[...bones.values()].reduce((a, b) => (b.near < a.near ? b : a))];   // nothing in reach: the closest bone
  const NONE = [0, 0], WHOLE = [1, 0], END = [0, 1];
  hit.forEach(b => {
    const half = Math.hypot(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]) / 2;
    const fromMiddle = Math.hypot(b.sx / b.n - c.x, b.sy / b.n - c.y, b.sz / b.n - c.z);
    b.mark = fromMiddle < Math.max(reach, half * .5) ? WHOLE : END;
  });
  writeHurt(g, i => bones.get(root[i]).mark || NONE);
  return 'parts';
}

/* Muscles: paint the zone for this spot onto the muscle surface. Each line of the zone is laid on
   the surface (front or back), then every vertex close enough to it turns red. With no zone drawn
   for the spot, a solid patch at the spot is painted instead. */
function markMuscles(o, spot) {
  const g = o.graph, P = posedPositions(o);
  const B = twin.bodyBox, H = B.max.y - B.min.y, dir = spot.back ? -1 : 1;
  const zone = spot.caps || muscleZone(spot) || [[spot.x, spot.v, spot.x, spot.v, Math.max(.07, spot.radius * .7), 0]];
  // Line ends as [x, y]; z is found below: the surface is the frontmost (or backmost) vertex near each end.
  const ends = zone.flatMap(([x1, v1, x2, v2]) => [[x1, B.min.y + v1 * H], [x2, B.min.y + v2 * H]]);
  const surf = ends.map(() => -Infinity);
  const NEAR = .05 * .05;
  for (let i = 0; i < g.total; i++) {
    const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2] * dir;
    for (let e = 0; e < ends.length; e++) {
      const dx = x - ends[e][0], dy = y - ends[e][1];
      if (dx * dx + dy * dy < NEAR && z > surf[e]) surf[e] = z;
    }
  }
  if (surf.some(z => z === -Infinity)) return null;   // a line end is off the model: keep the round glow
  const caps = zone.map(([, , , , r, taper = .45], k) => {
    const a = ends[k * 2], b = ends[k * 2 + 1];
    // Sink the line a little under the surface so the red wraps the muscle, not just its front face.
    const az = (surf[k * 2] - r * .3) * dir, bz = (surf[k * 2 + 1] - r * .3) * dir;
    const d = [b[0] - a[0], b[1] - a[1], bz - az];
    return { ax: a[0], ay: a[1], az, d, len2: d[0] * d[0] + d[1] * d[1] + d[2] * d[2], r, taper };
  });
  const h = [0, 0];
  writeHurt(g, i => {
    const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
    let red = 0;
    for (const c of caps) {
      const px = x - c.ax, py = y - c.ay, pz = z - c.az;
      let t = .5;
      if (c.len2 > 0) t = Math.min(1, Math.max(0, (px * c.d[0] + py * c.d[1] + pz * c.d[2]) / c.len2));
      const dist = Math.hypot(px - c.d[0] * t, py - c.d[1] * t, pz - c.d[2] * t);
      const r = c.r * (1 - c.taper * (1 - Math.sin(Math.PI * t)));   // thick in the middle, thinner at the ends
      const k = Math.min(1, Math.max(0, (r - dist) / (r * .14)));     // crisp edge, a little soft
      if (k > red) red = k;
    }
    h[0] = red;
    return h;
  });
  return 'parts';
}

/* Turn the hurt part of organ k red. spot = twin.injurySpot. Returns how it was marked:
   'parts' (see the aHurt attribute), 'all' (the whole organ), or null (keep the round glow). */
export function markHurt(k, o, spot) {
  if (k === 'bones') return o.boneStats ? markBones(o, spot) : null;
  if (k === 'muscles') return markMuscles(o, spot);
  if (o.pairHalf) return null;   // eyes, ears: one of the two is hurt, the glow shows which
  return 'all';
}
