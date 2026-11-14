import { $, $$ } from '../util.js';
import { api, live } from '../data/client.js';

/* "Where does this number come from" drawer. Opens from the footer link or the S key.
   Three groups, kept apart on purpose: live APIs anyone can re-run, published measured
   values, and our own assumptions. Served by GET /api/provenance. */

const KIND_WORD = { live: 'Live now', cache: 'Cached', fallback: 'Not reachable' };

function liveRow(s) {
  let age = '';
  if (s.fetched_min_ago !== null && s.fetched_min_ago !== undefined) {
    age = `<small>fetched ${s.fetched_min_ago} min ago</small>`;
  }
  let err = '';
  if (s.error) err = `<p class="src-err">${s.error}</p>`;
  return `<div class="src-row ${s.kind}">
    <div class="src-top"><b>${s.name}</b><span class="src-tag ${s.kind}">${KIND_WORD[s.kind]}</span></div>
    <p class="src-what">${s.what}</p>
    <p class="src-val">${s.sample}</p>${age}${err}
    <p class="src-links"><a href="${s.verify}" target="_blank" rel="noopener">Check this yourself ↗</a>
      <a href="${s.docs}" target="_blank" rel="noopener">API docs ↗</a></p>
  </div>`;
}

function pubRow(p) {
  let link = p.source;
  if (p.url) link = `<a href="${p.url}" target="_blank" rel="noopener">${p.source} ↗</a>`;
  return `<div class="src-row"><div class="src-top"><b>${p.value}</b></div>
    <p class="src-what">${p.what}</p><p class="src-cite">${link}</p></div>`;
}

function assumeRow(a) {
  return `<div class="src-row assume"><div class="src-top"><b>${a.value}</b><span class="src-tag assume">Our model</span></div>
    <p class="src-what">${a.what}</p><p class="src-cite">${a.why}</p></div>`;
}

function render(r) {
  const s = r.summary;
  $('#srcSum').innerHTML =
    `<div><span>Live right now</span><b>${s.live_now}</b><small>of ${s.live_now + s.from_cache + s.fallback} APIs</small></div>` +
    `<div><span>From cache</span><b>${s.from_cache}</b><small>fetched earlier, still real</small></div>` +
    `<div><span>Published values</span><b>${s.published_values}</b><small>NASA docs and papers</small></div>` +
    `<div><span>Our assumptions</span><b>${s.assumptions}</b><small>marked in the code</small></div>`;
  $('#srcLive').innerHTML = r.live.map(liveRow).join('');
  $('#srcPub').innerHTML = r.published.map(pubRow).join('');
  $('#srcAssume').innerHTML = r.assumptions.map(assumeRow).join('');
}

function offline() {
  $('#srcSum').innerHTML = '';
  $('#srcLive').innerHTML = '<p class="risk-clear">Start the backend to see which APIs are answering right now.</p>';
  $('#srcPub').innerHTML = '';
  $('#srcAssume').innerHTML = '';
}

async function open() {
  $('#sources').classList.add('on');
  if (!live.online) return offline();
  try {
    render(await api.provenance());
  } catch (err) {
    console.error(err);
    offline();
  }
}

function close() {
  $('#sources').classList.remove('on');
}

export function initSources() {
  $('#sourcesBtn').addEventListener('click', open);
  $$('#sources [data-close]').forEach(el => el.addEventListener('click', close));
  addEventListener('keydown', e => {
    const typing = /^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName);
    if (e.key === 'Escape' && $('#sources').classList.contains('on')) close();
    if ((e.key === 's' || e.key === 'S') && !typing && !e.metaKey && !e.ctrlKey) {
      if ($('#sources').classList.contains('on')) close(); else open();
    }
  });
}
