# RFC 0003: Free Axiom log retention

- **Status:** Implemented
- **Created:** 2026-08-14
- **Target release:** 1.0.0
- **Spec sections touched:** 11.12
- **Frozen interfaces touched:** none

## Summary

Dana will keep its privacy-approved structured logs on stdout and, when two
private production settings are present, mirror the same records directly to a
30-day Axiom dataset over HTTPS. This replaces the planned Render-to-Syslog
drain for the basic MVP without adding a paid observability subscription.

## Motivation

P9 verified the external plan boundaries instead of relying on the candidates
recorded before implementation. Axiom's free plan provides the required
30-day dataset retention, but its Secure Syslog endpoint is paid-only. Better
Stack's free Logs plan retains data for three days. The owner chose the free
route on 2026-08-14 because Dana is still a basic MVP and accepted that this
store covers Dana's application events, while Render's platform and build logs
remain subject to Render's shorter retention.

## Specification delta

### Replace section 11.12

```markdown
### 11.12 Observability

- Sentry (free tier) receives server and client errors; AC-104 proves the wiring.
- Better Stack (free tier): an uptime monitor on /api/health, and a heartbeat the scheduler pass pings after each successful cycle; heartbeat silence beyond 10 minutes alerts. /api/health also reports seconds since the last completed pass.
- Dana's privacy-policy logger continues to write its structured application events to stdout, which leaves Render's deploy diagnostics and seven-day Hobby log explorer intact. When both `AXIOM_DATASET` and an ingest-only `AXIOM_TOKEN` are present, the same Pino records are also sent directly over HTTPS to that Axiom dataset, whose retention is at least 30 days; with neither setting the external destination is disabled, and an incomplete pair records only the missing variable name and remains stdout-only. Only the closed, whitelisted logging surface of 10.5 reaches Axiom. Render platform and build logs are not copied and retain Render's own plan period. This direct destination is v1's accepted substitute for a Render workspace log stream because the free Axiom plan does not include its Secure Syslog endpoint and the free Better Stack Logs plan does not meet 10.5's retention period.
```

## Compatibility and migration

No schema, stored data, or API changes. Production remains stdout-only until
both Render environment variables are added together during P10; removing
either variable returns Dana to its previous stdout-only behavior.

## Alternatives considered

- Upgrade Axiom for Secure Syslog. Rejected for v1 because it adds a recurring
  subscription solely to preserve a transport shape.
- Upgrade Better Stack Logs. Rejected for the same cost reason; its free
  retention does not meet 10.5.
- Keep only Render's Hobby logs. Rejected because seven days violates 10.5.
- Delay all log retention to a later version. Rejected because privacy-safe
  operational evidence is part of the first release gate.

## Open questions

None.

## Implementation plan

| ID | Delivers | Depends on | Blocks | Owner | Acceptance |
| - | - | - | - | - | - |
| P9A | Optional dual stdout/Axiom Pino transport, environment example, privacy and configuration tests, operator instructions | P9 logging policy | P10 | `10-platform.md` | Default is stdout-only; partial configuration exposes no secret; both values select the official Axiom transport; full CI remains green |

The package is serial with the rest of P9. P10 activates the two private
settings and records a searchable production event plus the forbidden-value
search required by the operator guide.
