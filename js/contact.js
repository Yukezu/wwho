/* contact.js — contact form (Formspree email delivery, anti-spam honeypot,
 * character counter, localStorage fallback) + CV download button.
 */

/* ===== CONTACT FORM: local backup storage (only used if Formspree not configured) ===== */
const DB_KEY = 'louie_portfolio_messages';
const MAX_MESSAGE_LEN = 1000;

function getMessages() {
  const arr = store.get(DB_KEY, []);
  return Array.isArray(arr) ? arr : [];
}
function saveMessage(msg) {
  const msgs = getMessages();
  msgs.push({ ...msg, createdAt: new Date().toISOString() });
  return store.set(DB_KEY, msgs);
}
function clearMessages() {
  store.remove(DB_KEY);
  updateMsgCount();
}
function updateMsgCount() {
  const el = $('#msg-count');
  if (el) el.textContent = String(getMessages().length);
}

/* ===== Submit handler — tries Formspree first, falls back to localStorage ===== */
async function submitToFormspree(data) {
  if (!FORMSPREE_CONTACT_ID) return false;
  const res = await fetch(`https://formspree.io/f/${FORMSPREE_CONTACT_ID}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({
      name: data.name,
      email: data.email,
      message: data.message,
      _subject: `Portfolio contact from ${data.name}`,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return true;
}

function initContactForm() {
  const form = $('#contact-form');
  const btn = $('#submit-btn');
  const messageField = $('#message');
  const charCount = $('#char-count');
  if (!form || !btn) return;

  // Live character counter
  if (messageField && charCount) {
    const updateCount = () => {
      const len = messageField.value.length;
      charCount.textContent = `${len} / ${MAX_MESSAGE_LEN}`;
      charCount.classList.toggle('warn', len > MAX_MESSAGE_LEN * 0.9);
    };
    messageField.addEventListener('input', updateCount);
    updateCount();
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Honeypot — silently drop if filled (look like success to the bot)
    const hp = $('#website');
    if (hp && hp.value.trim() !== '') {
      showToast('Message sent!', "Thanks — I'll get back to you soon.");
      form.reset();
      return;
    }

    const data = {
      name: form.name.value.trim(),
      email: form.email.value.trim(),
      message: form.message.value.trim(),
    };
    if (!data.name || !data.email || !data.message) {
      showToast('Please fill in all fields', 'Your name, email, and message are required.', 'error');
      return;
    }
    if (data.message.length > MAX_MESSAGE_LEN) {
      showToast('Message too long', `Please keep it under ${MAX_MESSAGE_LEN} characters.`, 'error');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
      showToast('Invalid email', 'Please enter a valid email address.', 'error');
      return;
    }

    btn.classList.add('loading');

    // If Formspree is configured, send via email
    if (FORMSPREE_CONTACT_ID) {
      try {
        await submitToFormspree(data);
        form.reset();
        if (charCount) charCount.textContent = `0 / ${MAX_MESSAGE_LEN}`;
        const first = data.name.split(' ')[0];
        showToast('Message sent!', `Thanks ${first} — I'll get back to you soon.`, 'success');
      } catch (err) {
        showToast('Send failed', err.message + ' — saved locally as backup.', 'error');
        saveMessage(data); // fallback so the message isn't lost
        updateMsgCount();
      } finally {
        btn.classList.remove('loading');
      }
      return;
    }

    // No Formspree configured → fall back to localStorage (old behavior)
    setTimeout(() => {
      const ok = saveMessage(data);
      btn.classList.remove('loading');
      if (ok) {
        updateMsgCount();
        form.reset();
        if (charCount) charCount.textContent = `0 / ${MAX_MESSAGE_LEN}`;
        const first = data.name.split(' ')[0];
        showToast('Saved locally', `Thanks ${first} — but Formspree isn't set up yet. See README.`, 'success');
      } else {
        showToast('Could not save', 'Your browser blocked storage.', 'error');
      }
    }, 400);
  });

  // Clear messages button (only relevant when using localStorage fallback)
  const clearBtn = $('#clear-messages');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      if (getMessages().length === 0) {
        showToast('Nothing to clear', 'No saved messages yet.', 'error');
        return;
      }
      clearMessages();
      showToast('Cleared', 'All saved messages removed from this browser.', 'success');
    });
  }
}

/* ===== DOWNLOAD CV ===== */
function initDownloadCV() {
  const btn = $('#download-cv');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const cv = `LOUIE TAN
Just a Normal Person & a Student
Pampanga, Philippines
louietan195@gmail.com

========================================
ABOUT
========================================
I'm just a normal person and a student. I'm still figuring out what I want to do,
but I'm curious about a lot of things — design, code, music, films, and the small
moments that make up a day. This is a little corner of the internet where I keep
the stuff I'm into and the things I'm learning along the way.

========================================
INTERESTS
========================================
01. Design — Modern layouts, Responsive design
02. Code — Clean HTML/CSS/JS, Smooth interactions
03. Performance & Responsiveness — Speed optimization, Asset efficiency
04. Systems & Prototyping — Figma prototypes, Component systems

========================================
THINGS I'M LEARNING
========================================
Core: UI/UX Layout, Frontend Dev, Responsive Web Design, Component-based Design
Tech: HTML, CSS, JavaScript, React
Tools: Figma, Photoshop, Illustrator
Other: Git/GitHub, MongoDB, Design Systems, UI Interactions

========================================
PROJECTS
========================================
01. PC Parts E-Commerce System (2025)
02. Library Management System (2024)
03. Airbnb Data Analytics Dashboard (2024)
04. Factory Management System (2023)
05. Student Information System (2023)

========================================
CONTACT
========================================
Email: louietan195@gmail.com
Instagram: instagram.com/tanlouie_
Facebook: facebook.com/tanlouiee
GitHub: github.com/louietan
`;
    const blob = new Blob([cv], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'Louie-Tan-CV.txt';
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    showToast('CV downloaded', 'Check your downloads folder.', 'success');
  });
}

