/* ═══════════════════════════════════════════════════════════
   LAVA — Level Access Validation Assistant
   popup.js — Main extension logic
═══════════════════════════════════════════════════════════ */

"use strict";

// ── STATE ─────────────────────────────────────────────────
let currentProjectId = null;
let currentFindingId = null;
let importItems = []; // working list during import

// ── TAB STATE ─────────────────────────────────────────────
let activeTabId = 'projects';
let openProjectTabs = []; // [{ id, name }]
const tabSubView = { projects: 'view-home' };

// ── STORAGE ───────────────────────────────────────────────
function getProjects() {
  return new Promise(resolve => {
    chrome.storage.local.get("lava_projects", data => {
      resolve(data.lava_projects || []);
    });
  });
}

function saveProjects(projects) {
  return new Promise(resolve => {
    chrome.storage.local.set({ lava_projects: projects }, resolve);
  });
}

async function getProject(id) {
  const projects = await getProjects();
  return projects.find(p => p.id === id) || null;
}

async function upsertProject(project) {
  const projects = await getProjects();
  const idx = projects.findIndex(p => p.id === project.id);
  if (idx >= 0) projects[idx] = project;
  else projects.unshift(project);
  await saveProjects(projects);
}

async function removeProject(id) {
  const projects = await getProjects();
  await saveProjects(projects.filter(p => p.id !== id));
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// ── TOAST ─────────────────────────────────────────────────
let toastTimer;
function toast(msg, type = "default") {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.className = `toast ${type}`;
  el.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add("hidden"), 2400);
}

// ── CLIPBOARD ─────────────────────────────────────────────
async function copyText(text, label = "Copied") {
  try {
    await navigator.clipboard.writeText(text);
    toast(`✓ ${label} copied`, "success");
  } catch {
    toast("Could not copy — try manually", "error");
  }
}

// ── NAVIGATION ────────────────────────────────────────────
function showSubView(panelKey, viewId) {
  const panelId = panelKey === 'projects' ? 'panel-projects' : 'panel-project';

  // Activate the correct panel
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('panel-active'));
  document.getElementById(panelId).classList.add('panel-active');

  // Show the correct subview within that panel
  document.querySelectorAll(`#${panelId} .subview`).forEach(v => v.classList.remove('subview-active'));
  document.getElementById(viewId).classList.add('subview-active');

  // Store sub-view per tab
  tabSubView[activeTabId] = viewId;

  updatePanelBreadcrumb(panelKey, viewId);
}

async function updatePanelBreadcrumb(panelKey, viewId) {
  const bcProjects     = document.getElementById('bc-projects');
  const bcProjectPanel = document.getElementById('bc-project-panel');

  bcProjects.classList.add('bc-inactive');
  bcProjectPanel.classList.add('bc-inactive');

  if (panelKey === 'projects' && viewId === 'view-new-project') {
    bcProjects.classList.remove('bc-inactive');
  } else if (panelKey === 'project' && (viewId === 'view-import' || viewId === 'view-validation')) {
    if (currentProjectId) {
      const p = await getProject(currentProjectId);
      if (p) {
        const leaves = { 'view-import': 'Import Findings', 'view-validation': 'Validate' };
        document.getElementById('bc-back-project-label').textContent = p.name;
        document.getElementById('bc-project-leaf').textContent = leaves[viewId] || '';
        bcProjectPanel.classList.remove('bc-inactive');
      }
    }
  }
}

function activateTab(tabId) {
  activeTabId = tabId;

  document.querySelectorAll('.tab-btn').forEach(btn => {
    const isActive = btn.dataset.tab === tabId;
    btn.classList.toggle('tab-active', isActive);
    btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
    btn.setAttribute('tabindex', isActive ? '0' : '-1');
  });

  const panelKey = tabId === 'projects' ? 'projects' : 'project';
  const viewId   = tabSubView[tabId] || (panelKey === 'projects' ? 'view-home' : 'view-project');
  showSubView(panelKey, viewId);
}

function ensureProjectTab(id, name) {
  if (openProjectTabs.find(t => t.id === id)) return;
  openProjectTabs.push({ id, name });

  const btn = document.createElement('button');
  btn.className = 'tab-btn';
  btn.dataset.tab = id;
  btn.setAttribute('role', 'tab');
  btn.setAttribute('aria-selected', 'false');
  btn.setAttribute('aria-controls', 'panel-project');
  btn.setAttribute('tabindex', '-1');
  btn.innerHTML = `<i data-lucide="circle-check-big" class="tab-icon" aria-hidden="true"></i><span class="tab-label">${esc(name)}</span>`;
  btn.addEventListener('click', async () => {
    currentProjectId = id;
    tabSubView[id] = 'view-project';
    await renderProject();
    activateTab(id);
  });
  document.getElementById('tablist-sidebar').appendChild(btn);
  lucide.createIcons();
}

function removeProjectTab(id) {
  openProjectTabs = openProjectTabs.filter(t => t.id !== id);
  delete tabSubView[id];
  const btn = document.querySelector(`.tab-btn[data-tab="${id}"]`);
  if (btn) btn.remove();
}

// ── VIEW: HOME ────────────────────────────────────────────
async function renderHome() {
  const projects = await getProjects();
  const list = document.getElementById("projects-list");
  const empty = document.getElementById("no-projects");
  list.innerHTML = "";

  if (!projects.length) {
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");

  projects.forEach(proj => {
    const total = proj.findings.length;
    const done  = proj.findings.filter(f => f.completed).length;
    const allDone = total > 0 && done === total;

    const card = document.createElement("div");
    card.className = "project-card" + (allDone ? " complete" : "");
    card.innerHTML = `
      <div class="project-card-body">
        <div class="project-card-name">${esc(proj.name)}</div>
        <div class="project-card-progress">${done}/${total} findings${allDone ? " ✓" : ""}</div>
      </div>
      <div class="card-actions">
        <button class="btn btn-sm btn-tertiary" data-action="open" aria-label="Open ${esc(proj.name)}">
          Open
          <i data-lucide="arrow-right" aria-hidden="true"></i>
          </button>
        <button class="btn btn-sm btn-danger" data-action="delete" aria-label="Delete ${esc(proj.name)}">
          <i data-lucide="trash-2" aria-hidden="true"></i>
        </button>
      </div>
    `;
    card.querySelector("[data-action='open']").addEventListener("click", () => openProject(proj.id));
    card.querySelector("[data-action='delete']").addEventListener("click", async () => {
      const confirmMsg = allDone
        ? `"${proj.name}" is complete. Delete this project? This cannot be undone.`
        : `Delete "${proj.name}"? (${done}/${total} findings complete) This cannot be undone.`;
      if (confirm(confirmMsg)) {
        await removeProject(proj.id);
        removeProjectTab(proj.id);
        if (currentProjectId === proj.id) currentProjectId = null;
        await renderHome();
        toast("Project deleted");
      }
    });
    list.appendChild(card);
  });
  lucide.createIcons();
}

async function openProject(id) {
  currentProjectId = id;
  const p = await getProject(id);
  if (p) ensureProjectTab(id, p.name);
  tabSubView[id] = "view-project";
  await renderProject();
  activateTab(id);
}

// ── SIDEBAR CONTROLS ──────────────────────────────────────
document.getElementById("btn-sidebar-toggle").addEventListener("click", () => {
  const sidebar = document.getElementById("sidebar");
  const isCollapsed = sidebar.classList.toggle("collapsed");
  document.getElementById("btn-sidebar-toggle").setAttribute("aria-expanded", String(!isCollapsed));
});

document.getElementById("tab-projects").addEventListener("click", async () => {
  tabSubView.projects = "view-home";
  await renderHome();
  activateTab("projects");
});

// ── TABLIST KEYBOARD NAVIGATION (roving tabindex) ─────────
document.getElementById("tablist-sidebar").addEventListener("keydown", async e => {
  const tabs = Array.from(document.querySelectorAll('#tablist-sidebar [role="tab"]'));
  const currentIndex = tabs.findIndex(t => t === document.activeElement);
  if (currentIndex === -1) return;

  let targetIndex = -1;

  if (e.key === "ArrowDown" || e.key === "ArrowRight") {
    e.preventDefault();
    targetIndex = (currentIndex + 1) % tabs.length;
  } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
    e.preventDefault();
    targetIndex = (currentIndex - 1 + tabs.length) % tabs.length;
  } else if (e.key === "Home") {
    e.preventDefault();
    targetIndex = 0;
  } else if (e.key === "End") {
    e.preventDefault();
    targetIndex = tabs.length - 1;
  }

  if (targetIndex === -1) return;

  const target = tabs[targetIndex];
  const tabId = target.dataset.tab;

  // Auto-activate on focus (per spec OQ-01)
  if (tabId === 'projects') {
    tabSubView.projects = tabSubView.projects || 'view-home';
    await renderHome();
  } else {
    currentProjectId = tabId;
    tabSubView[tabId] = tabSubView[tabId] || 'view-project';
    await renderProject();
  }
  activateTab(tabId);
  target.focus();
});

document.getElementById("bc-back-projects").addEventListener("click", async () => {
  await renderHome();
  showSubView("projects", "view-home");
});

document.getElementById("bc-back-project").addEventListener("click", async () => {
  await renderProject();
  showSubView("project", "view-project");
});

// ── VIEW: NEW PROJECT ─────────────────────────────────────
document.getElementById("btn-new-project").addEventListener("click", () => {
  document.getElementById("form-new-project").reset();
  showSubView("projects", "view-new-project");
});
document.getElementById("btn-cancel-new-project").addEventListener("click", async () => {
  await renderHome();
  showSubView("projects", "view-home");
});

document.getElementById("form-new-project").addEventListener("submit", async e => {
  e.preventDefault();
  const name   = document.getElementById("proj-name").value.trim();
  if (!name) return;

  const project = { id: uid(), name, createdAt: Date.now(), findings: [] };
  await upsertProject(project);
  currentProjectId = project.id;
  importItems = [];
  ensureProjectTab(project.id, project.name);
  tabSubView[project.id] = "view-project";
  await renderProject();
  activateTab(project.id);
});

// ── VIEW: PROJECT ─────────────────────────────────────────
async function renderProject() {
  const project = await getProject(currentProjectId);
  if (!project) return;

  const total = project.findings.length;
  const done  = project.findings.filter(f => f.completed).length;
  const pct   = total > 0 ? (done / total) * 100 : 0;

  // Heading
  document.getElementById("project-heading").textContent = project.name;

  // Progress
  document.getElementById("progress-bar-fill").style.width = pct + "%";
  document.getElementById("progress-label").textContent = `${done} / ${total} complete`;

  // Internal tracking column visibility
  const hasDismissed = project.findings.some(f => f.status === "Dismissed");
  document.getElementById("col-internal-head").classList.toggle("hidden", !hasDismissed);

  // Findings table
  const noFindings = document.getElementById("no-findings");
  const table      = document.getElementById("findings-table");

  if (!total) {
    noFindings.classList.remove("hidden");
    table.classList.add("hidden");
  } else {
    noFindings.classList.add("hidden");
    table.classList.remove("hidden");

    const tbody = document.getElementById("findings-tbody");
    tbody.innerHTML = "";

    project.findings.forEach((f, i) => {
      const tr = document.createElement("tr");
      if (f.completed) tr.classList.add("row-complete");
      if (f.id === currentFindingId) tr.classList.add("row-active");

      const findingCell = f.findingUrl
        ? `<a href="${esc(f.findingUrl)}" target="_blank">${esc(f.findingId)}</a>`
        : esc(f.findingId);

      const taskCell = f.taskId
        ? (f.taskUrl ? `<a href="${esc(f.taskUrl)}" target="_blank">${esc(f.taskId)}</a>` : esc(f.taskId))
        : "—";

      const statusBadge = f.status
        ? `<span class="status-badge ${statusClass(f.status)}">${esc(f.status.replace(/_/g, " "))}</span>`
        : `<span class="status-badge status-pending">Pending</span>`;

      const internalCell = hasDismissed
        ? `<td>${f.internalTracking ? `<a href="${esc(f.internalTracking)}" target="_blank">Link</a>` : "—"}</td>`
        : "";

      tr.innerHTML = `
        <td class="col-num">${i + 1}</td>
        <td>${findingCell}</td>
        <td>${statusBadge}</td>
        <td>${taskCell}</td>
        ${internalCell}
        <td>
          <div class="actions-cell">
            <button class="btn btn-sm btn-tertiary" data-action="validate" data-fid="${f.id}" aria-label="Validate finding ${esc(f.findingId)}">Validate</button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  renderMdOutput(project);
}

// Event delegation for findings table
document.getElementById("findings-tbody").addEventListener("click", e => {
  const btn = e.target.closest("button[data-action]");
  if (!btn) return;
  if (btn.dataset.action === "validate") {
    openValidation(btn.dataset.fid);
  }
});

document.getElementById("btn-import-findings").addEventListener("click", () => {
  importItems = [];
  renderImportPreview();
  document.getElementById("import-paste-area").innerHTML = "";
  showSubView("project", "view-import");
});

document.getElementById("btn-delete-project").addEventListener("click", async () => {
  const p = await getProject(currentProjectId);
  if (!p) return;
  const done = p.findings.filter(f => f.completed).length;
  const total = p.findings.length;
  const allDone = total > 0 && done === total;

  const confirmMsg = allDone
    ? `"${p.name}" is complete. Delete this project? This cannot be undone.`
    : `Delete "${p.name}"? (${done}/${total} findings complete) This cannot be undone.`;

  if (confirm(confirmMsg)) {
    const deletedId = currentProjectId;
    await removeProject(deletedId);
    removeProjectTab(deletedId);
    currentProjectId = null;
    tabSubView.projects = "view-home";
    activateTab("projects");
    renderHome();
    toast("Project deleted");
  }
});

document.getElementById("btn-copy-md").addEventListener("click", () => {
  const text = document.getElementById("md-output").value;
  copyText(text, "MD table");
});

document.getElementById("btn-download-excel").addEventListener("click", async () => {
  const project = await getProject(currentProjectId);
  if (!project) return;
  downloadExcel(project);
});

function renderMdOutput(project) {
  const hasDismissed = project.findings.some(f => f.status === "Dismissed");
  const header  = hasDismissed
    ? "| Final Status | Finding | Task | Internal Tracking |"
    : "| Final Status | Finding | Task |";
  const divider = hasDismissed ? "|---|---|---|---|" : "|---|---|---|";

  const rows = project.findings.map(f => {
    const findingCell = f.findingUrl
      ? `[${f.findingId}](${f.findingUrl})`
      : f.findingId;
    const taskCell = f.taskId
      ? (f.taskUrl ? `[${f.taskId}](${f.taskUrl})` : f.taskId)
      : "";
    const statusCell = f.status ? f.status.replace(/_/g, " ") : "";
    return hasDismissed
      ? `| ${statusCell} | ${findingCell} | ${taskCell} | ${f.internalTracking || ""} |`
      : `| ${statusCell} | ${findingCell} | ${taskCell} |`;
  });

  document.getElementById("md-output").value = [header, divider, ...rows].join("\n");
}

function downloadExcel(project) {
  const hasDismissed = project.findings.some(f => f.status === "Dismissed");
  const headers = hasDismissed
    ? ["#", "Finding ID", "Finding URL", "Status", "Task ID", "Task URL", "Internal Tracking"]
    : ["#", "Finding ID", "Finding URL", "Status", "Task ID", "Task URL"];

  const rows = project.findings.map((f, i) => {
    const base = [i + 1, f.findingId, f.findingUrl || "", f.status || "", f.taskId || "", f.taskUrl || ""];
    return hasDismissed ? [...base, f.internalTracking || ""] : base;
  });

  const tsv = [headers, ...rows].map(r => r.join("\t")).join("\n");
  const blob = new Blob([tsv], { type: "application/vnd.ms-excel;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${project.name.replace(/[^a-z0-9]/gi, "_")}_findings.xls`;
  a.click();
  URL.revokeObjectURL(url);
  toast("✓ Excel downloaded", "success");
}

// ── VIEW: IMPORT ──────────────────────────────────────────
// Paste area logic
const pasteArea = document.getElementById("import-paste-area");

pasteArea.addEventListener("paste", e => {
  e.preventDefault();
  const html  = e.clipboardData.getData("text/html");
  const plain = e.clipboardData.getData("text/plain");

  if (html) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const anchors = doc.querySelectorAll("a");
    if (anchors.length > 0) {
      pasteArea.innerHTML = "";
      anchors.forEach(a => {
        const div = document.createElement("div");
        const clone = document.createElement("a");
        clone.href = a.href;
        clone.textContent = a.textContent.trim();
        div.appendChild(clone);
        pasteArea.appendChild(div);
      });
      return;
    }
  }

  // Plain text fallback
  const lines = plain.split("\n").map(l => l.trim()).filter(Boolean);
  pasteArea.innerHTML = lines.map(l => `<div>${esc(l)}</div>`).join("");
});

document.getElementById("btn-parse-paste").addEventListener("click", () => {
  const parsed = extractPasteItems();
  if (!parsed.length) { toast("Nothing to parse", "error"); return; }

  // Merge with existing importItems (avoid duplicates by findingId)
  parsed.forEach(item => {
    const exists = importItems.some(i => i.findingId === item.findingId);
    if (!exists) importItems.push(item);
  });
  renderImportPreview();
});

document.getElementById("btn-clear-paste").addEventListener("click", () => {
  pasteArea.innerHTML = "";
});

document.getElementById("btn-add-manual").addEventListener("click", () => {
  const idInput  = document.getElementById("manual-id");
  const urlInput = document.getElementById("manual-url");
  const findingId = idInput.value.trim();
  const findingUrl = urlInput.value.trim() || null;

  if (!findingId) { toast("Enter a Finding ID", "error"); return; }

  const exists = importItems.some(i => i.findingId === findingId);
  if (exists) { toast("Already in the list", "error"); return; }

  importItems.push({ id: uid(), findingId, findingUrl });
  idInput.value = "";
  urlInput.value = "";
  renderImportPreview();
});

document.getElementById("btn-clear-import").addEventListener("click", () => {
  importItems = [];
  renderImportPreview();
});

document.getElementById("btn-cancel-import").addEventListener("click", () => {
  showSubView("project", "view-project");
});

document.getElementById("btn-save-import").addEventListener("click", async () => {
  if (!importItems.length) { toast("Nothing to save", "error"); return; }
  const project = await getProject(currentProjectId);
  if (!project) return;

  // Add only new findings (avoid duplicates by findingId)
  importItems.forEach(item => {
    const exists = project.findings.some(f => f.findingId === item.findingId);
    if (!exists) {
      project.findings.push({
        id:              item.id || uid(),
        findingId:       item.findingId,
        findingUrl:      item.findingUrl || null,
        taskId:          "",
        taskUrl:         null,
        status:          "",
        internalTracking:"",
        environment:     "",
        completed:       false,
      });
    }
  });

  await upsertProject(project);
  importItems = [];
  await renderProject();
  showSubView("project", "view-project");
  toast(`✓ ${project.findings.length} findings saved`, "success");
});

function extractPasteItems() {
  const blocks = pasteArea.querySelectorAll("div, p, li");
  const items  = [];
  const seen   = new Set();

  const processText = (text, url) => {
    if (!text || seen.has(text)) return;
    seen.add(text);
    // If the text looks like a bare URL, use it as url and try to extract ID from path
    if (!url && (text.startsWith("http://") || text.startsWith("https://"))) {
      items.push({ id: uid(), findingId: extractIdFromUrl(text) || text, findingUrl: text });
      return;
    }
    items.push({ id: uid(), findingId: text, findingUrl: url || null });
  };

  if (blocks.length === 0) {
    pasteArea.textContent.trim().split("\n").forEach(l => {
      if (l.trim()) processText(l.trim(), null);
    });
  } else {
    blocks.forEach(block => {
      const a = block.querySelector("a");
      const text = block.textContent.trim();
      processText(text, a ? a.href : null);
    });
  }

  // Sort numerically by trailing number in ID
  items.sort((a, b) => {
    const numA = parseInt(a.findingId.match(/(\d+)\s*$/)?.[1] ?? "0", 10);
    const numB = parseInt(b.findingId.match(/(\d+)\s*$/)?.[1] ?? "0", 10);
    return numA - numB;
  });

  return items;
}

function extractIdFromUrl(url) {
  // Try to pull a finding-ID-like segment from the URL path
  const match = url.match(/([A-Z][A-Z\d–\-]+\d+)/);
  return match ? match[1] : null;
}

function renderImportPreview() {
  const preview = document.getElementById("import-preview");
  const count   = document.getElementById("import-count");
  const list    = document.getElementById("import-list");

  if (!importItems.length) {
    preview.classList.add("hidden");
    return;
  }

  preview.classList.remove("hidden");
  count.textContent = importItems.length;
  list.innerHTML = "";

  importItems.forEach((item, i) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="import-item-id">${esc(item.findingId)}</td>
      <td class="import-item-url">${item.findingUrl ? esc(item.findingUrl) : "—"}</td>
      <td class="import-item-remove-cell">
        <button class="import-item-remove" aria-label="Remove ${esc(item.findingId)}">
          <i data-lucide="x" aria-hidden="true"></i>
        </button>
      </td>
    `;
    tr.querySelector(".import-item-remove").addEventListener("click", () => {
      importItems.splice(i, 1);
      renderImportPreview();
    });
    list.appendChild(tr);
  });
  lucide.createIcons();
}

// ── VIEW: VALIDATION ──────────────────────────────────────
async function openValidation(findingId) {
  currentFindingId = findingId;
  const project = await getProject(currentProjectId);
  const finding = project?.findings.find(f => f.id === findingId);

  resetValidationForm();

  if (finding) {
    // Pre-populate from stored data
    document.getElementById("pulled-finding-id").value = finding.findingId || "";
    document.getElementById("pulled-task-id").value    = finding.taskId || "";
    document.getElementById("pulled-environment").value= finding.environment || "";

    // Pre-select status if already set
    if (finding.status) {
      document.getElementById("val-status").value = finding.status;
      toggleDismissedField(finding.status === "Dismissed");
    }
    if (finding.internalTracking) {
      document.getElementById("val-internal-url").value = finding.internalTracking;
    }
  }

  // Enable/disable "Open in Browser" based on whether a URL is stored
  document.getElementById("btn-open-finding").disabled = !finding?.findingUrl;

  // Set validation heading
  document.getElementById("validation-heading").textContent =
    "Validate: " + (finding?.findingId || "Finding");

  // Hide output section until Update is clicked
  document.getElementById("val-output-section").classList.add("hidden");
  showSubView("project", "view-validation");
}

function resetValidationForm() {
  document.getElementById("pulled-finding-id").value = "";
  document.getElementById("pulled-task-id").value    = "";
  document.getElementById("pulled-environment").value= "";
  clearFindingIdError();
  document.getElementById("val-status").value = "";
  document.getElementById("val-internal-url").value = "";
  document.getElementById("val-comment").value = "";
  document.getElementById("val-screenshot-name").value = "";
  document.getElementById("val-finding-comment").value = "";
  document.getElementById("val-task-comment").value = "";
  document.getElementById("field-internal-tracking").classList.add("hidden");
  document.getElementById("btn-open-finding").disabled = true;
  document.querySelectorAll("input[name='tools']").forEach(c => c.checked = false);
}

// Status select → show/hide dismissed field + pre-fill comment template
document.getElementById("val-status").addEventListener("change", e => {
  const status = e.target.value;
  toggleDismissedField(status === "Dismissed");
  prefillComment(status);
});

const COMMENT_TEMPLATES = {
  'Not Fixed':       "\n\n**Recommendation**",
  'Partially Fixed': "\n\n- **Pass:** \n- **Fail:** \n\n**Recommendation**",
};

function prefillComment(status) {
  const field    = document.getElementById("val-comment");
  const template = COMMENT_TEMPLATES[status] ?? null;
  const existing = field.value;

  if (template !== null) {
    const templateBody = template.trimStart();
    if (!existing.trim()) {
      // Nothing typed — use template as-is (leading blank lines included)
      field.value = template;
    } else {
      // Strip any previously appended template, then append the new one
      let base = existing;
      for (const prev of Object.values(COMMENT_TEMPLATES)) {
        const marker = "\n\n" + prev.trimStart();
        const idx = base.indexOf(marker);
        if (idx !== -1) { base = base.slice(0, idx); break; }
      }
      field.value = base.trimEnd() + "\n\n" + templateBody;
    }
  } else {
    // "done" status — clear only if field contains only an unmodified template
    const isOnlyTemplate = Object.values(COMMENT_TEMPLATES).includes(existing);
    if (isOnlyTemplate) field.value = "";
  }
}

function toggleDismissedField(show) {
  document.getElementById("field-internal-tracking").classList.toggle("hidden", !show);
}

async function syncSelectedStatusToPage(statusLabel) {
  const project = currentProjectId ? await getProject(currentProjectId) : null;
  const finding = project?.findings.find(f => f.id === currentFindingId) || null;
  const tab = await getActivePageTab(finding?.findingUrl || null);

  const results = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: applyFindingStatusOnPage,
    args: [statusLabel],
  });

  const result = results?.[0]?.result;
  if (!result?.ok) {
    throw new Error(result?.error || "Could not update the finding status on the page.");
  }
}

function applyFindingStatusOnPage(statusLabel) {
  const STATUS_MAP = {
    "To Review": "toReview",
    "Open": "open",
    "Fixed": "fixed",
    "Partially Fixed": "partiallyFixed",
    "Not Fixed": "notFixed",
    "Not Reproducible": "notReproducible",
    "Cannot Be Fixed": "cannotBeFixed",
    "Dismissed": "dismissed",
  };

  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

  const findStatusOption = statusValue => Array.from(
    document.querySelectorAll('#statusBox .dropdown-item[data-status]')
  ).find(btn => btn.dataset.status === statusValue);

  return (async () => {
    try {
      const targetStatus = STATUS_MAP[statusLabel];
      if (!targetStatus) {
        return { ok: false, error: `Unsupported status: ${statusLabel}` };
      }

      const dropdownButton = document.querySelector('#statusBox [ngbdropdowntoggle], #statusBox .dropdown-toggle');
      if (!dropdownButton) {
        return { ok: false, error: "Could not find the finding status dropdown on the page." };
      }

      dropdownButton.click();

      let option = null;
      for (let i = 0; i < 10; i++) {
        option = findStatusOption(targetStatus);
        if (option) break;
        await wait(100);
      }

      if (!option) {
        return { ok: false, error: `Status option "${statusLabel}" was not found on the page.` };
      }

      if (targetStatus === "dismissed" && option.disabled) {
        return {
          ok: false,
          error: "Dismissed is currently disabled. Please update the task first, then try again."
        };
      }

      if (option.disabled) {
        return { ok: false, error: `Status option "${statusLabel}" is currently disabled.` };
      }

      option.click();
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error?.message || "Could not update the finding status on the page." };
    }
  })();
}

// ── TAB HELPER ───────────────────────────────────────────
// Finds the tab for the current finding by URL, or falls back to the
// most recently accessed non-extension tab.
async function getActivePageTab(preferredUrl) {
  const allTabs = await chrome.tabs.query({});
  const pageTabs = allTabs.filter(t => t.url && !t.url.startsWith("chrome-extension://") && !t.url.startsWith("chrome://"));

  // 1. Try to match the stored finding URL exactly
  if (preferredUrl) {
    const stripHash = u => u.split("#")[0].split("?")[0];
    const match = pageTabs.find(t => stripHash(t.url) === stripHash(preferredUrl));
    if (match) return match;
    // 2. Try partial match (same base path)
    const partial = pageTabs.find(t => t.url.includes(stripHash(preferredUrl).split("/").slice(-1)[0]));
    if (partial) return partial;
  }

  // 3. Fall back to the most recently accessed non-extension tab
  const sorted = pageTabs.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
  if (sorted.length) return sorted[0];

  throw new Error("No page tab found. Make sure the finding page is open in Chrome.");
}

// ── PULL FROM PAGE ────────────────────────────────────────
document.getElementById("btn-pull-page").addEventListener("click", async () => {
  try {
    // Use stored finding URL to locate the exact tab
    const project = await getProject(currentProjectId);
    const finding = project?.findings.find(f => f.id === currentFindingId);
    const tab = await getActivePageTab(finding?.findingUrl || null);
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: scrapeFindingPage,
    });

    const data = results?.[0]?.result;
    if (!data) throw new Error("No data returned");

    if (data.error) throw new Error(data.error);

    // Populate pulled fields
    if (data.findingId) {
      document.getElementById("pulled-finding-id").value = data.findingId;
    }
    if (data.taskId)   document.getElementById("pulled-task-id").value = data.taskId;
    if (data.envUrl)   document.getElementById("pulled-environment").value = data.envUrl;

    // Store task URL for saving later
    if (data.taskUrl) {
      document.getElementById("pulled-task-id").dataset.taskUrl = data.taskUrl;
    }

    // Update stored finding with pulled environment
    if (currentProjectId && currentFindingId) {
      const project = await getProject(currentProjectId);
      const finding = project?.findings.find(f => f.id === currentFindingId);
      if (finding) {
        if (data.findingId) finding.findingId = data.findingId;
        if (data.envUrl)    finding.environment = data.envUrl;
        if (data.taskId)    finding.taskId = data.taskId;
        if (data.taskUrl)   finding.taskUrl = data.taskUrl;
        await upsertProject(project);
      }
    }

  } catch (err) {
    toast("✗ " + (err.message || "Could not pull data. Are you on a finding page?"), "error");
  }
});

// This function runs in the page context (no closure access)
function scrapeFindingPage() {
  try {
    // Finding ID: find the h2 immediately after "Findings details" h2
    let findingId = null;
    const allH2s = Array.from(document.querySelectorAll("h2"));
    const detailsH2 = allH2s.find(h => h.textContent.trim() === "Findings details");
    const targetH2 = detailsH2
      ? allH2s[allH2s.indexOf(detailsH2) + 1]
      : document.querySelector('h2[data-e2e-id="issue-summary"]'); // fallback
    if (targetH2) {
      const text = targetH2.textContent.trim();
      // The ID is everything before the first " – " (en-dash or regular dash)
      const parts = text.split(/\s[–—-]\s/);
      findingId = parts[0].trim();
    }

    // Task ID and URL
    const taskLink = document.querySelector(".linked-task a");
    const taskId   = taskLink ? taskLink.textContent.trim() : null;
    const taskUrl  = taskLink ? taskLink.href : null;

    // Environment URL — find the span.label with text "URL", get sibling anchor
    let envUrl = null;
    const labels = document.querySelectorAll(".label");
    for (const label of labels) {
      if (label.textContent.trim() === "URL") {
        const parent = label.parentElement;
        const anchor = parent ? parent.querySelector("a[href]") : null;
        if (anchor) { envUrl = anchor.href; break; }
      }
    }

    return { findingId, taskId, taskUrl, envUrl };
  } catch (err) {
    return { error: err.message };
  }
}

// ── UPDATE OUTPUT ─────────────────────────────────────────
document.getElementById("btn-update-output").addEventListener("click", async () => {
  const rawFindingId = document.getElementById("pulled-finding-id").value.trim();

  if (!rawFindingId) {
    showFindingIdError();
    return;
  }
  clearFindingIdError();

  const status   = document.getElementById("val-status").value;
  const env      = document.getElementById("pulled-environment").value.trim();
  const comment  = document.getElementById("val-comment").value.trim();
  const tools    = [...document.querySelectorAll("input[name='tools']:checked")].map(c => c.value);

  if (!status) {
    toast("Select a status first", "error");
    return;
  }

  try {
    await syncSelectedStatusToPage(status);
  } catch (err) {
    toast(err.message || "Could not update page status", "error");
    return;
  }

  const screenshotName = buildScreenshotName(rawFindingId, status);
  const findingComment = buildFindingComment({ env, status, screenshotName, tools, comment });
  const taskComment    = buildTaskComment({ env, status, screenshotName, tools, comment });

  document.getElementById("val-screenshot-name").value = screenshotName;
  document.getElementById("val-finding-comment").value  = findingComment;
  document.getElementById("val-task-comment").value     = taskComment;
  document.getElementById("val-output-section").classList.remove("hidden");

  toast(`✓ Output updated and page status set to ${status}`, "success");
});

function buildScreenshotName(findingId, status) {
  const dateStr = (() => {
    const d = new Date();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return m + day + d.getFullYear();
  })();
  // Normalize en-dash and em-dash before splitting
  const normalized = findingId
    .replaceAll("–", "-")
    .replaceAll("—", "-");
  // Split trailing digits from base
  const match = normalized.match(/^(.*?)(\d+)$/);
  const base = match ? match[1] : normalized;
  const num  = match ? match[2] : "";
  const cleanStatus = status.replace(/ /g, "_");
  return `${base}${num}_${dateStr}_${cleanStatus}`;
}

function showFindingIdError() {
  const input   = document.getElementById("pulled-finding-id");
  const errorEl = document.getElementById("pulled-finding-id-error");
  input.setAttribute("aria-invalid", "true");
  errorEl.removeAttribute("aria-hidden");
  errorEl.innerHTML =
    '<i data-lucide="circle-alert" role="img" aria-label="error:" class="icon-error"></i>'
    + ' Finding ID cannot be empty.';
  lucide.createIcons();
  input.focus();
}

function clearFindingIdError() {
  const input   = document.getElementById("pulled-finding-id");
  const errorEl = document.getElementById("pulled-finding-id-error");
  input.setAttribute("aria-invalid", "false");
  errorEl.setAttribute("aria-hidden", "true");
  errorEl.innerHTML = "";
}

document.getElementById("pulled-finding-id").addEventListener("input", () => {
  if (document.getElementById("pulled-finding-id").value.trim()) {
    clearFindingIdError();
  }
});

function stripBackticks(text) {
  return text.replace(/`/g, "");
}

function stripMarkdown(text) {
  return stripBackticks(text)
    .replace(/\*\*([^*]*)\*\*/g, "$1");
}

function buildFindingComment({ env, status, screenshotName, tools, comment }) {
  return `Environment: ${env}
Final Status: ${status}
Screenshot (attached): ${screenshotName}.png
Testing Tools: ${tools.join(", ") || "N/A"}

Validation Results:
${stripMarkdown(comment)}`;
}

function buildTaskComment({ env, status, screenshotName, tools, comment }) {
  return `**Environment:** ${env}
**Final Status:** ${status}
**Screenshot (attached):** ${screenshotName}.png
**Testing Tools:** ${tools.join(", ") || "N/A"}

**Validation Results:**
${comment}`;
}

// ── COPY OUTPUT BUTTONS ───────────────────────────────────
document.getElementById("btn-copy-screenshot").addEventListener("click", () => {
  copyText(document.getElementById("val-screenshot-name").value, "Screenshot name");
});
document.getElementById("btn-copy-finding").addEventListener("click", () => {
  copyText(document.getElementById("val-finding-comment").value, "Finding comment");
});
document.getElementById("btn-copy-task").addEventListener("click", () => {
  copyText(document.getElementById("val-task-comment").value, "Task comment");
});

// ── INJECT COMMENT ────────────────────────────────────────
document.getElementById("btn-inject-finding").addEventListener("click", async () => {
  const text = document.getElementById("val-finding-comment").value;
  await injectIntoPage("textarea#message", text, "Finding comment injected");
});

document.getElementById("btn-inject-task").addEventListener("click", async () => {
  const text = document.getElementById("val-task-comment").value;
  await injectIntoPage("textarea.form-control.editor", text, "Task comment injected");
});

async function injectIntoPage(selector, text, successMsg) {
  if (!text) { toast("Generate output first", "error"); return; }
  try {
    const tab = await getActivePageTab();
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (sel, txt) => {
        const el = document.querySelector(sel);
        if (!el) return { ok: false, error: `Element not found: ${sel}` };
        el.focus();
        // Use native setter so Angular's change detection picks up the new value
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
        nativeSetter.call(el, txt);
        el.dispatchEvent(new Event("input",  { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        return { ok: true };
      },
      args: [selector, text],
    });

    const result = results?.[0]?.result;
    if (result?.ok) {
      toast("✓ " + successMsg, "success");
    } else {
      toast(result?.error || "Could not inject — are you on the right page?", "error");
    }
  } catch (err) {
    toast("Injection failed: " + err.message, "error");
  }
}

// ── SAVE TO TABLE ─────────────────────────────────────────
document.getElementById("btn-save-to-table").addEventListener("click", async () => {
  const status   = document.getElementById("val-status").value;
  const taskId   = document.getElementById("pulled-task-id").value.trim();
  const taskUrl  = document.getElementById("pulled-task-id").dataset.taskUrl || null;
  const internal = document.getElementById("val-internal-url").value.trim();
  const env      = document.getElementById("pulled-environment").value.trim();
  const pullFid  = document.getElementById("pulled-finding-id").value.trim();

  if (!status) { toast("Select a status first", "error"); return; }

  const project = await getProject(currentProjectId);
  if (!project) return;

  const finding = project.findings.find(f => f.id === currentFindingId);
  if (!finding) return;

  finding.status           = status;
  finding.taskId           = taskId || finding.taskId;
  finding.taskUrl          = taskUrl || finding.taskUrl;
  finding.internalTracking = status === "Dismissed" ? internal : "";
  finding.environment      = env || finding.environment;
  if (pullFid) finding.findingId = pullFid;
  finding.completed        = true;

  await upsertProject(project);
  await renderProject();
  toast("✓ Saved to table", "success");

  // Check if all done → prompt to view delivery table
  const allDone = project.findings.every(f => f.completed);
  if (allDone) {
    setTimeout(() => {
      const go = confirm("🎉 All findings complete! Go back to the project to copy the delivery table?");
      if (go) showSubView("project", "view-project");
    }, 800);
  }
});

// ── NEXT FINDING ──────────────────────────────────────────
document.getElementById("btn-open-finding").addEventListener("click", async () => {
  const project = await getProject(currentProjectId);
  const finding = project?.findings.find(f => f.id === currentFindingId);
  if (finding?.findingUrl) {
    chrome.tabs.create({ url: finding.findingUrl });
  } else {
    toast("No URL stored for this finding", "error");
  }
});

document.getElementById("btn-next-finding").addEventListener("click", async () => {
  // Find the next incomplete finding
  const project = await getProject(currentProjectId);
  if (!project) { showSubView("project", "view-project"); return; }

  const currentIdx = project.findings.findIndex(f => f.id === currentFindingId);
  const next = project.findings.slice(currentIdx + 1).find(f => !f.completed)
    || project.findings.find(f => !f.completed && f.id !== currentFindingId);

  if (next) {
    openValidation(next.id);
  } else {
    showSubView("project", "view-project");
    toast("All findings complete!", "success");
  }
});

// ── BACK FROM VALIDATION / IMPORT ────────────────────────
// Navigation handled via panel breadcrumbs (bc-back-projects, bc-back-project)

// ── HELPERS ───────────────────────────────────────────────
function esc(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function statusClass(status) {
  const map = {
    "Fixed":            "status-fixed",
    "Partially Fixed":  "status-partially",
    "Not Fixed":        "status-not-fixed",
    "Not Reproducible": "status-not-repro",
    "Cannot Be Fixed":  "status-cannot",
    "Dismissed":        "status-dismissed",
  };
  return map[status] || "status-pending";
}

// ── INIT ──────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", async () => {
  await renderHome();
  activateTab("projects");
  lucide.createIcons();
});
