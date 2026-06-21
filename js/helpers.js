/* helpers.js — tiny utilities used across all scripts.
 * Exposes: $, $$, esc, store, showToast, apiFetch, isOwner, ownerLogin, ownerLogout.
 */

/* ===== DOM HELPERS ===== */
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

// Escape user-provided text before injecting into innerHTML (XSS safety).
function esc(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ===== SAFE LOCALSTORAGE ===== */
const store = {
  get(key, fallback) {
    try { const v = JSON.parse(localStorage.getItem(key)); return v ?? fallback; }
    catch { return fallback; }
  },
  set(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); return true; }
    catch { return false; }
  },
  getRaw(key, fallback = '') {
    try { return localStorage.getItem(key) ?? fallback; }
    catch { return fallback; }
  },
  setRaw(key, val) {
    try { localStorage.setItem(key, val); return true; }
    catch { return false; }
  },
  remove(key) {
    try { localStorage.removeItem(key); return true; }
    catch { return false; }
  },
};

/* ===== OWNER AUTH (passcode → token stored in localStorage) ===== */
const AUTH_TOKEN_KEY = 'louie_portfolio_token';

function getAuthToken() { return store.getRaw(AUTH_TOKEN_KEY, ''); }
function setAuthToken(t) { store.setRaw(AUTH_TOKEN_KEY, t); }
function clearAuthToken() { store.remove(AUTH_TOKEN_KEY); }
function isOwner() { return !!getAuthToken(); }

// Login: POST passcode to /api/login, store the returned token.
async function ownerLogin(passcode) {
  const res = await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ passcode }),
  });
  if (!res.ok) {
    let msg = 'Login failed';
    try { const e = await res.json(); msg = e.error || msg; } catch {}
    throw new Error(msg);
  }
  const data = await res.json();
  setAuthToken(data.token);
  return data;
}

function ownerLogout() {
  clearAuthToken();
}

/* ===== API FETCH HELPER =====
 * Adds the auth header if we have a token, and JSON-encodes object bodies. */
async function apiFetch(path, options = {}) {
  const opts = { ...options };
  const headers = { ...(opts.headers || {}) };
  if (opts.body && typeof opts.body === 'object' && !(opts.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(opts.body);
  }
  const token = getAuthToken();
  if (token) headers['Authorization'] = 'Bearer ' + token;
  opts.headers = headers;
  const res = await fetch(path, opts);
  return res;
}

/* ===== TOAST (XSS-safe) ===== */
function showToast(title, desc, kind /* 'error' | 'success' | undefined */) {
  const toast = $('#toast');
  if (!toast) return;
  toast.innerHTML = `<div class="toast-title">${esc(title)}</div>${desc ? `<div class="toast-desc">${esc(desc)}</div>` : ''}`;
  toast.className = 'toast show' + (kind ? ' ' + kind : '');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove('show'), 4000);
}

/* ===== DEBUG HELPERS ===== */
window.louiePortfolio = {
  isOwner: () => isOwner(),
  logout: () => { ownerLogout(); return 'logged out'; },
  version: '4.0.0-local',
};
