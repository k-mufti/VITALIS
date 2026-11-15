// Logo FX lab (dev only: loads with ?dev). Cycles effects on the slab VITALIS logo.
// Key: G = next effect, Shift+G = previous. Nothing here ships without ?dev.
import { SYS } from '../data/mock.js';

const BPM = SYS?.heart?.value || 64;

const FX = [
  { id: 'none',  name: 'None',            note: 'the plain slab' },
  { id: 'foil',  name: 'Holo foil',       note: 'rainbow sheen sweeps across the letters' },
  { id: 'card',  name: 'Holo card',       note: 'tilts toward your mouse, foil glare follows' },
  { id: 'scan',  name: 'Scan',            note: 'cyan scan bar, same as the fingerprint' },
  { id: 'beat',  name: 'Heartbeat',       note: `corner tab beats at the live heart rate (${BPM} bpm)` },
  { id: 'glitch',name: 'Signal glitch',   note: 'RGB split every few seconds, like a weak link' },
  { id: 'proj',  name: 'Hologram',        note: 'see-through cyan projection with scanlines + flicker' },
  { id: 'dots',  name: 'Halftone',        note: 'letters filled with drifting halftone dots' },
];

const KEY = 'vitalis.logofx';
let idx = 0;

function apply() {
  idx = ((idx % FX.length) + FX.length) % FX.length;
  try { localStorage.setItem(KEY, String(idx)); } catch {}
  const fx = FX[idx];
  document.querySelectorAll('.logo, .corner.tl').forEach(el => {
    if (!el.querySelector('.lx-t')) el.innerHTML = `<span class="lx-t" data-t="VITALIS">VITALIS</span><i class="lx-o"></i>`;
    FX.forEach(f => el.classList.remove('lx-' + f.id));
    el.classList.add('lx-' + fx.id);
    el.style.transform = '';
  });
  const ui = document.getElementById('logoFxLab');
  if (ui) {
    ui.querySelector('b').textContent = fx.name;
    ui.querySelector('em').textContent = `${idx + 1}/${FX.length} · ${fx.note}`;
  }
}

function buildUi() {
  const el = document.createElement('div');
  el.id = 'logoFxLab';
  el.innerHTML = `<span class="lbl">Logo FX</span><button data-d="-1">‹</button>
    <div class="txt"><b></b><em></em></div><button data-d="1">›</button>`;
  el.addEventListener('click', e => { const b = e.target.closest('button'); if (b) { idx += +b.dataset.d; apply(); } });
  document.body.appendChild(el);
}

// Holo card: tilt each logo toward the pointer and move the glare with it.
function onMove(e) {
  if (FX[idx].id !== 'card') return;
  document.querySelectorAll('.logo.lx-card, .corner.tl.lx-card').forEach(el => {
    const r = el.getBoundingClientRect();
    const dx = (e.clientX - (r.left + r.width / 2)) / 300, dy = (e.clientY - (r.top + r.height / 2)) / 200;
    const cx = Math.max(-1, Math.min(1, dx)), cy = Math.max(-1, Math.min(1, dy));
    el.style.transform = `perspective(500px) rotateY(${cx * 18}deg) rotateX(${-cy * 14}deg)`;
    el.style.setProperty('--gx', `${50 + cx * 50}%`);
    el.style.setProperty('--gy', `${50 + cy * 50}%`);
  });
}

function css() {
  const s = document.createElement('style');
  const beat = (60 / BPM).toFixed(3) + 's';
  s.textContent = `
#logoFxLab { position: fixed; left: 16px; bottom: 16px; z-index: 9999; width: 330px; display: flex; align-items: center; gap: 6px;
  background: #fff; border: 1px solid #0e0e0e; padding: 8px 10px; box-shadow: 4px 4px 0 #0aa5bd; font: 500 13px 'Barlow', sans-serif; color: #0e0e0e; font-stretch: 100%; }
#logoFxLab .lbl { width: 44px; font: 700 10px 'Barlow Condensed', sans-serif; letter-spacing: .16em; text-transform: uppercase; color: #8a8a85; }
#logoFxLab button { width: 26px; height: 26px; flex: none; border: 1px solid #0e0e0e; font: 600 18px/1 'Barlow', sans-serif; }
#logoFxLab button:hover { background: #0e0e0e; color: #fff; }
#logoFxLab .txt { flex: 1; min-width: 0; }
#logoFxLab b { display: block; font: 700 14px 'Barlow', sans-serif; }
#logoFxLab em { display: block; font: 400 11px 'Barlow', sans-serif; font-style: normal; color: #8a8a85; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.logo, .corner.tl { overflow: hidden; isolation: isolate; }
.lx-t { position: relative; display: inline-block; }
.lx-o { position: absolute; inset: 0; pointer-events: none; z-index: 2; }
.logo::after, .corner.tl::after { z-index: 3; }

/* 1. holo foil: iridescent band sweeps through the letters */
.lx-foil .lx-t { color: transparent; -webkit-background-clip: text; background-clip: text;
  background-image: linear-gradient(105deg, #fff 0 34%, #5cf0ff 40%, #b48cff 45%, #ff7cc8 50%, #ffe96a 55%, #6dffb4 60%, #fff 66% 100%);
  background-size: 300% 100%; animation: lxFoil 5s cubic-bezier(.6,0,.3,1) infinite; }
@keyframes lxFoil { 0% { background-position: 100% 0; } 60%, 100% { background-position: 0 0; } }

/* 2. holo card: tilt + glare + foil sheen, follows the pointer */
.lx-card { transition: transform .25s ease-out; transform-style: preserve-3d; }
.lx-card .lx-o { background:
    radial-gradient(circle at var(--gx, 50%) var(--gy, 50%), rgba(255,255,255,.45), transparent 45%),
    linear-gradient(115deg, transparent 20%, rgba(127,246,255,.35) 35%, rgba(201,166,255,.35) 45%, rgba(255,154,213,.3) 55%, transparent 70%);
  background-size: 100% 100%, 250% 100%; background-position: 0 0, var(--gx, 50%) 0; mix-blend-mode: screen; }

/* 3. scan: a cyan bar passes over every 5 s; letters light up under it */
.lx-scan .lx-o::before { content: ''; position: absolute; top: 0; bottom: 0; left: 0; width: 34%;
  background: linear-gradient(90deg, transparent, rgba(10,165,189,.55) 40%, #c8fbff 50%, rgba(10,165,189,.55) 60%, transparent);
  mix-blend-mode: screen; transform: translateX(-110%); animation: lxScan 5s cubic-bezier(.6,0,.3,1) infinite; }
.lx-scan .lx-o::after { content: ''; position: absolute; top: 0; bottom: 0; left: 0; width: 1px; background: #c8fbff;
  box-shadow: 0 0 6px 1px #0aa5bd; transform: translateX(-10px); animation: lxScanLine 5s cubic-bezier(.6,0,.3,1) infinite; }
@keyframes lxScan { 0% { transform: translateX(-110%); } 45%, 100% { transform: translateX(310%); } }
@keyframes lxScanLine { 0% { left: -2%; } 45%, 100% { left: 104%; } }

/* 4. heartbeat: cyan tab beats at the crew member's heart rate */
.lx-beat::after { animation: lxBeat ${beat} ease-out infinite; transform-origin: 100% 0; }
@keyframes lxBeat { 0% { transform: scale(1); filter: drop-shadow(0 0 0 #0aa5bd); } 12% { transform: scale(1.7); filter: drop-shadow(0 0 4px #0aa5bd); }
  24% { transform: scale(1.1); } 34% { transform: scale(1.45); } 60%, 100% { transform: scale(1); filter: drop-shadow(0 0 0 #0aa5bd); } }
.lx-beat .lx-o { background: linear-gradient(90deg, transparent 0, rgba(10,165,189,.35) 50%, transparent 100%) no-repeat;
  background-size: 30% 2px; background-position: -40% 100%; animation: lxTrace ${beat} linear infinite; }
@keyframes lxTrace { to { background-position: 140% 100%; } }

/* 5. glitch: a short RGB split + slice jump every 6 s */
.lx-glitch .lx-t::before, .lx-glitch .lx-t::after { content: attr(data-t); position: absolute; inset: 0; opacity: 0; }
.lx-glitch .lx-t::before { color: #2de2ff; animation: lxG1 6s steps(1) infinite; }
.lx-glitch .lx-t::after { color: #ff3b6b; mix-blend-mode: screen; animation: lxG2 6s steps(1) infinite; }
.lx-glitch .lx-t { animation: lxG0 6s steps(1) infinite; }
@keyframes lxG0 { 0%, 90%, 94%, 100% { transform: none; } 91% { transform: translateX(2px) skewX(-8deg); } 92.5% { transform: translateX(-2px); } }
@keyframes lxG1 { 0%, 89%, 95%, 100% { opacity: 0; } 90% { opacity: .9; transform: translate(-3px, 0); clip-path: inset(0 0 55% 0); }
  92% { opacity: .9; transform: translate(2px, 0); clip-path: inset(40% 0 10% 0); } }
@keyframes lxG2 { 0%, 89%, 95%, 100% { opacity: 0; } 90.5% { opacity: .9; transform: translate(3px, 0); clip-path: inset(50% 0 0 0); }
  93% { opacity: .9; transform: translate(-2px, 0); clip-path: inset(0 0 60% 0); } }

/* 6. hologram: see-through cyan projection with scanlines and flicker */
.lx-proj { background: rgba(10,165,189,.12) !important; color: #0aa5bd !important; outline: 1px solid rgba(10,165,189,.55); }
.lx-proj .lx-t { text-shadow: 0 0 6px rgba(10,165,189,.7), 0 0 1px #0aa5bd; animation: lxFlick 3.7s infinite; }
.lx-proj .lx-o { background: repeating-linear-gradient(0deg, rgba(10,165,189,.22) 0 1px, transparent 1px 3px);
  animation: lxRoll 1.2s linear infinite; }
@keyframes lxRoll { to { background-position: 0 6px; } }
@keyframes lxFlick { 0%, 100% { opacity: 1; } 41% { opacity: 1; } 42% { opacity: .45; } 43% { opacity: 1; } 77% { opacity: .8; } 78% { opacity: 1; } }

/* 7. halftone: letters filled with drifting dots (matches the body) */
.lx-dots .lx-t { color: transparent; -webkit-background-clip: text; background-clip: text;
  background-image: radial-gradient(circle, #fff 0 1.15px, transparent 1.5px), radial-gradient(circle, #8ff6ff 0 .9px, transparent 1.2px);
  background-size: 3.4px 3.4px, 3.4px 3.4px; background-position: 0 0, 1.7px 1.7px; animation: lxDots 5s linear infinite; }
@keyframes lxDots { to { background-position: 34px 17px, 18.7px 35.7px; } }
`;
  document.head.appendChild(s);
}

function init() {
  try { idx = +(localStorage.getItem(KEY) || 0) || 0; } catch {}
  css();
  const go = () => { buildUi(); apply(); };
  document.readyState === 'loading' ? addEventListener('DOMContentLoaded', go) : go();
  addEventListener('pointermove', onMove);
  addEventListener('keydown', e => {
    if (e.target.closest?.('input,textarea,select') || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key.toLowerCase() === 'g') { idx += e.shiftKey ? -1 : 1; apply(); }
  });
}

// start last so every const above is initialised
if (new URLSearchParams(location.search).has('dev')) init();
