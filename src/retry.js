'use strict';
// Connection retry policy: 30s -> 60s -> 120s, stop after 3 failures (no endless loops).
const DELAYS_MS = [30000, 60000, 120000];

class RetryPolicy {
  constructor({ delays = DELAYS_MS, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
    this.delays = delays; this.setTimer = setTimer; this.clearTimer = clearTimer;
    this.failures = 0; this.timer = null; this.stopped = false;
  }
  /** Call after a failed attempt. Returns {retry, delayMs}. Schedules fn when retry. */
  onFailure(fn) {
    this.failures++;
    if (this.failures > this.delays.length) { this.stopped = true; return { retry: false, delayMs: 0 }; }
    const delayMs = this.delays[this.failures - 1];
    this.cancel();
    this.timer = this.setTimer(fn, delayMs);
    return { retry: true, delayMs };
  }
  onSuccess() { this.reset(); }
  /** Manual Refresh resets the counter. */
  reset() { this.cancel(); this.failures = 0; this.stopped = false; }
  cancel() { if (this.timer) { this.clearTimer(this.timer); this.timer = null; } }
}
module.exports = { RetryPolicy, DELAYS_MS };
