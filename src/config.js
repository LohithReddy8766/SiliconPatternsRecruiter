// Fixed Supabase project connection. Not user-configurable — the app always
// talks to this shared database. The anon key is safe to bundle client-side
// because Row Level Security (supabase-rls-setup.sql) is the actual access
// boundary, not this key.
export const SUPABASE_URL = 'https://btyvynntfdswspirdyhx.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ0eXZ5bm50ZmRzd3NwaXJkeWh4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQwMDA5ODIsImV4cCI6MjA5OTU3Njk4Mn0._AtaDFXfUpSwVW3dPjcz4PGYQdWN7vC00_Wi28KRzmU';
