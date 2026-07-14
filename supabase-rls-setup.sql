-- Silicon Patterns Recruiter — Row Level Security setup for project B
-- Run this whole file in the Supabase SQL Editor (Project B → SQL Editor → New query).
-- Safe to re-run: policies are dropped and recreated idempotently.

-- ============================================================
-- candidates / search_cursors / recruiter_activities
-- Shared team database: any authenticated (logged-in) recruiter
-- gets full CRUD. assigned_recruiter_email is a label, not an
-- ownership boundary, matching the existing product model.
-- ============================================================

alter table public.candidates enable row level security;

drop policy if exists "Authenticated users can read candidates" on public.candidates;
drop policy if exists "Authenticated users can insert candidates" on public.candidates;
drop policy if exists "Authenticated users can update candidates" on public.candidates;
drop policy if exists "Authenticated users can delete candidates" on public.candidates;

create policy "Authenticated users can read candidates"
  on public.candidates for select to authenticated using (true);
create policy "Authenticated users can insert candidates"
  on public.candidates for insert to authenticated with check (true);
create policy "Authenticated users can update candidates"
  on public.candidates for update to authenticated using (true);
create policy "Authenticated users can delete candidates"
  on public.candidates for delete to authenticated using (true);

alter table public.search_cursors enable row level security;

drop policy if exists "Authenticated users can read search cursors" on public.search_cursors;
drop policy if exists "Authenticated users can write search cursors" on public.search_cursors;

create policy "Authenticated users can read search cursors"
  on public.search_cursors for select to authenticated using (true);
create policy "Authenticated users can write search cursors"
  on public.search_cursors for all to authenticated using (true) with check (true);

alter table public.recruiter_activities enable row level security;

drop policy if exists "Authenticated users can read recruiter activities" on public.recruiter_activities;
drop policy if exists "Authenticated users can write recruiter activities" on public.recruiter_activities;

create policy "Authenticated users can read recruiter activities"
  on public.recruiter_activities for select to authenticated using (true);
create policy "Authenticated users can write recruiter activities"
  on public.recruiter_activities for all to authenticated using (true) with check (true);

-- ============================================================
-- approved_emails / pending_users
-- Gate the account-approval flow itself. Any signed-in user can
-- check their OWN approval status (needed by the login flow) and
-- submit their OWN pending request, but only admins can list,
-- add, or remove entries.
--
-- IMPORTANT: keep this admin email list in sync by hand with
-- ADMIN_EMAILS in src/AuthContext.jsx. Documented in README.
-- ============================================================

alter table public.approved_emails enable row level security;

drop policy if exists "Users can check own approval" on public.approved_emails;
drop policy if exists "Admins manage approved emails" on public.approved_emails;

create policy "Users can check own approval"
  on public.approved_emails for select to authenticated
  using (email = auth.jwt() ->> 'email');

create policy "Admins manage approved emails"
  on public.approved_emails for all to authenticated
  using (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    or auth.jwt() ->> 'email' in (
      'adminsiliconpatterns@siliconpatterns.com',
      'dev@siliconpatterns.com',
      'ai@siliconpatterns.com'
    )
  )
  with check (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    or auth.jwt() ->> 'email' in (
      'adminsiliconpatterns@siliconpatterns.com',
      'dev@siliconpatterns.com',
      'ai@siliconpatterns.com'
    )
  );

alter table public.pending_users enable row level security;

drop policy if exists "Users can request own approval" on public.pending_users;
drop policy if exists "Admins manage pending users" on public.pending_users;

create policy "Users can request own approval"
  on public.pending_users for insert to authenticated
  with check (email = auth.jwt() ->> 'email');

create policy "Admins manage pending users"
  on public.pending_users for all to authenticated
  using (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    or auth.jwt() ->> 'email' in (
      'adminsiliconpatterns@siliconpatterns.com',
      'dev@siliconpatterns.com',
      'ai@siliconpatterns.com'
    )
  )
  with check (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    or auth.jwt() ->> 'email' in (
      'adminsiliconpatterns@siliconpatterns.com',
      'dev@siliconpatterns.com',
      'ai@siliconpatterns.com'
    )
  );

-- ============================================================
-- Verification (run these after the above, still in SQL Editor)
-- ============================================================
-- select tablename, rowsecurity from pg_tables
--   where schemaname = 'public'
--   and tablename in ('candidates','search_cursors','recruiter_activities','approved_emails','pending_users');
-- (all rowsecurity values should be `t`)
