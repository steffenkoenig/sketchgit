// @ts-nocheck
export function createSketchGitApp() {
// ╔══════════════════════════════════════════════════════╗
// ║         OBJECT UUID TRACKING                        ║
// ╚══════════════════════════════════════════════════════╝

// Properties to track for merge conflict detection
const MERGE_PROPS = ['stroke','fill','strokeWidth','left','top','width','height',
	'scaleX','scaleY','angle','rx','ry','x1','y1','x2','y2','path','text',
	'fontSize','fontFamily','opacity','flipX','flipY'];

// Assign stable UUID to every canvas object
function ensureObjId(obj) {
	if (!obj._id) obj._id = 'obj_' + Math.random().toString(36).slice(2,12);
	return obj._id;
}

function getCanvasData() {
	// Ensure all objects have IDs before serializing
	canvas.getObjects().forEach(ensureObjId);
	return JSON.stringify(canvas.toJSON(['_isArrow', '_id']));
}

function loadCanvasData(data) {
	canvas.loadFromJSON(JSON.parse(data), () => { canvas.renderAll(); });
}

// Build a map: _id → object-data for a canvas JSON snapshot
function buildObjMap(canvasJSON) {
	const parsed = typeof canvasJSON === 'string' ? JSON.parse(canvasJSON) : canvasJSON;
	const map = {};
	(parsed.objects || []).forEach(obj => {
		if (obj._id) map[obj._id] = obj;
	});
	return map;
}

// Extract relevant properties for comparison
function extractProps(obj) {
	const out = {};
	MERGE_PROPS.forEach(p => { if (obj[p] !== undefined) out[p] = obj[p]; });
	// For groups (arrows), also capture the sub-objects' state
	if (obj.objects) out._groupObjects = JSON.stringify(obj.objects);
	return out;
}

function propsEqual(a, b) {
	return JSON.stringify(a) === JSON.stringify(b);
}

// ╔══════════════════════════════════════════════════════╗
// ║         3-WAY MERGE ENGINE                          ║
// ╚══════════════════════════════════════════════════════╝

// Find the common ancestor (LCA) of two commits
function findLCA(shaA, shaB) {
	const ancestorsA = new Set();
	function walk(sha, set) {
		if (!sha || set.has(sha)) return;
		set.add(sha);
		const c = git.commits[sha];
		if (c) c.parents.forEach(p => walk(p, set));
	}
	walk(shaA, ancestorsA);
	// BFS from shaB to find first common
	const queue = [shaB];
	const visited = new Set();
	while (queue.length) {
		const sha = queue.shift();
		if (!sha || visited.has(sha)) continue;
		visited.add(sha);
		if (ancestorsA.has(sha)) return sha;
		const c = git.commits[sha];
		if (c) c.parents.forEach(p => queue.push(p));
	}
	return null;
}

// pendingMerge holds state while conflict resolution is in progress
let pendingMerge = null;

// Returns: { result: canvasJSON } if clean, or { conflicts: [...], baseMap, oursMap, theirsMap, baseData } if conflicts
function threeWayMerge(baseData, oursData, theirsData) {
	const baseMap   = buildObjMap(baseData);
	const oursMap   = buildObjMap(oursData);
	const theirsMap = buildObjMap(theirsData);

	// All unique IDs across all three
	const allIds = new Set([
		...Object.keys(baseMap),
		...Object.keys(oursMap),
		...Object.keys(theirsMap)
	]);

	const resultObjects = [];
	const conflicts = [];

	allIds.forEach(id => {
		const base   = baseMap[id];
		const ours   = oursMap[id];
		const theirs = theirsMap[id];

		const baseProps   = base   ? extractProps(base)   : null;
		const oursProps   = ours   ? extractProps(ours)   : null;
		const theirsProps = theirs ? extractProps(theirs) : null;

		// ── Deleted in both → skip
		if (!ours && !theirs) return;

		// ── Only in ours (new object added in our branch, or deleted in theirs)
		if (ours && !theirs) {
			if (!base) {
				// Added only in ours → keep
				resultObjects.push(ours);
			} else {
				// Was in base, deleted in theirs, still in ours
				// Keep ours (prefer keeping over deletion)
				resultObjects.push(ours);
			}
			return;
		}

		// ── Only in theirs (new object added in their branch, or deleted in ours)
		if (!ours && theirs) {
			if (!base) {
				// Added only in theirs → add
				resultObjects.push(theirs);
			} else {
				// Was in base, deleted in ours, still in theirs
				// Keep theirs
				resultObjects.push(theirs);
			}
			return;
		}

		// ── In both ours and theirs
		const oursChanged   = base ? !propsEqual(baseProps, oursProps)   : true;
		const theirsChanged = base ? !propsEqual(baseProps, theirsProps) : false;

		if (!oursChanged && !theirsChanged) {
			// Neither changed → take ours (they're identical)
			resultObjects.push(ours);
			return;
		}

		if (oursChanged && !theirsChanged) {
			// Only ours changed → take ours
			resultObjects.push(ours);
			return;
		}

		if (!oursChanged && theirsChanged) {
			// Only theirs changed → take theirs
			resultObjects.push(theirs);
			return;
		}

		// ── Both changed → check property-level conflicts
		const propConflicts = [];
		const mergedObj = { ...ours }; // start with ours as base

		const allPropKeys = new Set([
			...Object.keys(oursProps || {}),
			...Object.keys(theirsProps || {})
		]);

		allPropKeys.forEach(prop => {
			const bVal = baseProps ? baseProps[prop] : undefined;
			const oVal = oursProps  ? oursProps[prop]  : undefined;
			const tVal = theirsProps ? theirsProps[prop] : undefined;

			const oursChangedProp   = JSON.stringify(bVal) !== JSON.stringify(oVal);
			const theirsChangedProp = JSON.stringify(bVal) !== JSON.stringify(tVal);

			if (oursChangedProp && theirsChangedProp && JSON.stringify(oVal) !== JSON.stringify(tVal)) {
				// True conflict on this property
				propConflicts.push({ prop, base: bVal, ours: oVal, theirs: tVal, chosen: 'ours' });
			}
		});

		if (propConflicts.length === 0) {
			// Changes don't overlap at property level → auto-merge
			// Apply theirs changes on top of ours
			allPropKeys.forEach(prop => {
				const bVal = baseProps ? baseProps[prop] : undefined;
				const tVal = theirsProps ? theirsProps[prop] : undefined;
				if (JSON.stringify(bVal) !== JSON.stringify(tVal)) {
					mergedObj[prop] = tVal;
				}
			});
			resultObjects.push(mergedObj);
		} else {
			// Need user resolution
			conflicts.push({
				id,
				label: getObjLabel(ours || theirs),
				oursObj: ours,
				theirsObj: theirs,
				propConflicts, // [{prop, base, ours, theirs, chosen}]
				mergedObj      // will be mutated based on user choices
			});
			resultObjects.push(null); // placeholder, filled after resolution
		}
	});

	if (conflicts.length === 0) {
		// Clean merge
		const baseParsed = typeof baseData === 'string' ? JSON.parse(baseData) : JSON.parse(JSON.stringify(baseData));
		baseParsed.objects = resultObjects;
		return { result: JSON.stringify(baseParsed), autoMerged: true };
	}

	return {
		conflicts,
		cleanObjects: resultObjects, // null entries for conflicting objects
		baseData,
		oursData,
		theirsData
	};
}

function getObjLabel(obj) {
	if (!obj) return 'Object';
	const type = obj.type || 'object';
	const labels = {
		'rect': '▭ Rechteck',
		'ellipse': '○ Ellipse',
		'circle': '○ Kreis',
		'line': '― Linie',
		'path': '✏ Pfad',
		'i-text': 'T Text',
		'text': 'T Text',
		'group': '⊞ Gruppe',
		'polygon': '⬡ Polygon'
	};
	const base = labels[type] || type;
	const id = obj._id ? obj._id.slice(4, 10) : '?';
	return `${base} #${id}`;
}

// ╔══════════════════════════════════════════════════════╗
// ║         CONFLICT UI                                 ║
// ╚══════════════════════════════════════════════════════╝

function formatPropValue(prop, val) {
	if (val === undefined || val === null) return '<i style="opacity:.4">—</i>';
	const v = String(val);
	// Color properties
	if (prop === 'stroke' || prop === 'fill') {
		const isColor = /^#[0-9a-fA-F]{3,8}$/.test(v) || v.startsWith('rgb');
		if (isColor && v !== 'transparent') {
			return `<span class="color-swatch" style="background:${v}"></span>${v}`;
		}
		return v || '<i style="opacity:.4">transparent</i>';
	}
	// Numeric rounding
	if (typeof val === 'number') return Math.round(val * 100) / 100;
	// Long path data
	if (prop === 'path' || prop === '_groupObjects') return '<i style="opacity:.5">[complex data]</i>';
	// Truncate long strings
	if (v.length > 40) return v.slice(0, 38) + '…';
	return v;
}

function getPropLabel(prop) {
	const labels = {
		stroke: 'Farbe (Rand)', fill: 'Füllung', strokeWidth: 'Strichbreite',
		left: 'X-Position', top: 'Y-Position', width: 'Breite', height: 'Höhe',
		scaleX: 'Skalierung X', scaleY: 'Skalierung Y', angle: 'Rotation',
		rx: 'Radius X', ry: 'Radius Y', x1: 'Start X', y1: 'Start Y',
		x2: 'Ende X', y2: 'Ende Y', path: 'Pfad', text: 'Text',
		fontSize: 'Schriftgröße', fontFamily: 'Schriftart', opacity: 'Deckkraft',
		flipX: 'Spiegeln X', flipY: 'Spiegeln Y'
	};
	return labels[prop] || prop;
}

function openConflictModal(conflicts, cleanObjects, oursData, branchNames) {
	pendingMerge = {
		conflicts,
		cleanObjects,
		oursData,
		branchNames,
		resolved: false
	};

	const list = document.getElementById('conflictList');
	list.innerHTML = '';

	const totalConflicts = conflicts.reduce((s, c) => s + c.propConflicts.length, 0);
	document.getElementById('conflictSummary').textContent =
		`${conflicts.length} Objekt(e) mit ${totalConflicts} Property-Konflikt(en) gefunden. ` +
		`Wähle je Eigenschaft, welche Version übernommen werden soll.`;

	conflicts.forEach((conflict, ci) => {
		const objEl = document.createElement('div');
		objEl.className = 'conflict-obj';
		objEl.dataset.ci = ci;

		let headerHTML = `<div class="conflict-obj-header">
			<span>⊞</span>
			<b>${conflict.label}</b>
			<span style="margin-left:auto;color:var(--tx3)">${conflict.propConflicts.length} Konflikt(e)</span>
		</div>`;

		let propsHTML = '';
		conflict.propConflicts.forEach((pc, pi) => {
			propsHTML += `<div class="conflict-prop" data-ci="${ci}" data-pi="${pi}">
				<span class="prop-name">${getPropLabel(pc.prop)}</span>
				<div class="prop-option ${pc.chosen === 'ours' ? 'selected-ours' : ''}"
						 onclick="selectConflictChoice(${ci},${pi},'ours',this)"
						 data-choice="ours" data-ci="${ci}" data-pi="${pi}">
					<div class="opt-label" style="color:var(--a1)">← Ours (${branchNames.ours})</div>
					<div class="opt-val">${formatPropValue(pc.prop, pc.ours)}</div>
				</div>
				<span class="prop-vs">vs</span>
				<div class="prop-option ${pc.chosen === 'theirs' ? 'selected-theirs' : ''}"
						 onclick="selectConflictChoice(${ci},${pi},'theirs',this)"
						 data-choice="theirs" data-ci="${ci}" data-pi="${pi}">
					<div class="opt-label" style="color:var(--a3)">Theirs (${branchNames.theirs}) →</div>
					<div class="opt-val">${formatPropValue(pc.prop, pc.theirs)}</div>
				</div>
			</div>`;
		});

		objEl.innerHTML = headerHTML + propsHTML;
		list.appendChild(objEl);
	});

	updateConflictStats();
	openModal('conflictModal');
}

function selectConflictChoice(ci, pi, choice, clickedEl) {
	if (!pendingMerge) return;
	pendingMerge.conflicts[ci].propConflicts[pi].chosen = choice;

	// Update UI: deselect siblings, select clicked
	const prop = clickedEl.closest('.conflict-prop');
	prop.querySelectorAll('.prop-option').forEach(el => {
		el.classList.remove('selected-ours', 'selected-theirs');
	});
	clickedEl.classList.add(choice === 'ours' ? 'selected-ours' : 'selected-theirs');

	updateConflictStats();
}

function resolveAllOurs() {
	if (!pendingMerge) return;
	pendingMerge.conflicts.forEach((c, ci) => {
		c.propConflicts.forEach((pc, pi) => {
			pc.chosen = 'ours';
		});
	});
	// Re-render
	document.querySelectorAll('.prop-option').forEach(el => {
		const choice = el.dataset.choice;
		el.classList.remove('selected-ours', 'selected-theirs');
		if (choice === 'ours') el.classList.add('selected-ours');
	});
	updateConflictStats();
}

function resolveAllTheirs() {
	if (!pendingMerge) return;
	pendingMerge.conflicts.forEach((c, ci) => {
		c.propConflicts.forEach((pc, pi) => {
			pc.chosen = 'theirs';
		});
	});
	document.querySelectorAll('.prop-option').forEach(el => {
		const choice = el.dataset.choice;
		el.classList.remove('selected-ours', 'selected-theirs');
		if (choice === 'theirs') el.classList.add('selected-theirs');
	});
	updateConflictStats();
}

function updateConflictStats() {
	if (!pendingMerge) return;
	let oursCount = 0, theirsCount = 0, total = 0;
	pendingMerge.conflicts.forEach(c => {
		c.propConflicts.forEach(pc => {
			total++;
			if (pc.chosen === 'ours') oursCount++;
			else theirsCount++;
		});
	});
	document.getElementById('conflictStats').innerHTML =
		`<b>${oursCount}</b> ours · <b>${theirsCount}</b> theirs · <b>${total}</b> gesamt`;
}

function applyMergeResolution() {
	if (!pendingMerge) return;

	const { conflicts, cleanObjects, oursData } = pendingMerge;
	const baseParsed = JSON.parse(oursData);

	// Build final object list
	// cleanObjects has nulls at positions where conflicts were
	const finalObjects = [...cleanObjects];
	let conflictIdx = 0;

	finalObjects.forEach((obj, i) => {
		if (obj === null) {
			const conflict = conflicts[conflictIdx++];
			// Apply chosen values
			const merged = { ...conflict.oursObj };
			conflict.propConflicts.forEach(pc => {
				merged[pc.prop] = pc.chosen === 'ours' ? pc.ours : pc.theirs;
			});
			finalObjects[i] = merged;
		}
	});

	baseParsed.objects = finalObjects.filter(Boolean);
	const mergedData = JSON.stringify(baseParsed);

	// Complete the merge
	const { targetBranch, sourceBranch, targetSHA, sourceSHA } = pendingMerge.branchNames;
	const sha = git._sha();
	git.commits[sha] = {
		sha, parent: targetSHA, parents: [targetSHA, sourceSHA],
		message: `Merge '${sourceBranch}' into '${targetBranch}' (${conflicts.length} Konflikt(e) gelöst)`,
		ts: Date.now(), canvas: mergedData, branch: targetBranch, isMerge: true
	};
	git.branches[targetBranch] = sha;

	loadCanvasData(mergedData);
	clearDirty();
	closeModal('conflictModal');
	pendingMerge = null;
	renderTimeline();
	updateUI();
	showToast(`✓ Merge abgeschlossen — ${conflicts.length} Konflikt(e) gelöst`);
}

// ╔══════════════════════════════════════════════════════╗
// ║              GIT ENGINE                              ║
// ╚══════════════════════════════════════════════════════╝

const BRANCH_COLORS = ['#7c6eff','#ff5f7e','#3dd68c','#f5a623','#38bdf8','#e879f9','#fb923c','#a78bfa'];

const git = {
	commits: {},
	branches: {},
	HEAD: 'main',
	detached: null,

	_sha() {
		return Math.random().toString(36).slice(2,10) + Math.random().toString(36).slice(2,10);
	},

	init(canvas) {
		const sha = this._sha();
		this.commits[sha] = { sha, parent: null, parents: [], message: 'Initial commit', ts: Date.now(), canvas, branch: 'main', isMerge: false };
		this.branches['main'] = sha;
		this.HEAD = 'main';
		this.detached = null;
		return sha;
	},

	currentSHA() {
		if (this.detached) return this.detached;
		return this.branches[this.HEAD] || null;
	},

	commit(canvas, message) {
		if (this.detached) { showToast('⚠ Detached HEAD — create a branch first!', true); return null; }
		const parent = this.currentSHA();
		const sha = this._sha();
		this.commits[sha] = { sha, parent, parents: [parent].filter(Boolean), message, ts: Date.now(), canvas, branch: this.HEAD, isMerge: false };
		this.branches[this.HEAD] = sha;
		return sha;
	},

	createBranch(name, fromSHA) {
		if (this.branches[name]) { showToast('Branch already exists', true); return false; }
		this.branches[name] = fromSHA || this.currentSHA();
		return true;
	},

	checkout(branchOrSHA) {
		if (this.branches[branchOrSHA] !== undefined) {
			this.HEAD = branchOrSHA;
			this.detached = null;
			return this.branches[branchOrSHA];
		} else if (this.commits[branchOrSHA]) {
			this.detached = branchOrSHA;
			return branchOrSHA;
		}
		return null;
	},

	checkoutCommit(sha) {
		this.detached = sha;
		return sha;
	},

	// Smart 3-way merge — returns {done: true} or {conflicts: [...], ...} for UI
	merge(sourceBranch) {
		if (this.detached) { showToast('⚠ Cannot merge in detached HEAD', true); return null; }
		const targetBranch = this.HEAD;
		const targetSHA = this.branches[targetBranch];
		const sourceSHA = this.branches[sourceBranch];
		if (!sourceSHA) { showToast('Source branch not found', true); return null; }
		if (targetSHA === sourceSHA) { showToast('Already up to date', true); return null; }

		const lcaSHA = findLCA(targetSHA, sourceSHA);
		const baseData = lcaSHA ? this.commits[lcaSHA].canvas
														 : JSON.stringify({version:'5.3.1',objects:[],background:'#0a0a0f'});
		const oursData   = this.commits[targetSHA].canvas;
		const theirsData = this.commits[sourceSHA].canvas;

		const mergeResult = threeWayMerge(baseData, oursData, theirsData);

		if (mergeResult.result) {
			// Clean merge, no conflicts
			const sha = this._sha();
			this.commits[sha] = {
				sha, parent: targetSHA, parents: [targetSHA, sourceSHA],
				message: `Merge '${sourceBranch}' into '${targetBranch}'`,
				ts: Date.now(), canvas: mergeResult.result, branch: targetBranch, isMerge: true
			};
			this.branches[targetBranch] = sha;
			return { done: true, sha, mergedData: mergeResult.result };
		} else {
			// Conflicts need resolution — store branch info in pendingMerge
			mergeResult.branchNames = {
				ours: targetBranch, theirs: sourceBranch,
				targetBranch, sourceBranch, targetSHA, sourceSHA
			};
			return { conflicts: mergeResult };
		}
	},

	branchColor(name) {
		const names = Object.keys(this.branches);
		const idx = names.indexOf(name);
		return BRANCH_COLORS[idx % BRANCH_COLORS.length];
	}
};

// ╔══════════════════════════════════════════════════════╗
// ║              CANVAS ENGINE                           ║
// ╚══════════════════════════════════════════════════════╝

let canvas, ctx;
let currentTool = 'select';
let strokeColor = '#e2e2ef';
let fillColor = '#1a1a2e';
let fillEnabled = false;
let strokeWidth = 1.5;
let isDrawing = false;
let startX, startY, activeObj;
let isDirty = false;
let currentPenPath = null;
let myName = 'User';
let myColor = BRANCH_COLORS[Math.floor(Math.random()*BRANCH_COLORS.length)];

function initCanvas() {
	const wrap = document.getElementById('canvas-wrap');
	canvas = new fabric.Canvas('c', {
		width: wrap.clientWidth,
		height: wrap.clientHeight,
		backgroundColor: '#0a0a0f',
		selection: true,
		renderOnAddRemove: true
	});
	ctx = canvas;

	canvas.on('mouse:down', onMouseDown);
	canvas.on('mouse:move', onMouseMove);
	canvas.on('mouse:up', onMouseUp);
	canvas.on('object:modified', onObjectModified);
	canvas.on('object:added', onObjectAdded);
	canvas.on('mouse:wheel', onWheel);

	window.addEventListener('resize', () => {
		canvas.setWidth(wrap.clientWidth);
		canvas.setHeight(wrap.clientHeight);
		canvas.renderAll();
	});

	window.addEventListener('keydown', onKey);
}

function onMouseDown(e) {
	if (currentTool === 'select') return;
	const p = canvas.getPointer(e.e);
	startX = p.x; startY = p.y;
	isDrawing = true;
	canvas.selection = false;

	if (currentTool === 'pen') {
		currentPenPath = [{ x: p.x, y: p.y }];
		activeObj = new fabric.Path(`M ${p.x} ${p.y}`, {
			stroke: strokeColor, strokeWidth, fill: 'transparent',
			selectable: false, evented: false,
			strokeLineCap: 'round', strokeLineJoin: 'round'
		});
		canvas.add(activeObj);
		return;
	}

	if (currentTool === 'eraser') return;

	if (currentTool === 'text') {
		const t = new fabric.IText('Text', {
			left: p.x, top: p.y,
			fontSize: 18, fill: strokeColor,
			fontFamily: 'Fira Code',
			selectable: true, editable: true
		});
		ensureObjId(t);
		canvas.add(t);
		canvas.setActiveObject(t);
		t.enterEditing();
		t.selectAll();
		isDrawing = false;
		markDirty();
		return;
	}

	const opts = {
		left: p.x, top: p.y, width: 0, height: 0,
		stroke: strokeColor, strokeWidth,
		fill: fillEnabled ? fillColor : 'transparent',
		selectable: false, evented: false,
		originX: 'left', originY: 'top'
	};

	if (currentTool === 'rect') activeObj = new fabric.Rect({...opts, rx:3, ry:3});
	else if (currentTool === 'ellipse') activeObj = new fabric.Ellipse({...opts, rx:0, ry:0});
	else if (currentTool === 'line') activeObj = new fabric.Line([p.x,p.y,p.x,p.y], {stroke:strokeColor,strokeWidth,selectable:false,evented:false,strokeLineCap:'round'});
	else if (currentTool === 'arrow') activeObj = new fabric.Line([p.x,p.y,p.x,p.y], {stroke:strokeColor,strokeWidth,selectable:false,evented:false,strokeLineCap:'round',_isArrow:true});

	if (activeObj) { ensureObjId(activeObj); canvas.add(activeObj); }
}

function onMouseMove(e) {
	broadcastCursor(e);
	if (!isDrawing) return;
	const p = canvas.getPointer(e.e);

	if (currentTool === 'eraser') {
		const objs = canvas.getObjects();
		for (let i = objs.length - 1; i >= 0; i--) {
			const o = objs[i];
			if (o.containsPoint(p)) { canvas.remove(o); markDirty(); break; }
		}
		return;
	}

	if (currentTool === 'pen' && currentPenPath) {
		currentPenPath.push({x:p.x, y:p.y});
		canvas.remove(activeObj);
		const d = currentPenPath.map((pt,i) => (i===0?`M ${pt.x} ${pt.y}`:`L ${pt.x} ${pt.y}`)).join(' ');
		activeObj = new fabric.Path(d, {
			stroke:strokeColor, strokeWidth, fill:'transparent',
			selectable:false, evented:false,
			strokeLineCap:'round', strokeLineJoin:'round'
		});
		ensureObjId(activeObj);
		canvas.add(activeObj);
		return;
	}

	const dx = p.x - startX, dy = p.y - startY;
	if (!activeObj) return;

	if (currentTool === 'rect') {
		if (dx < 0) { activeObj.set({left: p.x, width: -dx}); }
		else activeObj.set({width: dx});
		if (dy < 0) { activeObj.set({top: p.y, height: -dy}); }
		else activeObj.set({height: dy});
	} else if (currentTool === 'ellipse') {
		activeObj.set({rx: Math.abs(dx)/2, ry: Math.abs(dy)/2,
			left: dx<0?p.x:startX, top: dy<0?p.y:startY});
	} else if (currentTool === 'line' || currentTool === 'arrow') {
		activeObj.set({x2:p.x, y2:p.y});
	}
	canvas.renderAll();
}

function onMouseUp(e) {
	if (!isDrawing) return;
	isDrawing = false;

	if (currentTool === 'pen' && activeObj) {
		ensureObjId(activeObj);
		activeObj.set({selectable:true, evented:true});
		canvas.setActiveObject(activeObj);
		currentPenPath = null;
		activeObj = null;
		markDirty();
		canvas.selection = true;
		return;
	}

	if (activeObj) {
		const p = canvas.getPointer(e.e);
		const dx = Math.abs(p.x - startX), dy = Math.abs(p.y - startY);
		if (dx < 3 && dy < 3) {
			canvas.remove(activeObj);
		} else {
			ensureObjId(activeObj);
			activeObj.set({selectable:true, evented:true});
			if (currentTool === 'arrow') drawArrowhead(activeObj);
			canvas.setActiveObject(activeObj);
			markDirty();
		}
		activeObj = null;
	}

	canvas.selection = true;
	canvas.renderAll();
	if (currentTool !== 'select') broadcastDraw();
}

function drawArrowhead(line) {
	const x1=line.x1, y1=line.y1, x2=line.x2, y2=line.y2;
	const angle = Math.atan2(y2-y1, x2-x1);
	const len = 14, spread = 0.4;
	const p1x = x2 - len*Math.cos(angle-spread);
	const p1y = y2 - len*Math.sin(angle-spread);
	const p2x = x2 - len*Math.cos(angle+spread);
	const p2y = y2 - len*Math.sin(angle+spread);
	const head = new fabric.Polygon([
		{x:x2,y:y2},{x:p1x,y:p1y},{x:p2x,y:p2y}
	],{fill:line.stroke, stroke:line.stroke, strokeWidth:1, selectable:false, evented:false});
	ensureObjId(head);
	canvas.add(head);
	const grp = new fabric.Group([line, head], {selectable:true, evented:true});
	ensureObjId(grp);
	canvas.remove(line);
	canvas.remove(head);
	canvas.add(grp);
	canvas.setActiveObject(grp);
	activeObj = null;
}

function onObjectModified() { markDirty(); broadcastDraw(); }
function onObjectAdded(e) {
	// Ensure every newly added object has a stable ID
	if (e.target) ensureObjId(e.target);
}

function onWheel(opt) {
	const delta = opt.e.deltaY;
	let zoom = canvas.getZoom();
	zoom *= 0.999 ** delta;
	zoom = Math.min(Math.max(zoom, 0.1), 10);
	canvas.zoomToPoint({x:opt.e.offsetX, y:opt.e.offsetY}, zoom);
	opt.e.preventDefault(); opt.e.stopPropagation();
}

function onKey(e) {
	if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
	const k = e.key.toLowerCase();
	if (k==='s') setTool('select');
	else if (k==='p') setTool('pen');
	else if (k==='l') setTool('line');
	else if (k==='a') setTool('arrow');
	else if (k==='r') setTool('rect');
	else if (k==='e') setTool('ellipse');
	else if (k==='t') setTool('text');
	else if (k==='x') setTool('eraser');
	else if (k==='+' || k==='=') zoomIn();
	else if (k==='-') zoomOut();
	else if (k==='0') resetZoom();
	else if ((e.ctrlKey||e.metaKey) && k==='z') { canvas.undo && canvas.undo(); markDirty(); }
	else if (k==='delete'||k==='backspace') {
		const obj = canvas.getActiveObject();
		if (obj) { canvas.remove(obj); markDirty(); broadcastDraw(); }
	}
}

function setTool(t) {
	currentTool = t;
	document.querySelectorAll('.tbtn').forEach(b=>b.classList.remove('on'));
	const el = document.getElementById('t'+t);
	if (el) el.classList.add('on');
	canvas.isDrawingMode = false;
	canvas.selection = (t==='select');
	canvas.defaultCursor = t==='eraser'?'crosshair':'default';
	if (t==='pen') canvas.defaultCursor = 'crosshair';
}

function updateStrokeColor(v) {
	strokeColor=v;
	document.getElementById('strokeDot').style.background=v;
	const o=canvas.getActiveObject();
	if(o){o.set('stroke',v);canvas.renderAll();}
}
function updateFillColor(v) {
	fillColor=v;
	document.getElementById('fillDot').style.background=v;
	const o=canvas.getActiveObject();
	if(o){o.set('fill',v);canvas.renderAll();}
}
function toggleFill() {
	fillEnabled=!fillEnabled;
	document.getElementById('tfillToggle').textContent = fillEnabled?'⊠':'⊡';
}
function setStrokeWidth(w) {
	strokeWidth=w;
	['sz1','sz3','sz5'].forEach(id=>document.getElementById(id).classList.remove('on'));
	if(w===1.5)document.getElementById('sz1').classList.add('on');
	else if(w===3)document.getElementById('sz3').classList.add('on');
	else if(w===5)document.getElementById('sz5').classList.add('on');
}
function zoomIn(){canvas.setZoom(Math.min(canvas.getZoom()*1.2,10))}
function zoomOut(){canvas.setZoom(Math.max(canvas.getZoom()/1.2,0.1))}
function resetZoom(){canvas.setZoom(1);canvas.viewportTransform=[1,0,0,1,0,0];canvas.renderAll()}

function markDirty() {
	isDirty=true;
	document.getElementById('dirty').classList.remove('hide');
}
function clearDirty() {
	isDirty=false;
	document.getElementById('dirty').classList.add('hide');
}

// ╔══════════════════════════════════════════════════════╗
// ║              TIMELINE RENDER                         ║
// ╚══════════════════════════════════════════════════════╝

const TL = { ROW_H: 36, COL_W: 80, PAD_X: 20, PAD_Y: 18, R: 9 };

let ctxMenuSHA = null;
let checkoutTargetSHA = null;
let branchFromSHA = null;

function renderTimeline() {
	const commits = Object.values(git.commits).sort((a,b)=>a.ts-b.ts);
	if (!commits.length) return;

	const branchRow = {};
	let rowIdx = 0;
	Object.keys(git.branches).forEach(b=>{
		if (branchRow[b]===undefined) branchRow[b]=rowIdx++;
	});

	const shaCol = {};
	commits.forEach((c,i)=>{ shaCol[c.sha]=i; });

	const headSHA = git.currentSHA();
	const rows = rowIdx || 1;
	const cols = commits.length;

	const svgW = Math.max(TL.PAD_X*2 + cols*TL.COL_W, 600);
	const svgH = TL.PAD_Y*2 + rows*TL.ROW_H;

	const svg = document.getElementById('tlsvg');
	svg.setAttribute('width', svgW);
	svg.setAttribute('height', svgH);
	svg.innerHTML = '';

	function cx(sha) { return TL.PAD_X + shaCol[sha]*TL.COL_W + TL.COL_W/2; }
	function cy(sha) {
		const c = git.commits[sha];
		if (!c) return TL.PAD_Y + TL.ROW_H/2;
		const r = branchRow[c.branch] !== undefined ? branchRow[c.branch] : 0;
		return TL.PAD_Y + r*TL.ROW_H + TL.ROW_H/2;
	}

	const ns = 'http://www.w3.org/2000/svg';
	function el(tag, attrs, parent) {
		const e = document.createElementNS(ns, tag);
		Object.entries(attrs).forEach(([k,v])=>e.setAttribute(k,v));
		(parent||svg).appendChild(e);
		return e;
	}

	commits.forEach(c=>{
		c.parents.forEach((p,pi)=>{
			const color = git.branchColor(c.branch);
			const x1=cx(p), y1=cy(p), x2=cx(c.sha), y2=cy(c.sha);
			let d;
			if (Math.abs(y1-y2)<1) { d=`M${x1},${y1} L${x2},${y2}`; }
			else { const mx=(x1+x2)/2; d=`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`; }
			el('path',{d,stroke:color,'stroke-width':'2',fill:'none','stroke-linecap':'round',
				'stroke-dasharray': pi>0?'4,3':''});
		});
	});

	commits.forEach(c=>{
		const x=cx(c.sha), y=cy(c.sha);
		const color = git.branchColor(c.branch);
		const isHead = c.sha===headSHA;
		const isMerge = c.isMerge;

		const g = el('g',{'class':'commit-node','data-sha':c.sha});
		g.style.cursor='pointer';

		if (isHead) {
			el('circle',{cx:x,cy:y,r:TL.R+5,fill:'none',stroke:color,'stroke-width':'1.5',opacity:'.35','class':'head-ring'},g);
		}

		if (isMerge) {
			const s=TL.R;
			el('polygon',{points:`${x},${y-s} ${x+s},${y} ${x},${y+s} ${x-s},${y}`,fill:color,stroke:isHead?'white':'transparent','stroke-width':'2'},g);
		} else {
			el('circle',{cx:x,cy:y,r:TL.R,fill:isHead?'white':color,stroke:color,'stroke-width':isHead?'3':'0'},g);
			if (isHead) el('circle',{cx:x,cy:y,r:TL.R-4,fill:color},g);
		}

		const msgEl = el('text',{x:x,y:y-TL.R-5,'text-anchor':'middle','font-size':'8','font-family':'Fira Code, monospace',fill:'#9090b0'},g);
		msgEl.textContent = c.message.length>18 ? c.message.slice(0,16)+'…' : c.message;

		const shaEl = el('text',{x:x,y:y+TL.R+10,'text-anchor':'middle','font-size':'7','font-family':'Fira Code, monospace',fill:'#5a5a7a'},g);
		shaEl.textContent = c.sha.slice(0,6);

		g.addEventListener('click', ev=>{ ev.stopPropagation(); openCommitPopup(c.sha, ev.clientX, ev.clientY); });
		g.addEventListener('contextmenu', ev=>{ ev.preventDefault(); openCommitPopup(c.sha, ev.clientX, ev.clientY); });
	});

	Object.entries(git.branches).forEach(([name, sha])=>{
		if (!sha || !git.commits[sha]) return;
		const color = git.branchColor(name);
		const x=cx(sha), y=cy(sha);
		const isCurrentBranch = name===git.HEAD;
		const lx=x+TL.R+4, ly=y-TL.R-2;
		const bg = el('rect',{x:lx-3,y:ly-9,width:name.length*6.2+6,height:12,fill:color,rx:'4',opacity:isCurrentBranch?'1':'.7'});
		svg.appendChild(bg);
		const lbl = el('text',{x:lx,y:ly,'font-size':'8','font-family':'Fira Code, monospace',fill:'white','font-weight':'600','class':'branch-label-el'});
		lbl.textContent = name;
		lbl.addEventListener('click',()=>{ git.checkout(name); loadCanvasData(git.commits[git.branches[name]].canvas); clearDirty(); updateUI(); renderTimeline(); showToast(`Switched to '${name}'`); });
		svg.appendChild(lbl);
	});

	document.getElementById('headSHA').textContent = headSHA ? headSHA.slice(0,7) : '';
	document.getElementById('currentBranchName').textContent = git.detached ? ('🔍 ' + git.detached.slice(0,6)) : git.HEAD;
	document.getElementById('currentBranchDot').style.background = git.branchColor(git.HEAD);

	if (headSHA) {
		const x = TL.PAD_X + shaCol[headSHA]*TL.COL_W;
		document.getElementById('tlscroll').scrollLeft = Math.max(0, x - 100);
	}
}

// ── Commit popup ──────────────────────────────────────
let popupSHA = null;

function openCommitPopup(sha, screenX, screenY) {
	popupSHA = sha;
	const c = git.commits[sha];
	if (!c) return;

	const isHead = sha === git.currentSHA();
	document.getElementById('cp-head-badge').style.display = isHead ? 'inline-flex' : 'none';
	document.getElementById('cp-sha').textContent = sha.slice(0, 12) + '…';
	document.getElementById('cp-msg').textContent = c.message;
	const d = new Date(c.ts);
	document.getElementById('cp-meta').textContent =
		`${c.branch} · ${d.toLocaleDateString()} ${d.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}`;

	const popup = document.getElementById('commit-popup');
	popup.classList.add('open');

	// Position: prefer above the click, keep on screen
	const pw = 230, ph = 180;
	let x = screenX - pw / 2;
	let y = screenY - ph - 14;
	x = Math.max(8, Math.min(x, window.innerWidth - pw - 8));
	if (y < 8) y = screenY + 18;
	popup.style.left = x + 'px';
	popup.style.top  = y + 'px';
}

function closeCommitPopup() {
	document.getElementById('commit-popup').classList.remove('open');
	popupSHA = null;
}

function cpCheckout() {
	if (!popupSHA) return;
	const sha = popupSHA;
	closeCommitPopup();
	const isHead = sha === git.currentSHA();
	if (isHead) { showToast('Already at this commit'); return; }
	git.checkoutCommit(sha);
	loadCanvasData(git.commits[sha].canvas);
	clearDirty();
	renderTimeline(); updateUI();
	showToast('⤵ Viewing commit ' + sha.slice(0,7) + ' — detached HEAD');
}

function cpBranchFrom() {
	if (!popupSHA) return;
	ctxMenuSHA = popupSHA;
	closeCommitPopup();
	openBranchCreate();
}

function cpRollback() {
	if (!popupSHA) return;
	const sha = popupSHA;
	if (git.detached) { showToast('⚠ Not on a branch', true); closeCommitPopup(); return; }
	if (!confirm(`Rollback branch '${git.HEAD}' to ${sha.slice(0,7)}? This cannot be undone.`)) return;
	closeCommitPopup();
	git.branches[git.HEAD] = sha;
	git.detached = null;
	loadCanvasData(git.commits[sha].canvas);
	clearDirty(); renderTimeline(); updateUI();
	showToast('Rolled back to ' + sha.slice(0,7));
}

function scrollToCommit(sha) { /* unused */ }

// ╔══════════════════════════════════════════════════════╗
// ║              MODAL ACTIONS                           ║
// ╚══════════════════════════════════════════════════════╝

function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

function openCommitModal() {
	if (!isDirty) { showToast('Nothing new to commit'); return; }
	document.getElementById('commitMsg').value='';
	openModal('commitModal');
	setTimeout(()=>document.getElementById('commitMsg').focus(),100);
}

function doCommit() {
	const msg = document.getElementById('commitMsg').value.trim() || 'Update drawing';
	const sha = git.commit(getCanvasData(), msg);
	if (!sha) return;
	closeModal('commitModal');
	clearDirty();
	renderTimeline();
	updateUI();
	showToast(`✓ Committed: ${msg}`);
	broadcast({type:'commit', sha, commit: git.commits[sha]});
}

function openBranchModal() {
	const list = document.getElementById('branchListEl');
	list.innerHTML='';
	Object.entries(git.branches).forEach(([name,sha])=>{
		const color=git.branchColor(name);
		const item=document.createElement('div');
		item.className='branch-item'+(name===git.HEAD?' active-branch':'');
		item.innerHTML=`<div style="width:10px;height:10px;border-radius:50%;background:${color};flex-shrink:0"></div>
			<span class="bname">${name}</span><span class="bsha">${sha?sha.slice(0,7):''}</span>`;
		item.addEventListener('click',()=>{
			git.checkout(name);
			const c=git.commits[git.branches[name]];
			if(c){loadCanvasData(c.canvas);}
			clearDirty(); closeModal('branchModal'); renderTimeline(); updateUI();
			showToast(`Switched to branch '${name}'`);
		});
		list.appendChild(item);
	});
	openModal('branchModal');
}

function openBranchCreate() {
	branchFromSHA = ctxMenuSHA || git.currentSHA();
	const c=git.commits[branchFromSHA];
	document.getElementById('branchFromInfo').innerHTML=
		`<b>From:</b> ${branchFromSHA?branchFromSHA.slice(0,7):'?'} — ${c?c.message:''}`;
	document.getElementById('newBranchName').value='';
	closeModal('branchModal');
	openModal('branchCreateModal');
	setTimeout(()=>document.getElementById('newBranchName').focus(),100);
}

function doCreateBranch() {
	const name = document.getElementById('newBranchName').value.trim().replace(/\s+/g,'-');
	if (!name) return;
	if (!git.createBranch(name, branchFromSHA)) return;
	git.checkout(name);
	closeModal('branchCreateModal');
	renderTimeline(); updateUI();
	showToast(`✓ Created & switched to '${name}'`);
	ctxMenuSHA=null;
}

function openMergeModal() {
	if (git.detached) { showToast('⚠ Cannot merge in detached HEAD', true); return; }
	document.getElementById('mergeTargetName').textContent = git.HEAD;
	const sel = document.getElementById('mergeSourceSelect');
	sel.innerHTML='';
	Object.keys(git.branches).filter(b=>b!==git.HEAD).forEach(b=>{
		const o=document.createElement('option'); o.value=b; o.textContent=b; sel.appendChild(o);
	});
	if (!sel.options.length) { showToast('No other branches to merge', true); return; }
	openModal('mergeModal');
}

function doMerge() {
	const src=document.getElementById('mergeSourceSelect').value;
	closeModal('mergeModal');

	const result = git.merge(src);
	if (!result) return;

	if (result.done) {
		// Clean merge
		loadCanvasData(git.commits[git.branches[git.HEAD]].canvas);
		clearDirty();
		renderTimeline(); updateUI();
		showToast(`✓ Merged '${src}' into '${git.HEAD}' — kein Konflikt`);
	} else if (result.conflicts) {
		// Need user resolution
		const { conflicts, cleanObjects, oursData, branchNames } = result.conflicts;
		openConflictModal(conflicts, cleanObjects, oursData, branchNames);
		showToast(`⚡ ${conflicts.length} Konflikt(e) gefunden — bitte auflösen`, true);
	}
}

// (commit node actions now handled by #commit-popup via openCommitPopup / cpCheckout / cpBranchFrom / cpRollback)

function updateUI() {
	document.getElementById('currentBranchName').textContent = git.detached ? ('🔍 '+git.detached.slice(0,6)) : git.HEAD;
	document.getElementById('headSHA').textContent = (git.currentSHA()||'').slice(0,7);
	document.getElementById('currentBranchDot').style.background = git.branchColor(git.HEAD);
}

function tlScrollLeft() { document.getElementById('tlscroll').scrollLeft -= 200; }
function tlScrollRight() { document.getElementById('tlscroll').scrollLeft += 200; }

// ╔══════════════════════════════════════════════════════╗
// ║              COLLABORATION (WebSocket Rooms)        ║
// ╚══════════════════════════════════════════════════════╝

let socket = null;
let wsClientId = null;
let currentRoomId = 'default';
let presenceClients = [];
let remoteCursors = {};

function wsUrlForRoom(roomId) {
	const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
	const host = window.location.host;
	const name = encodeURIComponent(myName || 'User');
	const color = encodeURIComponent(myColor || '#7c6eff');
	return `${protocol}//${host}/ws?room=${encodeURIComponent(roomId)}&name=${name}&color=${color}`;
}

function getRoomFromUrl() {
	const params = new URLSearchParams(window.location.search);
	const raw = (params.get('room') || '').trim();
	return sanitizeRoomId(raw || 'default');
}

function sanitizeRoomId(value) {
	const cleaned = (value || 'default').trim().slice(0, 40).replace(/[^a-zA-Z0-9_-]/g, '-');
	return cleaned || 'default';
}

function roomInviteLink(roomId) {
	const url = new URL(window.location.href);
	url.searchParams.set('room', roomId);
	return url.toString();
}

function initRealtime() {
	const initialRoom = getRoomFromUrl();
	document.getElementById('remotePeerInput').value = initialRoom;
	document.getElementById('myPeerId').textContent = roomInviteLink(initialRoom);
	connectToPeer();
}

function handlePeerData(data) {
	if (data.type === 'welcome') {
		wsClientId = data.clientId;
		currentRoomId = data.roomId || currentRoomId;
		const link = roomInviteLink(currentRoomId);
		document.getElementById('myPeerId').textContent = link;
		const url = new URL(window.location.href);
		url.searchParams.set('room', currentRoomId);
		window.history.replaceState({}, '', url.toString());
		document.getElementById('peerStatus').textContent = `✓ Verbunden mit Raum '${currentRoomId}'`;
		document.getElementById('peerStatus').className = 'peer-status ok';
		broadcast({ type: 'profile', name: myName, color: myColor });
		broadcast({ type: 'fullsync-request' });
		return;
	}

	if (data.type === 'presence') {
		presenceClients = Array.isArray(data.clients) ? data.clients : [];
		updateCollabUI();

		// remove stale remote cursors
		const ids = new Set(presenceClients.map(c => c.clientId));
		Object.keys(remoteCursors).forEach(id => {
			if (!ids.has(id)) {
				document.getElementById(remoteCursors[id])?.remove();
				delete remoteCursors[id];
			}
		});
		return;
	}

	if (data.type === 'user-left') {
		if (remoteCursors[data.clientId]) {
			document.getElementById(remoteCursors[data.clientId])?.remove();
			delete remoteCursors[data.clientId];
		}
		return;
	}

	if (data.type === 'cursor') {
		updateRemoteCursor(data.senderId, {
			x: data.x,
			y: data.y,
			name: data.senderName || 'User',
			color: data.senderColor || '#7c6eff'
		});
		return;
	}

	if (data.type === 'draw') {
		loadCanvasData(data.canvas);
		renderTimeline();
		return;
	}

	if (data.type === 'commit') {
		git.commits[data.sha] = data.commit;
		renderTimeline();
		showToast('📥 Commit erhalten: ' + data.commit.message);
		return;
	}

	if (data.type === 'fullsync-request') {
		broadcast({
			type: 'fullsync',
			targetId: data.senderId,
			commits: git.commits,
			branches: git.branches,
			HEAD: git.HEAD,
			detached: git.detached
		});
		return;
	}

	if (data.type === 'fullsync') {
		if (data.targetId && data.targetId !== wsClientId) return;
		Object.assign(git.commits, data.commits || {});
		Object.assign(git.branches, data.branches || {});
		if (data.HEAD) git.HEAD = data.HEAD;
		git.detached = data.detached || null;
		const headSha = git.detached || git.branches[git.HEAD];
		const c = git.commits[headSha];
		if (c) loadCanvasData(c.canvas);
		renderTimeline();
		updateUI();
	}
}

function updateRemoteCursor(clientId, data) {
	if (!clientId || clientId === wsClientId) return;
	const layer = document.getElementById('cursor-layer');
	let el = document.getElementById('rcursor-' + clientId);
	if (!el) {
		el = document.createElement('div');
		el.className = 'rcursor';
		el.id = 'rcursor-' + clientId;
		layer.appendChild(el);
		remoteCursors[clientId] = el.id;
	}
	el.innerHTML = `<div class="rcursor-tip" style="border-bottom-color:${data.color}"></div>
		<div class="rcursor-name" style="background:${data.color}">${data.name}</div>`;
	el.style.left = data.x + 'px';
	el.style.top = data.y + 'px';
}

function broadcastCursor(e) {
	if (!socket || socket.readyState !== WebSocket.OPEN) return;
	const rect = document.getElementById('canvas-wrap').getBoundingClientRect();
	broadcast({
		type: 'cursor',
		x: e.e.clientX - rect.left,
		y: e.e.clientY - rect.top
	});
}

function broadcastDraw() {
	if (!socket || socket.readyState !== WebSocket.OPEN) return;
	broadcast({ type: 'draw', canvas: getCanvasData() });
}

function broadcast(data) {
	if (!socket || socket.readyState !== WebSocket.OPEN) return;
	try {
		socket.send(JSON.stringify(data));
	} catch (_) {}
}

function connectToPeer() {
	const requestedRoom = sanitizeRoomId(document.getElementById('remotePeerInput').value.trim() || currentRoomId || 'default');
	document.getElementById('remotePeerInput').value = requestedRoom;

	if (socket && socket.readyState === WebSocket.OPEN && requestedRoom === currentRoomId) {
		showToast('Bereits mit diesem Raum verbunden');
		return;
	}

	if (socket) {
		try { socket.close(); } catch (_) {}
	}

	document.getElementById('peerStatus').textContent = 'Verbinde...';
	document.getElementById('peerStatus').className = 'peer-status';
	currentRoomId = requestedRoom;
	socket = new WebSocket(wsUrlForRoom(requestedRoom));

	socket.addEventListener('open', () => {
		document.getElementById('liveInd').style.display = 'block';
		showToast(`🟢 Raum verbunden: ${requestedRoom}`);
	});

	socket.addEventListener('message', ev => {
		let data;
		try { data = JSON.parse(ev.data); } catch (_) { return; }
		handlePeerData(data);
	});

	socket.addEventListener('close', () => {
		document.getElementById('liveInd').style.display = 'none';
		document.getElementById('peerStatus').textContent = 'Verbindung getrennt';
		document.getElementById('peerStatus').className = 'peer-status err';
		presenceClients = [];
		updateCollabUI();
	});

	socket.addEventListener('error', () => {
		document.getElementById('peerStatus').textContent = 'WebSocket Fehler';
		document.getElementById('peerStatus').className = 'peer-status err';
	});
}

function updateCollabUI() {
	const others = presenceClients.filter(c => c.clientId !== wsClientId);
	const list = document.getElementById('connectedList');
	list.innerHTML = others.map(c => `<div class="connected-peer">
		<div style="width:6px;height:6px;background:${c.color || 'var(--a3)'};border-radius:50%"></div>
		${(c.name || 'User').slice(0, 20)}
	</div>`).join('');

	const row = document.getElementById('avatarRow');
	row.innerHTML = others.slice(0, 4).map(c => `<div class="av" style="background:${c.color || '#7c6eff'}">${(c.name || 'U').slice(0,1).toUpperCase()}</div>`).join('');
	if (!others.length) row.innerHTML = '';
}

function copyPeerId() {
	const link = roomInviteLink(currentRoomId || 'default');
	navigator.clipboard.writeText(link).then(() => showToast('✓ Einladungslink kopiert'));
}

let collabOpen=false;
function toggleCollabPanel() {
	collabOpen=!collabOpen;
	document.getElementById('collab-panel').classList.toggle('open',collabOpen);
}

// ╔══════════════════════════════════════════════════════╗
// ║              NAME SETUP                              ║
// ╚══════════════════════════════════════════════════════╝

function setName() {
	const n=document.getElementById('nameInput').value.trim();
	if(!n)return;
	myName=n;
	if (socket && socket.readyState === WebSocket.OPEN) {
		broadcast({ type: 'profile', name: myName, color: myColor });
	}
	closeModal('nameModal');
}

// ╔══════════════════════════════════════════════════════╗
// ║              TOAST                                   ║
// ╚══════════════════════════════════════════════════════╝

let toastTimer;
function showToast(msg, isErr=false) {
	const t=document.getElementById('toast');
	t.textContent=msg;
	t.style.borderColor=isErr?'var(--a2)':'var(--bdr2)';
	t.classList.add('show');
	clearTimeout(toastTimer);
	toastTimer=setTimeout(()=>t.classList.remove('show'),2800);
}

// ╔══════════════════════════════════════════════════════╗
// ║              BOOTSTRAP                               ║
// ╚══════════════════════════════════════════════════════╝

function init() {
	initCanvas();
	const initData = JSON.stringify({version:'5.3.1',objects:[],background:'#0a0a0f'});
	git.init(initData);
	renderTimeline();
	updateUI();
	initRealtime();
	openModal('nameModal');
	setTimeout(()=>document.getElementById('nameInput').focus(),200);
	document.addEventListener('click', e=>{
		const panel=document.getElementById('collab-panel');
		if(collabOpen && !panel.contains(e.target) && !e.target.closest('#topbar')){
			collabOpen=false; panel.classList.remove('open');
		}
		// close commit popup when clicking outside it
		const popup = document.getElementById('commit-popup');
		if (popup.classList.contains('open') && !popup.contains(e.target)) {
			closeCommitPopup();
		}
	});
}

init();

return {
	setTool,
	updateStrokeColor,
	updateFillColor,
	toggleFill,
	setStrokeWidth,
	zoomIn,
	zoomOut,
	resetZoom,
	toggleCollabPanel,
	openMergeModal,
	openBranchCreate,
	openCommitModal,
	copyPeerId,
	connectToPeer,
	closeCommitPopup,
	cpCheckout,
	cpBranchFrom,
	cpRollback,
	closeModal,
	doCommit,
	doCreateBranch,
	doMerge,
	resolveAllOurs,
	resolveAllTheirs,
	applyMergeResolution,
	setName,
	openBranchModal,
	tlScrollLeft,
	tlScrollRight
};
}
