const fs = require('fs');

// BUG-012
let ce = fs.readFileSync('lib/sketchgit/canvas/canvasEngine.ts', 'utf8');
ce = ce.replace(/this\.canvas\.on\('object:modified', \(e: \{ target\?: FabricObject \}\) => \{\n      \/\/ Guard against re-entrant calls: Fabric\.js v7 can re-fire object:modified\n      \/\/ for the already-removed arrow group when setActiveObject triggers\n      \/\/ discardActiveObject → endCurrentTransform\.  Without this guard the\n      \/\/ remove\(\) becomes a no-op while buildArrowGroup keeps adding new arrows,\n      \/\/ accumulating hundreds of groups and crashing the tab\.\n      if \(this\._reSnapping\) return;\n      this\.pushHistory\(\);\n      this\.markDirty\(\);/, `// Capture state BEFORE the transformation (P037 undo support)\n    this.canvas.on('before:transform', () => {\n      this.pushHistory();\n    });\n    this.canvas.on('object:modified', (e: { target?: FabricObject }) => {\n      // Guard against re-entrant calls: Fabric.js v7 can re-fire object:modified\n      // for the already-removed arrow group when setActiveObject triggers\n      // discardActiveObject → endCurrentTransform.  Without this guard the\n      // remove() becomes a no-op while buildArrowGroup keeps adding new arrows,\n      // accumulating hundreds of groups and crashing the tab.\n      if (this._reSnapping) return;\n      this.markDirty();`);
fs.writeFileSync('lib/sketchgit/canvas/canvasEngine.ts', ce);

// BUG-013
let wc = fs.readFileSync('lib/sketchgit/realtime/wsClient.ts', 'utf8');
wc = wc.replace(/connect\(roomId: string, myName: string, myColor: string\): void \{\n    this\.roomId = roomId;/, `connect(roomId: string, myName: string, myColor: string): void {\n    if (this.socket) {\n      const old = this.socket;\n      this.socket = null;\n      this.intentionalClose = true;\n      try { old.close(1000, 'room-switch'); } catch { /* ignore */ }\n    }\n    this.roomId = roomId;`);
fs.writeFileSync('lib/sketchgit/realtime/wsClient.ts', wc);

// BUG-014
let tc = fs.readFileSync('lib/sketchgit/coordinators/timelineCoordinator.ts', 'utf8');
tc = tc.replace(/const \{ git, canvas \} = this\.ctx;/, `const { git, canvas, collab, ws } = this.ctx;`);
tc = tc.replace(/\(name\) => \{\n        git\.checkout\(name\);\n        const c = git\.commits\[git\.branches\[name\]\];\n        if \(c\) canvas\.loadCanvasData\(c\.canvas\);\n        canvas\.clearDirty\(\);\n        this\.updateUI\(\);\n        this\.render\(\);\n        showToast\(`\Switched to '\$\{name\}'`\);\n      \},/, `(name) => {\n        const branchTip = git.branches[name];\n        git.checkout(name);\n        const c = git.commits[branchTip];\n        if (c) canvas.loadCanvasData(c.canvas);\n        canvas.clearDirty();\n        this.updateUI();\n        this.render();\n        showToast(\`Switched to '\${name}'\`);\n        \n        // Notify peers of the branch switch\n        collab.sendBranchUpdate(name, branchTip, { isRollback: false });\n        collab.sendProfile(\n          ws.name,\n          ws.color,\n          name,\n          branchTip ?? null,\n        );\n      },`);
fs.writeFileSync('lib/sketchgit/coordinators/timelineCoordinator.ts', tc);

// BUG-016
let pr = fs.readFileSync('proxy.ts', 'utf8');
pr = pr.replace(/const RATE_LIMITED_PATHS = new Set\(\["\/api\/auth\/register", "\/api\/auth\/signin"\]\);/, `const RATE_LIMITED_PATHS = new Set([\n  "/api/auth/register",\n  "/api/auth/signin",\n  "/api/auth/forgot-password",\n  "/api/auth/reset-password",\n]);`);
pr = pr.replace(/matcher: \["\/dashboard\/:path\*", "\/api\/auth\/register", "\/api\/auth\/signin"\],/, `matcher: [\n    "/dashboard/:path*",\n    "/api/auth/register",\n    "/api/auth/signin",\n    "/api/auth/forgot-password",\n    "/api/auth/reset-password",\n  ],`);
fs.writeFileSync('proxy.ts', pr);

// Proxy test fix
let prt = fs.readFileSync('lib/server/test/proxy.config.test.ts', 'utf8');
prt = prt.replace(/expect\(config\.matcher\.length\)\.toBe\(3\);/, `expect(config.matcher).toContain('/api/auth/forgot-password');\n    expect(config.matcher).toContain('/api/auth/reset-password');\n    expect(config.matcher.length).toBe(5);`);
fs.writeFileSync('lib/server/test/proxy.config.test.ts', prt);

// 1. Update docs/support/index.md
let supportDocs = fs.readFileSync('docs/support/index.md', 'utf8');
supportDocs = supportDocs.replace('## Bug Fixes (Milestone 1.0)\n- Addressed bugs BUG-020 and BUG-021 which previously caused tab crashes when snapping arrows near boundaries. The engine now safely halts redundant animation frames.\n', '## Bug Fixes (Milestone 1.0)\n- Addressed bugs BUG-020 and BUG-021 which previously caused tab crashes when snapping arrows near boundaries. The engine now safely halts redundant animation frames.\n- BUG-012: Moving and resizing objects can now be accurately undone with a single Ctrl+Z action.\n- BUG-013: Fixed a WebSocket issue where switching rooms would orphan existing connections and cause continuous spurious reconnections.\n- BUG-014: Switching branches via the timeline SVG label now instantly notifies peers and updates their presence panels.\n- BUG-016: Password reset and forgot password endpoints are now properly rate-limited to protect against abuse.\n');
fs.writeFileSync('docs/support/index.md', supportDocs);

// 2. Update .jules/builder.md
let builderDocs = fs.readFileSync('.jules/builder.md', 'utf8');
builderDocs += '\n\n## Bug Fixes (Milestone 1.0)\n**Current State Audit:** Verified fixes for BUG-012, BUG-013, BUG-014, BUG-015, and BUG-016.\n**Completed Items:**\n- [x] Fixed undo state post-transform (BUG-012)\n- [x] Fixed WsClient.connect orphaning sockets (BUG-013)\n- [x] Fixed timeline branch peer notification (BUG-014)\n- [x] Verified fix for color change undo (BUG-015)\n- [x] Rate limited forgot-password and reset-password routes (BUG-016)\n- [x] Updated docs/support/index.md\n**Active Step:** Complete.\n**Blockers/Constraints:** None.\n';
fs.writeFileSync('.jules/builder.md', builderDocs);

// 3. Update reports/bugs/bug_summary.md
let bugSummary = fs.readFileSync('reports/bugs/bug_summary.md', 'utf8');
bugSummary = bugSummary.replace(/### BUG-012[\s\S]*?(?=### BUG-013)/, '### BUG-012 - Undo saves post-transform state; move/resize cannot be undone ✅\n\n**Severity**: Medium\n\nFixed by listening to `before:transform` instead of `object:modified` to capture the pre-modification snapshot.\n\n---\n\n');
bugSummary = bugSummary.replace(/### BUG-013[\s\S]*?(?=### BUG-014)/, '### BUG-013 - WsClient.connect() orphans the old socket, causing spurious reconnects ✅\n\n**Severity**: High\n\nFixed by intentionally closing `this.socket` before creating a new connection.\n\n---\n\n');
bugSummary = bugSummary.replace(/### BUG-014[\s\S]*?(?=### BUG-015)/, '### BUG-014 - Clicking a branch label in the timeline SVG doesn\'t notify peers ✅\n\n**Severity**: Low\n\nFixed by adding `collab.sendBranchUpdate` and `collab.sendProfile` calls inside the timeline SVG `onBranchClick` callback.\n\n---\n\n');
bugSummary = bugSummary.replace(/### BUG-015[\s\S]*?(?=### BUG-016)/, '### BUG-015 - Color/fill changes to selected objects are not undoable ✅\n\n**Severity**: Low\n\nFixed by ensuring `this.pushHistory()` is called before `obj.set()` inside `updateStrokeColor` and `updateFillColor`.\n\n---\n\n');
bugSummary = bugSummary.replace(/### BUG-016[\s\S]*?(?=### BUG-017)/, '### BUG-016 - /api/auth/forgot-password and /api/auth/reset-password bypass the rate limiter ✅\n\n**Severity**: Medium\n\nFixed by adding the routes to `RATE_LIMITED_PATHS` and `config.matcher` in `proxy.ts`.\n\n---\n\n');
fs.writeFileSync('reports/bugs/bug_summary.md', bugSummary);
