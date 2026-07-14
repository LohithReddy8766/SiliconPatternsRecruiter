# Silicon Patterns Recruiter

An internal recruiter tool for sourcing, scoring, and tracking ASIC/VLSI/semiconductor engineering candidates from LinkedIn. It scrapes candidate profiles via Apify, ranks them against a job description (skills, designation, location, experience), screens them with an LLM (Groq), and tracks them through a hiring pipeline — all shared across a team via a Supabase database.

## Architecture note (read this before deploying)

This is a **100% client-side single-page app — there is no backend server**. Every call to Apify, Groq, and Supabase is made directly from the browser using public keys embedded in the built JS bundle. That means:

- **Row Level Security (RLS) on the Supabase tables is the actual security boundary**, not the app's login screen. The login screen controls what the *UI* shows; RLS controls what the *database* will actually return or accept, no matter who's asking. Run [`supabase-rls-setup.sql`](./supabase-rls-setup.sql) in the Supabase SQL Editor for any project this app points at — without it, anyone who extracts the anon key can read/write/delete all candidate data directly via the REST API, login screen or not.
- Every Supabase call in [`src/supabase.js`](./src/supabase.js) is threaded with the logged-in user's own access token (not just the shared anon key), because the RLS policies in that SQL file are scoped `to authenticated` — a request carrying only the anon key authenticates as Postgres role `anon` and gets rejected.
- The Apify and Groq API keys are true secrets (unlike the Supabase anon key, which is meant to be public-safe under RLS) but are currently entered/stored client-side via the in-app Settings modal. Anyone with access to a logged-in session can view them in the browser. Hardening this (e.g. proxying those calls through a backend, or removing the editable UI in favor of build-time-only env vars) is a known gap — see Known limitations.

## Setup

```bash
git clone <this-repo>
cd "best sillicon"
npm install
cp .env.example .env.local   # fill in real values, see table below
npm run dev
```

On first run against a fresh Supabase project, open **Settings → View SQL Table Setup Instructions** in the app for the `candidates` table schema, then separately run [`supabase-rls-setup.sql`](./supabase-rls-setup.sql) in the Supabase SQL Editor to lock it down (also covers `search_cursors`, `recruiter_activities`, `approved_emails`, `pending_users`).

### Environment variables

| Variable | Purpose | Where to get it |
|---|---|---|
| `VITE_SUPABASE_URL` | Supabase project URL | Project Settings → API |
| `VITE_SUPABASE_ANON_KEY` | Supabase public anon key | Project Settings → API |
| `VITE_APIFY_API_TOKEN` | Runs the LinkedIn profile-search actor (`harvestapi~linkedin-profile-search`) | apify.com → Settings → Integrations |
| `VITE_GROQ_API_TOKEN` | JD parsing, AI candidate screening, outreach message generation | console.groq.com/keys |

## Deployment

The repo includes `vercel.json`. Connect the repo in Vercel, set the four env vars above in the project settings, and deploy — `npm run build` is the build command Vercel will use automatically.

## Known limitations

- **No realtime multi-tab sync.** Editing in one tab only nudges other open tabs with a "data changed elsewhere, refresh?" toast — it does not live-merge state.
- **Test coverage is minimal, not exhaustive** — a handful of pure-function unit tests (`src/App.test.js`) plus one smoke test (`src/LoginPage.test.jsx`), enough to catch obvious regressions in core scoring/matching logic, not a full suite.
- **Lint has a pre-existing backlog** (mostly React Compiler/Fast Refresh warnings from before CI existed) — see `.github/workflows/ci.yml`, where it's currently non-blocking.
- **The admin allowlist must be kept in sync by hand** between `ADMIN_EMAILS` in [`src/AuthContext.jsx`](./src/AuthContext.jsx) and the matching email list inside `supabase-rls-setup.sql`'s `approved_emails`/`pending_users` policies. Adding or removing an admin means editing both.
- **Apify/Groq keys are client-visible** — see the architecture note above.
