// In-process store for the SASD 4.4.3 monitoring metrics.
//
// Counts and samples are kept in one-minute buckets for the last 15 minutes (the longest window
// the SASD alert thresholds use), so memory stays bounded however busy the service is. Each
// bucket keeps at most SAMPLE_LIMIT samples per series (reservoir sampling), which is enough for
// a stable 95th percentile. Nothing personal is ever recorded: only counts and durations.
const BUCKET_MS = 60 * 1000;
const RETENTION_MS = 15 * BUCKET_MS;
const SAMPLE_LIMIT = 500;

function createMetricsStore({ now = Date.now, random = Math.random } = {}) {
  let buckets = new Map();
  let totals = {};
  const startedAt = now();

  function bucket() {
    const key = Math.floor(now() / BUCKET_MS);
    let current = buckets.get(key);
    if (!current) {
      current = { counts: {}, samples: {}, seen: {} };
      buckets.set(key, current);
      prune(key);
    }
    return current;
  }

  function prune(currentKey) {
    const oldest = currentKey - RETENTION_MS / BUCKET_MS;
    for (const key of buckets.keys()) {
      if (key <= oldest) buckets.delete(key);
    }
  }

  // Buckets that fall inside the last `windowMs`, the current minute included.
  function within(windowMs) {
    const currentKey = Math.floor(now() / BUCKET_MS);
    const firstKey = currentKey - Math.ceil(windowMs / BUCKET_MS) + 1;
    return [...buckets.entries()].filter(([key]) => key >= firstKey && key <= currentKey).map(([, value]) => value);
  }

  return {
    startedAt,

    increment(name, by = 1) {
      const current = bucket();
      current.counts[name] = (current.counts[name] || 0) + by;
      totals[name] = (totals[name] || 0) + by;
    },

    observe(name, value) {
      if (!Number.isFinite(value) || value < 0) return;
      const current = bucket();
      const samples = current.samples[name] || (current.samples[name] = []);
      const seen = (current.seen[name] = (current.seen[name] || 0) + 1);
      if (samples.length < SAMPLE_LIMIT) {
        samples.push(value);
      } else {
        const slot = Math.floor(random() * seen);
        if (slot < SAMPLE_LIMIT) samples[slot] = value;
      }
    },

    count(name, windowMs = RETENTION_MS) {
      return within(windowMs).reduce((sum, current) => sum + (current.counts[name] || 0), 0);
    },

    total(name) {
      return totals[name] || 0;
    },

    samples(name, windowMs = RETENTION_MS) {
      return within(windowMs).flatMap((current) => current.samples[name] || []);
    },

    // Nearest-rank percentile (p between 0 and 100); null when there are no samples.
    percentile(name, p, windowMs = RETENTION_MS) {
      const values = this.samples(name, windowMs).sort((a, b) => a - b);
      if (values.length === 0) return null;
      const rank = Math.max(1, Math.ceil((p / 100) * values.length));
      return values[rank - 1];
    },

    reset() {
      buckets = new Map();
      totals = {};
    },
  };
}

module.exports = { createMetricsStore, BUCKET_MS, RETENTION_MS, SAMPLE_LIMIT };
