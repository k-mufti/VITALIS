import { $ } from '../util.js';
import { API, api, live, onData } from '../data/client.js';
import { state } from '../state.js';
import { bodyForGuide, bodyForAlert, releaseBody } from './vitaly-body.js';

/* Vitaly: the voice assistant. Standalone: it guides you, it never calls anyone.

   Summon: say "Hey Vitaly", or press T if the wake word misses.
   The screen switches to a pulsing orb with the body dimmed behind it; the orb is teal when
   calm, amber for a warning, red for an emergency, and pulses with Vitaly's voice.

   Guides: when the backend watchdog detects a problem, or you say what's wrong ("sharp pain in
   my chest", "she's not breathing"), Vitaly walks you through it one step at a time. Say "next",
   "repeat", "back" or "stop". The whole guide arrives in one reply and every line is voiced in
   advance, so stepping through it needs no server round trip and no waiting.

   Questions go to the backend: everyday ones are answered instantly from live data, unusual
   ones by the AI. Actions (log a countermeasure, note to Earth) need a "yes".

   Voice: Deepgram Aura (through the backend, so the key stays there); Chrome's built-in voice if
   Deepgram isn't set up. Ears: Deepgram live speech-to-text, with Chrome's recogniser as the
   fallback; typing always works. */

const WAKE = /\b(?:hey|hi|ok|okay)?\s*(?:vitaly|vitali|vitaliy|vitalik|vitalie|vitaley|vitality|vitally|vitale|vital e)\b[,.!?]?\s*/i;
const YES = /\b(yes|yeah|yep|confirm|do it|go ahead|please do|affirmative|correct)\b/i;
const NO = /\b(no|nope|cancel that|don't|do not|stop|never ?mind|negative)\b/i;
const REPEAT = /\b(repeat|again|say (that|it) again|what was that|pardon)\b/i;
const NEXT = /\b(next|done|did (it|that)|okay|ok|got it|continue|go on|ready|what now|then what|and then|yes|yeah|yep|no|nope)\b/i;
const BACK = /\b(back|previous|before that)\b/i;
const STOP = /\b(stop|exit|quit|end (the )?guide|cancel|i'?m (fine|okay|ok|good|alright) now|false alarm|never ?mind)\b/i;
const GREETING = 'What do you need help with?';   // after "Hey Vitaly" on its own; voiced in advance by the backend
// A lone "hey" or "um" is not a question (unless a guide or a yes/no is waiting for short answers).
const FILLER = /^(?:hey|hi|hello|ok|okay|um+|uh+|hmm+|well|so)[\s.,!?]*$/i;
// Words that change who a guide is for ("it's not for me, it's for my teammate", "actually it's me"). Checked before
// the short step commands, so "no, it's my teammate" is not taken as "next".
const RETARGET = /\b(team ?mates?|crew ?mates?|someone|somebody|friend|buddy|partner|colleague|co-?worker|brother|sister|mom|dad|wife|husband|not (for )?(me|myself)|it'?s not me|for (him|her|them|me)|it'?s me)\b/i;
const CLOSE_AFTER_MS = 5000;
const CANCEL_DEAF_MS = 1200;   // after Esc: nothing is heard for a moment
const SKIP_MAX_MS = 8000;      // give up waiting for Deepgram to end an utterance that was already acted on or cancelled
const ECHO_TAIL_MS = 3000;     // after Vitaly stops talking: short fragments of its own last line are echo, not you
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
      <div class="v-earth" id="vEarth" hidden></div>
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
  $('#vClose').addEventListener('click', () => close(true));
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
  // "Ask Vitaly" buttons under the steps of an alert.
  $('#vGuide').addEventListener('click', e => {
    const q = e.target.dataset.ask;
    if (q) heard(q);
  });
  setInterval(paintEarth, 500);
  $('#vBar').addEventListener('click', e => {
    const a = e.target.dataset.say;
    if (a) heard(a);
  });
  addEventListener('keydown', e => {
    const typing = /^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName);
    if (e.key === 'Escape' && open) close(true);
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

// cancelled: you pressed Esc or the close button. Whatever you had just said ("Hey Vitaly") is dropped, including
// words still being transcribed, so it cannot reopen the screen a moment later.
function close(cancelled = false) {
  clearTimeout(closeTimer);
  clearTimeout(endTimer);
  if (cancelled) {
    ignoreUntil = Date.now() + CANCEL_DEAF_MS;
    if (ears) { try { ears.abort(true); } catch (err) { /* restarts itself */ } }
  }
  hush();
  releaseBody();
  dock(false);
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

// Docked: Vitaly moves to a side panel so the body can zoom to the problem (vitaly-body.js).
function dock(on) {
  $('#vitaly').classList.toggle('docked', on);
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
  if (bodyForAlert(inc.kind)) dock(true);
  await startGuide({ title: inc.title, severity: inc.severity, say: inc.say, steps: inc.guide, value: inc.value, incidentId: inc.id });
}

// ---------- guides: one step at a time ----------

// Opening line + step 1 play as one clip, so there is no gap between them (every clip has a little
// silence at both ends). With a readings line ("Your heart rate is about 72...") it is two clips:
// the opening, then the readings joined to step 1. Everything after that is "next".
async function startGuide(g) {
  const mine = guide = { ...g, i: 0, started: false };
  $('#vConfirm').hidden = true;
  show(g.severity === 'emergency' ? 'emergency' : 'warning');
  mode = 'alert';
  paintGuide();
  // If the crew member says "next" during the opening, guideCommand takes over and this stops.
  const mineStill = () => guide === mine && !mine.started;
  const clips = g.readings ? [g.say, `${g.readings} ${g.steps[0]}`] : [`${g.say} ${g.steps[0]}`];
  for (const clip of clips) {
    if (!mineStill()) return;
    await say(clip);
  }
  if (mineStill()) {
    mine.started = true;
    paintGuide();
    mode = 'alert';
  }
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
    <p class="v-hint">Say “next”, “repeat”, “back” or “stop”</p>
    <div class="v-ask"><span>Ask Vitaly</span>${ASK.map(q => `<button data-ask="${q}">${q}</button>`).join('')}</div>`;
  const now = box.querySelector('li.now');
  if (now) now.scrollIntoView({ block: 'nearest' });
  paintEarth();
}

// Questions offered during an alert. Each is answered at once from live data.
const ASK = ['How am I doing?', 'When will Earth answer?'];

// ---------- the copy sent to Earth ----------

// "4 min 12 s" of real mission time left, from demo seconds left.
function realTime(demoSeconds, scale) {
  const s = Math.max(0, Math.round(demoSeconds * scale));
  const m = Math.floor(s / 60);
  return m ? `${m} min ${String(s % 60).padStart(2, '0')} s` : `${s} s`;
}

/* An emergency sends the readings to the flight surgeon. This shows the message on its way, at the
   real delay to Earth, while the steps carry on: the guide never waits for the reply. */
function paintEarth() {
  const box = $('#vEarth');
  if (!box) return;
  const inc = guide && guide.incidentId ? find(guide.incidentId) : null;
  const e = inc && inc.earth;
  box.hidden = !e;
  if (!e) return;
  const now = Date.now() / 1000;
  const oneWay = e.arrives_at - e.sent_at;
  let stage = 'sending', head = 'Sent to Earth', sub = `Reaches the flight surgeon in ${realTime(e.arrives_at - now, e.time_scale)}`;
  let fill = (now - e.sent_at) / oneWay;
  if (now >= e.reply_at) {
    stage = 'replied'; head = 'Earth replied'; sub = e.reply; fill = 0;
  } else if (now >= e.arrives_at) {
    stage = 'waiting'; head = 'Earth has your readings'; sub = `Reply lands in ${realTime(e.reply_at - now, e.time_scale)}`;
    fill = (e.reply_at - now) / oneWay;
  }
  const pct = Math.round(Math.min(1, Math.max(0, fill)) * 100);
  const note = stage === 'replied'
    ? `Round trip ${Math.round(e.delay_min * 2)} min. You did not have to wait for it.`
    : 'Keep going. The steps do not wait for Earth.';
  // Same stage: only the countdown and the bar move, so the text does not flicker.
  if (box.dataset.stage === stage && box.dataset.id === String(inc.id) && stage !== 'replied') {
    box.querySelector('.v-earth-sub').textContent = sub;
    box.querySelector('.v-track i').style.width = pct + '%';
    return;
  }
  if (box.dataset.stage === stage && box.dataset.id === String(inc.id)) return;
  box.dataset.stage = stage;
  box.dataset.id = inc.id;
  box.innerHTML = `<p class="v-h">Earth · ${e.delay_min.toFixed(1)} min away</p>
    <div class="v-track-ends"><span>You</span><span>Earth</span></div>
    <div class="v-track"><i style="width:${pct}%"></i></div>
    <p class="v-earth-head">${head}</p>
    <p class="v-earth-sub">${sub}</p>
    <p class="v-earth-note">${note}</p>
    <p class="v-earth-demo">Demo: time runs ${Math.round(e.time_scale)}× faster</p>`;
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
  if (guide && !(guide.id && RETARGET.test(text)) && text.split(/\s+/).length <= 5 && (STOP.test(text) || REPEAT.test(text) || BACK.test(text) || NEXT.test(text))) {
    return guideCommand(text);
  }

  mode = 'thinking';
  status('Thinking');
  let r;
  try {
    r = await api.vitalyAsk(text, state.current, guide && guide.id ? { id: guide.id, who: guide.who, step: guide.i } : null);
  } catch (err) {
    r = { say: 'I can\'t reach the medical system right now. Your alerts still work.' };
  }
  if (r.guide) {
    if (bodyForGuide(r.guide, text)) dock(true);
    return startGuide(r.guide);
  }
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
  // A slow risk not mentioned yet (bone loss before landing, training too hard): once, after the answer.
  if (r.heads_up && !guide) await say(r.heads_up);
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
let lastLine = '';           // the last line Vitaly said
let lastSpokeAt = 0;         // when Vitaly last stopped talking

function hush() {
  lastSpokeAt = Date.now();
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
        analyser.smoothingTimeConstant = 0.45;   // quick enough to follow syllables
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
  lastLine = text;
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
  lastSpokeAt = Date.now();
  ignoreUntil = Date.now() + 450;
  if (ears) { try { ears.abort(); } catch (err) { /* restarts itself */ } }
  if (mode === 'speaking') mode = prev === 'speaking' ? 'listening' : prev;
  setTimeout(checkIncidents, 0);
}

// ---------- ears ----------
/* Two ways to listen. Deepgram live speech-to-text (through the backend) is the main one: the
   microphone is streamed as raw audio and words come back as they are spoken, far more accurate
   than Chrome's recogniser with accents, noise and medical words. Chrome's recogniser is the
   fallback when Deepgram isn't set up or can't be reached. Either way the same code below decides
   when you have finished speaking. */

let ears = null;              // { abort() } while a recogniser is running
const words = t => t.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
// True if what the mic picked up is Vitaly's own recent speech (4+ words found in order).
const isEcho = text => {
  const w = words(text);
  if (w.length >= 4) return words(lastSaid).join(' ').includes(w.join(' '));
  // Deepgram runs about a second behind the room, so the end of Vitaly's own last line (its greeting, a step)
  // can arrive as a fragment after it stops. Without this, "...help with?" was taken as your question.
  if (!w.length || Date.now() - lastSpokeAt > ECHO_TAIL_MS || !words(lastLine).join(' ').includes(w.join(' '))) return false;
  return w.length >= 2 || !(NEXT.test(text) || BACK.test(text) || REPEAT.test(text) || STOP.test(text) || YES.test(text) || NO.test(text));
};
// What was said to Vitaly: the words after "hey Vitaly" (or before it, if the name came last).
function afterWake(text) {
  const m = text.match(WAKE);
  if (!m) return text.trim();
  const after = text.slice(m.index + m[0].length).trim();
  return after.length > 1 ? after : text.slice(0, m.index).trim();
}

// Turns a stream of "here is the sentence so far" updates into one heard() call per utterance.
// id: which utterance this is. stopped: the recogniser thinks you went quiet. settle: how long to
// wait after that before acting (0 = now), so a pause mid-sentence doesn't cut you off.
let handled = -1;
let endTimer = null;
let micLoudAt = 0;            // when the microphone last picked up a voice (Deepgram ears only)
function finishHearing(id, text, done) {
  clearTimeout(endTimer);
  if (id <= handled) return;
  handled = id;
  if (done) done();
  if (Date.now() < ignoreUntil) return;       // you just cancelled: this was said before that
  const q = afterWake(text);
  if (isEcho(q)) return;
  if (q.length < 2 && WAKE.test(text)) return greet();     // "Hey Vitaly" on its own
  if (FILLER.test(q) && !guide && !pending) return;        // a stray "hey" or "um"
  if (q.length > 1) heard(q);
}

// "Hey Vitaly" and then a pause: ask what is needed. Not during a guide (it is already talking you
// through something) and not if you carried straight on with a question (that never gets here).
function greet() {
  if (guide || speaking) return;
  if (!open) show(openEmergency() ? 'emergency' : 'calm');
  mode = 'listening';
  status('Listening');
  say(GREETING).then(() => { if (!guide) closeSoon(); });
}
function resetHearing() { handled = -1; clearTimeout(endTimer); }

// Returns false if the words were ignored (Vitaly talking, or not addressed to Vitaly).
function hearing(id, text, stopped, settle, done) {
  if (speaking || Date.now() < ignoreUntil) return false;
  if (id <= handled || !text || isEcho(text)) return false;
  if (!open || mode === 'idle') {
    if (!WAKE.test(text)) return false;
    summon();
    chime();   // instant "I'm listening" tone; no spoken "Yes?" to talk over the question
  }
  const rest = afterWake(text);
  closeSoon();   // still talking: don't let the screen time out mid-question
  $('#vHeard').textContent = `“${text}”`;
  clearTimeout(endTimer);
  const command = guide && rest.split(/\s+/).length <= 2 && (NEXT.test(rest) || REPEAT.test(rest) || BACK.test(rest) || STOP.test(rest));
  const wakeOnly = WAKE.test(text) && rest.length < 2;
  const unfinished = !wakeOnly && (UNFINISHED.test(rest.replace(/[.,!?…]+$/, '')) || rest.length < 2);   // Deepgram adds punctuation
  let wait;
  // A finished sentence ("...today?") that Deepgram also heard end needs almost no extra wait.
  const sentenceEnd = /[.?!]$/.test(rest) && words(rest).length >= 3;
  if (wakeOnly) wait = stopped ? 300 : 1000;   // said just the name and paused: answer quickly
  else if (stopped) wait = command ? 0 : unfinished ? ENDPOINT_UNFINISHED_MS : sentenceEnd ? Math.min(settle, SETTLE_SENTENCE_MS) : settle;
  else wait = command ? ENDPOINT_COMMAND_MS : unfinished ? ENDPOINT_UNFINISHED_MS : ENDPOINT_MS;
  // The microphone itself is the fastest sign you're still talking: if it was loud a moment ago,
  // hold on (for up to 3 s) and let the next words arrive instead of answering half a sentence.
  let held = 0;
  const fire = () => {
    if (!command && Date.now() - micLoudAt < 350 && held < 3000) {
      held += 250;
      endTimer = setTimeout(fire, 250);
      return;
    }
    finishHearing(id, text, done);
  };
  if (wait <= 0) fire();
  else endTimer = setTimeout(fire, wait);
  return true;
}

function earsOn(kind) {
  $('#vMic').textContent = 'Hey';
  $('#vLaunch').classList.add('listening');
  $('#vLaunch').title = `Talk to Vitaly (say "Hey Vitaly" or press T) · ${kind === 'deepgram' ? 'Deepgram' : 'Chrome'} listening`;
  $('#vitaly').dataset.ears = kind;
}
function earsOff(reason) {
  ears = null;
  $('#vMic').textContent = 'T';
  $('#vLaunch').classList.remove('listening');
  if (reason) $('#vLaunch').title = reason;
}

let earsStarted = false;
async function startEars() {
  if (earsStarted) return;
  earsStarted = true;
  let useDeepgram = false;
  try { useDeepgram = (await api.vitalyStatus()).listen === 'deepgram'; } catch (err) { /* backend down: Chrome */ }
  if (useDeepgram && await startDeepgramEars()) return;
  startChromeEars();
}

// ----- Deepgram: stream the microphone, get words back -----

// Runs on the audio thread: turns the microphone into 16-bit samples, 50 ms at a time.
const TAP = `class VitalyTap extends AudioWorkletProcessor {
  constructor() { super(); this.buf = new Int16Array(800); this.n = 0; }
  process(inputs) {
    const ch = inputs[0][0];
    if (ch) for (let i = 0; i < ch.length; i++) {
      const s = Math.max(-1, Math.min(1, ch[i]));
      this.buf[this.n++] = s < 0 ? s * 0x8000 : s * 0x7fff;
      if (this.n === this.buf.length) { this.port.postMessage(this.buf.slice().buffer); this.n = 0; }
    }
    return true;
  }
}
registerProcessor('vitaly-tap', VitalyTap);`;
// How long to wait for more words once Deepgram signals a break. "Phrase ended" is a firm signal;
// "this text is final" also happens mid-sentence, so it gets a little longer.
const SETTLE_STOPPED_MS = 400;
const SETTLE_FINAL_MS = 700;
const SETTLE_SENTENCE_MS = 150;   // ...unless it ends like a finished sentence

async function startDeepgramEars() {
  let stream, ctx;
  try {
    // Echo cancellation keeps Vitaly's own voice out of the microphone.
    stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
    await ctx.audioWorklet.addModule(URL.createObjectURL(new Blob([TAP], { type: 'application/javascript' })));
  } catch (err) {
    if (stream) stream.getTracks().forEach(t => t.stop());
    if (err && (err.name === 'NotAllowedError' || err.name === 'SecurityError')) {
      earsOff('Microphone blocked: press T and type to Vitaly');
      return true;            // no microphone at all: Chrome's recogniser can't hear either
    }
    return false;
  }
  const tap = new AudioWorkletNode(ctx, 'vitaly-tap');
  const mute = ctx.createGain();
  mute.gain.value = 0;        // the tap must reach the output to run, but must not be heard
  const micSrc = ctx.createMediaStreamSource(stream);
  micSrc.connect(tap).connect(mute).connect(ctx.destination);
  meterMic(ctx, micSrc);

  let ws = null;
  let parts = [];             // pieces of the current utterance Deepgram has finalised
  let latest = '';            // the whole utterance so far
  let id = 0;
  let fails = 0;
  let stopped = false;
  // Deepgram keeps re-sending the same words for seconds, until it decides you have finished talking ("Hey Vitaly"
  // arrived four times over four seconds). So an utterance that was acted on, or cancelled with Esc, is ignored until
  // Deepgram says it has ended; otherwise its late repeats looked like a new "Hey Vitaly" and the screen popped up again.
  let ended = false;          // Deepgram has said the current utterance is over
  let skipping = false;       // ignoring the rest of an utterance that was already dealt with
  let skipSince = 0;
  const clear = () => { parts = []; latest = ''; id++; ended = false; };
  const dealtWith = () => {   // an utterance was acted on: ignore the rest of it
    const over = ended;
    clear();
    if (!over) { skipping = true; skipSince = Date.now(); }
  };
  const update = (text, quiet, settle) => {
    latest = text;
    const kept = hearing(id, text, quiet, settle, dealtWith);
    if (!kept && quiet) clear();   // chatter that wasn't for Vitaly, or Vitaly's own voice: drop it
  };
  const connect = () => {
    ws = new WebSocket(API.replace(/^http/, 'ws') + '/api/vitaly/listen');
    ws.binaryType = 'arraybuffer';
    let gotWords = false;
    ws.onmessage = e => {
      const m = JSON.parse(e.data);
      gotWords = true;
      fails = 0;
      const over = m.type === 'stopped' || !!m.stopped;
      if (skipping) {
        if (over) { skipping = false; clear(); return; }                 // the old utterance has ended
        if (Date.now() - skipSince < SKIP_MAX_MS) return;                // still the old one: ignore
        skipping = false; clear();                                       // gave up waiting: this is new
      }
      if (over) ended = true;
      else if (ended && m.type === 'words' && m.text) clear();           // words after an ended utterance: a new one
      if (m.type === 'stopped') { if (latest) update(latest, true, SETTLE_STOPPED_MS); return; }
      if (m.type !== 'words') return;
      if (m.final && m.text) parts.push(m.text);
      const text = (m.final ? parts : [...parts, m.text]).filter(Boolean).join(' ');
      if (text) update(text, m.stopped || m.final, m.stopped ? SETTLE_STOPPED_MS : SETTLE_FINAL_MS);
    };
    ws.onclose = () => {
      if (stopped) return;
      if (!gotWords && ++fails >= 3) {   // can't reach Deepgram: hand over to Chrome's recogniser
        stopped = true;
        stream.getTracks().forEach(t => t.stop());
        ctx.close();
        ears = null;
        return startChromeEars();
      }
      setTimeout(connect, 800);
    };
  };
  let floor = 0.01;           // background noise level, learned as we go
  tap.port.onmessage = e => {
    if (ws && ws.readyState === 1) ws.send(e.data);
    const pcm = new Int16Array(e.data);
    let sum = 0;
    for (let i = 0; i < pcm.length; i++) sum += (pcm[i] / 32768) ** 2;
    const rms = Math.sqrt(sum / pcm.length);
    if (rms > Math.max(0.015, floor * 3)) micLoudAt = Date.now();
    else floor += (rms - floor) * 0.05;
  };
  // Chrome suspends audio in a tab it thinks is idle; wake it when the page is looked at again.
  document.addEventListener('visibilitychange', () => { if (!document.hidden && ctx.state === 'suspended') ctx.resume(); });
  connect();
  // abort(): forget what was heard so far (called when Vitaly finishes talking). With cancel (Esc), an utterance in
  // progress is also ignored until it ends.
  ears = {
    abort(cancel) {
      clearTimeout(endTimer);
      const inProgress = !!latest && !ended;
      clear();
      if (cancel && inProgress) { skipping = true; skipSince = Date.now(); }
    },
  };
  earsOn('deepgram');
  return true;
}

// ----- Chrome's built-in recogniser (fallback) -----

function startChromeEars() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return earsOff('Press T and type to Vitaly');
  const rec = new SR();
  rec.continuous = true;
  rec.interimResults = true;
  rec.lang = 'en-US';
  let denied = false;
  rec.onstart = resetHearing;   // result numbering restarts with every session
  rec.onresult = e => {
    const index = e.results.length - 1;
    const res = e.results[index];
    hearing(index, res[0].transcript.trim(), res.isFinal, 0);
  };
  rec.onerror = e => {
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
      denied = true;
      earsOff('Microphone blocked: press T and type to Vitaly');
    }
  };
  rec.onend = () => { if (!denied) setTimeout(() => { try { rec.start(); } catch (err) { /* already running */ } }, 60); };
  try {
    rec.start();
    ears = rec;
    earsOn('chrome');
    // The recogniser keeps its audio to itself, so open the mic separately for the orb's meter.
    navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
      .then(stream => { const c = new (window.AudioContext || window.webkitAudioContext)(); meterMic(c, c.createMediaStreamSource(stream)); })
      .catch(() => { /* no meter: the orb still breathes while listening */ });
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
/* A liquid orb drawn like the organs: flat blue layers that ripple like water, with halftone dots
   at the edges and on the lit side. Nothing jitters: every motion is a sum of sine waves.

   It listens to whoever is talking. While Vitaly speaks it follows Vitaly's audio; otherwise it
   follows the microphone. The voice is split into low, mid and high: the low part swells the
   orb and its core, the mid part makes the big ripples, the high part adds small fast ripples.
   A sudden loud sound (the start of a word) pushes everything outward. The mouse can play with
   it too (see startOrb). */

let pulse = 0;      // kicks from word boundaries (Chrome's voice, which has no audio to read)
let micAnalyser = null, micBins = null;

// Microphone meter for the orb (the same stream the ears use).
function meterMic(ctx, source) {
  try {
    micAnalyser = ctx.createAnalyser();
    micAnalyser.fftSize = 512;
    micAnalyser.smoothingTimeConstant = 0.45;
    micBins = new Uint8Array(micAnalyser.frequencyBinCount);
    source.connect(micAnalyser);
  } catch (err) { micAnalyser = null; }
}

// Loudness of three speech bands (about 80-300 Hz, 300-1500 Hz, 1.5-5 kHz), each 0..1. Each source
// learns its own loudest level (and slowly forgets it), so a soft or a loud voice both use the full
// range and every syllable shows as a rise and fall instead of sitting at the top.
const outBins = new Uint8Array(256);
function bands(an, bins) {
  an.getByteFrequencyData(bins);
  const hz = an.context.sampleRate / an.fftSize;
  const avg = (lo, hi) => {
    const a = Math.max(1, Math.round(lo / hz)), b = Math.min(bins.length - 1, Math.round(hi / hz));
    let s = 0;
    for (let i = a; i <= b; i++) s += bins[i];
    return s / (b - a + 1);
  };
  const raw = [avg(80, 300), avg(300, 1500), avg(1500, 5000)];
  const FLOOR = 60;                                   // a quiet room
  an.peak = Math.max(Math.max(...raw), (an.peak || 0) * 0.997, FLOOR + 50);
  return raw.map(v => Math.min(1, Math.max(0, (v - FLOOR) / (an.peak - FLOOR))) ** 0.9);
}

// What the orb should react to right now: [low, mid, high].
function voiceNow(t) {
  if (speaking) {
    if (analyser && audioEl && !audioEl.paused) return bands(analyser, outBins);
    // Chrome's voice: no audio to read, so fake a syllable rhythm plus the word-boundary kicks.
    const syl = Math.max(0, Math.sin(t * 11)) * (0.6 + 0.4 * Math.sin(t * 3.7));
    return [0.3 + 0.5 * syl + pulse * 0.5, 0.35 + 0.55 * syl + pulse * 0.6, 0.2 + 0.45 * syl];
  }
  if (micAnalyser && mode !== 'thinking') {
    if (micAnalyser.context.state === 'suspended') micAnalyser.context.resume();
    return bands(micAnalyser, micBins);
  }
  return [0, 0, 0];
}

// Smoothed state the drawing uses.
const orb = { low: 0, mid: 0, high: 0, kick: 0, last: 0, ripple: 0, prevT: 0, acc: 0, hist: [],
  mx: null, my: null, pull: 0, pa: 0, stir: 0, stirGoal: 0, splash: 0 };

// Drawn like the organs: flat colour, dark at the back and brighter inside, with halftone dots
// (a 45-degree screen grid, like print) that grow at the edges and on the side the light hits.
// Severity picks the palette: deep / body / dots, same blues as the organs when calm.
const ORB_COLORS = {
  calm:      { deep: [10, 31, 107], body: [24, 70, 196], dot: [127, 233, 255] },
  warning:   { deep: [74, 40, 6], body: [190, 118, 20], dot: [255, 226, 168] },
  emergency: { deep: [84, 16, 10], body: [200, 52, 31], dot: [255, 196, 184] },
};
const pal = JSON.parse(JSON.stringify(ORB_COLORS.calm));
const CELL = 6;                  // halftone cell in CSS pixels, as on the organs
const N_ANG = 144;               // points around each layer
const LAYERS = 6;
const rad = Array.from({ length: LAYERS }, () => new Float32Array(N_ANG));
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const mixRGB = (a, b, f) => a.map((v, i) => Math.round(v + (b[i] - v) * f));
const css = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
// Light from the upper left, toward the viewer (same direction as the organs).
const LX = -0.55, LY = -0.65, LZ = 0.55, LN = Math.hypot(LX, LY, LZ);

function startOrb() {
  const canvas = $('#vOrb');
  const ctx = canvas.getContext('2d');
  // The orb always moves, even with the system's "Reduce motion" on: it is how Vitaly shows it
  // is listening and talking, so a still orb would look broken.
  // The mouse plays with the water: near the orb it pulls a bulge toward the cursor, moving fast
  // stirs it up, and a click makes a splash.
  addEventListener('pointermove', e => {
    if (!open) return;
    const r = canvas.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    if (orb.mx != null) orb.stirGoal = Math.min(1, orb.stirGoal + Math.hypot(x - orb.mx, y - orb.my) / 600);
    orb.mx = x; orb.my = y;
  });
  addEventListener('pointerdown', e => {
    if (!open || e.target.closest('button, a, input, [data-say], [data-ask]')) return;
    orb.kick = Math.min(1, orb.kick + 0.5);
    orb.splash = 1;
  });
  const frame = now => {
    requestAnimationFrame(frame);
    if (!open) return;
    const dpr = Math.min(2, devicePixelRatio || 1);
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const t = now / 1000;
    const dt = Math.min(0.1, Math.max(0, t - orb.prevT));
    orb.prevT = t;
    const goalPal = ORB_COLORS[level] || ORB_COLORS.calm;
    for (const k of ['deep', 'body', 'dot']) pal[k] = pal[k].map((c, i) => c + (goalPal[k][i] - c) * 0.06);
    const deep = pal.deep.map(Math.round), body = pal.body.map(Math.round), dotC = pal.dot.map(Math.round);

    // Follow the voice: rise quickly, settle a little slower (frame-rate independent).
    pulse *= Math.exp(-dt * 5);
    let [low, mid, high] = voiceNow(t);
    if (mode === 'thinking') {                    // a slow churn while it works out an answer
      low = 0.2 + 0.12 * Math.sin(t * 2.6);
      mid = 0.25 + 0.15 * Math.sin(t * 3.4 + 1);
      high = 0.1 + 0.08 * Math.sin(t * 6.1);
    }
    const follow = (cur, goal) => cur + (goal - cur) * (1 - Math.exp(-dt * (goal > cur ? 16 : 6)));
    orb.low = follow(orb.low, low);
    orb.mid = follow(orb.mid, mid);
    orb.high = follow(orb.high, high);
    // A small push at the start of each word.
    const loudNow = Math.max(low, mid);
    if (loudNow - orb.last > 0.08) orb.kick = Math.min(0.8, orb.kick + (loudNow - orb.last) * 1.6);
    orb.last = loudNow;
    orb.kick *= Math.exp(-dt * 4);
    orb.splash *= Math.exp(-dt * 2.5);
    orb.stir += (orb.stirGoal - orb.stir) * (1 - Math.exp(-dt * 8));
    orb.stirGoal *= Math.exp(-dt * 3);
    const e = Math.min(1, (orb.low + orb.mid) / 2 + orb.kick * 0.4 + orb.stir * 0.3);
    // Water: what the voice does now reaches the centre first and rolls outward, layer by layer.
    orb.acc += dt;
    while (orb.acc > 1 / 60) {
      orb.acc -= 1 / 60;
      orb.hist.unshift([orb.low, orb.mid, orb.high, orb.kick]);
      if (orb.hist.length > 60) orb.hist.pop();
    }
    const past = k => orb.hist[Math.min(orb.hist.length - 1, k)] || [0, 0, 0, 0];
    // Always flowing; the voice speeds it up (the phase adds up, so a speed change never jumps).
    orb.ripple += dt * (0.9 + e * 2.4);
    const rp = orb.ripple;

    const cx = w / 2, cy = h * 0.42, R = Math.min(w, h) * 0.24;
    // Cursor pull: strongest at the orb's edge, gone three radii away.
    const pa = orb.mx == null ? 0 : Math.atan2(orb.my - cy, orb.mx - cx);
    const pd = orb.mx == null ? 1e9 : Math.hypot(orb.mx - cx, orb.my - cy);
    orb.pull += (Math.max(0, Math.min(1, (R * 3 - pd) / (R * 2))) - orb.pull) * (1 - Math.exp(-dt * 5));
    orb.pa += Math.atan2(Math.sin(pa - orb.pa), Math.cos(pa - orb.pa)) * (1 - Math.exp(-dt * 8));

    // Layer shapes, outer (k = 0) to inner. Inner layers feel the voice first.
    for (let k = 0; k < LAYERS; k++) {
      const f = k / (LAYERS - 1);
      const [l, m, hi, kk] = past(Math.round((1 - f) * 12));
      const wLow = 0.04 + l * 0.09 + kk * 0.03, wMid = 0.025 + m * 0.1, wHigh = 0.006 + hi * 0.035 + kk * 0.015;
      const base = R * (0.86 - f * 0.5) * (1 + l * 0.07 + kk * 0.06);
      const sp = 1 + k * 0.18;
      const keep = 1 - f * 0.35;
      for (let i = 0; i < N_ANG; i++) {
        const a = (i / N_ANG) * Math.PI * 2;
        const ripple = wLow * Math.sin(2 * a + rp * sp + k * 1.3)
          + wMid * Math.sin(3 * a - rp * sp * 1.4 + k * 0.7)
          + wMid * 0.6 * Math.sin(5 * a + rp * sp * 1.1 - k)
          + wHigh * Math.sin(8 * a - rp * sp * 2.4 + k * 2)
          + wHigh * 0.6 * Math.sin(13 * a + rp * sp * 3.1 - k * 1.7)
          + orb.pull * (0.12 - f * 0.05) * Math.max(0, Math.cos(a - orb.pa)) ** 6
          + orb.splash * (0.08 - f * 0.04) * Math.sin(7 * a - rp * 4 + k * 0.9)
          + orb.stir * 0.04 * Math.sin(4 * a + rp * 2.6 - k);
        rad[k][i] = base * (1 + ripple * keep);
      }
    }

    // Flat layers: navy outside, brighter body colour toward the middle. Each layer's edge gets a
    // faint dark line so the water rings read clearly.
    const layerPath = k => {
      ctx.beginPath();
      for (let i = 0; i <= N_ANG; i++) {
        const a = (i / N_ANG) * Math.PI * 2, r = rad[k][i % N_ANG];
        const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
        if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      ctx.closePath();
    };
    ctx.lineWidth = 1.5;
    for (let k = 0; k < LAYERS; k++) {
      const f = k / (LAYERS - 1);
      layerPath(k);
      ctx.fillStyle = css(mixRGB(deep, body, 0.3 + f * 0.7));
      ctx.fill();
      if (k) { ctx.strokeStyle = css(deep, 0.35); ctx.stroke(); }
    }

    // Halftone dots. Each dot asks: how close to the orb's silhouette (rim), how much light
    // (upper left), how close to its own layer's wavy edge, and is it in the core.
    const Ro = R * 0.9;
    const coreR = R * (0.16 + orb.low * 0.1 + orb.kick * 0.05);
    const reach = R * 1.3;
    const s = CELL / Math.SQRT2;
    const dots = new Path2D();
    for (let u = -reach; u <= reach; u += CELL) {
      for (let v = -reach; v <= reach; v += CELL) {
        const dx = (u - v) * Math.SQRT1_2, dy = (u + v) * Math.SQRT1_2;
        const rho = Math.hypot(dx, dy);
        let ang = Math.atan2(dy, dx); if (ang < 0) ang += Math.PI * 2;
        const ia = Math.round((ang / (Math.PI * 2)) * N_ANG) % N_ANG;
        if (rho > rad[0][ia]) continue;           // outside the orb
        let k = LAYERS - 1;
        while (k > 0 && rho > rad[k][ia]) k--;    // the innermost layer this dot is in
        const rel = rho / rad[k][ia];
        // As if the orb were a sphere: rim and light.
        const nx = dx / Ro, ny = dy / Ro, nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
        const rim = 1 - nz;
        const lam = Math.max(0, (nx * LX + ny * LY + nz * LZ) / LN);
        let size = Math.max(
          smooth(0.35, 0.97, rim) * 0.74 * (rho / rad[0][ia]),
          smooth(0.4, 1, lam) * 0.6,
          smooth(0.82, 1, rel) * (0.55 - k * 0.05),
          rho < coreR ? 0.6 * (1 - rho / coreR) + 0.2 : 0,
        ) * (1 + e * 0.3);
        if (size < 0.06) continue;
        const r = Math.min(0.5, size * 0.5) * s * 1.35;
        const x = cx + dx, y = cy + dy;
        dots.moveTo(x + r, y);
        dots.arc(x, y, r, 0, Math.PI * 2);
      }
    }
    // Cut the dots off at the smooth outline (as the organs' silhouette does), then a crisp edge.
    ctx.save();
    layerPath(0);
    ctx.clip();
    ctx.fillStyle = css(dotC);
    ctx.fill(dots);
    ctx.restore();
    layerPath(0);
    ctx.strokeStyle = css(dotC, 0.85);
    ctx.lineWidth = 1.5;
    ctx.stroke();

  };
  requestAnimationFrame(frame);
}

// ---------- public TTS helper ----------
// Speaks text using Vitaly's voice stack (Deepgram → Chrome fallback) without touching any
// Vitaly panel state. Safe to call from any module that needs the AI voice (e.g. injury alerts).
export async function speakText(text) {
  if (!text) return;
  const token = ++speakToken;
  speechSynthesis.cancel();
  if (stopPlaying) stopPlaying();
  let played = false;
  if (await deepgramReady() && token === speakToken) {
    played = await playDeepgram(text, token);
    if (!played && token === speakToken) {
      await pause(800);
      if (token === speakToken) played = await playDeepgram(text, token);
    }
  }
  if (!played && token === speakToken) {
    await browserSay(text, token);
  }
}
