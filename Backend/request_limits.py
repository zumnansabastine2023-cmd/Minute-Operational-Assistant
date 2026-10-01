"""Small process-local abuse guard; no external state or secrets."""
from collections import deque
from threading import Lock
from time import monotonic
from fastapi import HTTPException


class RequestLimiter:
    def __init__(self, clock=monotonic):
        self.clock = clock
        self.entries = {}
        self.lock = Lock()

    def check(self, owner, category, limit, window=60):
        now = self.clock()
        with self.lock:
            for key in list(self.entries):
                while self.entries[key] and self.entries[key][0] <= now - window:
                    self.entries[key].popleft()
                if not self.entries[key]:
                    del self.entries[key]
            events = self.entries.setdefault((owner, category), deque())
            if len(events) >= limit:
                raise HTTPException(status_code=429, detail="Too many requests. Please wait a minute and try again.", headers={"Retry-After": str(window)})
            events.append(now)


limiter = RequestLimiter()
