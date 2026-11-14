import { $ } from '../util.js';
import { api, live, onData, missionInfo } from '../data/client.js';

/* Radiation, made visible.
   1. Space-weather chip in the top bar: live GOES proton flux from NOAA SWPC (>=10 MeV), plus the
      latest real solar events from NASA DONKI. Click it for the details.
   2. Dose gauge under the day number: crew dose so far against the NASA-STD-3001 career limit,
      with any storm dose shown as its own red segment.
   The flux and events are real. The dose is our model (published dose rates per mission phase). */

const POLL_MS = 60000;
// NOAA SWPC: an S1 solar radiation storm starts at 10 pfu. Below 1 pfu is background.
const ELEVATED_PFU = 1;

let weather = null;
let pollTimer = null;

export function initRadiation() {
  const chip = $('#sw');
  const pop = $('#swPop');
  chip.addEventListener('click', e => {
    e.stopPropagation();
    setPop(pop.hidden);
  });
  document.addEventListener('click', e => {
    if (!pop.hidden && !pop.contains(e.target)) setPop(false);
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') setPop(false);
  });

  // Demo helper: preview how each level looks. vitalisWeatherPreview('raised' | 'storm' | 'quiet' | null)
  window.vitalisWeatherPreview = lv => {
    preview = lv || null;
    renderChip();
    if (!$('#swPop').hidden) renderPop();
  };
  renderDose();
  renderChip();
  onData(type => {
    if (type === 'online') startPolling();
    if (type === 'offline') renderChip();
    if (type === 'state') {
      renderDose();
      renderChip();
      checkStorm();
    }
  });
}

// ---------- storm alert ----------
/* When the director replays a solar particle event (or the real flux crosses 10 pfu), the screen
   takes over: a red banner naming the real DONKI event, the shelter dose counting up, and proton
   streaks raining over the body. "Acknowledge" closes the banner; the streaks fade to a slow
   drizzle until the storm is reset. */

let stormKey = null;
let primed = false;
let fx = null;
let stormIntensity = 0; // replayed storm: 1 while the banner is up, 0.25 after Acknowledge, 0 when over
let preview = null;     // demo override for the weather level: vitalis.weatherPreview('raised')

function checkStorm() {
  const storm = live.state && live.state.storm;
  const key = storm ? `${storm.sepID}|${live.state.storm_dose_msv || 0}` : null;
  // A storm already running when the page loads gets the drizzle, not the takeover.
  if (!primed) {
    primed = true;
    stormKey = key;
    stormIntensity = storm ? 0.25 : 0;
    syncFx();
    return;
  }
  if (key === stormKey) return;
  stormKey = key;
  if (!storm) {
    hideAlert();
    stormIntensity = 0;
  } else {
    showAlert(storm);
    stormIntensity = 1;
  }
  syncFx();
}

/* Weather over the body, by level:
   quiet    nothing
   elevated slow amber drizzle
   storm    red proton rain (full during a replayed storm's banner, lighter after) */
const RED = '224,68,46', AMBER = '227,155,45';

function syncFx() {
  if (stormIntensity > 0) return startFx(stormIntensity, RED);
  const lv = level();
  if (lv === 'storm') return startFx(0.6, RED);
  if (lv === 'raised') return startFx(0.3, AMBER);
  stopFx();
}

function showAlert(storm) {
  let el = $('#stormAlert');
  if (!el) {
    el = document.createElement('div');
    el.className = 'storm-alert';
    el.id = 'stormAlert';
    el.setAttribute('role', 'alert');
    $('#app').appendChild(el);
  }
  const m = missionInfo();
  const delay = m.comms_delay_min;
  const instrument = storm.instrument ? `${esc(storm.instrument)}` : 'a NASA instrument';
  el.innerHTML = `
    <div class="sa-icon" aria-hidden="true"><i></i><i></i><i></i></div>
    <div class="sa-main">
      <p class="sa-kicker">Solar particle event · real NASA DONKI data</p>
      <h2>Crew to storm shelter now</h2>
      <p class="sa-meta">Replaying event <b>${esc(storm.sepID)}</b>, measured by ${instrument}.
        ${link(storm.link, 'DONKI record')}</p>
    </div>
    <div class="sa-dose">
      <span>Shelter dose</span>
      <b><em id="saDose">+0.0</em> <small>mSv</small></b>
      <span class="sa-limit">limit ${m.radiation_event_limit_msv || 250} mSv per event</span>
    </div>
    <div class="sa-side">
      ${delay ? `<p class="sa-earth">Alert reaches Earth in <b>${delay.toFixed(1)} min</b></p>` : ''}
      <button class="sa-ack" id="saAck">Acknowledge</button>
    </div>`;
  el.classList.remove('out');
  requestAnimationFrame(() => el.classList.add('in'));
  $('#saAck').addEventListener('click', () => {
    hideAlert();
    stormIntensity = 0.25;
    syncFx();
  });
  countUp($('#saDose'), storm.dose_msv || 0, 4000);
}

function hideAlert() {
  const el = $('#stormAlert');
  if (!el) return;
  el.classList.remove('in');
  el.classList.add('out');
  setTimeout(() => el.remove(), 500);
}

function countUp(node, to, ms) {
  const t0 = performance.now();
  const step = now => {
    if (!node.isConnected) return;
    const t = Math.min(1, (now - t0) / ms);
    node.textContent = '+' + (to * (1 - Math.pow(1 - t, 3))).toFixed(1);
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// Proton streaks over the 3D stage. intensity 1 = full storm, 0.25 = drizzle, 0 = gone.
function startFx(intensity, color = RED) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const stage = $('#stage3d');
  if (!fx) {
    const wrap = document.createElement('div');
    wrap.className = 'storm-fx';
    const canvas = document.createElement('canvas');
    wrap.appendChild(canvas);
    stage.appendChild(wrap);
    fx = { wrap, canvas, ctx: canvas.getContext('2d'), level: 0, target: intensity, streaks: [], raf: 0, reduce, color };
    fx.raf = requestAnimationFrame(drawFx);
  }
  fx.target = intensity;
  fx.color = color;
  fx.wrap.style.setProperty('--fx-rgb', color);
  stage.classList.add('storming');
}

function stopFx() {
  if (fx) fx.target = 0;
  $('#stage3d').classList.remove('storming');
}

function drawFx(now) {
  const f = fx;
  if (!f) return;
  const dpr = Math.min(2, devicePixelRatio || 1);
  const w = f.wrap.clientWidth, h = f.wrap.clientHeight;
  if (f.canvas.width !== Math.round(w * dpr) || f.canvas.height !== Math.round(h * dpr)) {
    f.canvas.width = Math.round(w * dpr);
    f.canvas.height = Math.round(h * dpr);
  }
  f.level += (f.target - f.level) * 0.04;
  f.wrap.style.setProperty('--storm', f.level.toFixed(3));
  const ctx = f.ctx;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  if (!f.reduce) {
    // Spawn: streaks come in at a shallow angle from the upper left, like a particle shower.
    const spawn = f.level * 6;
    const count = Math.floor(spawn) + (Math.random() < spawn % 1 ? 1 : 0);
    for (let i = 0; i < count; i++) {
      // Weaker weather falls slower and shorter, so drizzle reads differently from a storm.
      const speed = 0.4 + f.level * 0.8;
      f.streaks.push({ x: Math.random() * (w + h * 0.4) - h * 0.4, y: -20, v: (9 + Math.random() * 14) * speed, len: (30 + Math.random() * 90) * speed, a: 0.25 + Math.random() * 0.6, c: f.color });
    }
    ctx.lineCap = 'round';
    f.streaks = f.streaks.filter(s => {
      s.x += s.v * 0.35;
      s.y += s.v;
      const g = ctx.createLinearGradient(s.x, s.y, s.x - s.len * 0.35, s.y - s.len);
      g.addColorStop(0, `rgba(${s.c},${s.a})`);
      g.addColorStop(1, `rgba(${s.c},0)`);
      ctx.strokeStyle = g;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(s.x - s.len * 0.35, s.y - s.len);
      ctx.stroke();
      return s.y - s.len < h;
    });
  }

  if (f.target === 0 && f.level < 0.01 && !f.streaks.length) {
    f.wrap.remove();
    fx = null;
    return;
  }
  f.raf = requestAnimationFrame(drawFx);
}

function setPop(open) {
  $('#swPop').hidden = !open;
  $('#sw').setAttribute('aria-expanded', String(open));
  if (open) renderPop();
}

function startPolling() {
  if (pollTimer) return;
  const pull = async () => {
    try {
      weather = await api.spaceWeather();
    } catch (err) {
      // keep the last reading; the chip says how old it is
    }
    renderChip();
    if (!$('#swPop').hidden) renderPop();
  };
  pull();
  pollTimer = setInterval(pull, POLL_MS);
}

// ---------- chip ----------

// The replayed storm lives in the sim state; the real flux comes from NOAA.
function activeStorm() {
  return (live.state && live.state.storm) || (weather && weather.active_storm) || null;
}

function level() {
  if (preview) return preview;
  const now = weather && weather.now;
  if (activeStorm()) return 'storm';
  if (!now) return 'none';
  if (now.proton_event_now) return 'storm';
  if (now.flux_pfu >= ELEVATED_PFU) return 'raised';
  return 'quiet';
}

const WORD = { quiet: 'Quiet', raised: 'Elevated', storm: 'Solar storm', none: 'No feed' };

function renderChip() {
  const chip = $('#sw');
  const lv = level();
  chip.dataset.level = lv;
  const now = weather && weather.now;
  let value = '—';
  if (now) value = `${formatFlux(now.flux_pfu)} pfu`;
  let word = WORD[lv];
  if (!live.online) word = 'Offline';
  else if (!weather) word = 'Loading';
  else if (activeStorm() && !(now && now.proton_event_now)) word = 'Storm replay';
  if (preview) word = WORD[lv];
  $('#swValue').textContent = value;
  $('#swWord').textContent = word;
  syncFx();
  chip.title = now ? `GOES-${now.satellite} proton flux ${now.energy}, ${now.time_tag}` : 'Live space weather from NOAA and NASA';
}

/* The panel: what the weather is now, and whether to go inside. Nothing else. */
const NOW_SAY = {
  quiet: { word: 'Quiet', say: 'All clear.' },
  raised: { word: 'Elevated', say: 'Stay near the shelter.' },
  storm: { word: 'Solar storm', say: 'Go to the storm shelter now.' },
  none: { word: 'No reading', say: 'Waiting for the satellite.' },
};

function renderPop() {
  const pop = $('#swPop');
  if (!live.online || !weather) {
    pop.innerHTML = `<p class="sw-muted">Offline. Start the backend for live data.</p>`;
    return;
  }
  const now = weather.now;
  const lv = level();
  const t = NOW_SAY[lv];
  const flux = now ? now.flux_pfu : null;
  const shelterAt = now ? now.threshold_pfu : 10;
  const replay = activeStorm() && !(now && now.proton_event_now) && !preview;

  pop.dataset.level = lv;
  pop.innerHTML = `
    <div class="sw-sky" aria-hidden="true">${skyDrops(lv)}</div>
    <div class="sw-now">
      <b class="sw-word">${t.word}</b>
      <span class="sw-val">${formatFlux(flux)} <small>pfu</small></span>
    </div>
    ${now ? meter(flux, shelterAt) : ''}
    <p class="sw-say">${t.say}</p>
    <p class="sw-rule">Shelter at ${shelterAt} pfu${replay ? ' · replaying a real NASA storm' : ''}</p>
    ${now ? `<p class="sw-src">Live · NOAA GOES-${now.satellite} · ${fmtTime(now.time_tag)}</p>` : ''}`;
}

// Particles for the little sky at the top of the panel. Count, speed and colour follow the level.
function skyDrops(lv) {
  const n = { quiet: 6, raised: 14, storm: 28, none: 0 }[lv] || 0;
  let out = '';
  for (let i = 0; i < n; i++) {
    const x = (i * 37 + 11) % 100;
    const delay = ((i * 0.53) % 2).toFixed(2);
    const dur = (0.8 + ((i * 7) % 10) / 10).toFixed(2);
    out += `<i style="left:${x}%;animation-delay:-${delay}s;animation-duration:${dur}s"></i>`;
  }
  return out;
}

// Log scale from 0.1 to 1000 pfu, with the storm threshold marked.
function meter(flux, threshold) {
  const pos = v => Math.max(0, Math.min(100, (Math.log10(Math.max(v, 0.1)) + 1) * 25));
  return `<div class="sw-meter"><i style="width:${pos(flux)}%"></i><em style="left:${pos(threshold)}%"></em></div>
    <div class="sw-meter-scale"><span>0.1</span><span>1</span><span>10 shelter</span><span>100</span><span>1000</span></div>`;
}

// ---------- dose graph ----------
/* Cumulative dose over the whole mission: solid line up to today, dashed projection after,
   the career limit as a red line, and the day the projection crosses it. Words kept to labels. */

let curve = null;
let curveKey = null;

async function loadCurve() {
  const m = missionInfo();
  const key = `${m.mission}|${m.day}|${m.storm_dose_msv || 0}`;
  if (!live.online || key === curveKey) return;
  curveKey = key;
  try {
    curve = await api.radiationCurve();
  } catch (err) {
    curve = null; // older backend without the endpoint: draw from the state alone
  }
  drawChart();
}

function renderDose() {
  const m = missionInfo();
  $('#doseValue').innerHTML = `${Math.round(m.radiation_msv || 0)} <small>mSv</small>`;
  drawChart();
  loadCurve();
}

function drawChart() {
  const m = missionInfo();
  const svg = $('#doseChart');
  const limit = m.radiation_career_limit_msv || 600;
  const storm = m.storm_dose_msv || 0;
  // Offline (or no curve yet): a straight line from launch to today, no projection.
  const c = curve || {
    day: m.day, end_day: m.day, points: [{ day: 0, msv: 0 }, { day: m.day, msv: (m.radiation_msv || 0) - storm }],
    crosses_limit_day: null,
  };
  const today = Math.min(c.day, c.end_day);
  const end = Math.max(c.end_day, 1);

  const W = 320, H = 130, L = 4, R = 40, T = 12, B = 18;
  const top = Math.max(limit * 1.15, ...c.points.map(p => p.msv + storm));
  const x = d => L + (d / end) * (W - L - R);
  const y = v => T + (1 - v / top) * (H - T - B);
  const pt = (d, v) => `${x(d).toFixed(1)},${y(v).toFixed(1)}`;

  const past = c.points.filter(p => p.day <= today);
  const future = c.points.filter(p => p.day >= today);
  const atToday = past[past.length - 1].msv;
  const pastLine = past.map(p => pt(p.day, p.msv)).join(' ');
  const area = `${pt(0, 0)} ${pastLine} ${pt(today, atToday + storm)} ${pt(today, 0)}`;
  const futureLine = future.map(p => pt(p.day, p.msv + storm)).join(' ');
  const last = c.points[c.points.length - 1];
  const endDose = last.msv + storm;

  let svgStr = `
    <line class="dc-axis" x1="${L}" x2="${W - R}" y1="${y(0)}" y2="${y(0)}"/>
    <line class="dc-limit" x1="${L}" x2="${W - R}" y1="${y(limit)}" y2="${y(limit)}"/>
    <text class="dc-limit-t" x="${W - R + 4}" y="${y(limit) + 3}">${limit}</text>
    <text class="dc-limit-s" x="${W - R + 4}" y="${y(limit) + 13}">limit</text>
    <polygon class="dc-area" points="${area}"/>
    <polyline class="dc-past" points="${pastLine}"/>`;
  if (storm) {
    svgStr += `<line class="dc-storm" x1="${x(today)}" x2="${x(today)}" y1="${y(atToday)}" y2="${y(atToday + storm)}"/>`;
  }
  if (future.length > 1) {
    svgStr += `<polyline class="dc-future" points="${futureLine}"/>`;
    if (c.end_day > today) {
      svgStr += `<text class="dc-end" x="${x(c.end_day) + 4}" y="${y(endDose) + 3}">${Math.round(endDose)}</text>`;
    }
  }
  if (c.crosses_limit_day !== null && c.crosses_limit_day !== undefined && c.crosses_limit_day > today) {
    const cx = x(c.crosses_limit_day);
    svgStr += `<line class="dc-cross-l" x1="${cx}" x2="${cx}" y1="${y(limit)}" y2="${y(0)}"/>
      <circle class="dc-cross" cx="${cx}" cy="${y(limit)}" r="3.5"/>
      <text class="dc-cross-t" x="${cx}" y="${y(0) + 13}" text-anchor="middle">day ${c.crosses_limit_day}</text>`;
  }
  svgStr += `
    <circle class="dc-now" cx="${x(today)}" cy="${y(atToday + storm)}" r="4.5"/>
    <text class="dc-axis-t" x="${L}" y="${H - 4}">0</text>
    <text class="dc-now-t" x="${x(today)}" y="${H - 4}" text-anchor="middle">now</text>`;
  if (c.end_day > today) svgStr += `<text class="dc-axis-t" x="${W - R}" y="${H - 4}" text-anchor="end">${c.end_day}</text>`;
  svg.innerHTML = svgStr;

  const crossText = c.crosses_limit_day ? `, projected to pass the ${limit} mSv career limit on day ${c.crosses_limit_day}` : '';
  svg.setAttribute('aria-label', `${Math.round(atToday + storm)} mSv so far of ${limit} mSv career limit${crossText}.`);
  const pct = (atToday + storm) / limit;
  $('#dose').dataset.level = pct >= 0.8 ? 'high' : pct >= 0.5 ? 'mid' : 'low';
}

// ---------- formatting ----------

function formatFlux(v) {
  if (v === null || v === undefined) return '—';
  if (v >= 100) return Math.round(v).toString();
  if (v >= 10) return v.toFixed(1);
  return v.toFixed(2);
}

function fmtTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return esc(iso);
  return d.toISOString().slice(11, 16) + ' UTC ' + d.toISOString().slice(0, 10);
}

function link(url, text) {
  if (!url || !/^https:\/\//.test(url)) return '';
  return `<a href="${esc(url)}" target="_blank" rel="noopener">${text} ↗</a>`;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
