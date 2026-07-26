// AIM Portal front-end: login gate, category chips, live keyword search.

const el = (id) => document.getElementById(id);
const loginView = el("login");
const appView = el("app");

const CATEGORIES = [
  "Handbooks",
  "Forms",
  "Syllabi",
  "Investments",
  "Policies",
  "Internships",
];

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
  if (!q) {
    el("results").innerHTML = "";
    el("status").textContent =
      "Type a keyword or pick a category above to browse the AIM library.";
    return;
  }
  const res = await api(`/api/search?q=${encodeURIComponent(q)}`);
  if (res.status === 401) return showLogin();
  const data = await res.json();
  render(data.results, q);
}

function extOf(name) {
  const m = (name || "").match(/\.([a-z0-9]+)$/i);
  return m ? m[1].toLowerCase() : "file";
}

function render(results, q) {
  const status = el("status");
  const list = el("results");
  status.textContent = results.length
    ? `${results.length} result${results.length === 1 ? "" : "s"} for “${q}”`
    : `No matches for “${q}”. Try another keyword.`;
  list.innerHTML = "";
  for (const doc of results) {
    const ext = extOf(doc.title || doc.path);
    const li = document.createElement("li");
    li.className = "result";
    li.innerHTML = `
      <span class="ext" data-ext="${ext}">${ext}</span>
      <div class="meta">
        <div class="title">${esc(stripExt(doc.title || doc.path))}</div>
        <div class="sub">${esc(doc.folder || "AIM Library")}</div>
      </div>`;
    li.addEventListener("click", () => openFile(doc));
    list.appendChild(li);
  }
}

function stripExt(name) {
  return (name || "").replace(/\.[a-z0-9]+$/i, "");
}

async function openFile(doc) {
  const res = await api(
    `/api/file?key=${encodeURIComponent(doc.key || doc.path)}`
  );
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
