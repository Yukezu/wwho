/* supabase-client.js — initializes the Supabase client and exposes auth helpers.
 *
 * Loaded AFTER config.js + helpers.js + the Supabase JS SDK (via CDN).
 * Falls back to the local API (helpers.js ownerLogin/ownerLogout) when
 * Supabase isn't configured.
 */

// True if Supabase URL + anon key are both set (not the placeholder).
function supabaseConfigured() {
  return !!SUPABASE_URL
    && !SUPABASE_URL.startsWith('PASTE_')
    && !!SUPABASE_ANON_KEY
    && !SUPABASE_ANON_KEY.startsWith('PASTE_')
    && typeof window.supabase !== 'undefined'; // the CDN exposes the lib on window.supabase
}

let supa = null; // the Supabase client instance

function initSupabase() {
  if (!supabaseConfigured()) return null;
  if (supa) return supa;
  try {
    supa = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true },
      realtime: { params: { eventsPerSecond: 2 } },
    });
  } catch (e) {
    console.error('Supabase init failed:', e);
    supa = null;
  }
  return supa;
}

/* ===== AUTH (Supabase or local fallback) =====
 * In Supabase mode: the lock icon prompts for email + password, then
 *   supabase.auth.signInWithPassword().
 * In local mode: the lock icon prompts for a passcode, then POST /api/login.
 *
 * Both modes store a token in localStorage (Supabase's own + our local one),
 * and isOwner() returns true if either is present.
 */

// Returns true if the owner is currently logged in (either backend).
async function isOwnerAsync() {
  const s = initSupabase();
  if (s) {
    try {
      const { data } = await s.auth.getUser();
      return !!(data && data.user);
    } catch { return false; }
  }
  return isOwner(); // local fallback (helpers.js)
}

// Synchronous-ish check — use this for initial UI. For accurate state after
// async calls, use isOwnerAsync().
function isOwnerSync() {
  const s = initSupabase();
  if (s) {
    // Supabase stores the session in localStorage synchronously — peek at it.
    try {
      const raw = localStorage.getItem('sb-' + (new URL(SUPABASE_URL)).hostname.split('.')[0] + '-auth-token');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.access_token) return true;
      }
    } catch {}
    return false;
  }
  return isOwner();
}

// Login. Returns { ok, error? }.
async function ownerLoginAny(credentials) {
  const s = initSupabase();
  if (s) {
    // credentials = { email, password }
    const { error } = await s.auth.signInWithPassword({
      email: credentials.email,
      password: credentials.password,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }
  // Local fallback — credentials = { passcode }
  try {
    await ownerLogin(credentials.passcode);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function ownerLogoutAny() {
  const s = initSupabase();
  if (s) {
    try { await s.auth.signOut(); } catch {}
  }
  ownerLogout(); // local fallback (clears our token too — harmless in Supabase mode)
}

// Subscribe to auth state changes (Supabase only). Callback gets (loggedIn: boolean).
function onAuthChange(cb) {
  const s = initSupabase();
  if (!s) return () => {};
  const { data } = s.auth.onAuthStateChange((_event, session) => {
    cb(!!(session && session.user));
  });
  return () => data?.subscription?.unsubscribe?.();
}
