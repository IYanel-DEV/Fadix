/* ══════════════════════════════════════════
   AppFlow — Dashboard Application
   ══════════════════════════════════════════ */

/* ── State ── */
const state = {
  user: null,
  files: [],
  notes: [],
  currentFile: null,
  editingFile: null,
  searchCache: {},
};

/* ── DOM refs ── */
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

/* ── Auth ── */

// Check if logged in
(function checkAuth() {
  const saved = localStorage.getItem("appflow_user");
  if (saved) {
    try {
      state.user = JSON.parse(saved);
      showDashboard();
    } catch { /* invalid */ }
  }
})();

$("#loginForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const email = $("#loginEmail").value.trim();
  const password = $("#loginPassword").value;
  const users = JSON.parse(localStorage.getItem("appflow_users") || "[]");
  const user = users.find((u) => u.email === email && u.password === password);
  if (!user) return showAuthError("Invalid email or password");
  loginUser(user);
});

$("#registerForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const name = $("#regName").value.trim();
  const email = $("#regEmail").value.trim();
  const password = $("#regPassword").value;
  if (password.length < 6) return showAuthError("Password must be at least 6 characters");
  const users = JSON.parse(localStorage.getItem("appflow_users") || "[]");
  if (users.some((u) => u.email === email)) return showAuthError("Email already registered");
  const user = { id: Date.now().toString(36), name, email, password, createdAt: Date.now() };
  users.push(user);
  localStorage.setItem("appflow_users", JSON.stringify(users));
  loginUser(user);
});

$("#showSignup").addEventListener("click", (e) => {
  e.preventDefault();
  $(".auth-form.active").classList.remove("active");
  $("#registerForm").classList.add("active");
  hideAuthError();
});

$("#showLogin").addEventListener("click", (e) => {
  e.preventDefault();
  $(".auth-form.active").classList.remove("active");
  $("#loginForm").classList.add("active");
  hideAuthError();
});

$("#logoutBtn").addEventListener("click", () => {
  localStorage.removeItem("appflow_user");
  state.user = null;
  $("#dashboard").style.display = "none";
  $("#authContainer").style.display = "flex";
});

function loginUser(user) {
  state.user = user;
  localStorage.setItem("appflow_user", JSON.stringify(user));
  showDashboard();
}

function showAuthError(msg) {
  let el = $(".auth-error");
  if (!el) {
    el = document.createElement("div");
    el.className = "auth-error";
    $(".auth-form.active").prepend(el);
  }
  el.textContent = msg;
  el.style.display = "block";
}

function hideAuthError() {
  const el = $(".auth-error");
  if (el) el.style.display = "none";
}

/* ── Dashboard ── */
function showDashboard() {
  $("#authContainer").style.display = "none";
  const d = $("#dashboard");
  d.style.display = "flex";
  loadUserProfile();
  loadFiles();
  loadNotes();
  switchTab("search");
}

function loadUserProfile() {
  if (!state.user) return;
  const initials = state.user.name.split(" ").map((s) => s[0]).join("").toUpperCase().slice(0, 2);
  $("#profileAvatar").textContent = initials;
  $("#profileName").textContent = state.user.name;
  $("#profileEmail").textContent = state.user.email;
}

/* ── Tab Switching ── */
$$(".nav-item").forEach((btn) => {
  btn.addEventListener("click", () => {
    const tab = btn.dataset.tab;
    switchTab(tab);
  });
});

function switchTab(tab) {
  $$(".nav-item").forEach((n) => n.classList.remove("active"));
  document.querySelector(`.nav-item[data-tab="${tab}"]`).classList.add("active");
  $$(".tab-content").forEach((t) => t.classList.remove("active"));
  $(`#tab-${tab}`).classList.add("active");
}

/* ── Toast ── */
function toast(message, type = "success") {
  const t = document.createElement("div");
  t.className = `toast ${type}`;
  t.textContent = message;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

/* ── Search ── */

// Tavily-style search simulation using a public CORS proxy
// In production, point this to your own server endpoint
const SEARCH_API = "https://api.tavily.com/search";

async function performSearch(query) {
  const resultsEl = $("#searchResults");

  // Check cache
  const cacheKey = query.toLowerCase().trim();
  if (state.searchCache[cacheKey]) {
    renderSearchResults(state.searchCache[cacheKey]);
    return;
  }

  resultsEl.innerHTML = `<div class="search-loading"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg> Searching...</div>`;

  try {
    // Try the built-in search proxy first
    const resp = await fetch("/api/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, apiKey: localStorage.getItem("appflow_search_key") || "" }),
    });

    if (resp.ok) {
      const data = await resp.json();
      const results = formatTavilyResults(data);
      state.searchCache[cacheKey] = results;
      renderSearchResults(results);
      return;
    }
  } catch { /* fall through to demo */ }

  // Demo / fallback results for when no search API is configured
  const demos = [
    { title: "MDN Web Docs — HTML", url: "https://developer.mozilla.org/en-US/docs/Web/HTML", snippet: "HTML (HyperText Markup Language) is the most basic building block of the Web. It defines the meaning and structure of web content." },
    { title: "MDN Web Docs — CSS", url: "https://developer.mozilla.org/en-US/docs/Web/CSS", snippet: "Cascading Style Sheets (CSS) is a stylesheet language used to describe the presentation of a document written in HTML." },
    { title: "MDN Web Docs — JavaScript", url: "https://developer.mozilla.org/en-US/docs/Web/JavaScript", snippet: "JavaScript (JS) is a lightweight, interpreted, first-class functions programming language." },
    { title: "React Documentation", url: "https://react.dev", snippet: "React is the library for web and native user interfaces. Build user interfaces out of individual pieces called components." },
    { title: "Node.js Documentation", url: "https://nodejs.org/en/docs", snippet: "Node.js is an open-source, cross-platform JavaScript runtime environment. Execute JavaScript code outside a browser." },
  ];

  const filtered = query
    ? demos.filter((r) => r.title.toLowerCase().includes(query.toLowerCase()) || r.snippet.toLowerCase().includes(query.toLowerCase()))
    : demos;

  state.searchCache[cacheKey] = filtered;
  renderSearchResults(filtered);
}

function formatTavilyResults(data) {
  if (!data || (!data.results && !data.answer)) return [];
  const results = [];
  if (data.answer) {
    results.push({ title: "AI Summary", url: "", snippet: data.answer, isSummary: true });
  }
  if (data.results) {
    for (const r of data.results) {
      results.push({ title: r.title, url: r.url, snippet: r.content });
    }
  }
  return results;
}

function renderSearchResults(results) {
  const el = $("#searchResults");
  if (!results || results.length === 0) {
    el.innerHTML = `<div class="search-empty">No results found. Try a different query.</div>`;
    return;
  }
  el.innerHTML = results.map((r) =>
    `<div class="search-result">
      <h3>${r.isSummary ? "📝" : ""} ${r.url ? `<a href="${r.url}" target="_blank" rel="noopener">${escapeHtml(r.title)}</a>` : escapeHtml(r.title)}</h3>
      <p>${escapeHtml(r.snippet)}</p>
      ${r.url ? `<div class="source">${escapeHtml(new URL(r.url).hostname)}</div>` : ""}
    </div>`
  ).join("");
}

$("#searchBtn").addEventListener("click", () => performSearch($("#searchInput").value));
$("#searchInput").addEventListener("keydown", (e) => { if (e.key === "Enter") performSearch(e.target.value); });

/* ── Files ── */
function loadFiles() {
  const key = `appflow_files_${state.user?.id || "default"}`;
  state.files = JSON.parse(localStorage.getItem(key) || "[]");
  renderFiles();
}

function saveFiles() {
  const key = `appflow_files_${state.user?.id || "default"}`;
  localStorage.setItem(key, JSON.stringify(state.files));
  renderFiles();
}

function renderFiles() {
  const el = $("#fileList");
  if (state.files.length === 0) {
    el.innerHTML = `<div class="search-empty">No files yet. Click "New File" to create one.</div>`;
    return;
  }
  el.innerHTML = state.files.map((f, i) =>
    `<div class="file-item">
      <div class="file-item-name" data-index="${i}">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        ${escapeHtml(f.name)}
      </div>
      <div class="file-item-actions">
        <button class="edit-btn" data-index="${i}">Edit</button>
        <button class="delete-btn" data-index="${i}">Delete</button>
      </div>
    </div>`
  ).join("");

  // Click file name to open in editor
  el.querySelectorAll(".file-item-name").forEach((div) => {
    div.addEventListener("click", () => openFileEditor(parseInt(div.dataset.index)));
  });
  el.querySelectorAll(".edit-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => { e.stopPropagation(); openFileEditor(parseInt(btn.dataset.index)); });
  });
  el.querySelectorAll(".delete-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.index);
      if (confirm(`Delete "${state.files[idx].name}"?`)) {
        state.files.splice(idx, 1);
        saveFiles();
        closeFileEditor();
        toast("File deleted");
      }
    });
  });
}

$("#newFileBtn").addEventListener("click", () => showNewFileModal());

function showNewFileModal() {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal">
      <h3>Create New File</h3>
      <div class="input-group">
        <label>Filename</label>
        <input type="text" id="newFileName" placeholder="example.txt" autofocus>
      </div>
      <div class="input-group">
        <label>Content (optional)</label>
        <textarea id="newFileContent" rows="6" style="width:100%;padding:10px 12px;background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--text);font-size:13px;font-family:var(--font);outline:none;resize:vertical"></textarea>
      </div>
      <div class="modal-actions">
        <button class="modal-cancel" id="newFileCancel">Cancel</button>
        <button class="modal-confirm" id="newFileConfirm">Create</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const nameInput = overlay.querySelector("#newFileName");
  const contentInput = overlay.querySelector("#newFileContent");

  nameInput.focus();
  nameInput.addEventListener("keydown", (e) => { if (e.key === "Enter") confirm(); });

  overlay.querySelector("#newFileCancel").addEventListener("click", () => overlay.remove());
  overlay.querySelector("#newFileConfirm").addEventListener("click", confirm);

  function confirm() {
    const name = nameInput.value.trim();
    if (!name) return nameInput.focus();
    state.files.push({ name, content: contentInput.value, createdAt: Date.now() });
    saveFiles();
    overlay.remove();
    toast(`File "${name}" created`);
    openFileEditor(state.files.length - 1);
  }
}

function openFileEditor(index) {
  state.editingFile = index;
  const file = state.files[index];
  if (!file) return;
  const editor = $("#fileEditor");
  editor.style.display = "block";
  $("#editorFilename").textContent = file.name;
  $("#editorContent").value = file.content || "";
  // Scroll to editor
  editor.scrollIntoView({ behavior: "smooth", block: "center" });
}

$("#saveFileBtn").addEventListener("click", () => {
  if (state.editingFile === null) return;
  const file = state.files[state.editingFile];
  if (!file) return;
  file.content = $("#editorContent").value;
  saveFiles();
  toast(`"${file.name}" saved`);
});

$("#closeEditorBtn").addEventListener("click", closeFileEditor);
function closeFileEditor() {
  state.editingFile = null;
  $("#fileEditor").style.display = "none";
}

/* ── Notes ── */
function loadNotes() {
  const key = `appflow_notes_${state.user?.id || "default"}`;
  state.notes = JSON.parse(localStorage.getItem(key) || "[]");
  renderNotes();
}

function saveNotes() {
  const key = `appflow_notes_${state.user?.id || "default"}`;
  localStorage.setItem(key, JSON.stringify(state.notes));
  renderNotes();
}

function renderNotes() {
  const el = $("#notesList");
  if (state.notes.length === 0) {
    el.innerHTML = `<div class="search-empty">No notes yet. Click "New Note" to create one.</div>`;
    return;
  }
  el.innerHTML = state.notes.map((n, i) =>
    `<div class="note-card" data-index="${i}">
      <button class="delete-note" data-index="${i}">✕</button>
      <h3>${escapeHtml(n.title || "Untitled")}</h3>
      <p>${escapeHtml(n.content || "")}</p>
      <div class="note-date">${new Date(n.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</div>
    </div>`
  ).join("");

  el.querySelectorAll(".note-card").forEach((card) => {
    card.addEventListener("click", (e) => {
      if (e.target.closest(".delete-note")) return;
      const idx = parseInt(card.dataset.index);
      editNote(idx);
    });
  });
  el.querySelectorAll(".delete-note").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.index);
      if (confirm(`Delete "${state.notes[idx].title || "Untitled"}"?`)) {
        state.notes.splice(idx, 1);
        saveNotes();
        toast("Note deleted");
      }
    });
  });
}

$("#newNoteBtn").addEventListener("click", () => showNewNoteModal());

function showNewNoteModal(editIndex = null) {
  const isEdit = editIndex !== null;
  const existing = isEdit ? state.notes[editIndex] : { title: "", content: "" };

  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal">
      <h3>${isEdit ? "Edit Note" : "New Note"}</h3>
      <div class="input-group">
        <label>Title</label>
        <input type="text" id="noteTitle" value="${escapeHtml(existing.title)}" placeholder="Note title" autofocus>
      </div>
      <div class="input-group">
        <label>Content</label>
        <textarea id="noteContent" rows="8" style="width:100%;padding:10px 12px;background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--text);font-size:13px;font-family:var(--font);outline:none;resize:vertical">${escapeHtml(existing.content)}</textarea>
      </div>
      <div class="modal-actions">
        <button class="modal-cancel" id="noteCancel">Cancel</button>
        <button class="modal-confirm" id="noteConfirm">${isEdit ? "Save" : "Create"}</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  overlay.querySelector("#noteTitle").focus();
  overlay.querySelector("#noteCancel").addEventListener("click", () => overlay.remove());
  overlay.querySelector("#noteConfirm").addEventListener("click", () => {
    const title = overlay.querySelector("#noteTitle").value.trim() || "Untitled";
    const content = overlay.querySelector("#noteContent").value.trim();
    if (isEdit) {
      state.notes[editIndex] = { ...state.notes[editIndex], title, content };
    } else {
      state.notes.push({ title, content, createdAt: Date.now() });
    }
    saveNotes();
    overlay.remove();
    toast(isEdit ? "Note saved" : "Note created");
  });
}

function editNote(index) {
  showNewNoteModal(index);
}

/* ── Utilities ── */
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
