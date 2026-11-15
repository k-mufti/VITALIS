"""Vitaly's ears: Deepgram live speech-to-text, relayed through the backend so the key never
reaches the browser.

The browser streams raw microphone audio (16 kHz, 16-bit, mono) over a websocket; this module
passes it to Deepgram and sends back small messages:

    {"type": "words", "text": "...", "final": bool, "stopped": bool}
    {"type": "stopped"}          the speaker has gone quiet

"final" means Deepgram won't revise that piece of text; "stopped" means it heard the end of a
phrase. The browser decides when a whole question is finished (it knows if a guide is running).

Why not Chrome's built-in recognition: Deepgram Nova-3 is far more accurate with accents, noise
and medical words, sends words as they are spoken, and can be told that "Vitaly" is a word.

Settings (backend/.env): DEEPGRAM_API_KEY, DEEPGRAM_STT_MODEL (default nova-3). Without a key the
browser falls back to Chrome's recognition.
https://developers.deepgram.com/docs/live-streaming-audio
"""
import asyncio
import contextlib
import json
import os
from urllib.parse import urlencode

import websockets

URL = "wss://api.deepgram.com/v1/listen"
DEFAULT_MODEL = "nova-3"
SAMPLE_RATE = 16000
# Words Deepgram should expect (Nova-3 keyterms): the name, and terms that are easy to mishear.
KEYTERMS = ["Vitaly", "hey Vitaly", "crewmate", "dosimeter", "millisieverts", "CO2", "tourniquet"]


def settings():
    return {"key": os.getenv("DEEPGRAM_API_KEY", "").strip(),
            "model": os.getenv("DEEPGRAM_STT_MODEL", DEFAULT_MODEL).strip() or DEFAULT_MODEL}


def status():
    s = settings()
    return {"listen": "deepgram" if s["key"] else "browser", "listen_model": s["model"]}


def url(model):
    params = [("model", model), ("language", "en"), ("encoding", "linear16"), ("sample_rate", SAMPLE_RATE),
              ("channels", 1), ("interim_results", "true"), ("smart_format", "true"),
              ("endpointing", 300),          # ms of silence that ends a phrase
              ("utterance_end_ms", 1000),    # backstop when background noise hides the silence
              ("vad_events", "true")]
    if model.startswith("nova-3"):
        params += [("keyterm", k) for k in KEYTERMS]
    return f"{URL}?{urlencode(params)}"


def slim(raw):
    """Deepgram's message -> the small message the browser needs, or None to drop it."""
    try:
        m = json.loads(raw)
    except (TypeError, ValueError):
        return None
    if m.get("type") == "UtteranceEnd":
        return {"type": "stopped"}
    if m.get("type") != "Results":
        return None
    alts = (m.get("channel") or {}).get("alternatives") or [{}]
    text = (alts[0].get("transcript") or "").strip()
    final, stopped = bool(m.get("is_final")), bool(m.get("speech_final"))
    if not text and not stopped:
        return None
    return {"type": "words", "text": text, "final": final, "stopped": stopped}


async def relay(browser):
    """Pipe one browser microphone stream to Deepgram and the words back, until either side closes."""
    s = settings()
    if not s["key"]:
        await browser.close(code=4401, reason="no speech key")
        return
    try:
        dg = await websockets.connect(url(s["model"]), additional_headers={"Authorization": f"Token {s['key']}"},
                                      open_timeout=8)
    except Exception:
        await browser.close(code=4502, reason="speech service unavailable")
        return

    async def up():
        while True:
            msg = await browser.receive()
            if msg["type"] == "websocket.disconnect":
                return
            if msg.get("bytes"):
                await dg.send(msg["bytes"])

    async def down():
        async for raw in dg:
            out = slim(raw) if isinstance(raw, str) else None
            if out:
                await browser.send_json(out)

    async def keepalive():   # Deepgram closes a stream that is silent for 10 s
        while True:
            await asyncio.sleep(4)
            await dg.send('{"type":"KeepAlive"}')

    tasks = [asyncio.ensure_future(t()) for t in (up, down, keepalive)]
    try:
        await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
    finally:
        for t in tasks:
            t.cancel()
        with contextlib.suppress(Exception):
            await dg.send('{"type":"CloseStream"}')
        with contextlib.suppress(Exception):
            await dg.close()
        with contextlib.suppress(Exception):
            await browser.close()
