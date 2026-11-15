import { $ } from '../util.js';
import { API, api, live, onData } from '../data/client.js';
import { state } from '../state.js';

/* Vitaly: the voice assistant. Standalone: it guides you, it never calls anyone.

   Summon: say "Hey Vitaly" (Chrome speech recognition), or press T if the wake word misses.
   The screen switches to a pulsing orb with the body dimmed behind it; the orb is teal when
   calm, amber for a warning, red for an emergency, and pulses with Vitaly's voice.

   Guides: when the backend watchdog detects a problem, or you say what's wrong ("sharp pain in
   my chest", "she's not breathing"), Vitaly walks you through it one step at a time. Say "next",
   "repeat", "back" or "stop". The whole guide arrives in one reply and every line is voiced in
   advance, so stepping through it needs no server round trip and no waiting.

   Questions go to the backend: everyday ones are answered instantly from live data, unusual
   ones by the AI. Actions (log a countermeasure, note to Earth) need a "yes".

   Voice: Deepgram Aura (through the backend, so the key stays there); Chrome's built-in voice if
   Deepgram isn't set up. Listening needs Chrome; typing always works. */

const WAKE = /\b(?:hey|hi|ok|okay)?\s*(?:vitaly|vitali|vitalie|vitaley|vitality|vitally|vitale|vital e)\b[,.!?]?\s*/i;
const YES = /\b(yes|yeah|yep|confirm|do it|go ahead|please do|affirmative|correct)\b/i;
const NO = /\b(no|nope|cancel that|don't|do not|stop|never ?mind|negative)\b/i;
const REPEAT = /\b(repeat|again|say (that|it) again|what was that|pardon)\b/i;
const NEXT = /\b(next|done|did (it|that)|okay|ok|got it|continue|go on|ready|what now|then what|and then|yes|yeah|yep|no|nope)\b/i;
const BACK = /\b(back|previous|before that)\b/i;
const STOP = /\b(stop|exit|quit|end (the )?guide|cancel|i'?m (fine|okay|ok|good|alright) now|false alarm|never ?mind)\b/i;
const CLOSE_AFTER_MS = 5000;
// How long a pause ends what you're saying. Chrome's own "final" result usually arrives first;
// these are the backstop. Short guide commands are quick; a sentence that stops on a word like
// "and" or "my" is clearly unfinished, so it gets longer.
const ENDPOINT_MS = 1600;
const ENDPOINT_COMMAND_MS = 350;
const ENDPOINT_UNFINISHED_MS = 2800;
const UNFINISHED = /\b(and|or|but|so|because|is|are|was|has|have|my|his|her|their|the|a|an|in|on|at|of|to|with|from|for|about|that|which|who|if|when|i|he|she|they|it's|i'm|um|uh)$/i;
const COLORS = { calm: [63, 214, 198], warning: [227, 155, 45], emergency: [224, 68, 46] };

let mode = 'idle';            // idle | listening | thinking | speaking | confirm | alert
let open = false;
let level = 'calm';
let pending = null;           // action waiting for "yes"
let current = null;           // incident being handled
let guide = null;             // { title, severity, steps, i, incidentId } while walking through steps
let closeTimer = null;
let speaking = false;
let ignoreUntil = 0;          // don't hear our own voice
const announced = new Set();
const queue = [];

// ---------- set up ----------

export function initVitaly() {
  document.body.insertAdjacentHTML('beforeend', `
    <div class="vitaly" id="vitaly" data-level="calm" aria-live="assertive" hidden>
      <canvas class="v-orb" id="vOrb" aria-hidden="true"></canvas>
      <div class="v-text">
        <p class="v-status" id="vStatus">Listening</p>
        <p class="v-say" id="vSay"></p>
        <p class="v-heard" id="vHeard"></p>
      </div>
      <div class="v-guide" id="vGuide"></div>
      <div class="v-bar" id="vBar" hidden>
        <button data-say="back">Back</button><button data-say="repeat">Repeat</button><button data-say="next" class="main">Next</button><button data-say="stop">End</button>
      </div>
      <div class="v-confirm" id="vConfirm" hidden>
        <button data-answer="yes">Yes</button><button data-answer="no">No</button>
      </div>
      <form class="v-type" id="vType" autocomplete="off">
        <input id="vInput" placeholder="Or type to Vitaly…" aria-label="Type to Vitaly" />
      </form>
      <button class="v-close" id="vClose" aria-label="Close Vitaly">Esc</button>
    </div>
    <button class="v-launch" id="vLaunch" title="Talk to Vitaly (say &quot;Hey Vitaly&quot; or press T)">
      <i></i><span>Vitaly</span><em id="vMic">T</em>
    </button>`);

  $('#vLaunch').addEventListener('click', () => summon());
  $('#vClose').addEventListener('click', () => close());
  $('#vType').addEventListener('submit', e => {
    e.preventDefault();
    const text = $('#vInput').value.trim();
    $('#vInput').value = '';
    if (text) heard(text);
  });
  $('#vInput').addEventListener('input', () => { if (open) closeSoon(); });   // typing: don't time out
  $('#vConfirm').addEventListener('click', e => {
    const a = e.target.dataset.answer;
    if (a) heard(a);
  });
  $('#vBar').addEventListener('click', e => {
    const a = e.target.dataset.say;
    if (a) heard(a);
  });
  addEventListener('keydown', e => {
    const typing = /^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName);
    if (e.key === 'Escape' && open) close();
    if ((e.key === 't' || e.key === 'T') && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      summon();
    }
  });

  onData(type => {
    if (type === 'incidents') checkIncidents();
  });
  startOrb();
  // Browsers only allow the mic after the user has interacted with the page.
  const firstGesture = () => { startEars(); removeEventListener('pointerdown', firstGesture); removeEventListener('keydown', firstGesture); };
  addEventListener('pointerdown', firstGesture);
  addEventListener('keydown', firstGesture);
}

// ---------- opening and closing ----------

function show(lv = 'calm') {
  clearTimeout(closeTimer);
  level = lv;
  $('#vitaly').dataset.level = lv;
  if (!open) {
    open = true;
    $('#vitaly').hidden = false;
    requestAnimationFrame(() => $('#vitaly').classList.add('on'));
  }
}

function close() {
  clearTimeout(closeTimer);
  hush();
  open = false;
  mode = 'idle';
  pending = null;
  current = null;
  guide = null;
  paintGuide();
  $('#vitaly').classList.remove('on');
  setTimeout(() => { if (!open) $('#vitaly').hidden = true; }, 400);
  $('#vConfirm').hidden = true;
  setText('', '');
}

// Back to the body 5 s after Vitaly stops, unless an emergency still needs attention.
function closeSoon() {
  clearTimeout(closeTimer);
  closeTimer = setTimeout(() => {
    if (speaking || mode === 'confirm' || mode === 'thinking') return;
    if (guide || openEmergency()) return;   // stay while a guide is running
    close();
  }, CLOSE_AFTER_MS);
}

function openEmergency() {
  return (live.incidents || []).some(i => i.state === 'open' && i.severity === 'emergency');
}

export function summon() {
  // Start voicing every everyday answer now, so the reply plays instantly.
  fetch(`${API}/api/vitaly/prewarm`, { method: 'POST' }).catch(() => {});
  show(openEmergency() ? 'emergency' : 'calm');
  mode = 'listening';
  status(ears ? 'Listening' : 'Type your question');
  setText('', '');
  if (!ears) $('#vInput').focus();
  closeSoon();
}

// ---------- alerts from the watchdog ----------

const cleared = [];  // titles of handled alerts that resolved, waiting for an "All clear"

function checkIncidents() {
  for (const inc of live.incidents || []) {
    // Numbers restart after a crew reset, so an alert is known by its number and start time.
    const key = `${inc.id}:${inc.created}`;
    if (inc.state === 'open' && (inc.severity === 'emergency' || inc.severity === 'warning') && !announced.has(key)) {
      announced.add(key);
      queue.push(inc.id);
    }
    if (current && inc.id === current.id) current = inc;
  }
  // Drop queued alerts that resolved before their turn.
  for (let i = queue.length - 1; i >= 0; i--) {
    const inc = find(queue[i]);
    if (!inc || inc.state !== 'open') queue.splice(i, 1);
  }
  if (current && (current.state === 'resolved' || !find(current.id))) {
    cleared.push(current.title);
    if (guide && guide.incidentId === current.id) { guide = null; paintGuide(); }
    current = null;
  }
  queue.sort((a, b) => sevRank(find(a)) - sevRank(find(b)));
  if (queue.length && (!current || sevRank(find(queue[0])) < sevRank(current))) {
    cleared.length = 0;
    announce(find(queue.shift()));
    return;
  }
  if (!current && cleared.length && !speaking) {
    const titles = cleared.splice(0);
    show(openEmergency() ? 'emergency' : 'calm');
    mode = 'listening';
    say(`All clear. ${titles.join(' and ')} resolved.`).then(closeSoon);
  }
}

const find = id => (live.incidents || []).find(i => i.id === id);
const sevRank = inc => (!inc ? 9 : inc.severity === 'emergency' ? 0 : 1);

async function announce(inc) {
  if (!inc) return;
  current = inc;
  pending = null;
  hush();
  alarm(inc.severity);
  await startGuide({ title: inc.title, severity: inc.severity, say: inc.say, steps: inc.guide, value: inc.value, incidentId: inc.id });
}

// ---------- guides: one step at a time ----------

// Opening line, what the sensors show (if any), then step 1. Everything after is "next".
async function startGuide(g) {
  const mine = guide = { ...g, i: 0, started: false };
  $('#vConfirm').hidden = true;
  show(g.severity === 'emergency' ? 'emergency' : 'warning');
  mode = 'alert';
  paintGuide();
  // If the crew member says "next" during the opening, guideCommand takes over and this stops.
  const mineStill = () => guide === mine && !mine.started;
  await say(g.say);
  if (mineStill() && g.readings) await say(g.readings);
  if (mineStill()) await sayStep();
}

async function sayStep() {
  const g = guide;
  g.started = true;
  paintGuide();
  await say(g.steps[g.i]);
  if (guide === g) mode = 'alert';
}

async function guideCommand(text) {
  const g = guide;
  if (STOP.test(text)) {
    guide = null;
    paintGuide();
    mode = 'listening';
    show(openEmergency() ? 'emergency' : 'calm');
    status(ears ? 'Listening' : 'Type your question');
    await say('Okay, I\'ve stopped the guide. I\'m still watching your readings.');
    return closeSoon();
  }
  if (!g.started) return sayStep();   // interrupted the opening: go straight to step 1
  if (REPEAT.test(text)) return sayStep();
  if (BACK.test(text)) {
    if (g.i === 0) return say('That\'s the first step.');
    g.i--;
    return sayStep();
  }
  if (g.i >= g.steps.length - 1) {
    guide = null;
    paintGuide();
    mode = 'listening';
    show(openEmergency() ? 'emergency' : 'calm');
    status(ears ? 'Listening' : 'Type your question');
    await say('That was the last step. I\'m still watching your readings. Say Vitaly if anything changes.');
    return closeSoon();
  }
  g.i++;
  return sayStep();
}

function paintGuide() {
  const box = $('#vGuide');
  $('#vBar').hidden = !guide;
  if (!guide) { box.innerHTML = ''; return; }
  const reading = guide.value && /\d/.test(guide.value) ? ` · ${guide.value}` : '';
  status(`${guide.title}${reading} · step ${guide.i + 1} of ${guide.steps.length}`);
  box.innerHTML = `<p class="v-h">${guide.title}</p><ol>${guide.steps.map((t, i) =>
    `<li class="${i < guide.i ? 'done' : i === guide.i ? 'now' : ''}">${t}</li>`).join('')}</ol>
    <p class="v-hint">Say “next”, “repeat”, “back” or “stop”</p>`;
  const now = box.querySelector('li.now');
  if (now) now.scrollIntoView({ block: 'nearest' });
}

// ---------- what the crew member said ----------

async function heard(text) {
  if (!open) show(openEmergency() ? 'emergency' : 'calm');
  clearTimeout(closeTimer);
  $('#vHeard').textContent = `“${text}”`;

  if (mode === 'confirm' && pending) {
    if (YES.test(text)) return runAction(pending);
    if (NO.test(text)) {
      pending = null;
      $('#vConfirm').hidden = true;
      mode = 'listening';
      await say('Okay, I won\'t.');
      if (guide) { mode = 'alert'; return paintGuide(); }
      return closeSoon();
    }
  }
  // In a guide, short replies drive the steps. A new symptom or a real question still gets through.
  if (guide && text.split(/\s+/).length <= 5 && (STOP.test(text) || REPEAT.test(text) || BACK.test(text) || NEXT.test(text))) {
    return guideCommand(text);
  }

  mode = 'thinking';
  status('Thinking');
  let r;
  try {
    r = await api.vitalyAsk(text, state.current);
  } catch (err) {
    r = { say: 'I can\'t reach the medical system right now. Your alerts still work.' };
  }
  if (r.guide) return startGuide(r.guide);
  if (r.action) {
    pending = r.action;
    mode = 'confirm';
    $('#vConfirm').hidden = false;
    $('#vBar').hidden = true;
    status('Say yes or no');
    await say(r.say);
    return;
  }
  await say(r.say);
  if (guide) {              // answered a question mid-guide: back to the current step
    mode = 'alert';
    paintGuide();
    return;
  }
  mode = 'listening';
  status(ears ? 'Listening' : 'Type your question');
  closeSoon();
}

async function runAction(action) {
  pending = null;
  $('#vConfirm').hidden = true;
  mode = 'thinking';
  status('On it');
  try {
    const r = await api.vitalyAction(action);
    if (action.type === 'log_countermeasure') {
      await say('Logged. Your plan is updated.');
    } else if (action.type === 'note_earth') {
      await say(`Sent. It reaches the flight surgeon in about ${Math.round(r.note.delay_min)} minutes.`);
    }
  } catch (err) {
    await say('That didn\'t go through. Try again.');
  }
  if (guide) { mode = 'alert'; return paintGuide(); }   // back to the guide in progress
  mode = 'listening';
  status(ears ? 'Listening' : 'Type your question');
  closeSoon();
}

// ---------- voice out: Deepgram, with Chrome's voice as the fallback ----------

let voice = null;
function pickVoice() {
  const voices = speechSynthesis.getVoices();
  if (!voices.length) return null;
  const score = v => {
    let s = 0;
    if (/en-GB/i.test(v.lang)) s += 4;
    else if (/^en/i.test(v.lang)) s += 2;
    if (/premium|enhanced|neural|natural/i.test(v.name)) s += 5;
    if (/daniel|arthur|oliver|google uk english male|serena|jamie/i.test(v.name)) s += 3;
    if (/novelty|whisper|bells|bubbles|cellos|zarvox|trinoids|bad news|good news|organ|superstar|jester|wobble/i.test(v.name)) s -= 20;
    return s;
  };
  return voices.slice().sort((a, b) => score(b) - score(a))[0];
}
speechSynthesis.onvoiceschanged = () => { voice = pickVoice(); };

let deepgram = null;          // null = not checked yet; true/false from /api/vitaly/status
let audioEl = null;
let audioCtx = null;
let analyser = null;
let levels = null;
let speakToken = 0;           // newer speech cancels older

// Stop whatever Vitaly is saying.
let stopPlaying = null;      // ends the line being played, so whoever awaits it carries on
let playSeq = 0;             // which line owns the audio element
let lastSaid = '';           // recent speech, to recognise our own voice in the microphone

function hush() {
  speakToken++;
  speechSynthesis.cancel();
  if (stopPlaying) stopPlaying();
  if (audioEl) audioEl.pause();
  speaking = false;
}

// Is Deepgram set up? A failed check (backend restarting) is retried after a few seconds instead
// of switching the whole page to Chrome's voice.
let deepgramCheckedAt = 0;
async function deepgramReady() {
  if (deepgram === true) return true;
  if (Date.now() - deepgramCheckedAt < 4000) return false;
  deepgramCheckedAt = Date.now();
  try { deepgram = (await api.vitalyStatus()).voice === 'deepgram'; } catch (err) { deepgram = null; }
  return deepgram === true;
}

const pause = ms => new Promise(r => setTimeout(r, ms));

// The orb follows the real loudness of Deepgram's audio.
function audioLevel() {
  if (!analyser || !audioEl || audioEl.paused) return 0;
  analyser.getByteTimeDomainData(levels);
  let sum = 0;
  for (const v of levels) sum += ((v - 128) / 128) ** 2;
  return Math.sqrt(sum / levels.length);
}

// Deepgram audio streams from the backend; the audio element starts playing as soon as the first
// chunk lands (about 0.2 s). Resolves true when it finished, false if it failed (use Chrome's voice).
function playDeepgram(text, token) {
  return new Promise(resolve => {
    if (!audioEl) {
      audioEl = new Audio();
      audioEl.crossOrigin = 'anonymous';  // lets the analyser read the backend's audio
      try {
        audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
        const src = audioCtx.createMediaElementSource(audioEl);
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 512;
        levels = new Uint8Array(analyser.fftSize);
        src.connect(analyser);
        analyser.connect(audioCtx.destination);
      } catch (err) { analyser = null; }
    }
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    // Each line owns the audio element only while it is the newest. A line that was interrupted
    // must not touch the handlers of the line that replaced it (its late cleanup used to wipe the
    // new line's "started" marker, so 4 s later Chrome's voice re-read the line).
    const id = ++playSeq;
    let started = false;
    let finished = false;
    const done = ok => {
      if (finished) return;
      finished = true;
      clearTimeout(stall);
      if (playSeq === id) {
        audioEl.onended = audioEl.onerror = audioEl.onplaying = null;
        stopPlaying = null;
      }
      resolve(ok && token === speakToken);
    };
    stopPlaying = () => done(false);
    // If nothing plays within 5 s (network, Deepgram down), give up and use Chrome's voice.
    const stall = setTimeout(() => {
      if (started || (playSeq === id && audioEl.currentTime > 0)) return;
      if (playSeq === id) audioEl.pause();
      done(false);
    }, 5000);
    audioEl.onplaying = () => { started = true; };
    audioEl.onended = () => done(true);
    audioEl.onerror = () => done(started);
    audioEl.src = `${API}/api/vitaly/tts?text=${encodeURIComponent(text)}`;
    // play() rejects if autoplay is blocked (fall back) or if a newer line replaced this one (ignore).
    audioEl.play().catch(() => { if (playSeq === id) done(false); });
  });
}

function browserSay(text, token) {
  return new Promise(resolve => {
    voice = voice || pickVoice();
    const u = new SpeechSynthesisUtterance(text);
    if (voice) u.voice = voice;
    u.rate = 1.0;
    u.pitch = 0.95;
    u.onboundary = () => { pulse = Math.min(1, pulse + 0.55); };
    let finished = false;
    const done = () => { if (!finished) { finished = true; resolve(); } };
    u.onend = done;
    u.onerror = done;
    speechSynthesis.speak(u);
    setTimeout(() => { if (token === speakToken) done(); }, 2500 + text.length * 90);  // some voices never fire onend
  });
}

async function say(text) {
  if (!text) return;
  $('#vSay').textContent = text;
  lastSaid = (lastSaid + ' ' + text).slice(-600);
  const token = ++speakToken;
  speechSynthesis.cancel();          // a new line replaces whatever was being said
  if (stopPlaying) stopPlaying();
  speaking = true;
  const prev = mode;
  if (mode !== 'alert' && mode !== 'confirm') mode = 'speaking';
  // One voice: Deepgram. If a line fails (usually the backend restarting), try it once more before
  // ever using Chrome's voice, which is the last resort so Vitaly is never silent.
  let played = false;
  if (await deepgramReady() && token === speakToken) {
    played = await playDeepgram(text, token);
    if (!played && token === speakToken) {
      await pause(800);
      if (token === speakToken) played = await playDeepgram(text, token);
    }
  }
  if (token === speakToken) $('#vitaly').dataset.voice = played ? 'deepgram' : 'backup';
  if (!played && token === speakToken) {
    console.info('Vitaly: Deepgram voice unavailable for this line, using the browser voice.');
    await browserSay(text, token);
  }
  if (token !== speakToken) return;  // something newer took over
  speaking = false;
  // The recogniser lags about a second behind the room, so it is still chewing on Vitaly's own
  // voice. Throw that away: restart it, and stay deaf for a moment.
  ignoreUntil = Date.now() + 450;
  if (ears) { try { ears.abort(); } catch (err) { /* restarts itself */ } }
  if (mode === 'speaking') mode = prev === 'speaking' ? 'listening' : prev;
  setTimeout(checkIncidents, 0);
}

// ---------- ears (Chrome speech recognition) ----------

let ears = null;
function startEars() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR || ears) { if (!SR) $('#vMic').textContent = 'T'; return; }
  const rec = new SR();
  rec.continuous = true;
  rec.interimResults = true;
  rec.lang = 'en-US';
  let denied = false;
  // Low latency: react to Chrome's in-progress text instead of waiting ~1 s for its final text.
  // The wake word counts the moment it appears; a question ends after 0.7 s with no new words.
  let handled = -1;          // index of the last result already acted on
  let endTimer = null;
  const words = t => t.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
  // True if what the mic picked up is Vitaly's own recent speech (4+ words found in order).
  const isEcho = text => {
    const w = words(text);
    return w.length >= 4 && words(lastSaid).join(' ').includes(w.join(' '));
  };
  const finish = (index, text) => {
    clearTimeout(endTimer);
    if (index <= handled) return;
    handled = index;
    const q = text.replace(WAKE, '').trim();
    if (q.length > 1 && !isEcho(q)) heard(q);
  };
  rec.onstart = () => { handled = -1; };   // result numbering restarts with every session
  rec.onresult = e => {
    if (speaking || Date.now() < ignoreUntil) return;
    const index = e.results.length - 1;
    if (index <= handled) return;
    const res = e.results[index];
    const text = res[0].transcript.trim();
    if (!text || isEcho(text)) return;
    const rest = text.replace(WAKE, '').trim();
    if (!open || mode === 'idle') {
      if (!WAKE.test(text)) return;
      summon();
      chime();   // instant "I'm listening" tone; no spoken "Yes?" to talk over the question
    }
    closeSoon();   // still talking: don't let the screen time out mid-question
    $('#vHeard').textContent = `“${text}”`;
    if (res.isFinal) return finish(index, text);
    clearTimeout(endTimer);
    let wait = ENDPOINT_MS;
    const short = rest.split(/\s+/).length <= 2;
    if (guide && short && (NEXT.test(rest) || REPEAT.test(rest) || BACK.test(rest) || STOP.test(rest))) wait = ENDPOINT_COMMAND_MS;
    else if (UNFINISHED.test(rest) || rest.length < 2) wait = ENDPOINT_UNFINISHED_MS;
    endTimer = setTimeout(() => finish(index, text), wait);
  };
  rec.onerror = e => {
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
      denied = true;
      ears = null;
      $('#vMic').textContent = 'T';
      $('#vLaunch').title = 'Microphone blocked: press T and type to Vitaly';
    }
  };
  rec.onend = () => { if (!denied) setTimeout(() => { try { rec.start(); } catch (err) { /* already running */ } }, 60); };
  try {
    rec.start();
    ears = rec;
    $('#vMic').textContent = 'Hey';
    $('#vLaunch').classList.add('listening');
  } catch (err) {
    ears = null;
  }
}

// ---------- alarm tone ----------
// Plays the instant an alert arrives, before any voice: two tones for a warning, three fast
// rising ones for an emergency. Pure Web Audio, nothing to download.
function alarm(severity) {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const notes = severity === 'emergency' ? [880, 988, 1175] : [660, 880];
    const step = severity === 'emergency' ? 0.14 : 0.2;
    notes.forEach((f, i) => {
      const t = audioCtx.currentTime + i * step;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.value = f;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + step * 0.9);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(t);
      osc.stop(t + step);
    });
  } catch (err) { /* no audio: the screen still shows the alert */ }
}

// One soft rising note: "I'm listening". Instant, and unlike a spoken "Yes?" it can't talk over you.
function chime() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587, t);
    osc.frequency.exponentialRampToValueAtTime(880, t + 0.12);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.12, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + 0.25);
  } catch (err) { /* no audio */ }
}

// ---------- text on screen ----------

function status(text) { $('#vStatus').textContent = text; }
function setText(sayText, heardText) { $('#vSay').textContent = sayText; $('#vHeard').textContent = heardText; }

// ---------- the orb ----------
/* A geodesic sphere of dots inside two wavy particle rings. Everything breathes slowly; Vitaly's
   voice (word boundaries) kicks the rings outward, and the colour follows severity. */

let pulse = 0;
let rgb = COLORS.calm.slice();
const SPHERE = fibonacciSphere(220);
const LINKS = nearestLinks(SPHERE, 3);
const DUST = Array.from({ length: 90 }, () => ({ a: Math.random() * Math.PI * 2, r: 1.15 + Math.random() * 0.6, s: 0.2 + Math.random() * 0.8 }));

function startOrb() {
  const canvas = $('#vOrb');
  const ctx = canvas.getContext('2d');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const frame = now => {
    requestAnimationFrame(frame);
    if (!open) return;
    const dpr = Math.min(2, devicePixelRatio || 1);
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const t = reduce ? 0 : now / 1000;
    const target = COLORS[level] || COLORS.calm;
    rgb = rgb.map((c, i) => c + (target[i] - c) * 0.06);
    const col = a => `rgba(${rgb.map(Math.round).join(',')},${a})`;

    // Voice energy: decays; while speaking it never drops below a murmur.
    const loud = audioLevel();
    const base = loud ? Math.min(1, loud * 4) : speaking ? 0.25 + 0.15 * Math.sin(t * 9) : mode === 'thinking' ? 0.15 + 0.1 * Math.sin(t * 4) : 0.05;
    pulse = Math.max(base, pulse * 0.9);
    const cx = w / 2, cy = h * 0.42, R = Math.min(w, h) * 0.24;

    // Outer rings of particles, deformed by the voice.
    for (let ring = 0; ring < 2; ring++) {
      const base = R * (1.0 + ring * 0.12);
      const amp = R * (0.03 + pulse * (0.10 + ring * 0.05));
      const n = 520;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const wob = Math.sin(3 * a + t * (0.8 + ring * 0.3)) + 0.6 * Math.sin(5 * a - t * 1.3 + ring) + 0.3 * Math.sin(9 * a + t * 2.1);
        const r = base + amp * wob + (Math.random() - 0.5) * R * 0.02;
        ctx.fillStyle = col(0.25 + 0.5 * Math.random());
        ctx.fillRect(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 1.3, 1.3);
      }
    }
    // Inner thin ring.
    ctx.strokeStyle = col(0.35);
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i <= 200; i++) {
      const a = (i / 200) * Math.PI * 2;
      const r = R * 0.62 * (1 + 0.02 * Math.sin(6 * a + t * 2) * (1 + pulse * 3));
      const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    ctx.stroke();
    // Dust drifting around the rings.
    for (const d of DUST) {
      const a = d.a + t * 0.05 * d.s;
      const r = R * (d.r + 0.05 * Math.sin(t * d.s + d.a));
      ctx.fillStyle = col(0.15 + 0.3 * d.s);
      ctx.fillRect(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 1.2, 1.2);
    }
    // Geodesic sphere: rotating dots with links to their nearest neighbours.
    const sr = R * 0.36 * (1 + pulse * 0.12);
    const rot = t * 0.35, ca = Math.cos(rot), sa = Math.sin(rot), tilt = 0.35, ct = Math.cos(tilt), st = Math.sin(tilt);
    const proj = SPHERE.map(([x, y, z]) => {
      const x1 = x * ca + z * sa, z1 = -x * sa + z * ca;
      const y2 = y * ct - z1 * st, z2 = y * st + z1 * ct;
      return [cx + x1 * sr, cy + y2 * sr, z2];
    });
    ctx.lineWidth = 0.6;
    for (const [i, j] of LINKS) {
      const a = proj[i], b = proj[j];
      const depth = (a[2] + b[2]) / 2;
      ctx.strokeStyle = col(0.08 + 0.32 * (depth + 1) / 2);
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    }
    for (const p of proj) {
      ctx.fillStyle = col(0.2 + 0.7 * (p[2] + 1) / 2);
      ctx.fillRect(p[0] - 1, p[1] - 1, 2, 2);
    }
  };
  requestAnimationFrame(frame);
}

function fibonacciSphere(n) {
  const pts = [], g = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2, r = Math.sqrt(1 - y * y), a = g * i;
    pts.push([Math.cos(a) * r, y, Math.sin(a) * r]);
  }
  return pts;
}

function nearestLinks(pts, k) {
  const links = new Set();
  pts.forEach((p, i) => {
    pts.map((q, j) => [j, (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2])
      .filter(([j]) => j !== i).sort((a, b) => a[1] - b[1]).slice(0, k)
      .forEach(([j]) => links.add(i < j ? `${i}-${j}` : `${j}-${i}`));
  });
  return [...links].map(s => s.split('-').map(Number));
}
