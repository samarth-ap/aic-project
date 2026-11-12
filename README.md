# Lost & Found

**Tap when you're lost. Get found after class.**

UW AI Collective · Project Cycles · Demo Day (December)

During lecture, students tap **I'm lost** (or *too fast* / *example please* / *got it*) on their phones, anonymously.
Afterward, the app lines the taps up with the lecture transcript and Claude:

- splits the lecture into **concepts** and maps each confusion spike to one,
- finds the **root cause**: an earlier concept that didn't land,
- writes a **2-minute brief for the professor**: what lost people, why, a concrete fix, a recap slide for next lecture, and a ready-to-paste Canvas/Ed clarification post,
- writes a **catch-up card for every student who tapped**: a short re-explanation of exactly the moment *they* got lost, plus a practice question,
- groups concepts into **topics across the quarter** so the professor sees what keeps losing people.

Students tap because it helps *them* (each tap bookmarks a moment for their catch-up card). Professors get the class-wide map as a side effect.

---

## Quick start

Needs **Node 22.13+** (uses the built-in `node:sqlite`, so nothing native to compile).

```bash
npm install
cp .env.example .env.local      # add ANTHROPIC_API_KEY for AI analysis
npm run seed                    # demo course: 2 analyzed MATH 208 lectures
npm run dev                     # http://localhost:3000
```

`npm run seed` prints links to each demo report (with the professor key) and student catch-up page.

| Command | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm test` | Unit tests for spike detection and caption parsing |
| `npm run seed` | Demo course with synthetic taps + transcript, analyzed |
| `npm run simulate -- <CODE> 30` | 30 fake students join a **live** lecture; press Enter to trigger a confusion spike. For rehearsing the demo. |
| `npm run typecheck` | TypeScript check |

Delete `data/` to reset the database.

## How it works

```
 Student phone (/s/CODE)         Professor laptop (/prof/CODE)
   tap lost / too fast /           QR code + live confusion chart
   example / got it + questions    live captions (Web Speech API) or .vtt/.srt upload
          │                                   │
          ▼                                   ▼
   POST /api/sessions/CODE/tap        POST /api/sessions/CODE/transcript
   (server timestamps, 8s cooldown)   (server timestamps each phrase)
          └──────────────┬────────────────────┘
                         ▼
               SQLite  (lib/db.ts)
                         │  "End lecture & analyze"
                         ▼
   lib/analysis/signal.ts   — dedupe → shift taps ~20s back for reaction lag
                              → 30s bins → share of active students
                              → spikes = windows well above the lecture's baseline
                                and ≥ MIN_DEVICES distinct students (privacy floor)
   lib/analysis/report.ts   — Claude (structured output): concepts, moment → concept,
                              root cause, fix, catch-up cards, question clusters,
                              recap slide, clarification post
   lib/analysis/trends.ts   — Claude groups concepts across lectures into topics
                         │
          ┌──────────────┴───────────────┐
          ▼                              ▼
  /prof/CODE/report               /s/CODE/catchup
  /course?course=...              (cards for the moments THIS phone tapped)
```

### Pages

| Path | Who | What |
|---|---|---|
| `/` | everyone | Join with a code, or start a lecture |
| `/s/CODE` | student | Big tap button, anonymous question box |
| `/s/CODE/catchup` | student | Personal catch-up cards after class |
| `/prof/CODE` | professor | QR code, live chart and alert, live captions / caption upload, end & analyze |
| `/prof/CODE/report` | professor | Post-lecture brief |
| `/course?course=…` | professor | Quarter view: topics ranked by confusion |

### Privacy model

- Students never log in. Each phone gets a random id in `localStorage`; it's never linked to a name.
- Professors never see device ids. Reports only show moments with **≥ `MIN_DEVICES` distinct students** (default 3 for demos, use 5+ in real classes).
- Catch-up cards are looked up by the phone's own id (hashed in the stored report). Only that phone can ask for its cards.
- Professor pages need the session's admin key (kept in the professor's browser, or in the `#k=` link).
- Taps and caption lines are time-stamped by the server, not the phone.

## Demo-day script (≈4 minutes)

1. **Hook (30s)**: "How many of you have been lost in lecture and said nothing?"
2. **Live mini-lecture (2 min)**: put `/prof/CODE` on the projector. The audience scans the QR code. Give a 2-minute explanation with one deliberately confusing jump in it. Turn on live captions. Watch the live chart and alert light up.
3. **The reveal (1 min)**: click *End lecture & analyze*. Show the brief: the spike landed on the confusing jump, the root cause, the suggested fix. Then show a phone with its catch-up card.
4. **The quarter view (30s)**: open the seeded MATH 208 course: "after a few weeks, this is what a professor sees."
5. **Close with pilot numbers** from a real section.

Rehearse with `npm run simulate`. Have a seeded report ready in another tab in case the Wi-Fi fails.

**Phones need to reach your laptop.** Either deploy (see below) or run a tunnel such as `cloudflared tunnel --url http://localhost:3000` and set `PUBLIC_URL` to the tunnel URL so the QR code points there.

## Deploying

The app stores data in one SQLite file, so it needs a host with a persistent disk (Railway, Render, Fly.io, a VM): `npm run build && npm start`.
Vercel's filesystem is temporary, so to use Vercel swap `lib/db.ts` for Postgres (e.g. Supabase). Every query goes through that one file.

## 4-week plan to Demo Day

| Week | Goal | Done when |
|---|---|---|
| 1 (now) | Run the scaffold locally, add API key, deploy or set up a tunnel. Find 1–2 pilot sections (a TA or friendly professor). | Teammates can tap from their phones on a deployed URL. |
| 2 | Tune the AI: run on a real recorded lecture (Panopto captions export) with simulated taps. Tune prompts, lag (`lagMs`) and thresholds. | Report on a real lecture reads as accurate to someone who took the class. |
| 3 | **Pilot in a real section.** Collect: % of students who tapped, taps per student, prof rating of brief accuracy (1–5), student rating of catch-up cards. | Real data from ≥ 1 lecture. |
| 4 | Polish UI, rehearse demo, put pilot numbers on slides. | Two full dry runs. |

### Ideas after the MVP

- Panopto/Canvas integration to pull captions and post the clarification automatically
- Exam-question tagging → show that confusion predicted lower scores on those questions
- TA view for discussion sections, built from the week's confusion
- Weekly email digest for the professor

## Project layout

```
app/                     Next.js pages + API routes (app/api/…)
components/              Timeline chart, LiveCaptions
lib/db.ts                SQLite storage
lib/analysis/signal.ts   Spike detection (pure, unit-tested)
lib/analysis/transcript.ts  VTT/SRT parsing + helpers
lib/analysis/report.ts   Claude analysis + offline fallback
lib/analysis/trends.ts   Quarter view topic grouping
scripts/                 seed + simulate
tests/                   vitest
```
