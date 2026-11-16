// The Vitaly orb on the Body view (bottom left), so people can see where to click instead of
// having to know about "Hey Vitaly". Drawn like the big orb in vitaly.js: flat blue water layers,
// cyan halftone dots on a 45-degree screen, a crisp cyan edge. It always flows a little.
// As the cursor comes near it wakes up: it swells, flows faster, its dots grow and the water
// bulges toward the cursor. Moving onto it makes a splash; clicking it opens Vitaly.

const DEEP = [10, 31, 107], BODY = [24, 70, 196], DOT = [127, 233, 255];
const LAYERS = 6, N = 144;
const LX = -0.55, LY = -0.65, LZ = 0.55, LN = Math.hypot(LX, LY, LZ);   // light: upper left, as on the organs
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const mix = (a, b, f) => a.map((v, i) => Math.round(v + (b[i] - v) * f));
const css = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

export function startCallOrb(onClick) {
  const btn = document.getElementById('vCall');
  const canvas = document.getElementById('vCallOrb');
  if (!btn || !canvas) return;
  const ctx = canvas.getContext('2d');

  // Cursor position relative to the canvas, tracked page-wide so the orb reacts before it is touched.
  let mx = null, my = null, near = 0, splash = 0, kick = 0, wasInside = false, pa = 0, phase = 0, last = performance.now();
  addEventListener('pointermove', e => {
    const r = canvas.getBoundingClientRect();
    mx = e.clientX - r.left; my = e.clientY - r.top;
  }, { passive: true });
  document.addEventListener('pointerleave', () => { mx = my = null; });
  btn.addEventListener('click', () => { kick = 1; onClick(); });

  const rad = Array.from({ length: LAYERS }, () => new Float32Array(N));

  const draw = now => {
    requestAnimationFrame(draw);
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (!btn.offsetParent || document.hidden) return;   // not on screen

    const dpr = Math.min(3, devicePixelRatio || 1);
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.4;   // room for the swell and the bulge
    const d = mx == null ? 1e9 : Math.hypot(mx - cx, my - cy);
    near += (smooth(R * 2.6, R * 0.8, d) - near) * (1 - Math.exp(-dt * 6));
    const inside = d < R;
    if (inside && !wasInside) splash = 1;
    wasInside = inside;
    splash *= Math.exp(-dt * 2.2);
    kick *= Math.exp(-dt * 4);
    if (mx != null) pa += Math.atan2(Math.sin(Math.atan2(my - cy, mx - cx) - pa), Math.cos(Math.atan2(my - cy, mx - cx) - pa)) * (1 - Math.exp(-dt * 8));
    phase += dt * (0.9 + near * 2.2 + kick * 3);
    const swell = 1 + near * 0.07 + kick * 0.06;

    for (let k = 0; k < LAYERS; k++) {
      const f = k / (LAYERS - 1);
      const base = R * (0.86 - f * 0.5) * swell;
      const sp = 1 + k * 0.18, keep = 1 - f * 0.35;
      const wLow = 0.05 + near * 0.04, wMid = 0.035 + near * 0.035, wHigh = 0.01 + near * 0.02;
      for (let i = 0; i < N; i++) {
        const a = (i / N) * Math.PI * 2;
        const r = wLow * Math.sin(2 * a + phase * sp + k * 1.3)
          + wMid * Math.sin(3 * a - phase * sp * 1.4 + k * 0.7)
          + wMid * 0.6 * Math.sin(5 * a + phase * sp * 1.1 - k)
          + wHigh * Math.sin(8 * a - phase * sp * 2.4 + k * 2)
          + wHigh * 0.6 * Math.sin(13 * a + phase * sp * 3.1 - k * 1.7)
          + near * (0.14 - f * 0.05) * Math.max(0, Math.cos(a - pa)) ** 6
          + splash * (0.08 - f * 0.04) * Math.sin(7 * a - phase * 4 + k * 0.9);
        rad[k][i] = base * (1 + r * keep);
        if (k) rad[k][i] = Math.min(rad[k][i], rad[k - 1][i] * 0.97);   // inner water never pokes past the edge
      }
    }
    const path = k => {
      ctx.beginPath();
      for (let i = 0; i <= N; i++) {
        const a = (i / N) * Math.PI * 2, r = rad[k][i % N];
        const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
        if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      ctx.closePath();
    };

    // Flat layers: navy outside, brighter blue toward the middle.
    ctx.lineWidth = 1.2;
    for (let k = 0; k < LAYERS; k++) {
      path(k);
      ctx.fillStyle = css(mix(DEEP, BODY, 0.3 + (k / (LAYERS - 1)) * 0.7));
      ctx.fill();
      if (k) { ctx.strokeStyle = css(DEEP, 0.35); ctx.stroke(); }
    }

    // Halftone dots: big at the rim, on the lit side, along each layer's edge, and in the core.
    const cell = 4.4, s = cell / Math.SQRT2, Ro = R * 0.9 * swell, reach = R * 1.35, coreR = R * (0.18 + near * 0.06);
    const dots = new Path2D();
    for (let u = -reach; u <= reach; u += cell) {
      for (let v = -reach; v <= reach; v += cell) {
        const dx = (u - v) * Math.SQRT1_2, dy = (u + v) * Math.SQRT1_2, rho = Math.hypot(dx, dy);
        let ang = Math.atan2(dy, dx); if (ang < 0) ang += Math.PI * 2;
        const ia = Math.round((ang / (Math.PI * 2)) * N) % N;
        if (rho > rad[0][ia]) continue;
        let k = LAYERS - 1;
        while (k > 0 && rho > rad[k][ia]) k--;
        const nx = dx / Ro, ny = dy / Ro, nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
        const lam = Math.max(0, (nx * LX + ny * LY + nz * LZ) / LN);
        const size = Math.max(
          smooth(0.35, 0.97, 1 - nz) * 0.74 * (rho / rad[0][ia]),
          smooth(0.4, 1, lam) * 0.6,
          smooth(0.82, 1, rho / rad[k][ia]) * (0.55 - k * 0.05),
          rho < coreR ? 0.6 * (1 - rho / coreR) + 0.2 : 0,
        ) * (1 + near * 0.35 + kick * 0.3);
        if (size < 0.06) continue;
        const r = Math.min(0.5, size * 0.5) * s * 1.35;
        dots.moveTo(cx + dx + r, cy + dy);
        dots.arc(cx + dx, cy + dy, r, 0, Math.PI * 2);
      }
    }
    ctx.save(); path(0); ctx.clip();
    ctx.fillStyle = css(DOT); ctx.fill(dots);
    ctx.restore();
    path(0); ctx.strokeStyle = css(DOT, 0.85 + near * 0.15); ctx.lineWidth = 1.5 + near; ctx.stroke();
  };
  requestAnimationFrame(draw);
}
