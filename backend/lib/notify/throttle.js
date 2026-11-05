/**
 * Tiny in-memory rate limiter: shouldNotify("meal.updated:<userId>", 10 * 60 * 1000)
 * returns true at most once per window per key. Per-process only (fine for alerts).
 */
const lastSeen = new Map();
const MAX_KEYS = 5000;

const shouldNotify = (key, windowMs, now = Date.now()) => {
  const prev = lastSeen.get(key);
  if (prev != null && now - prev < windowMs) return false;
  if (lastSeen.size >= MAX_KEYS) {
    // Drop the oldest entries so the map cannot grow without bound.
    for (const k of lastSeen.keys()) {
      if (lastSeen.size < MAX_KEYS / 2) break;
      lastSeen.delete(k);
    }
  }
  lastSeen.set(key, now);
  return true;
};

const resetThrottle = () => lastSeen.clear();

module.exports = { shouldNotify, resetThrottle };
