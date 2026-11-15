"""Vitaly's voice: Deepgram Aura text-to-speech, called from the backend so the key never reaches
the browser.

Deepgram sends the first audio in about 0.2 s but needs several seconds for a whole sentence, so
the audio is streamed: the backend passes chunks to the browser as they arrive and the browser
starts playing at once. Each finished clip is cached, and a line being generated (say, an alert's
checklist the moment it fires) is shared with anyone who asks for it meanwhile, so the same line
is never generated twice.

Settings (backend/.env): DEEPGRAM_API_KEY, DEEPGRAM_TTS_MODEL (default aura-2-draco-en, a warm
British male voice). Without a key the browser falls back to Chrome's built-in voice.
https://developers.deepgram.com/docs/text-to-speech
"""
import asyncio
import hashlib
import os
from collections import OrderedDict
from pathlib import Path

import httpx

URL = "https://api.deepgram.com/v1/speak"
DEFAULT_MODEL = "aura-2-draco-en"
MAX_CHARS = 2000          # Deepgram's per-request limit
CACHE_SIZE = 400
TIMEOUT_S = 20

_cache = OrderedDict()    # key -> finished MP3 bytes
# Finished clips also go to disk, so checklists and common answers are instant after a restart
# and never paid for twice. Git-ignored.
DISK = Path(__file__).resolve().parents[2] / "data" / "voice_cache"
_jobs = {}                # key -> Job still streaming from Deepgram

# Background voicing (startup, a few hundred lines on first run) goes a few at a time so Deepgram
# doesn't refuse us for too many requests at once; a line someone is waiting for skips the queue.
BACKGROUND_AT_ONCE = 3
_slots = None

# Short lines Vitaly says often: generated once at startup.
COMMON = ["Yes?", "I'm here.", "Okay, I won't.", "Logged. Your plan is updated.", "That didn't go through. Try again.",
          "Okay. Say next when you've done that.", "That was the last step. I'm still watching your readings. Say Vitaly if anything changes.",
          "Okay, I've stopped the guide. I'm still watching your readings.", "That's the first step.",
          "I can't reach the medical system right now. Your alerts still work."]


def settings():
    return {"key": os.getenv("DEEPGRAM_API_KEY", "").strip(),
            "model": os.getenv("DEEPGRAM_TTS_MODEL", DEFAULT_MODEL).strip() or DEFAULT_MODEL}


def status():
    s = settings()
    return {"voice": "deepgram" if s["key"] else "browser", "voice_model": s["model"]}


def remember(key, audio):
    _cache[key] = audio
    _cache.move_to_end(key)
    if len(_cache) > CACHE_SIZE:
        _cache.popitem(last=False)


def cached(text):
    """True if this line is ready to play instantly."""
    s = settings()
    key = _key(s["model"], (text or "").strip()[:MAX_CHARS])
    return key in _cache or (DISK / f"{key}.mp3").exists()


def _key(model, text):
    return hashlib.sha1(f"{model}|{text}".encode()).hexdigest()


class Job:
    """One Deepgram stream that any number of listeners can follow while it is still arriving."""

    def __init__(self, s, text, key, background):
        self.chunks, self.done, self.ok = [], False, False
        self.changed = asyncio.Event()
        self.urgent = asyncio.Event()   # set when someone is waiting to hear this line
        if not background:
            self.urgent.set()
        self.task = asyncio.ensure_future(self.run(s, text, key))

    async def run(self, s, text, key):
        global _slots
        if _slots is None:
            _slots = asyncio.Semaphore(BACKGROUND_AT_ONCE)
        held = False
        try:
            if not self.urgent.is_set():
                slot = asyncio.ensure_future(_slots.acquire())
                rush = asyncio.ensure_future(self.urgent.wait())
                await asyncio.wait({slot, rush}, return_when=asyncio.FIRST_COMPLETED)
                rush.cancel()
                if slot.done() and not slot.cancelled():
                    held = True
                else:
                    slot.cancel()
            for attempt in range(3):
                try:
                    self.chunks.clear()
                    async with httpx.AsyncClient(timeout=TIMEOUT_S) as client:
                        async with client.stream("POST", URL, params={"model": s["model"], "encoding": "mp3"}, json={"text": text},
                                                 headers={"Authorization": f"Token {s['key']}"}) as r:
                            if r.status_code == 429 and attempt < 2:   # too many at once: wait and retry
                                await asyncio.sleep(1.5 * (attempt + 1))
                                continue
                            r.raise_for_status()
                            async for chunk in r.aiter_bytes():
                                self.chunks.append(chunk)
                                self.changed.set()
                    break
                except httpx.HTTPStatusError:
                    raise
            self.ok = bool(self.chunks)
            if self.ok:
                audio = b"".join(self.chunks)
                remember(key, audio)
                try:
                    DISK.mkdir(parents=True, exist_ok=True)
                    (DISK / f"{key}.mp3").write_bytes(audio)
                except OSError:
                    pass
        except Exception:
            self.ok = False
        finally:
            if held:
                _slots.release()
            self.done = True
            self.changed.set()
            _jobs.pop(key, None)

    async def follow(self):
        """Yield chunks as they arrive, from the start, until the stream ends."""
        i = 0
        while True:
            while i < len(self.chunks):
                yield self.chunks[i]
                i += 1
            if self.done:
                return
            self.changed.clear()
            if i < len(self.chunks) or self.done:
                continue
            await self.changed.wait()


def start(text, background=False):
    """Cached bytes, or a Job streaming them. None if Deepgram isn't set up.
    background=True queues the line politely; a later normal call for it jumps the queue."""
    s = settings()
    text = (text or "").strip()[:MAX_CHARS]
    if not s["key"] or not text:
        return None
    key = _key(s["model"], text)
    if key in _cache:
        _cache.move_to_end(key)
        return _cache[key]
    f = DISK / f"{key}.mp3"
    if f.exists():
        audio = f.read_bytes()
        remember(key, audio)
        return audio
    if key not in _jobs:
        _jobs[key] = Job(s, text, key, background)
    elif not background:
        _jobs[key].urgent.set()
    return _jobs[key]


async def first_chunk_ok(job, wait_s=6.0):
    """True once a job has produced audio; False if it failed (or stayed silent) first."""
    loop = asyncio.get_event_loop()
    deadline = loop.time() + wait_s
    while not job.chunks and not job.done:
        if loop.time() > deadline:
            return False
        job.changed.clear()
        try:
            await asyncio.wait_for(job.changed.wait(), timeout=0.5)
        except asyncio.TimeoutError:
            pass
    return bool(job.chunks)


async def speak(text):
    """Whole MP3 bytes (waits for the full clip). Used by the POST endpoint and tools."""
    got = start(text)
    if got is None or isinstance(got, bytes):
        return got
    async for _ in got.follow():
        pass
    return b"".join(got.chunks) if got.ok else None


def prewarm(*texts, background=True):
    """Start generating lines ahead of need, e.g. every guide step at startup."""
    for t in texts:
        if t:
            start(t, background=background)
