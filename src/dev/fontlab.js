// Font + logo lab (dev only: loads with ?dev). Cycles type pairings and VITALIS logo styles.
// Keys: F / Shift+F = next / previous font, L / Shift+L = next / previous logo.
// Nothing here ships: without ?dev this file returns straight away.

// head = logo + headings, cond = labels/tabs/numbers (--cond), sans = body text (--sans)
const FONTS = [
  { name: 'Barlow (now)',     note: 'current signage pair',
    head: 'Barlow Condensed', cond: 'Barlow Condensed', sans: 'Barlow', load: [] },
  { name: 'Big Shoulders',    note: 'stadium wayfinding, tall + tight',
    head: 'Big Shoulders Display', cond: 'Big Shoulders Display', sans: 'Barlow', headW: 800, track: .06,
    load: ['Big+Shoulders+Display:wght@400..900'] },
  { name: 'Michroma',         note: 'wide flight-deck caps',
    head: 'Michroma', cond: 'Michroma', sans: 'Manrope', headW: 400, condScale: .74,
    load: ['Michroma', 'Manrope:wght@400..700'] },
  { name: 'Chakra Petch',     note: 'cut corners, HUD',
    head: 'Chakra Petch', cond: 'Chakra Petch', sans: 'Chakra Petch',
    load: ['Chakra+Petch:wght@400;500;600;700'] },
  { name: 'Stencil',          note: 'painted on the hull',
    head: 'Saira Stencil One', cond: 'Saira Condensed', sans: 'Saira', headW: 400,
    load: ['Saira+Stencil+One', 'Saira+Condensed:wght@400;500;600;700', 'Saira:wght@400..700'] },
  { name: 'Syncopate',        note: 'ultra-wide, airy',
    head: 'Syncopate', cond: 'Syncopate', sans: 'Manrope', condScale: .68,
    load: ['Syncopate:wght@400;700', 'Manrope:wght@400..700'] },
  { name: 'Unbounded',        note: 'chunky, soft, loud',
    head: 'Unbounded', cond: 'Unbounded', sans: 'DM Sans', headW: 800, condScale: .74, track: .04,
    load: ['Unbounded:wght@400..900', 'DM+Sans:wght@400..700'] },
  { name: 'Telemetry',        note: 'mono readout',
    head: 'Space Mono', cond: 'Space Mono', sans: 'Space Grotesk', condScale: .88,
    load: ['Space+Mono:wght@400;700', 'Space+Grotesk:wght@400..700'] },
  { name: 'Tektur',           note: 'angular sci-fi, still readable',
    head: 'Tektur', cond: 'Tektur', sans: 'Barlow', headW: 800,
    load: ['Tektur:wght@400..900'] },
  { name: 'Glitch',           note: 'crazy: broken signal logo',
    head: 'Rubik Glitch', cond: 'Oxanium', sans: 'Oxanium', headW: 400,
    load: ['Rubik+Glitch', 'Oxanium:wght@400..800'] },
  { name: 'Neon',             note: 'crazy: tube-light logo',
    head: 'Monoton', cond: 'Bebas Neue', sans: 'Barlow', headW: 400, track: .08,
    load: ['Monoton', 'Bebas+Neue'] },
];

// Logo styles for the bar logo + sign-in corner. Each returns inner HTML.
const MARK = `<svg class="fl-mark" viewBox="0 0 26 24" aria-hidden="true">
  <path d="M2 4 L9.5 20 L13 10.5" />
  <path class="c" d="M13 10.5 L15.2 15 L17.6 4 L19.4 9 L24 9" /></svg>`;
const LOGOS = [
  { name: 'Plain',   html: () => 'VITALIS' },
  { name: 'Slab',    html: () => '<span class="fl-slab">VITALIS</span>' },
  { name: 'Lambda',  html: () => 'VIT<b class="fl-c">Λ</b>LIS' },
  { name: 'Pulse',   html: () => `<span class="fl-pulse">VITALIS<svg viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true"><path d="M0 6 H38 L42 1 L46 9 L50 3 L53 6 H100"/></svg></span>` },
  { name: 'Mark',    html: () => `<span class="fl-row">${MARK}<span>VITALIS</span></span>` },
  { name: 'Split',   html: () => 'VITA<span class="fl-out">LIS</span>' },
  { name: 'Dots',    html: () => '<span class="fl-low">v<span class="fl-i">ı</span>tal<span class="fl-i">ı</span>s</span>' },
  { name: 'Bracket', html: () => '<span class="fl-br">[</span>VITALIS<span class="fl-br">]</span><i class="fl-sq"></i>' },
];

const KEY = 'vitalis.fontlab';
let state = { f: 0, l: 0 };

function init() {
  try { Object.assign(state, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch {}
  injectCss();
  const go = () => { buildUi(); apply(); };
  document.readyState === 'loading' ? addEventListener('DOMContentLoaded', go) : go();
  addEventListener('keydown', e => {
    if (e.target.closest?.('input,textarea,select') || e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase(), d = e.shiftKey ? -1 : 1;
    if (k === 'f') step('f', d);
    else if (k === 'l') step('l', d);
  });
}

const loaded = new Set();
function loadFont(spec) {
  if (loaded.has(spec)) return;
  loaded.add(spec);
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = `https://fonts.googleapis.com/css2?family=${spec}&display=swap`;
  document.head.appendChild(l);
}

// Wide fonts: also register a shrunk copy ("<name> FL") via @font-face size-adjust,
// used only for labels so tabs and chips don't overflow.
const scaled = new Set();
async function loadScaled(spec, family, pct) {
  const id = family + pct;
  if (scaled.has(id)) return;
  scaled.add(id);
  try {
    const css = await (await fetch(`https://fonts.googleapis.com/css2?family=${spec}&display=swap`)).text();
    const st = document.createElement('style');
    st.textContent = css.replace(/font-family: '([^']+)';/g, `font-family: '$1 FL'; size-adjust: ${pct}%;`);
    document.head.appendChild(st);
  } catch (e) { console.warn('fontlab: could not scale', family, e); }
}

function step(which, d) {
  const n = which === 'f' ? FONTS.length : LOGOS.length;
  state[which] = (state[which] + d + n) % n;
  apply();
}

function apply() {
  state.f = ((state.f % FONTS.length) + FONTS.length) % FONTS.length;
  state.l = ((state.l % LOGOS.length) + LOGOS.length) % LOGOS.length;
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {}
  const f = FONTS[state.f], lg = LOGOS[state.l];
  f.load.forEach(loadFont);
  const r = document.documentElement.style;
  let cond = f.cond;
  if (f.condScale) {
    const spec = f.load.find(x => x.split(':')[0].replace(/\+/g, ' ') === f.cond);
    loadScaled(spec, f.cond, Math.round(f.condScale * 100));
    cond = `${f.cond} FL`;
  }
  r.setProperty('--cond', `'${cond}', '${f.cond}', sans-serif`);
  r.setProperty('--sans', `'${f.sans}', sans-serif`);
  r.setProperty('--fl-head', `'${f.head}', sans-serif`);
  r.setProperty('--fl-head-w', f.headW || 700);
  r.setProperty('--fl-track', f.track ?? .18);
  document.querySelectorAll('.logo, .corner.tl').forEach(el => {
    el.innerHTML = lg.html();
    el.dataset.flLogo = lg.name.toLowerCase();
  });
  const ui = document.getElementById('fontLab');
  if (ui) {
    ui.querySelector('[data-k=f] b').textContent = f.name;
    ui.querySelector('[data-k=f] em').textContent = `${state.f + 1}/${FONTS.length} · ${f.note}`;
    ui.querySelector('[data-k=l] b').textContent = lg.name;
    ui.querySelector('[data-k=l] em').textContent = `${state.l + 1}/${LOGOS.length}`;
  }
}

function buildUi() {
  const el = document.createElement('div');
  el.id = 'fontLab';
  el.innerHTML = ['f', 'l'].map(k => `
    <div class="row" data-k="${k}">
      <span class="lbl">${k === 'f' ? 'Font' : 'Logo'}</span>
      <button data-d="-1" aria-label="previous">‹</button>
      <div class="txt"><b></b><em></em></div>
      <button data-d="1" aria-label="next">›</button>
    </div>`).join('') + '<p>F / L keys · shift = back</p>';
  el.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (b) step(b.closest('.row').dataset.k, +b.dataset.d);
  });
  document.body.appendChild(el);
}

function injectCss() {
  const s = document.createElement('style');
  s.textContent = `
/* the lab's own widget keeps fixed fonts so it stays readable */
#fontLab { position: fixed; left: 16px; bottom: 16px; z-index: 9999; width: 300px; background: #fff; border: 1px solid #0e0e0e;
  font: 500 13px 'Barlow', system-ui, sans-serif; color: #0e0e0e; padding: 8px 10px 6px; box-shadow: 4px 4px 0 #0aa5bd; }
#fontLab .row { display: flex; align-items: center; gap: 6px; padding: 4px 0; }
#fontLab .row + .row { border-top: 1px solid #e1e1dc; }
#fontLab .lbl { width: 34px; font: 700 11px 'Barlow Condensed', sans-serif; letter-spacing: .18em; text-transform: uppercase; color: #8a8a85; }
#fontLab button { width: 26px; height: 26px; flex: none; border: 1px solid #0e0e0e; font: 600 18px/1 'Barlow', sans-serif; }
#fontLab button:hover { background: #0e0e0e; color: #fff; }
#fontLab .txt { flex: 1; min-width: 0; }
#fontLab b { display: block; font: 700 14px 'Barlow', sans-serif; }
#fontLab em { display: block; font: 400 11px 'Barlow', sans-serif; font-style: normal; color: #8a8a85; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
#fontLab p { font: 500 10px 'Barlow Condensed', sans-serif; letter-spacing: .14em; text-transform: uppercase; color: #b4b4ae; margin-top: 2px; }

/* display font on logo + headings */
.logo, .corner.tl, h1, h2 { font-family: var(--fl-head) !important; }
.logo, .corner.tl { font-weight: var(--fl-head-w) !important; letter-spacing: calc(var(--fl-track) * 1em) !important; }
h1, h2 { font-weight: var(--fl-head-w); }

/* ---- logo styles ---- */
.logo, .corner.tl { display: inline-flex; align-items: center; line-height: 1; white-space: nowrap; }
.logo { font-size: 22px !important; }
.corner.tl { font-size: 15px !important; color: #0e0e0e; }
.fl-c { color: var(--cyan); font-weight: inherit; }
.fl-slab { background: var(--ink); color: #fff; padding: .34em .5em .3em .7em; position: relative; }
.fl-slab::after { content: ''; position: absolute; right: 0; top: 0; border: .32em solid transparent; border-top-color: var(--cyan); border-right-color: var(--cyan); }
.fl-pulse { position: relative; padding-bottom: .5em; }
.fl-pulse svg { position: absolute; left: 0; right: .2em; bottom: -.05em; width: calc(100% - .2em); height: .55em; overflow: visible; }
.fl-pulse path { fill: none; stroke: var(--cyan); stroke-width: 1.6; vector-effect: non-scaling-stroke; stroke-linejoin: round;
  stroke-dasharray: 140; animation: flBeat 2.4s var(--ease) infinite; }
@keyframes flBeat { 0% { stroke-dashoffset: 140; } 55%, 100% { stroke-dashoffset: 0; } }
.fl-row { display: inline-flex; align-items: center; gap: .45em; }
.fl-mark { width: 1.45em; height: 1.35em; overflow: visible; }
.fl-mark path { fill: none; stroke: var(--ink); stroke-width: 2.6; stroke-linejoin: miter; stroke-linecap: square; }
.fl-mark path.c { stroke: var(--cyan); }
.fl-out { color: transparent; -webkit-text-stroke: 1.2px var(--ink); }
.fl-low { text-transform: none; letter-spacing: .02em; font-size: 1.2em; }
.fl-i { position: relative; }
.fl-i::after { content: ''; position: absolute; left: 50%; top: .16em; width: .19em; height: .19em; margin-left: -.095em; border-radius: 50%; background: var(--cyan); }
.fl-br { color: var(--cyan); font-weight: 300; margin: 0 .12em; letter-spacing: 0; }
.fl-sq { display: inline-block; width: .3em; height: .3em; background: var(--ink); margin-left: .25em; align-self: flex-end; margin-bottom: .1em; }
`;
  document.head.appendChild(s);
}

// start last so every const above is initialised
if (new URLSearchParams(location.search).has('dev')) init();
