// AIM Portal front-end: login gate, home tiles (incl. AIM Pitches),
// category chips, live keyword search, animations.

const el = (id) => document.getElementById(id);
const loginView = el("login");
const appView = el("app");

// Icon set (inline SVG paths).
const ICONS = {
  pitch:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M7 14l4-4 3 3 5-6"/></svg>',
  book:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>',
  form:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6M9 13h6M9 17h4"/></svg>',
  syllabus:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5M2 12l10 5 10-5"/></svg>',
  chart:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><rect x="7" y="12" width="3" height="6"/><rect x="12" y="8" width="3" height="10"/><rect x="17" y="4" width="3" height="14"/></svg>',
};

// Home tiles. First one is the featured AIM Pitches card.
const TILES = [
  {
    q: "years",
    title: "AIM Pitch Library",
    desc: "676 equity write-ups, valuations, presentations & road shows — 2016 to 2025.",
    icon: "pitch",
    featured: true,
    cta: "Browse everything →",
  },
  { q: "2025", title: "2025", desc: "Latest pitches & security reviews.", icon: "chart" },
  { q: "2024", title: "2024", desc: "Reviews by sector & ticker.", icon: "chart" },
  { q: "2023", title: "2023", desc: "Fall '22 & Spring '22 write-ups.", icon: "book" },
  { q: "Road Show", title: "Road Shows & Videos", desc: "Recorded presentations.", icon: "syllabus" },
];

const CATEGORIES = ["2025", "2024", "2023", "2022", "2021", "2020", "2019", "2018", "2017", "2016"];

async function api(path, opts) {
  return fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
}

function showApp() {
  loginView.classList.add("hidden");
  appView.classList.remove("hidden");
  buildChips();
  el("q").focus();
  runSearch();
}
function showLogin() {
  appView.classList.add("hidden");
  loginView.classList.remove("hidden");
  el("password").focus();
}

async function init() {
  const { authed } = await (await api("/api/session")).json();
  authed ? showApp() : showLogin();
}

// ---------- Login ----------
el("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errEl = el("login-error");
  errEl.classList.add("hidden");
  const res = await api("/api/login", {
    method: "POST",
    body: JSON.stringify({ password: el("password").value }),
  });
  if (res.ok) {
    el("password").value = "";
    showApp();
  } else {
    errEl.textContent = "Incorrect password. Please try again.";
    errEl.classList.remove("hidden");
  }
});

el("logout").addEventListener("click", async () => {
  await api("/api/logout", { method: "POST" });
  showLogin();
});

// ---------- Category chips ----------
let activeChip = null;
function buildChips() {
  const wrap = el("chips");
  wrap.innerHTML = "";
  for (const cat of CATEGORIES) {
    const b = document.createElement("button");
    b.className = "chip";
    b.textContent = cat;
    b.addEventListener("click", () => {
      if (activeChip === b) {
        activeChip.classList.remove("active");
        activeChip = null;
        el("q").value = "";
      } else {
        document.querySelectorAll(".chip").forEach((c) => c.classList.remove("active"));
        b.classList.add("active");
        activeChip = b;
        el("q").value = cat;
      }
      runSearch();
    });
    wrap.appendChild(b);
  }
}

// ---------- Home tiles ----------
function renderHome() {
  const home = el("home");
  home.innerHTML = "";
  TILES.forEach((t, i) => {
    const div = document.createElement("div");
    div.className = "tile" + (t.featured ? " featured" : "");
    div.style.animationDelay = `${i * 0.07}s`;
    div.innerHTML = `
      <div class="tile-icon">${ICONS[t.icon]}</div>
      <h3>${t.title}</h3>
      <p>${t.desc}</p>
      ${t.cta ? `<span class="tile-cta">${t.cta}</span>` : ""}`;
    div.addEventListener("click", () => {
      el("q").value = t.q;
      runSearch();
      document.querySelector(".chips").scrollIntoView({ behavior: "smooth", block: "start" });
    });
    home.appendChild(div);
  });
}

// ---------- Search ----------
let timer;
const qInput = el("q");
qInput.addEventListener("input", () => {
  if (activeChip) {
    activeChip.classList.remove("active");
    activeChip = null;
  }
  clearTimeout(timer);
  timer = setTimeout(runSearch, 160);
});

async function runSearch() {
  const q = qInput.value.trim();
  const home = el("home");
  if (!q) {
    el("results").innerHTML = "";
    el("status").textContent = "";
    home.classList.remove("hidden");
    renderHome();
    return;
  }
  home.classList.add("hidden");
  const res = await api(`/api/search?q=${encodeURIComponent(q)}`);
  if (res.status === 401) return showLogin();
  const data = await res.json();
  render(data.results, q);
}

function extOf(name) {
  const m = (name || "").match(/\.([a-z0-9]+)$/i);
  return m ? m[1].toLowerCase() : "file";
}
function stripExt(name) {
  return (name || "").replace(/\.[a-z0-9]+$/i, "");
}

function render(results, q) {
  el("status").textContent = results.length
    ? `${results.length} result${results.length === 1 ? "" : "s"} for “${q}”`
    : `No matches for “${q}”. Try another keyword.`;
  const list = el("results");
  list.innerHTML = "";
  results.forEach((doc, i) => {
    const ext = extOf(doc.title || doc.path);
    const li = document.createElement("li");
    li.className = "result";
    li.style.animationDelay = `${Math.min(i, 12) * 0.04}s`;
    li.innerHTML = `
      <span class="ext" data-ext="${ext}">${ext}</span>
      <div class="meta">
        <div class="title">${esc(stripExt(doc.title || doc.path))}</div>
        <div class="sub">${esc(doc.folder || "AIM Library")}</div>
      </div>`;
    li.addEventListener("click", () => openFile(doc));
    list.appendChild(li);
  });
}

async function openFile(doc) {
  const res = await api(`/api/file?key=${encodeURIComponent(doc.key || doc.path)}`);
  if (res.status === 401) return showLogin();
  const data = await res.json();
  if (data.url) window.open(data.url, "_blank", "noopener");
}

function esc(s) {
  return (s || "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

init();
