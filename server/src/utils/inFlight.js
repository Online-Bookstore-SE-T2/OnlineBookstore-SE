function createInFlightCoalescer() {
  const inFlight = new Map();

  return function coalesce(key, operation) {
    const existing = inFlight.get(key);
    if (existing) return existing;

    const pending = Promise.resolve().then(operation);
    inFlight.set(key, pending);

    const cleanup = () => {
      if (inFlight.get(key) === pending) {
        inFlight.delete(key);
      }
    };

    pending.then(cleanup, cleanup);
    return pending;
  };
}

module.exports = { createInFlightCoalescer };
