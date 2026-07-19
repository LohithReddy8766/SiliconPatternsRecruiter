# Silicon Patterns Recruiter

An internal recruiter tool for sourcing, scoring, and tracking ASIC/VLSI/semiconductor engineering candidates from LinkedIn. It scrapes candidate profiles via Apify, ranks them against a job description (skills, designation, location, experience), screens them with an LLM (Groq), and tracks them through a hiring pipeline — all shared across a team via a Supabase database.

## Architecture note (read this before deploying)

This is a **100% client-side single-page app — there is no backend server**. Every call to Apify, Groq, and Supabase is made directly from the browser using public keys embedded in the built JS bundle. That means:

- **Row Level Security (RLS) on the Supabase tables is the actual security boundary**, not the app's login screen. The login screen controls what the *UI* shows; RLS controls what the *database* will actually return or accept, no matter who's asking. Run [`supabase-rls-setup.sql`](./supabase-rls-setup.sql) in the Supabase SQL Editor for any project this app points at — without it, anyone who extracts the anon key can read/write/delete all candidate data directly via the REST API, login screen or not.
- Every Supabase call in [`src/supabase.js`](./src/supabase.js) is threaded with the logged-in user's own access token (not just the shared anon key), because the RLS policies in that SQL file are scoped `to authenticated` — a request carrying only the anon key authenticates as Postgres role `anon` and gets rejected.
- The Supabase URL/anon key are **fixed in [`src/config.js`](./src/config.js)**, not user-configurable — there's no "connect a different database" flow. Only the Apify and Groq keys are editable per-browser via the in-app Settings modal, since those are the only true secrets (the anon key is meant to be public-safe under RLS).

## Setup

```bash
git clone <this-repo>
cd "best sillicon"
npm install
cp .env.example .env.local   # optional: Apify/Groq default values, see below
npm run dev
```

The app always connects to the Supabase project configured in `src/config.js`. To point it at a different project, edit that file directly, then run [`supabase-rls-setup.sql`](./supabase-rls-setup.sql) against the new project's SQL Editor (covers `candidates`, `search_cursors`, `recruiter_activities`, `approved_emails`, `pending_users`).

### Environment variables

| Variable | Purpose | Where to get it |
|---|---|---|
| `VITE_APIFY_API_TOKEN` | Runs the LinkedIn profile-search actor (`harvestapi~linkedin-profile-search`) | apify.com → Settings → Integrations |
| `VITE_GROQ_API_TOKEN` | JD parsing, AI candidate screening, outreach message generation | console.groq.com/keys |

Both are optional defaults — recruiters can also set their own via the in-app Settings modal, which takes priority per-browser.

## Deployment

The repo includes `vercel.json`. Connect the repo in Vercel, optionally set the two env vars above in the project settings, and deploy — `npm run build` is the build command Vercel will use automatically.

## Known limitations

- **No realtime multi-tab sync.** Editing in one tab only nudges other open tabs with a "data changed elsewhere, refresh?" toast — it does not live-merge state.
- **Test coverage is minimal, not exhaustive** — a handful of pure-function unit tests (`src/App.test.js`) plus one smoke test (`src/LoginPage.test.jsx`), enough to catch obvious regressions in core scoring/matching logic, not a full suite.
- **Lint has a pre-existing backlog** (mostly React Compiler/Fast Refresh warnings from before CI existed) — see `.github/workflows/ci.yml`, where it's currently non-blocking.
- **The admin allowlist must be kept in sync by hand** between `ADMIN_EMAILS` in [`src/AuthContext.jsx`](./src/AuthContext.jsx) and the matching email list inside `supabase-rls-setup.sql`'s `approved_emails`/`pending_users` policies. Adding or removing an admin means editing both.
- **Apify/Groq keys are client-visible** in the Settings modal/localStorage — true secrets, unlike the Supabase anon key, but not yet hardened (e.g. proxied through a backend). Known gap, not yet scheduled.
