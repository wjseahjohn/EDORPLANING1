# Team Production Calculator

Overriding income tracker with cloud sync via Supabase, deployable to Vercel.

---

## Setup (one-time, ~10 minutes)

### Step 1 — Create a Supabase project

1. Go to https://supabase.com and sign up (free)
2. Click **New project**, give it a name (e.g. `team-production`), choose a region close to Singapore, set a database password
3. Wait ~2 minutes for the project to provision

### Step 2 — Create the database table

1. In your Supabase project, click **SQL Editor** in the left sidebar
2. Paste and run this SQL:

```sql
create table production_data (
  id integer primary key,
  payload jsonb not null,
  updated_at timestamptz default now()
);

-- Allow read/write without auth (since no password protection needed)
alter table production_data enable row level security;

create policy "allow all" on production_data
  for all using (true) with check (true);
```

3. Click **Run**

### Step 3 — Get your Supabase credentials

1. In your Supabase project, go to **Settings → API**
2. Copy:
   - **Project URL** (looks like `https://xxxxxxxxxxxx.supabase.co`)
   - **anon / public key** (the long string under "Project API keys")

### Step 4 — Deploy to Vercel

1. Push this folder to a GitHub repository (or zip and drag-drop to Vercel)
2. Go to https://vercel.com and sign up (free)
3. Click **Add New Project** → import your GitHub repo
4. Under **Environment Variables**, add:
   - `NEXT_PUBLIC_SUPABASE_URL` → your Project URL from Step 3
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` → your anon key from Step 3
5. Click **Deploy**

That's it! Vercel gives you a URL like `https://team-production-xxx.vercel.app` — bookmark it on your phone.

---

## Local development (optional)

```bash
npm install
cp .env.local.example .env.local
# Edit .env.local and fill in your Supabase credentials
npm run dev
```

Open http://localhost:3000

---

## How it works

- All data is stored in a single row in your Supabase `production_data` table
- Every time you change a value, it auto-saves after 1.2 seconds (debounced)
- You can access it from any device — phone, tablet, laptop — and changes sync instantly
- The **Year-on-year** tab shows % change per agent and per month across 2024, 2025, and 2026

---

## Updating OR rates

If a manager's overriding rate changes, edit `src/lib/data.ts` and update the `rate` value for that agent in the relevant year's array. Redeploy to Vercel (it auto-deploys on git push if connected to GitHub).
