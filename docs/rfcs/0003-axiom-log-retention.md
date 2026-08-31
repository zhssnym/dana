# RFC 0003: Axiom log retention

**Status:** implemented
**Milestone:** none, this RFC predates the milestone process

Dana keeps its privacy-approved structured logs on stdout and, when two private production
settings are present, mirrors the same records to a 30-day Axiom dataset over HTTPS. That
replaced the planned Render-to-Syslog drain without adding a paid observability
subscription. The behaviour it introduced is specified in section 11.12.

The vendor facts were checked on 2026-08-14 against the plans themselves, rather than
taken from the candidates recorded before implementation. Axiom's free plan gives the
30-day retention section 10.5 requires, but its Secure Syslog endpoint is paid only.
Better Stack's free Logs plan retains three days. Render's Hobby log explorer keeps seven.
So only Axiom's free tier meets the requirement, and only by ingesting over HTTPS rather
than syslog. These are facts that cost research and go stale, which is why they are kept
with the date they were checked.

The owner chose the free route on 2026-08-14 because Dana was still a basic MVP, and
accepted that this store covers Dana's own application events while Render's platform and
build logs keep Render's shorter retention.

Four options lost. Upgrading Axiom for Secure Syslog adds a recurring subscription solely
to preserve a transport shape. Upgrading Better Stack Logs costs the same for the same
reason. Keeping only Render's Hobby logs violates 10.5 at seven days. Deferring log
retention to a later version gives up privacy-safe operational evidence, which was part of
the first release gate.
