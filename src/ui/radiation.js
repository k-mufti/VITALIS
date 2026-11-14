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

function checkStorm() {
  const storm = live.state && live.state.storm;
  const key = storm ? `${storm.sepID}|${live.state.storm_dose_msv || 0}` : null;
  // A storm already running when the page loads gets the drizzle, not the takeover.
  if (!primed) {
    primed = true;
    stormKey = key;
    if (storm) startFx(0.25);
    return;
  }
  if (key === stormKey) return;
  stormKey = key;
  if (!storm) {
    hideAlert();
    stopFx();
    return;
  }
  showAlert(storm);
  startFx(1);
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
    if (fx) fx.target = 0.25;
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
function startFx(intensity) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const stage = $('#stage3d');
  if (!fx) {
    const wrap = document.createElement('div');
    wrap.className = 'storm-fx';
    const canvas = document.createElement('canvas');
    wrap.appendChild(canvas);
    stage.appendChild(wrap);
    fx = { wrap, canvas, ctx: canvas.getContext('2d'), level: 0, target: intensity, streaks: [], raf: 0, reduce };
    fx.raf = requestAnimationFrame(drawFx);
  }
  fx.target = intensity;
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
      f.streaks.push({ x: Math.random() * (w + h * 0.4) - h * 0.4, y: -20, v: 9 + Math.random() * 14, len: 30 + Math.random() * 90, a: 0.25 + Math.random() * 0.6 });
    }
    ctx.lineCap = 'round';
    f.streaks = f.streaks.filter(s => {
      s.x += s.v * 0.35;
      s.y += s.v;
      const g = ctx.createLinearGradient(s.x, s.y, s.x - s.len * 0.35, s.y - s.len);
      g.addColorStop(0, `rgba(224,68,46,${s.a})`);
      g.addColorStop(1, 'rgba(224,68,46,0)');
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
  $('#swValue').textContent = value;
  $('#swWord').textContent = word;
  chip.title = now ? `GOES-${now.satellite} proton flux ${now.energy}, ${now.time_tag}` : 'Live space weather from NOAA and NASA';
}

function renderPop() {
  const pop = $('#swPop');
  if (!live.online || !weather) {
    pop.innerHTML = `<h3>Space weather</h3><p class="sw-muted">Start the backend to see live NOAA and NASA data.</p>`;
    return;
  }
  const now = weather.now;
  const storm = activeStorm();
  const sep = (weather.recent_solar_particle_events || [])[0];
  const flare = (weather.recent_flares || [])[0];
  const status = weather.status || {};

  let html = `<h3>Space weather <span class="sw-tag">live</span></h3>`;
  if (storm) {
    html += `<div class="sw-alert"><b>Solar particle event: crew in storm shelter</b>
      <p>Replaying real event ${esc(storm.sepID)}${storm.instrument ? `, seen by ${esc(storm.instrument)}` : ''}.
      Adds ${storm.dose_msv} mSv while sheltered.</p>
      ${link(storm.link, 'Open in NASA DONKI')}</div>`;
  }
  if (now) {
    html += `<div class="sw-row"><span>Proton flux now</span><b>${formatFlux(now.flux_pfu)} <small>pfu</small></b></div>
      ${meter(now.flux_pfu, now.threshold_pfu)}
      <p class="sw-muted">GOES-${now.satellite}, ${esc(now.energy)} protons, ${fmtTime(now.time_tag)}.
      A solar radiation storm starts at ${now.threshold_pfu} pfu.</p>`;
  } else {
    html += `<p class="sw-muted">No GOES reading yet (${esc(status.noaa_protons || 'unavailable')}).</p>`;
  }
  if (sep) {
    const instrument = ((sep.instruments || [])[0] || {}).displayName;
    html += `<div class="sw-row"><span>Last solar particle event</span><b>${fmtDate(sep.eventTime)}</b></div>
      <p class="sw-muted">${instrument ? esc(instrument) + '. ' : ''}${link(sep.link, 'DONKI record')}</p>`;
  }
  if (flare) {
    html += `<div class="sw-row"><span>Last solar flare</span><b>${esc(flare.classType || '?')} <small>${fmtDate(flare.peakTime || flare.beginTime)}</small></b></div>`;
  }
  html += `<p class="sw-src">Sources: NOAA SWPC GOES (${esc(status.noaa_protons || '?')}) · NASA DONKI (${esc(status.sep || '?')})</p>`;
  pop.innerHTML = html;
}

// Log scale from 0.1 to 1000 pfu, with the storm threshold marked.
function meter(flux, threshold) {
  const pos = v => Math.max(0, Math.min(100, (Math.log10(Math.max(v, 0.1)) + 1) * 25));
  return `<div class="sw-meter"><i style="width:${pos(flux)}%"></i><em style="left:${pos(threshold)}%"></em></div>
    <div class="sw-meter-scale"><span>0.1</span><span>1</span><span>10 storm</span><span>100</span><span>1000</span></div>`;
}

// ---------- dose gauge ----------

function renderDose() {
  const m = missionInfo();
  const limit = m.radiation_career_limit_msv || 600;
  const dose = m.radiation_msv || 0;
  const stormDose = m.storm_dose_msv || 0;
  const pct = Math.min(100, (100 * dose) / limit);
  const stormPct = Math.min(pct, (100 * stormDose) / limit);

  $('#doseValue').innerHTML = `${Math.round(dose)} <small>/ ${limit} mSv</small>`;
  $('#doseBase').style.width = `${pct - stormPct}%`;
  $('#doseStorm').style.width = `${stormPct}%`;
  $('#doseStorm').style.left = `${pct - stormPct}%`;
  $('#doseLimit').textContent = `${limit} mSv career limit`;

  let lv = 'low';
  if (pct >= 50) lv = 'mid';
  if (pct >= 80) lv = 'high';
  $('#dose').dataset.level = lv;

  const parts = [`<b>${Math.round(pct)}%</b> of career limit`];
  const rate = m.dose_rate_msv_per_day;
  if (rate) {
    const daysLeft = Math.max(0, Math.round((limit - dose) / rate));
    parts.push(`+${rate} mSv a day`);
    parts.push(`limit in ~${daysLeft} days at this rate`);
  }
  if (stormDose) parts.push(`<span class="dose-storm-note">+${Math.round(stormDose)} mSv from solar storms</span>`);
  $('#doseSub').innerHTML = parts.join(' · ');
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

function fmtDate(iso) {
  if (!iso) return '?';
  const d = new Date(iso.replace(/Z?$/, 'Z'));
  if (isNaN(d)) return esc(iso);
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function link(url, text) {
  if (!url || !/^https:\/\//.test(url)) return '';
  return `<a href="${esc(url)}" target="_blank" rel="noopener">${text} ↗</a>`;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
