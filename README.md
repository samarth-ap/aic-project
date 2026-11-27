# Lost and Found

**Lose the thread in a lecture? Tap once and get back on track in under a minute.**

UW AI Collective · Project Cycles · Demo Day (December)

The professor records the lecture in the app and it's transcribed as it happens. A student who gets lost taps a big red **Lost** button and gets a short TLDR of what was just said from an AI tutor that already knows the lecture up to that second. They can keep chatting if the short answer isn't enough.

Every tap is stamped against the professor's one recording, so the whole class shares one timeline. After the lecture the professor sees where the class got lost (like YouTube's "most replayed" curve, but for confusion) and publishes a short clarification for each hotspot. Students see the same hotspots without names, their own moments for exam review, a concept map and a personalised study plan.

---

## Quick start

Needs **Node 22.13+** (uses the built-in `node:sqlite`, so nothing native to compile).

```bash
npm install
cp .env.example .env.local      # optional: add ANTHROPIC_API_KEY (or GROQ_API_KEY) for the AI tutor
npm run seed                    # demo: CSE 143 with 12 lectures, ~96 students
npm run dev                     # http://localhost:3000
```

Sign in with **Use my email**. With no email service configured (local dev), the 6-digit code is shown on screen.

| Account | Opens |
|---|---|
| `prof@uw.edu` | Professor web app (`/teach`) |
| `student@uw.edu` | Student app (`/app`). Best viewed at phone width, or on a phone. |

To try a **live lecture** without a microphone, run `npm run simulate` in a second terminal: it starts a lecture in CSE 143 twenty minutes in, replays the transcript in real time and has classmates tap Lost around the hotspots. Join it as the student, tap Lost, and open `/teach/live/CODE` as the professor. Ctrl+C ends it and runs the after-lecture analysis.

| Command | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm test` | Unit tests (hotspots, tutor format, study plan, quizzes, captions, auth) |
| `npm run seed` | Resets the local SQLite database and loads the demo |
| `npm run simulate` | A live demo lecture (`-- --at 5` to start 5 minutes in) |
| `npm run typecheck` / `npm run lint` | Checks |

## What's in the app

### Students (phone)

Four tabs plus a full-screen live mode. Add it to the home screen for an app-like experience (it ships a web manifest).

| Screen | What it does |
|---|---|
| Welcome, sign in | Google, Apple (when configured) or a 6-digit email code |
| Join | Scan the professor's QR code or type the class code (once per class). A one-off lecture code works too. |
| Classes | Class cards, a **Live now** banner with **Join lecture** |
| Class page | Study plan and concept map cards, lectures with *your* Lost count and the class hotspot count |
| Live lecture | One big red **Lost** button, live clock, "My moments this lecture". Dark by default, no sounds, light haptic. Taps made offline are queued with their lecture time and sent on reconnect. |
| Tutor sheet | Opens over the live screen. TLDR first (about 60 words, names the concept: "You're in: base cases"), then **Got it** / **Explain more** / **Give an example**, typed follow-ups, and **What did I miss?** (a two-line catch-up of what was said since the tap). A second tap within 30 s reopens the same thread. |
| Lecture page | Where the class got lost (curve with your moments in gold, tap a peak to jump there), replay with transcript, hotspot cards with published clarifications |
| Concept map | Built after each lecture (or across the class): taught concepts, class hotspots filled, your questions as dashed gold branches |
| My moments | Every Lost moment and chat, searchable, filter by "Still fuzzy" or class, mark *Got it* / *Still fuzzy*, delete a thread |
| Study | Countdown to the exam, today's ~20-minute plan (weak spots first), 5-question checks, "Rewatch 2 min", "Explain again", where you stand by topic |
| Profile | Notification and dark-screen settings, privacy note, download my chats, delete my data |

### Professors (laptop web app)

| Screen | What it does |
|---|---|
| Class page | Class code + QR, topics that keep coming up, drafts waiting for review, lecture table (joined, lost at least once, hotspots, clarifications), **Start lecture** (title + optional slides/notes for the tutor) |
| Live lecture | Big QR and code to project, recording indicator and clock, students joined, optional live Lost count (off by default), tutor context (slides, microphone level, transcript status), **Stop lecture** |
| Lecture: Insights | Lost taps, students lost at least once, resolved by the tutor, hotspots; the confusion curve; for each hotspot the transcript excerpt, students' grouped questions, an editable draft clarification, **Publish**, **Attach link or video**, **Dismiss** |
| Lecture: Recording | Audio player over the confusion curve, transcript (click a line to play from there), jump to a hotspot |
| Lecture: Clarifications | What students see, with "opened by", "of students lost here" and "marked Got it after" |
| Term trends | Students lost by lecture, tutor resolution rate, topics that keep producing hotspots and how many students are still fuzzy |
| Class settings | Rename, exam date, end-of-term audio deletion date, graded work the tutor must not answer, regenerate code, TA code, remove students |

## How it works

```
Professor laptop (/teach/live/CODE)                    Student phone (/app/live/CODE)
  microphone → MediaRecorder, 10 s chunks ─┐             tap Lost ──► POST /api/lectures/CODE/lost
  (queued and retried if the network drops) │              (server stamps lecture time; 30 s rule)
  speech-to-text (browser) → phrases ──┐    │            tutor  ──► POST /api/lectures/CODE/tutor
                                       ▼    ▼                       streams the TLDR / follow-ups
                     POST …/transcript   POST …/audio
                              │
                              ▼
                  Postgres or SQLite (lib/db.ts)
                              │
     running summary + concept list, about once a minute   (lib/analysis/live.ts)
     tutor context at each tap: last 3-5 min weighted to the
     last 90 s, summary, slides, the student's earlier moments  (lib/analysis/tutor.ts)
                              │  Stop lecture
                              ▼
     hotspots: 30 s buckets, one count per student per bucket,
     ≥ max(3, 10% of joined), peaks within 90 s merge           (lib/analysis/hotspots.ts)
     concept map, hotspot labels, grouped questions, draft TLDRs (lib/analysis/lecture.ts)
     study plan and checks                                       (lib/analysis/study.ts)
```

All lecture times are milliseconds from the start of the professor's recording, set by the server, so every tap lands on the same timeline whatever the phone's clock says.

### AI

- `ANTHROPIC_API_KEY` → Claude (tutor and running summary on `CHAT_MODEL`, default Sonnet 5.5; after-lecture analysis on `CLAUDE_MODEL`, default Opus 5.5).
- `GROQ_API_KEY` → Groq's free tier (`lib/analysis/llm.ts`).
- Neither → **offline mode**: everything works, but the tutor quotes what the professor just said instead of explaining it, concept names come from the transcript, drafts are empty for the professor to write, and checks are fill-the-gap questions from the transcript.

### Privacy

- Professors see counts and shares, never who tapped Lost or what anyone asked. Grouped questions are paraphrased (with AI) or exact repeats.
- Students see class hotspots without names; in lectures with fewer than 10 students joined, shares show as "a few students".
- Tutor chats and study plans are visible only to the student. Students can download or delete their chats, or delete all their data.
- Names appear to staff only in class settings (to manage the roster), never next to taps or chats.
- Audio is deleted on the class's end-of-term date; transcripts, markers and chats stay.
- A "this lecture is being recorded" notice shows on the projected join screen and on the student's live screen.

## Configuration

See `.env.example`. The main ones:

| Variable | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` or `GROQ_API_KEY` | AI tutor and analysis |
| `DATABASE_URL` | Postgres (required on Vercel). Without it, SQLite in `data/`. |
| `RESEND_API_KEY`, `EMAIL_FROM` | Send sign-in codes by email (https://resend.com). Without them, local dev shows the code on screen. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google sign-in |
| `APPLE_CLIENT_ID`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY` | Sign in with Apple |
| `ALLOWED_EMAIL_DOMAINS` | Who may sign in (default `uw.edu`; `*` for anyone) |
| `ENABLE_CLASS_GUEST_EMAILS` | Set to `1` to let instructors allow guest email sign-in per class. Defaults to off. |
| `PUBLIC_URL` | What the QR code links to (a tunnel or your laptop's IP when testing with phones) |

**Google sign-in:** Google Cloud console → OAuth consent screen (External; scopes `openid email profile`) → Credentials → OAuth client (Web). Redirect URIs: `https://<your-app>/api/auth/callback/google` and `http://localhost:3000/api/auth/callback/google`.

**Apple sign-in:** in the Apple Developer account create a Services ID (that's `APPLE_CLIENT_ID`) with the return URL `https://<your-app>/api/auth/callback/apple`, and a Sign in with Apple key (`APPLE_KEY_ID`, its `.p8` contents as `APPLE_PRIVATE_KEY`). Apple requires https, so test it on the deployed app.

### Test with a guest email

Set `ENABLE_CLASS_GUEST_EMAILS=1` on the test deployment or in `.env.local`. Sign in as the instructor, open **Edit class**, select **Allow guest emails** under **Guest email sign-in**, and save. Open the class QR link (`/join/<class-code>`) in a private window or another browser profile. Sign in with a different email to join as a student. A returning guest can also sign in from the home page while an enrolled class allows guests.

The class setting applies to verified guest accounts in that class. Switch it back to **Use site email rules** to close guest access to the class. Set `ENABLE_CLASS_GUEST_EMAILS=0` or leave it unset for a deployment that uses the site email rules for every class. With the default `ALLOWED_EMAIL_DOMAINS`, those rules accept `@uw.edu` addresses.

## Using real phones

- Phones need to reach the server. Deploy (below), or run a tunnel such as `cloudflared tunnel --url http://localhost:3000` and set `PUBLIC_URL` to it so the QR code points there.
- The professor's page needs the microphone, which browsers allow only on `localhost` or https. Live transcription uses the browser's speech recognition: use **Chrome or Edge** on the professor's laptop.
- Campus Wi-Fi often blocks phone-to-laptop traffic; a tunnel or a deployment avoids that.

## Deploying (Vercel)

1. Import the repo on vercel.com (Next.js defaults).
2. *Storage → Create Database → Neon* and connect it (sets `DATABASE_URL`). Tables are created on first request.
3. Add `ANTHROPIC_API_KEY` (or `GROQ_API_KEY`), `RESEND_API_KEY` + `EMAIL_FROM`, and any sign-in keys. Redeploy.
4. Optional demo data in the hosted database: `DATABASE_URL="<url>" npm run seed -- --force`.

Lecture audio is stored in the database (about 12 MB per 50-minute lecture at 32 kbps). For a long pilot, move it to object storage.

## Demo-day script (about 4 minutes)

1. **Hook:** "How many of you have been lost in lecture and said nothing?"
2. **Live:** project `/teach/live/CODE`. The audience scans the QR code and joins. Give a two-minute explanation with one deliberately confusing jump. People tap Lost and get a TLDR on their phones.
3. **The reveal:** Stop lecture. Show Insights: the peak landed on the confusing jump, the grouped questions, the draft clarification. Publish it and show it arriving on a phone.
4. **The term:** open Term trends and a student's Study tab on the seeded CSE 143.

Rehearse with `npm run simulate`; keep a seeded lecture open in another tab in case the Wi-Fi fails.

## Not built yet

- Native iOS/Android apps. The student app is a mobile web app (installable to the home screen) built to the mockups; the same screens can move to a cross-platform app later.
- Push notifications ("Tell me when a lecture starts", daily study reminder): the settings are saved but nothing is sent yet.
- A hosted streaming speech-to-text service: live transcription uses the browser's speech recognition on the professor's laptop. A caption file (`.vtt`/`.srt`) can replace the transcript afterwards via `POST /api/lectures/CODE/transcript`.
- Real-time push to phones: the app polls every 5-8 seconds; tutor answers stream.
- Later in the spec: concept map that grows live, visual explanations, live-stream and Panopto import, university SSO, paid plans, "Draft a review handout".

## Project layout

```
app/                        Next.js pages, server actions (app/actions.ts) and API routes (app/api/…)
  app/                      student app: (tabs)/…, live/[code], map/[kind]/[code]
  teach/                    professor web app: (shell)/[class]/…, live/[code]
components/                 Player (replay, confusion curve, transcript), Tutor, TabBar, icons
lib/db.ts                   storage (Postgres or SQLite)
lib/auth.ts                 sign-in and permissions
lib/views.ts                data for each screen, with the privacy rules
lib/analysis/hotspots.ts    confusion timeline and hotspots (pure, unit-tested)
lib/analysis/tutor.ts       the tutor (prompt, context, offline fallback)
lib/analysis/live.ts        running summary during the lecture
lib/analysis/lecture.ts     after-lecture processing
lib/analysis/study.ts       study plan and checks
scripts/                    seed, simulate, demo data
tests/                      vitest
```
