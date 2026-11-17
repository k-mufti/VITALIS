// VITALIS logo: a small Vitaly orb (flat blue water layers, cyan halftone dots, crisp cyan edge)
// with VITALIS in navy Michroma to its right. The water always flows; the cursor pulls it when nearby. Replaces the black slab (the holographic tilt in logo-holo.js still applies).
// The real text stays in the page for screen readers.

const logos = [...document.querySelectorAll('.logo, .corner.tl')];

const DEEP = [10, 31, 107], BODY = [24, 70, 196], DOT = [127, 233, 255];
const LX = -0.55, LY = -0.65, LZ = 0.55, LN = Math.hypot(LX, LY, LZ);   // light: upper left, as on the organs
const FONT = "'Michroma', 'Arial', sans-serif", SPACING = 0.22;
const LAYERS = 5, N = 96;
const mix = (a, b, f) => a.map((v, i) => Math.round(v + (b[i] - v) * f));
const css = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

if (logos.length) {
  const font = document.createElement('link');
  font.rel = 'stylesheet';
  font.href = 'https://fonts.googleapis.com/css2?family=Michroma&display=swap';
  document.head.appendChild(font);

  const style = document.createElement('style');
  style.textContent = `
    .logo.logo-orb, .corner.tl.logo-orb { background: none; border: 0; padding: 0; overflow: visible; font-size: 0; color: transparent; }
    .logo.logo-orb::before, .logo.logo-orb::after, .corner.tl.logo-orb::before, .corner.tl.logo-orb::after { display: none; }
    .logo-orb > canvas.logo-badge { display: block; pointer-events: none; }`;
  document.head.appendChild(style);

  // Orb height and word size: top bar, and the smaller corner on the sign-in screen.
  const items = logos.map(el => {
    const small = el.matches('.corner');
    const cv = document.createElement('canvas');
    cv.className = 'logo-badge';
    cv.setAttribute('aria-hidden', 'true');
    el.setAttribute('aria-label', el.textContent.trim());
    el.appendChild(cv);
    el.classList.add('logo-orb');
    return { el, cv, ctx: cv.getContext('2d'), H: small ? 34 : 42, size: small ? 14 : 18.5, pull: 0, mx: null, my: null };
  });

  addEventListener('pointermove', e => {
    for (const it of items) {
      const r = it.cv.getBoundingClientRect();
      it.mx = e.clientX - r.left; it.my = e.clientY - r.top;
    }
  }, { passive: true });

  const setFont = (ctx, size) => {
    ctx.font = `400 ${size}px ${FONT}`;
    if ('letterSpacing' in ctx) ctx.letterSpacing = `${size * SPACING}px`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
  };
  // The word starts a little to the right of the orb.
  const wordAt = (ctx, it) => {
    setFont(ctx, it.size);
    ctx.textAlign = 'left';
    const x = it.H * 1.3, y = it.H / 2 + it.size * 0.04;
    ctx.fillText('VITALIS', x, y);
    if (ctx.lineWidth > 0.5) ctx.strokeText('VITALIS', x, y);   // a touch heavier than Michroma's one weight
  };

  const measure = it => {
    // Width of the letters plus the spacing between them (counted by hand: not every browser
    // includes letter spacing in measureText).
    const m = document.createElement('canvas').getContext('2d');
    setFont(m, it.size);
    if ('letterSpacing' in m) m.letterSpacing = '0px';
    const tw = m.measureText('VITALIS').width + it.size * SPACING * 6;
    it.W = Math.ceil(it.H * 1.3 + tw + 4);
    it.dpr = Math.min(3, devicePixelRatio || 1);
    it.cv.width = Math.round(it.W * it.dpr); it.cv.height = Math.round(it.H * it.dpr);
    it.cv.style.width = it.W + 'px'; it.cv.style.height = it.H + 'px';
  };

  const draw = (it, t, dt) => {
    const { ctx, W, H, dpr } = it;
    const ox = H / 2, oy = H / 2, R = H * 0.45;
    // Pull toward the cursor when it is within about three orb radii.
    const d = it.mx == null ? 1e9 : Math.hypot(it.mx - ox, it.my - oy);
    it.pull += (smooth(R * 3.5, R, d) - it.pull) * (1 - Math.exp(-dt * 5));
    const pa = it.mx == null ? 0 : Math.atan2(it.my - oy, it.mx - ox);
    const speed = 1 + it.pull * 1.2;
    const rad = [];
    for (let k = 0; k < LAYERS; k++) {
      const f = k / (LAYERS - 1), base = R * (0.98 - f * 0.6), sp = (1 + k * 0.2) * speed, arr = new Float32Array(N);
      for (let i = 0; i < N; i++) {
        const a = i / N * Math.PI * 2;
        const r = 0.05 * Math.sin(2 * a + t * 1.1 * sp + k * 1.3) + 0.035 * Math.sin(3 * a - t * 1.5 * sp + k * 0.7)
          + 0.02 * Math.sin(5 * a + t * 1.2 * sp - k) + it.pull * 0.1 * Math.max(0, Math.cos(a - pa)) ** 6;
        arr[i] = base * (1 + r * (1 - f * 0.35));
      }
      rad.push(arr);
    }
    const path = k => {
      ctx.beginPath();
      for (let i = 0; i <= N; i++) {
        const a = i / N * Math.PI * 2, r = rad[k][i % N];
        i ? ctx.lineTo(ox + Math.cos(a) * r, oy + Math.sin(a) * r) : ctx.moveTo(ox + Math.cos(a) * r, oy + Math.sin(a) * r);
      }
      ctx.closePath();
    };

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    // Water layers: navy outside, bright organ blue in the middle.
    ctx.lineWidth = 0.6;
    for (let k = 0; k < LAYERS; k++) {
      path(k);
      ctx.fillStyle = css(mix(DEEP, BODY, 0.3 + 0.7 * k / (LAYERS - 1)));
      ctx.fill();
      if (k) { ctx.strokeStyle = css(DEEP, 0.35); ctx.stroke(); }
    }
    // Halftone dots on a 45-degree screen: big at the rim, on the lit side and along each layer's edge.
    const cell = 2.4, s = cell * Math.SQRT1_2 * 1.35, span = R * 1.1;
    const dots = new Path2D();
    for (let u = -span * 1.42; u <= span * 1.42; u += cell) {
      for (let v = -span * 1.42; v <= span * 1.42; v += cell) {
        const dx = (u - v) * Math.SQRT1_2, dy = (u + v) * Math.SQRT1_2, rho = Math.hypot(dx, dy);
        if (rho > span) continue;
        let a = Math.atan2(dy, dx); if (a < 0) a += Math.PI * 2;
        const ia = Math.round(a / (Math.PI * 2) * N) % N;
        if (rho > rad[0][ia]) continue;
        let k = LAYERS - 1; while (k > 0 && rho > rad[k][ia]) k--;
        const nx = dx / (R * 0.95), ny = dy / (R * 0.95), nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
        const lam = Math.max(0, (nx * LX + ny * LY + nz * LZ) / LN);
        const size = Math.max(smooth(0.35, 0.97, 1 - nz) * 0.74, smooth(0.4, 1, lam) * 0.55, smooth(0.82, 1, rho / rad[k][ia]) * (0.5 - k * 0.05));
        const x = ox + dx, y = oy + dy;
        if (size < 0.08) continue;
        const r = Math.min(0.5, size * 0.5) * s;
        dots.moveTo(x + r, y); dots.arc(x, y, r, 0, Math.PI * 2);
      }
    }
    ctx.save(); path(0); ctx.clip();
    ctx.fillStyle = css(DOT); ctx.fill(dots);
    ctx.restore();
    path(0); ctx.strokeStyle = css(DOT, 0.9); ctx.lineWidth = 1; ctx.stroke();

    // The word, in navy beside the orb.
    ctx.fillStyle = ctx.strokeStyle = css(DEEP); ctx.lineWidth = it.size * 0.045; ctx.lineJoin = 'round';
    wordAt(ctx, it);
  };

  let last = performance.now(), t = 0;
  const frame = now => {
    requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    t += dt;
    for (const it of items) if (it.el.isConnected && it.el.offsetParent) draw(it, t, dt);
  };
  const start = () => { items.forEach(measure); requestAnimationFrame(frame); };
  // Wait for the font's stylesheet, then the font itself (a fallback font is used if either fails).
  new Promise(r => { font.onload = font.onerror = r; setTimeout(r, 3000); })
    .then(() => document.fonts && document.fonts.load('400 12px Michroma'))
    .catch(() => {})
    .then(start);
}
