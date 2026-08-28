# Tanban — Agent Guide

## Project Overview

Thunderbird Mail Extension (Manifest V2) that renders tasks as a Kanban board.
No build system, no bundler, no transpiler — plain vanilla JS loaded directly.

- **Extension ID**: `DogeTheBeast.tanban@addons.thunderbird.net`
- **Target**: Thunderbird 128.0 – 150.*
- **Permissions**: `storage`, `tabs`
- **Key APIs**: `browser.*` WebExtension APIs + 6 custom calendar experiment APIs

## Project Structure

```
manifest.json          # Extension manifest (experiment_apis, permissions)
background.js          # Background script — message routing, task CRUD
tanban.html            # UI shell
tanban.js              # Frontend — board rendering, drag-and-drop
tanban.css             # Dark-theme stylesheet
icons/                 # Extension icons (16px, 32px SVG/PNG)
calendar/experiments/  # Thunderbird calendar experiment APIs
  calendar/
    ext-calendar-utils.sys.mjs    # Shared utilities (ES module)
    schema/                        # JSON API schemas
    parent/                        # Parent-process implementations
    child/                         # Child-process implementations
```

## Commands

There is **no package.json, no build system, no test runner, no linter**.

| Action | Command |
|--------|---------|
| Load in Thunderbird | Go to `about:debugging` → This Thunderbird → Load Temporary Add-on → pick `manifest.json` |
| Pack for distribution | `zip -r tanban.zip . -x "*.git*" "*.zip" "AGENTS.md"` |
| Quick reload after edit | Press Ctrl+Shift+F5 in the Tanban tab, or use the refresh button |
| Restart required | Changes to `calendar/experiments/` files require a full Thunderbird restart |

There are **no tests** in the project. If adding tests:
- Use plain JS (no transpiler), compatible with Thunderbird's engine
- Place test files in a `test/` directory at project root
- Use `console.assert()` or a minimal test helper

## Code Style

### Formatting
- **Indentation**: 2 spaces for JS/JSON/HTML, 4 spaces for CSS
- **Quotes**: Double quotes (`"`) for all strings
- **Semicolons**: Always required at end of statements
- **Line length**: Aim for ~100 chars max
- **Trailing commas**: Allowed in objects and arrays

### Naming
- **Files**: `kebab-case.js`, `.sys.mjs` for experiment modules, `.json` for schemas
- **Classes/ExtensionAPIs**: `PascalCase` (e.g., `ExtensionAPI`, `EventManager`, `CalEvent`)
- **Functions & variables**: `camelCase` (e.g., `processTasksForTanban`, `draggedTask`)
- **Constants**: `UPPER_SNAKE_CASE` for status values (e.g., `COMPLETED`, `NEEDS-ACTION`)
- **CSS classes**: `kebab-case` (e.g., `task-card`, `column-header`, `empty-column`)
- **CSS IDs**: `kebab-case` (e.g., `tanban-columns`, `new-task-btn`, `refresh-btn`)

### Imports

**Frontend (`tanban.js`, `background.js`)** — no import statements, uses `browser.*` global:
```javascript
browser.runtime.sendMessage({ action: "getTasks" }, function (response) { ... });
browser.calendar.items.query({ type: "task" }).then(...).catch(...);
```

**Experiment modules (`.sys.mjs`)** — ES module syntax with `ChromeUtils.importESModule`:
```javascript
var {
  ExtensionCommon: { ExtensionAPI, EventManager },
} = ChromeUtils.importESModule("resource://gre/modules/ExtensionCommon.sys.mjs");

var { cal } = ChromeUtils.importESModule(
  "resource:///modules/calendar/calUtils.sys.mjs",
);
```

**Shared utilities** — standard ES module `export`:
```javascript
export function isOwnCalendar(calendar, extension) { ... }
export function convertCalendar(extension, calendar) { ... }
```

### Functions & Style
- **Use `function() {}` syntax** — no arrow functions for callbacks in frontend/background
- Arrow functions (`=>`) are acceptable in experiment code and array methods (`.map()`, `.forEach()`)
- No async/await in frontend/background — use `.then().catch()` with `return true` for async responses
- async/await is used in experiment API code — that's fine there
- No template literals — use `+` for string concatenation
- No destructuring in frontend/background (ok in experiment code)

### Error Handling

**Frontend/background** — `.catch()` with `console.error()` + `sendResponse({ error: ... })`:
```javascript
browser.calendar.items.query({ type: "task" })
  .then(function (items) { sendResponse({ tasks: items }); })
  .catch(function (error) {
    console.error("Error fetching tasks:", error);
    sendResponse({ error: error.message });
  });
return true; // signal async response
```

**Experiment code** — throw `ExtensionError` or use try/catch:
```javascript
if (!item) throw new ExtensionError("Could not find item " + id);
try { ... } catch (e) { console.error(e); return null; }
```

### DOM Manipulation
- Pure vanilla JS: `document.createElement`, `element.appendChild`, `element.textContent`, `element.className`, `element.dataset.*`, `element.classList.add/remove`, `element.addEventListener`
- Use `document.querySelector` / `document.getElementById` for selection
- Set `element.dataset.*` for storing data on DOM elements

### Drag and Drop
- HTML5 Drag and Drop API: `dragstart`, `dragend`, `dragover`, `dragenter`, `dragleave`, `drop`
- `e.dataTransfer.effectAllowed = "move"`, `e.dataTransfer.setData("text/plain", id)`

### CSS
- Dark theme: `#1E1E21` body, `#2A2A2E` cards, `#FBFBFE` text, `#0A84FF` accent, `#4A4A52` borders
- `.overdue` class on overdue task cards
- `.dragging` (opacity 0.5) and `.dragover` (blue top border) for drag feedback
- Responsive breakpoint at 768px

### Thunderbird-Specific Patterns

**Experiment API class pattern**:
```javascript
this.calendar_items = class extends ExtensionAPI {
  getAPI(context) {
    return { calendar: { items: { ... } } };
  }
};
```

**Event registration**:
```javascript
onCreated: new EventManager({
  context,
  name: "calendar.items.onCreated",
  register: (fire, options) => {
    const observer = createCalendarObserver({ onAddItem: (item) => { ... } });
    cal.manager.addCalendarObserver(observer);
    return () => { cal.manager.removeCalendarObserver(observer); };
  },
}).api(),
```

**Importing utils from extension** (uses UUID-based resource URL):
```javascript
const { convertItem } = ChromeUtils.importESModule(
  `resource://${root}/calendar/experiments/calendar/ext-calendar-utils.sys.mjs`,
);
```

**Compatibility shim** in frontend:
```javascript
if (!window.browser) {
  window.browser = window.chrome || browser;
}
```

### Comments
- `//` for single-line, `/* */` for block headers
- MPL-2.0 license header in experiment files
- `TODO:` for incomplete work (prefix with author name when known: `//TODO: RATIQ`)
- Use `WARNING:` for important operational notes

## Manifest Additions

When adding new experiment APIs, register them in `manifest.json` under `experiment_apis`:
```json
"experiment_apis": {
  "my_api": {
    "schema": "path/to/schema.json",
    "parent": {
      "scopes": ["addon_parent"],
      "script": "path/to/parent.js",
      "paths": [["namespace", "apiName"]],
      "events": ["startup"]
    }
  }
}
```
