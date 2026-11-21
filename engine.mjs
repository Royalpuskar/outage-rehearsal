// Deterministic, sequential circuit-breaker model. No network requests are made.
function object(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Expected an object');
  return value;
}
function number(value, label, min = 0) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > 1e12)
    throw Error(label + ' must be finite and in range');
  return value;
}
function count(value, label) {
  number(value, label, 1);
  if (!Number.isInteger(value)) throw Error(label + ' must be an integer');
  return value;
}
export function run(input) {
  object(input);
  if (JSON.stringify(input).length > 200000) throw Error('Input exceeds 200000 serialized characters');
  const threshold = count(input.threshold, 'threshold');
  const cooldown = number(input.cooldown, 'cooldown');
  const recoverySuccesses = count(input.recoverySuccesses === undefined ? 1 : input.recoverySuccesses, 'recoverySuccesses');
  if (!Array.isArray(input.events) || input.events.length > 500) throw Error('events must be an array of at most 500 items');
  let previous = -Infinity;
  // Validate the entire event log before replaying it.
  const events = Array.from(input.events, event => {
    object(event);
    const at = number(event.at, 'time', -1e12);
    if (typeof event.ok !== 'boolean') throw Error('Event ok must be a boolean');
    if (at < previous) throw Error('Events out of order');
    previous = at;
    return {at, ok: event.ok};
  });
  let state = 'closed', failures = 0, successes = 0, retryAt = null;
  let opened = 0, recovered = 0, probes = 0;
  const rows = events.map(({at, ok}, eventIndex) => {
    const before = state;
    let admittedState = state, result, reason;
    if (state === 'open' && at < retryAt) {
      result = 'blocked'; reason = 'cooldown-active';
    } else {
      if (state === 'open') {state = 'half-open'; successes = 0; retryAt = null;}
      admittedState = state;
      result = ok ? 'success' : 'failure';
      if (state === 'half-open') {
        probes++;
        if (!ok) {
          state = 'open'; retryAt = at + cooldown; successes = 0;
          opened++; reason = 'probe-failed';
        } else {
          successes++;
          if (successes >= recoverySuccesses) {
            state = 'closed'; failures = 0; successes = 0;
            recovered++; reason = 'recovery-confirmed';
          } else reason = 'recovery-pending';
        }
      } else if (ok) {
        failures = 0; reason = 'request-succeeded';
      } else {
        failures++;
        if (failures >= threshold) {
          state = 'open'; retryAt = at + cooldown; opened++; reason = 'failure-threshold';
        } else reason = 'failure-below-threshold';
      }
    }
    return {eventIndex, at, result, before, admittedState, state, reason,
      failures, recoveryProgress: successes, retryAt};
  });
  return {
    metrics: {events: rows.length, blocked: rows.filter(row => row.result === 'blocked').length,
      probes, opened, recovered},
    rows,
    final: {state, failures, recoveryProgress: successes, retryAt}
  };
}
