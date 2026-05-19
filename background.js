/* ═══════════════════════════════════════════════════════════
   LAVA — background.js
   Opens (or focuses) a persistent standalone window
   instead of a dismissable popup.
═══════════════════════════════════════════════════════════ */

let lavaWindowId = null;

chrome.action.onClicked.addListener(async () => {
  // If window already exists, just focus it
  if (lavaWindowId !== null) {
    try {
      const win = await chrome.windows.get(lavaWindowId);
      if (win) {
        await chrome.windows.update(lavaWindowId, { focused: true });
        return;
      }
    } catch {
      // Window was closed externally — fall through and create a new one
      lavaWindowId = null;
    }
  }

  // Open a new standalone window
  const win = await chrome.windows.create({
    url:    chrome.runtime.getURL("popup.html"),
    type:   "popup",        // frameless chrome window — no tab bar
    width:  560,
    height: 680,
    top:    60,
    left:   60,
  });

  lavaWindowId = win.id;
});

// Clear the stored ID when the user closes the window
chrome.windows.onRemoved.addListener(windowId => {
  if (windowId === lavaWindowId) {
    lavaWindowId = null;
  }
});

// ── AUTO-DELETE ALARM ──────────────────────────────────────
chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create('checkExpiredProjects', { periodInMinutes: 60 });
});

chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create('checkExpiredProjects', { periodInMinutes: 60 });
});

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === 'checkExpiredProjects') {
    deleteExpiredProjects();
  }
});

async function deleteExpiredProjects() {
  const data = await chrome.storage.local.get(['lava_projects', 'lava_deleted_projects']);
  const projects = data.lava_projects || [];
  const deleted  = data.lava_deleted_projects || [];
  const now      = Date.now();

  const surviving = [];
  projects.forEach(p => {
    if (p.expiresAt && p.expiresAt <= now) {
      // Security: only preserve name and timestamp
      deleted.push({ name: p.name, deletedAt: now });
    } else {
      surviving.push(p);
    }
  });

  await chrome.storage.local.set({
    lava_projects: surviving,
    lava_deleted_projects: deleted,
  });
}
