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

import httpx

URL = "https://api.deepgram.com/v1/speak"
DEFAULT_MODEL = "aura-2-draco-en"
MAX_CHARS = 2000          # Deepgram's per-request limit
CACHE_SIZE = 200
TIMEOUT_S = 20

_cache = OrderedDict()    # key -> finished MP3 bytes
_jobs = {}                # key -> Job still streaming from Deepgram

# Short lines Vitaly says often: generated once at startup.
COMMON = ["Yes?", "Okay. I'll keep watching your readings.", "Okay, I won't.", "Help call cancelled. I'll keep watching.",
          "Logged. Your plan is updated.", "That didn't go through. Try again."]


def settings():
    return {"key": os.getenv("DEEPGRAM_API_KEY", "").strip(),
            "model": os.getenv("DEEPGRAM_TTS_MODEL", DEFAULT_MODEL).strip() or DEFAULT_MODEL}


def status():
    s = settings()
    return {"voice": "deepgram" if s["key"] else "browser", "voice_model": s["model"]}


def _key(model, text):
    return hashlib.sha1(f"{model}|{text}".encode()).hexdigest()


class Job:
    """One Deepgram stream that any number of listeners can follow while it is still arriving."""

    def __init__(self, s, text, key):
        self.chunks, self.done, self.ok = [], False, False
        self.changed = asyncio.Event()
        self.task = asyncio.ensure_future(self.run(s, text, key))

    async def run(self, s, text, key):
        try:
            async with httpx.AsyncClient(timeout=TIMEOUT_S) as client:
                async with client.stream("POST", URL, params={"model": s["model"], "encoding": "mp3"}, json={"text": text},
                                         headers={"Authorization": f"Token {s['key']}"}) as r:
                    r.raise_for_status()
                    async for chunk in r.aiter_bytes():
                        self.chunks.append(chunk)
                        self.changed.set()
            self.ok = True
            _cache[key] = b"".join(self.chunks)
            if len(_cache) > CACHE_SIZE:
                _cache.popitem(last=False)
        except Exception:
            self.ok = False
        finally:
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


def start(text):
    """Cached bytes, or a Job streaming them. None if Deepgram isn't set up."""
    s = settings()
    text = (text or "").strip()[:MAX_CHARS]
    if not s["key"] or not text:
        return None
    key = _key(s["model"], text)
    if key in _cache:
        _cache.move_to_end(key)
        return _cache[key]
    if key not in _jobs:
        _jobs[key] = Job(s, text, key)
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


def prewarm(*texts):
    """Start generating lines in the background, e.g. an alert's checklist the moment it fires."""
    for t in texts:
        if t:
            start(t)
