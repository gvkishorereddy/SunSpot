# SunSpot — Study Scout

SunSpot is a mobile-first hackathon MVP for checking recent, community-submitted crowd levels at Tempe study spaces. Study Scout shows only reports from the previous hour and verifies approximate proximity before accepting a report.

SunSpot is an independent student-built demo and is not affiliated with or endorsed by Arizona State University.

## Stack

- Next.js App Router and TypeScript
- Tailwind CSS
- Supabase PostgreSQL
- Next.js route handlers
- Browser Geolocation API
- Vitest

## Local setup

Prerequisites: Node.js 20.9 or newer, pnpm, and a Supabase project.

1. Install dependencies:

   ```bash
   pnpm install
   ```

2. Copy the environment template:

   ```bash
   cp .env.example .env.local
   ```

3. In Supabase, open the project’s **Connect** dialog and copy the project URL into `NEXT_PUBLIC_SUPABASE_URL`.

4. Open **Project Settings → API Keys**, create or copy a current secret key, and place it in `SUPABASE_SECRET_KEY`. Keep this value server-only. Never prefix it with `NEXT_PUBLIC_` or commit `.env.local`.

5. Apply the database migration using one of the methods below.

6. Start the app:

   ```bash
   pnpm dev
   ```

Then open the local URL printed in the terminal.

## Link Supabase and push the migration

The Supabase CLI is installed as a development dependency and the local Supabase folder is already initialized.

1. Authenticate in your own terminal. The command opens a browser; do not paste access tokens into chat:

   ```bash
   pnpm exec supabase login
   ```

2. Copy the project reference from **Project Settings → General → Reference ID**, then link the existing project:

   ```bash
   pnpm exec supabase link --project-ref YOUR_PROJECT_REF
   ```

3. Push the migration:

   ```bash
   pnpm exec supabase db push
   ```

The migration creates `buildings` and `reports`, enables RLS on both public tables, creates no public policies, adds report indexes, and idempotently seeds Hayden Library and Noble Library.

### SQL Dashboard fallback

If CLI linking is unavailable:

1. Open the existing Supabase project dashboard.
2. Go to **SQL Editor → New query**.
3. Open `supabase/migrations/001_study_scout.sql` locally and paste the entire file into the editor.
4. Select **Run** once.
5. In **Table Editor**, confirm that `buildings` and `reports` exist and show RLS as enabled.
6. In `buildings`, confirm rows exist for `hayden-library-tempe` and `noble-library-tempe`.

The seed uses `ON CONFLICT (slug)`, so re-running the complete migration is safe.

## API

- `GET /api/buildings` returns active buildings.
- `GET /api/reports?buildingId=<uuid>` returns newest-first reports from the previous hour plus count and average.
- `POST /api/reports` validates all input, recomputes proximity on the server, and stores only distance and reported accuracy—not raw coordinates.

All database access uses the server-only Supabase client. Because there are no public RLS policies, a browser cannot read or insert rows directly with a public key.

## Location verification

Location is requested only after the user selects **Verify location**. The server rejects reported accuracy worse than 200 meters and accepts a report only when the calculated distance is inside the building radius plus no more than 100 meters of accuracy allowance. This is an approximate proximity check and can be spoofed.

## Quality checks

```bash
pnpm test
pnpm lint
pnpm build
```

## Deploy to Vercel

1. Push this project to a Git provider and import it in Vercel.
2. Keep the detected framework preset as **Next.js**.
3. Add `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SECRET_KEY` in **Project Settings → Environment Variables** for Production, Preview, and Development as appropriate.
4. Do not add a browser-exposed Supabase key; all requests go through the Next.js server routes.
5. Deploy, then verify that `/api/buildings` responds and submit a nearby test report from an HTTPS page. Browser geolocation requires a secure context in production.

No additional build command or output-directory override is needed.
