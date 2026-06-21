/* config.js — site config.
 *
 * The site talks to Supabase directly from the browser (works on GitHub Pages).
 * If SUPABASE_URL is the placeholder, it falls back to the local Next.js API
 * (for dev / this sandbox).
 *
 * Setup (5 min): see SETUP-SUPABASE.md
 */

/* ===== SUPABASE (primary backend — works on GitHub Pages) =====
 * 1. Sign up at https://supabase.com (free, GitHub OAuth)
 * 2. Create a new project (any name, pick a region close to you)
 * 3. Wait ~2 min for provisioning
 * 4. Left sidebar → Project Settings → API
 * 5. Copy "Project URL" → paste below as SUPABASE_URL
 * 6. Copy "anon public" key → paste below as SUPABASE_ANON_KEY
 *
 * The anon key is SAFE to expose in client-side code — it's gated by Row
 * Level Security (RLS) policies in your database. Visitors can only read;
 * only you (logged in) can write.
 *
 * Then run supabase/migration.sql in the SQL Editor to create the tables
 * + RLS policies, and create your owner account under Authentication → Users.
 */
const SUPABASE_URL = "https://wbhikjfmvhbtspkttmsz.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_qqvuqButj6XtKG0P3BAtGg_uiZLSvUZ";

/* ===== OWNER (used only by the local-API fallback) =====
 * Passcode you type when you click the lock icon in dev mode.
 * Set in the server's .env as OWNER_PASSCODE.
 * For Supabase mode, you log in with email + password instead.
 */


/* ===== FORMSPREE (optional email notifications) =====
 * Free tier: 50 submissions/month per form.
 * Leave as "" to disable — the contact form still saves to the DB.
 */
const FORMSPREE_CONTACT_ID   = "https://formspree.io/f/xrewzlvk";
const FORMSPREE_GUESTBOOK_ID = "https://formspree.io/f/mjgqboda";

/* ===== TMDB (The Movie Database — powers the "Watching" card) =====
 * Free, no credit card. Get a key in ~2 minutes:
 *   1. Sign up at https://www.themoviedb.org/signup
 *   2. Go to https://www.themoviedb.org/settings/api
 *   3. Click "Register for a new key" → choose "Developer"
 *   4. Copy the "API Key (v3 auth)" value → paste below
 *
 * Leave as "" to disable — the Watching card falls back to a plain title field.
 */
const TMDB_API_KEY = "2b9dad871566445c47964cc6766a4aec";

// Expose globals so other scripts can use them.
