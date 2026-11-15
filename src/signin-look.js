/* Sign-in look: one setting per effect on the fingerprint screen, plus a dev panel to tune them.
   The panel only exists with ?dev in the URL (e.g. http://localhost:8000/?dev).
   Normal visitors always get DEFAULTS. In dev mode, changes are saved in this browser;
   "Copy settings" puts them on the clipboard so they can become the DEFAULTS below. */

export const DEFAULTS = {
  print: 18,          // which print in assets/fingerprints (1-25)
  size: 1,            // print size multiplier
  holdMs: 1700,       // how long to hold for a match
  noFinish: false,    // dev: stop at 99% so the scan can be watched
  tilt: true, tiltAmount: 1, follow: true,
  split: true, splitAmount: 1, splitOpacity: 1,
  glint: true, glintOpacity: 1, glintSpeed: 1,
  lines: true, linesOpacity: 1,
  glitch: true, glitchRate: 1, glitchStrength: 1,
  particles: true, particleAmount: 1, particleSize: 1,
  rings: true, arc: true,
  glow: true, glowAmount: 1,
  field: true, fieldOpacity: 1,
  brackets: true, ruler: true, readouts: true, crosshairs: true,
  shock: true,
};

const DEV = new URLSearchParams(location.search).has('dev');
const STORE_KEY = 'vitalis-signin-look';

function load() {
  if (!DEV) return { ...DEFAULTS };
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(STORE_KEY) || '{}') }; }
  catch { return { ...DEFAULTS }; }
}

export const LOOK = load();

// Toggles become "off-*" classes on #signin; amounts become CSS variables (see styles.css).
const TOGGLES = ['split', 'glint', 'lines', 'glitch', 'particles', 'rings', 'arc', 'glow', 'field', 'brackets', 'ruler', 'readouts', 'crosshairs', 'shock'];
const VARS = { size: '--k-size', splitOpacity: '--k-split', glintOpacity: '--k-glint', linesOpacity: '--k-lines', glowAmount: '--k-glow', fieldOpacity: '--k-field' };

export function applyLook() {
  const s = document.getElementById('signin');
  if (!s) return;
  TOGGLES.forEach(k => s.classList.toggle('off-' + k, !LOOK[k]));
  Object.entries(VARS).forEach(([k, v]) => s.style.setProperty(v, LOOK[k]));
}

/* ---------- Dev panel ---------- */

// [key, label, min, max, step] for sliders; [key, label] for toggles; ['#', title] for headings.
const ROWS = [
  ['#', 'Print'],
  ['print', 'Print number (reloads)', 1, 25, 1],
  ['size', 'Size', .5, 1.6, .01],
  ['holdMs', 'Hold time (ms)', 400, 5000, 50],
  ['noFinish', 'Never finish (stop at 99%)'],
  ['#', 'Motion'],
  ['tilt', 'Tilt'], ['tiltAmount', 'Tilt amount', 0, 2.5, .05], ['follow', 'Lean toward cursor'],
  ['#', 'Hologram'],
  ['split', 'Colour split'], ['splitAmount', 'Split distance', 0, 3, .05], ['splitOpacity', 'Split opacity', 0, 2, .05],
  ['glint', 'Foil glint'], ['glintOpacity', 'Glint opacity', 0, 1.2, .05], ['glintSpeed', 'Glint speed', .2, 3, .05],
  ['lines', 'Scanlines'], ['linesOpacity', 'Scanline opacity', 0, 1.6, .05],
  ['glitch', 'Glitch slices'], ['glitchRate', 'Glitch rate', .1, 4, .05], ['glitchStrength', 'Glitch strength', 0, 3, .05],
  ['#', 'Particles'],
  ['particles', 'Particles'], ['particleAmount', 'Amount', 0, 4, .05], ['particleSize', 'Size', .3, 3, .05],
  ['#', 'Around the print'],
  ['rings', 'Orbit rings'], ['arc', 'Cyan arc'],
  ['glow', 'Scan glow + trail'], ['glowAmount', 'Glow amount', 0, 2, .05],
  ['field', 'Dot field'], ['fieldOpacity', 'Dot field opacity', 0, 2, .05],
  ['brackets', 'Corner brackets'], ['ruler', 'Ruler'], ['readouts', 'Readouts'], ['crosshairs', 'Crosshairs'],
  ['shock', 'Match shockwave'],
];

const CSS = `
#signinDev { position: fixed; top: 16px; right: 16px; bottom: 16px; z-index: 60; width: 270px; overflow-y: auto; background: rgba(255,255,255,.96);
  border: 1px solid #0e0e0e; padding: 12px 14px; font: 400 12px 'Barlow', sans-serif; color: #0e0e0e; scrollbar-width: thin; }
#signinDev.min { bottom: auto; width: auto; }
#signinDev.min > :not(header) { display: none; }
#signinDev header { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
#signinDev h4, #signinDev h5 { font: 600 12px 'Barlow Condensed', sans-serif; letter-spacing: .18em; text-transform: uppercase; margin: 0; }
#signinDev h5 { margin: 14px 0 6px; padding-bottom: 4px; border-bottom: 1px solid #0e0e0e; }
#signinDev label { display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 2px 8px; margin: 6px 0; }
#signinDev label b { font-weight: 500; }
#signinDev label output { font: 600 11px 'Barlow Condensed', sans-serif; color: #0aa5bd; font-variant-numeric: tabular-nums; }
#signinDev input[type=range] { grid-column: 1 / -1; width: 100%; accent-color: #0aa5bd; margin: 0; }
#signinDev input[type=checkbox] { accent-color: #0aa5bd; }
#signinDev .row { display: flex; gap: 6px; margin-top: 14px; }
#signinDev button { font: 600 11px 'Barlow Condensed', sans-serif; letter-spacing: .14em; text-transform: uppercase; padding: 6px 8px;
  border: 1px solid #0e0e0e; background: none; cursor: pointer; flex: 1; }
#signinDev button:hover { background: #0e0e0e; color: #fff; }
#signinDev header button { flex: none; border: 0; padding: 2px 6px; }
`;

function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(LOOK)); } catch {}
}

function rowHtml([k, label, min, max, step]) {
  if (k === '#') return `<h5>${label}</h5>`;
  if (typeof DEFAULTS[k] === 'boolean') {
    return `<label><b>${label}</b><input type="checkbox" data-k="${k}" ${LOOK[k] ? 'checked' : ''}/></label>`;
  }
  return `<label><b>${label}</b><output>${LOOK[k]}</output><input type="range" data-k="${k}" min="${min}" max="${max}" step="${step}" value="${LOOK[k]}"/></label>`;
}

export function initSigninDev() {
  if (!DEV) return;
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.append(style);
  const panel = document.createElement('aside');
  panel.id = 'signinDev';
  panel.innerHTML = `<header><h4>Sign-in FX</h4><button data-act="min" aria-label="Minimise">–</button></header>
    ${ROWS.map(rowHtml).join('')}
    <div class="row"><button data-act="replay">Replay</button><button data-act="reset">Reset</button><button data-act="copy">Copy settings</button></div>`;
  document.body.append(panel);

  panel.addEventListener('input', e => {
    const k = e.target.dataset.k;
    if (!k) return;
    if (e.target.type === 'checkbox') LOOK[k] = e.target.checked;
    else {
      LOOK[k] = +e.target.value;
      e.target.previousElementSibling.textContent = LOOK[k];
    }
    save();
    if (k === 'print') { location.reload(); return; }
    applyLook();
  });
  panel.addEventListener('click', e => {
    const act = e.target.dataset.act;
    if (act === 'min') panel.classList.toggle('min');
    if (act === 'replay') location.reload();
    if (act === 'reset') { try { localStorage.removeItem(STORE_KEY); } catch {} location.reload(); }
    if (act === 'copy') {
      navigator.clipboard?.writeText(JSON.stringify(LOOK, null, 2));
      e.target.textContent = 'Copied';
      setTimeout(() => (e.target.textContent = 'Copy settings'), 1200);
    }
  });
  // Keep typing/space in the panel from starting a scan.
  panel.addEventListener('keydown', e => e.stopPropagation());
  // Remove the panel once the app shows.
  const watch = setInterval(() => { if (!document.getElementById('signin')) { panel.remove(); clearInterval(watch); } }, 500);
}
