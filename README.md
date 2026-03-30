# 🌋 LAVA v2 — Level Access Validation Assistant
### Chrome Extension

A full validation workflow manager: import findings, validate one by one, generate comments and screenshot names, then export a delivery-ready table.

---

## Installation

1. Open Chrome and go to `chrome://extensions`
2. Enable **Developer mode** (toggle, top-right)
3. Click **Load unpacked**
4. Select this `lava-extension` folder
5. LAVA will appear in your extensions bar

> **Note on icons:** Chrome will show a default icon since no custom icons are included. To add yours, place `icon16.png`, `icon48.png`, and `icon128.png` in an `icons/` folder and update `manifest.json` accordingly.

---

## Full Workflow

### 1. Create a Project
- Click **+ New Project**
- Fill in project name, client, ticket #, and asset name (all optional except name)
- Click **Create Project**

### 2. Import Findings
From the project dashboard, click **+ Import Findings**. You have three options:

**Paste area** (most common) — supports:
- Plain text IDs: `LEARN-AMP177` (one per line)
- Linked text from Zendesk (copy-paste HTML with links preserved)
- Raw URLs

Click **Parse & Preview** → review the list → click **Save to Project**

**Manual add** — type a Finding ID and optional URL, click **Add**

### 3. Validate Each Finding
Click **Validate** on any finding row to open the validation form.

**Pull from Page:**
- Navigate to the finding's page in Chrome
- Click **Pull from Page** to auto-fill: Finding ID, Task ID, Environment URL

**Fill in manually:**
- Status (Fixed, Partially Fixed, Not Fixed, etc.)
- If **Dismissed** → an extra field appears for the client's internal tracking URL
- Testing Tools (checkboxes)
- Validation Comment

**Click Update Output** → generates:
- Screenshot Name (copy button)
- Finding Comment (copy + inject directly into the finding page's comment field)
- Task Comment (copy + inject directly into the task page's comment field)

**Inject into page:** Navigate to the finding or task page, then click the inject button. The comment will be placed into the textarea — just click submit on the page.

**Click ✓ Save & Mark Complete** to record the status and task ID in the project table.

Use **Next Finding →** to move to the next incomplete finding automatically.

### 4. Delivery Table
Once all findings are complete, the **Delivery Table** section shows:
- **Copy MD** — Markdown table to paste into your delivery message
- **↓ Excel / ↓ CSV** — download as CSV (opens in Excel)

The table columns are:
- `Final Status | Finding | Task` (standard)
- `Final Status | Finding | Task | Internal Tracking` (if any findings are Dismissed)

---

## Storage & Safety

Data is saved in `chrome.storage.local`:
- ✅ Survives browser cache clears
- ✅ Survives browser restarts
- ✅ Survives computer restarts
- ❌ Only lost if you uninstall the extension or explicitly clear extension storage
- 🔒 Sandboxed — no website or other extension can access it

---

## Project Cleanup

When you're done with a project:
- Click **🗑 Delete** on the project dashboard
- Or: after saving the last finding, LAVA will prompt you to go to the delivery table, and you can delete manually afterward

---

## File Structure

```
lava-extension/
├── manifest.json     Chrome extension manifest
├── popup.html        Extension UI
├── popup.css         Styles
├── popup.js          All application logic
└── README.md         This file
```
