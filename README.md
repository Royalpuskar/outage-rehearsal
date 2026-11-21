# Outage Rehearsal

Replay synthetic successes and failures through a circuit-breaker state machine.

**Status:** implemented browser-local research prototype. Automated tests can be reproduced with the command below. The existing Pages site previously passed smoke checks. The recovery-probe update is locally tested; its deployment and browser behavior have not yet been verified.

## Website

Live website: https://royalpuskar.github.io/outage-rehearsal/

## Problem and approach

Reliability engineers can examine how consecutive-failure thresholds and recovery policies change request admission. Every event records the state before admission, the state in which its outcome is evaluated, the resulting state, and a decision reason. It runs the same pure JavaScript engine in the browser and Node tests. All input is provided by the user or the included synthetic fixture; no external facts are inferred.

## Implemented features

- Editable scenario with a synthetic example and reset control.
- Deterministic analysis, summary metrics, filterable result table, and JSON report export.
- Input validation, explicit errors, and invalidation of outdated reports after edits.
- Keyboard-accessible controls, responsive layout, and large-screen CSS.
- Zero runtime dependencies and no external API calls.

## Install and run

Requirements: Python 3 for a static local server, Node.js 22 or later for tests.

```sh
git clone https://github.com/Royalpuskar/outage-rehearsal.git
cd outage-rehearsal
python3 -m http.server 8000
```

Open http://localhost:8000. Do not open index.html through a file URL; ES modules require a server.

```sh
node --test test.mjs
```

## Example and schema

The complete example in `sample.mjs` defines the supported input shape:

```json
{
  "threshold": 2,
  "cooldown": 5,
  "events": [
    {
      "at": 0,
      "ok": false
    },
    {
      "at": 1,
      "ok": false
    },
    {
      "at": 3,
      "ok": true
    },
    {
      "at": 6,
      "ok": true
    }
  ]
}
```

Edit one value and select **Run analysis**. **Reset example** restores the fixture. **Export report** downloads the current result; it never publishes it.

Input is capped at 200,000 serialized characters, arrays processed by the engine at 500 elements, and numeric magnitudes at 1e12. Domain constraints are checked inside `engine.mjs`; unsupported structures return an error.

## Recovery policy

Optional `recoverySuccesses` is a positive integer, defaulting to 1. Closed-state successes reset consecutive failures; reaching `threshold` opens the breaker until `retryAt`. Requests strictly before that deadline are blocked and their supplied outcomes are ignored.

An event at or after the deadline enters half-open before its outcome is evaluated. Successful probes accumulate toward `recoverySuccesses`; a failed probe immediately reopens the breaker and restarts cooldown. Closure resets both counters.

Equal timestamps are processed in array order. Zero cooldown admits the next event as a probe even at the same timestamp. Time advances only with supplied events; recovery is never synthesized after the log ends.

### Reproduce a failed-probe recovery

```json
{"threshold":1,"cooldown":5,"recoverySuccesses":2,"events":[
  {"at":0,"ok":false},{"at":5,"ok":true},{"at":6,"ok":false},
  {"at":10,"ok":true},{"at":11,"ok":true},{"at":12,"ok":true}
]}
```

Expected resulting states: open, half-open, open, open, half-open, closed. The event at 6 restarts cooldown until 11. The event at 10 is blocked despite its supplied successful outcome.

Rows retain `at`, `result`, and `state`, adding `eventIndex`, `before`, `admittedState`, `reason`, `failures`, `recoveryProgress`, and `retryAt`. The failure counter records closed-state consecutive failures and remains frozen through recovery until closure resets it. The retry deadline is null outside open state. The top-level `final` object records the last state and counters. Metrics additionally count admitted probes, opening/reopening decisions, and confirmed recoveries.

## Architecture and request flow

`index.html` loads `app.mjs`, which parses scenario JSON and calls `run` from `engine.mjs`. The engine returns `metrics` and `rows`; the UI renders values with `textContent`, never user-supplied HTML. Editing invalidates the prior report. Export creates a local Blob download.

There is no application authentication, credential store, session cookie, or token lifecycle. GitHub Pages serves public static files. The app does not collect passwords or API keys, contact third-party APIs, persist inputs, or send scenario data over the network. GitHub hosting can still receive ordinary page request metadata. Reloading discards edits.

## Limitations

Logical-time simulation only. Events represent sequential, instantaneous outcomes, not concurrent requests with separate start and completion times. No probe concurrency limit, timeout, latency, jitter, automatic retries, rolling failure window, or provider-specific semantics are modeled. No failure injection, remote traffic, or production service control. This is not a production circuit-breaker implementation.

The interface shares a portfolio design system, while this repository has its own domain engine, fixture, and tests. No accuracy, novelty, production-readiness, or 4K visual-test claim is made. Large-screen CSS is not a substitute for device testing.

## Validation

Eleven local Node tests pass for this update. They cover cooldown boundaries, failed probes, multiple-success recovery, ignored blocked outcomes, failure resets, equal-time ordering, zero cooldown, final states, and invalid inputs. A compatibility experiment enumerates all 256 eight-event success/failure sequences with threshold 2 and cooldown 2: default recovery preserves the prior result/state sequence in every case. This is a bounded compatibility check, not exhaustive correctness or a production benchmark. New browser, mobile, and 3840×2160 checks have not been performed.

`test.mjs` checks domain outcomes and edge cases, deterministic behavior, input preservation, malformed roots, and size limits. GitHub Actions runs the same suite. Review the tests themselves to see exactly what is covered; passing these checks does not establish security or exhaustive correctness.

## Roadmap

- Add more independently reviewed domain fixtures and explicit schema documentation.
- Add domain-specific form controls alongside the JSON editor.
- Expand accessibility and mobile browser testing.
- Revisit the documented domain limitations before production use.

## Contribution and license

See [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md), and [LICENSE](LICENSE).

© 2026 Puskar (Royalpuskar). All rights reserved except permissions granted by the MIT license. Preserve applicable third-party notices.

