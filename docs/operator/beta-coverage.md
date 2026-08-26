# Closed beta: what to watch

The private half of the beta. `beta-welcome.md` is what testers are sent; this
is what you hold. Its job is not to tell anyone what to do — it is to let you
tell, at the end of the week, **what nobody touched**, which is the finding a
pile of bug reports will never give you.

## Why the welcome contains no instructions

Section 9.13 puts the entire first-run teaching load on the starter workflows:
an empty Desk offers a worked example, importing one drops a folder in the
Library, a page with sections, and tasks that land across the views of 9.4 and
9.5. That mechanism has never met a person who did not build it.

A closed beta is the only chance it will ever get. If the welcome email explains
where the bell is and how to share a folder, the measurement is destroyed and
9.13 ships untested. So the welcome says what Dana *is*, how to get *in*, and
what to *report* — and stops.

The first question of the whole beta is therefore: **did anyone import a
starter, and did they keep it?**

## Who to seed

Pairs, not individuals. Dana's thesis is that a folder is the shareable unit;
a solo tester exercises none of sharing, assignment, comments, notifications or
the roster, which is most of what v2 added. Three pairs beat ten strangers.

Seed for spread rather than for numbers:

- at least one **iPhone/Safari** user and one **Android/Chrome** user, because
  the install paths differ and the iOS one is the fragile half
- at least one tester in a **different timezone from yours** — see below
- email addresses across **Gmail, Outlook/Hotmail, iCloud and one corporate
  domain**, because that is the only way to measure inbox placement
- one person who has **never heard you describe Dana**. They are the only real
  reading you will get of 9.2 and 9.13.

## What CI cannot see, and the beta can

The gate covers 253 files, 1795 tests and 197 browser cases. Everything below is
outside it by nature — it needs real inboxes, real devices, real clocks, or real
people.

**Time and the clock**
- My Day rolling over at the tester's local midnight, not yours
- a reminder email arriving at the minute it was set for, in the tester's zone
- recurrence crossing a DST boundary
- the carry-forward of unfinished items across several real days in a row

**Email, which is entirely unmeasurable locally**
- inbox versus spam, per provider, for each of the four templates
- whether the folder-invite email reads as legitimate to someone who was not
  warned it was coming
- bounces and complaints in Resend
- the reminder that fires while the machine is asleep or the service is down

**Real devices**
- the iOS install path (Safari only — Chrome on iOS cannot do it)
- the Android install prompt, which is inconsistent by version
- desktop install in Chrome and Edge
- a photo taken on a phone and attached to a task
- the app opened cold, from the home screen, after a day away

**Real second people**
- an invite accepted by someone who has never seen Dana, end to end
- two people editing the same folder within a few minutes of each other
- comments read as a conversation rather than as a feature
- assignment to a non-member, which triggers sharing
- someone leaving a folder, and someone being removed from one

**The paths nobody volunteers for**
- Trash and restore, on something that mattered
- ownership transfer
- **account deletion** — the most destructive path in the product and the least
  exercised. Ask one tester to do it deliberately at the end, and watch what the
  log says the transaction removed.

## What the logs will and will not tell you

Section 10 forbids analytics and tracking, so there are no page views to read
and there will be no funnel. What *is* logged, at thirty days' retention in
Axiom: authentication events, invite lifecycle transitions, folder and account
deletion with row counts, status transitions, reminder sends and skips, request
errors with status codes.

That is enough to answer the questions that matter most:

- how many people signed in **more than once** (the only real retention signal
  you have)
- how many invites were created, and how many were ever accepted
- how many tasks reached `completed` rather than being created and abandoned
- how many reminders sent, and how many skipped
- which routes are throwing

It is not enough to tell you which pages were visited. For that you have the
testers' own words, which is the other reason the welcome asks for the vague
reports.

## The four dashboards, daily

| What | Answers |
| - | - |
| Sentry | did anything throw, and for whom |
| Better Stack — uptime | was the web process reachable |
| Better Stack — heartbeat | did the reminder loop keep completing (ten-minute alarm) |
| Axiom `dana-production-logs` | the counts above |
| Resend | delivery, bounces, spam complaints |

Check the heartbeat first each morning. A silent reminder loop is the failure
most likely to go unnoticed by everybody, testers included: nothing appears
broken, mail simply never comes, and the tester concludes Dana does not do
reminders.

## Before the invitations go out

- [ ] **Always-on web service bought.** A cold start on a spun-down instance is
      roughly a minute of blank screen, and it lands on every tester at once, on
      first impression, for a fault that is not in the product.
- [ ] **Database renewed** (expires 2026-09-12) — the beta must not run across
      that date on an expiring instance.
- [ ] **The sign-in gate decided and, if taken, built.** Nothing today stops a
      stranger who reaches the URL from getting a real account with real rows in
      the production database.
- [ ] The feedback address in `beta-welcome.md` filled in, and someone reading it.
- [ ] The four email templates sent to yourself at Gmail, Outlook and iCloud, and
      the spam folder checked in each.
- [ ] A starter workflow imported on a fresh account, on a phone, by you, once —
      so that the first time it runs in front of a stranger is not the first time
      it has run.

## Reading the week

At the end, three questions in this order:

1. **Did anyone come back on day three?** Everything else is decoration if not.
2. **Did any folder get genuinely shared and used by two people?** If no pair
   managed it, that is the finding, and it outranks every bug in the pile.
3. **What did nobody touch?** Compare the logs against the feature list. A
   surface nobody reached in a week of real use is either undiscoverable or
   unwanted, and those two need telling apart before the next thing is built.
