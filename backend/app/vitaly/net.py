"""One long-lived HTTP client for Vitaly's outside calls (OpenRouter, Deepgram).

A fresh client for every call meant a new TCP + TLS handshake each time, 100 to 300 ms added to every
answer and every spoken line. This keeps connections open and warm so a call goes straight out.
"""
import asyncio
import contextlib

import httpx

HOSTS = ("https://openrouter.ai", "https://api.deepgram.com")
KEEP_WARM_S = 20          # ping interval; servers drop connections that sit idle

_client = None
_loop = None


def client():
    """The shared client (made on first use, and again if the event loop changed, as in tests)."""
    global _client, _loop
    loop = asyncio.get_running_loop()
    if _client is None or _client.is_closed or _loop is not loop:
        _loop = loop
        _client = httpx.AsyncClient(timeout=20, limits=httpx.Limits(max_connections=40, max_keepalive_connections=10,
                                                                    keepalive_expiry=60))
    return _client


async def keep_warm():
    """Open a connection to each service now, and again before it goes idle."""
    while True:
        for host in HOSTS:
            with contextlib.suppress(Exception):
                await client().head(host, timeout=5)
        await asyncio.sleep(KEEP_WARM_S)
