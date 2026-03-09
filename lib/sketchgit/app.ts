/**
 * app.ts – thin orchestrator for SketchGit.
 *
 * This file wires all modules together and exposes the same public API that
 * `createSketchGitApp()` previously returned from the monolithic file.
 * It is the only place that knows about all subsystems; every other module
 * is independently importable and testable.
 */

// ── Module imports ────────────────────────────────────────────────────────────
import { GitModel } from './git/gitModel';
import { CanvasEngine } from './canvas/canvasEngine';
import { WsClient } from './realtime/wsClient';
import { CollaborationManager } from './realtime/collaborationManager';
import { renderTimeline } from './ui/timelineRenderer';
import { showToast } from './ui/toast';
import { openModal, closeModal } from './ui/modals';
import { PendingMerge, BranchNames, MergeConflict, ConflictChoice } from './types';
import { BRANCH_COLORS } from './types';

// ─── Factory (same shape as the old monolithic createSketchGitApp) ────────────

export function createSketchGitApp() {

  // ── Instances ──────────────────────────────────────────────────────────────
  const git = new GitModel((msg) => showToast(msg, true));
  const ws = new WsClient();
  const collab = new CollaborationManager(ws, {
    getCanvasData: () => canvas.getCanvasData(),
    loadCanvasData: (data) => canvas.loadCanvasData(data),
    renderTimeline: () => doRenderTimeline(),
    updateUI: () => updateUI(),
    getGitState: () => ({
      commits: git.commits as Record<string, unknown>,
      branches: git.branches,
      HEAD: git.HEAD,
      detached: git.detached,
    }),
    applyGitState: (state) => {
      Object.assign(git.commits, state.commits);
      Object.assign(git.branches, state.branches);
      if (state.HEAD) git.HEAD = state.HEAD;
      git.detached = state.detached ?? null;
      const headSha = git.detached ?? git.branches[git.HEAD];
      const c = git.commits[headSha];
      if (c) canvas.loadCanvasData(c.canvas);
    },
    receiveCommit: (sha, commit) => {
      git.commits[sha] = commit as import('./types').Commit;
    },
  });

  const canvas = new CanvasEngine(
    () => collab.broadcastDraw(),
    (e) => collab.broadcastCursor(e),
  );

  // ── User identity ──────────────────────────────────────────────────────────
  let myName = 'User';
  let myColor = BRANCH_COLORS[Math.floor(Math.random() * BRANCH_COLORS.length)];

  // ── Commit popup state ────────────────────────────────────────────────────
  let popupSHA: string | null = null;

  // ── Pending merge state ───────────────────────────────────────────────────
  let pendingMerge: PendingMerge | null = null;

  // ── Branch-create target SHA ──────────────────────────────────────────────
  let branchFromSHA: string | null = null;
  let ctxMenuSHA: string | null = null;

  // ─── Timeline ─────────────────────────────────────────────────────────────

  function doRenderTimeline(): void {
    renderTimeline(
      git,
      (sha, x, y) => openCommitPopup(sha, x, y),
      (name) => {
        git.checkout(name);
        const c = git.commits[git.branches[name]];
        if (c) canvas.loadCanvasData(c.canvas);
        canvas.clearDirty();
        updateUI();
        doRenderTimeline();
        showToast(`Switched to '${name}'`);
      },
    );
  }

  function updateUI(): void {
    const nameEl = document.getElementById('currentBranchName');
    if (nameEl) {
      nameEl.textContent = git.detached
        ? '🔍 ' + git.detached.slice(0, 6)
        : git.HEAD;
    }
    const shaEl = document.getElementById('headSHA');
    if (shaEl) shaEl.textContent = (git.currentSHA() ?? '').slice(0, 7);
    const dotEl = document.getElementById('currentBranchDot');
    if (dotEl) dotEl.style.background = git.branchColor(git.HEAD);
  }

  // ─── Commit popup ──────────────────────────────────────────────────────────

  function openCommitPopup(sha: string, screenX: number, screenY: number): void {
    popupSHA = sha;
    const c = git.commits[sha];
    if (!c) return;

    const isHead = sha === git.currentSHA();
    const headBadge = document.getElementById('cp-head-badge');
    if (headBadge) headBadge.style.display = isHead ? 'inline-flex' : 'none';

    const shaEl = document.getElementById('cp-sha');
    if (shaEl) shaEl.textContent = sha.slice(0, 12) + '…';
    const msgEl = document.getElementById('cp-msg');
    if (msgEl) msgEl.textContent = c.message;
    const d = new Date(c.ts);
    const metaEl = document.getElementById('cp-meta');
    if (metaEl) {
      metaEl.textContent =
        `${c.branch} · ${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }

    const popup = document.getElementById('commit-popup');
    if (popup) {
      popup.classList.add('open');
      const pw = 230, ph = 180;
      let x = screenX - pw / 2;
      let y = screenY - ph - 14;
      x = Math.max(8, Math.min(x, window.innerWidth - pw - 8));
      if (y < 8) y = screenY + 18;
      popup.style.left = x + 'px';
      popup.style.top = y + 'px';
    }
  }

  function closeCommitPopup(): void {
    document.getElementById('commit-popup')?.classList.remove('open');
    popupSHA = null;
  }

  function cpCheckout(): void {
    if (!popupSHA) return;
    const sha = popupSHA;
    closeCommitPopup();
    if (sha === git.currentSHA()) { showToast('Already at this commit'); return; }
    git.checkoutCommit(sha);
    canvas.loadCanvasData(git.commits[sha].canvas);
    canvas.clearDirty();
    doRenderTimeline(); updateUI();
    showToast('⤵ Viewing commit ' + sha.slice(0, 7) + ' — detached HEAD');
  }

  function cpBranchFrom(): void {
    if (!popupSHA) return;
    ctxMenuSHA = popupSHA;
    closeCommitPopup();
    openBranchCreate();
  }

  function cpRollback(): void {
    if (!popupSHA) return;
    const sha = popupSHA;
    if (git.detached) { showToast('⚠ Not on a branch', true); closeCommitPopup(); return; }
    if (!confirm(`Rollback branch '${git.HEAD}' to ${sha.slice(0, 7)}? This cannot be undone.`)) return;
    closeCommitPopup();
    git.branches[git.HEAD] = sha;
    git.detached = null;
    canvas.loadCanvasData(git.commits[sha].canvas);
    canvas.clearDirty(); doRenderTimeline(); updateUI();
    showToast('Rolled back to ' + sha.slice(0, 7));
  }

  // ─── Commit modal ──────────────────────────────────────────────────────────

  function openCommitModal(): void {
    if (!canvas.isDirty) { showToast('Nothing new to commit'); return; }
    const msgEl = document.getElementById('commitMsg') as HTMLInputElement | null;
    if (msgEl) msgEl.value = '';
    openModal('commitModal');
    setTimeout(() => (document.getElementById('commitMsg') as HTMLInputElement | null)?.focus(), 100);
  }

  function doCommit(): void {
    const msgEl = document.getElementById('commitMsg') as HTMLInputElement | null;
    const msg = (msgEl?.value ?? '').trim() || 'Update drawing';
    const sha = git.commit(canvas.getCanvasData(), msg);
    if (!sha) return;
    closeModal('commitModal');
    canvas.clearDirty();
    doRenderTimeline();
    updateUI();
    showToast(`✓ Committed: ${msg}`);
    ws.send({ type: 'commit', sha, commit: git.commits[sha] });
  }

  // ─── Branch modal ──────────────────────────────────────────────────────────

  function openBranchModal(): void {
    const list = document.getElementById('branchListEl');
    if (!list) return;
    list.innerHTML = '';
    for (const [name, sha] of Object.entries(git.branches)) {
      const color = git.branchColor(name);
      const item = document.createElement('div');
      item.className = 'branch-item' + (name === git.HEAD ? ' active-branch' : '');
      item.innerHTML =
        `<div style="width:10px;height:10px;border-radius:50%;background:${color};flex-shrink:0"></div>` +
        `<span class="bname">${name}</span>` +
        `<span class="bsha">${sha ? sha.slice(0, 7) : ''}</span>`;
      item.addEventListener('click', () => {
        git.checkout(name);
        const c = git.commits[git.branches[name]];
        if (c) canvas.loadCanvasData(c.canvas);
        canvas.clearDirty(); closeModal('branchModal'); doRenderTimeline(); updateUI();
        showToast(`Switched to branch '${name}'`);
      });
      list.appendChild(item);
    }
    openModal('branchModal');
  }

  function openBranchCreate(): void {
    branchFromSHA = ctxMenuSHA ?? git.currentSHA();
    const c = branchFromSHA ? git.commits[branchFromSHA] : null;
    const infoEl = document.getElementById('branchFromInfo');
    if (infoEl) {
      infoEl.innerHTML =
        `<b>From:</b> ${branchFromSHA ? branchFromSHA.slice(0, 7) : '?'} — ${c ? c.message : ''}`;
    }
    const nameEl = document.getElementById('newBranchName') as HTMLInputElement | null;
    if (nameEl) nameEl.value = '';
    closeModal('branchModal');
    openModal('branchCreateModal');
    setTimeout(() => (document.getElementById('newBranchName') as HTMLInputElement | null)?.focus(), 100);
  }

  function doCreateBranch(): void {
    const nameEl = document.getElementById('newBranchName') as HTMLInputElement | null;
    const name = (nameEl?.value ?? '').trim().replace(/\s+/g, '-');
    if (!name) return;
    if (!git.createBranch(name, branchFromSHA)) return;
    git.checkout(name);
    closeModal('branchCreateModal');
    doRenderTimeline(); updateUI();
    showToast(`✓ Created & switched to '${name}'`);
    ctxMenuSHA = null;
  }

  // ─── Merge modal ───────────────────────────────────────────────────────────

  function openMergeModal(): void {
    if (git.detached) { showToast('⚠ Cannot merge in detached HEAD', true); return; }
    const targetEl = document.getElementById('mergeTargetName');
    if (targetEl) targetEl.textContent = git.HEAD;
    const sel = document.getElementById('mergeSourceSelect') as HTMLSelectElement | null;
    if (!sel) return;
    sel.innerHTML = '';
    for (const b of Object.keys(git.branches).filter((b) => b !== git.HEAD)) {
      const o = document.createElement('option');
      o.value = b; o.textContent = b;
      sel.appendChild(o);
    }
    if (!sel.options.length) { showToast('No other branches to merge', true); return; }
    openModal('mergeModal');
  }

  function doMerge(): void {
    const sel = document.getElementById('mergeSourceSelect') as HTMLSelectElement | null;
    const src = sel?.value ?? '';
    closeModal('mergeModal');

    const result = git.merge(src);
    if (!result) return;

    if ('done' in result) {
      canvas.loadCanvasData(git.commits[git.branches[git.HEAD]].canvas);
      canvas.clearDirty();
      doRenderTimeline(); updateUI();
      showToast(`✓ Merged '${src}' into '${git.HEAD}'`);
    } else if ('conflicts' in result) {
      const conflictResult = result.conflicts;
      const { conflicts, cleanObjects, oursData, branchNames } = conflictResult;
      openConflictModal(
        conflicts as MergeConflict[],
        cleanObjects as (Record<string, unknown> | null)[],
        oursData as string,
        branchNames as BranchNames,
      );
      showToast(`⚡ ${conflicts.length} conflict(s) — please resolve`, true);
    }
  }

  // ─── Conflict resolution UI ────────────────────────────────────────────────

  function formatPropValue(prop: string, val: unknown): string {
    if (val === undefined || val === null) return '<i style="opacity:.4">—</i>';
    const v = String(val);
    if (prop === 'stroke' || prop === 'fill') {
      const isColor = /^#[0-9a-fA-F]{3,8}$/.test(v) || v.startsWith('rgb');
      if (isColor && v !== 'transparent') {
        return `<span class="color-swatch" style="background:${v}"></span>${v}`;
      }
      return v || '<i style="opacity:.4">transparent</i>';
    }
    if (typeof val === 'number') return String(Math.round((val as number) * 100) / 100);
    if (prop === 'path' || prop === '_groupObjects') return '<i style="opacity:.5">[complex data]</i>';
    if (v.length > 40) return v.slice(0, 38) + '…';
    return v;
  }

  function getPropLabel(prop: string): string {
    const labels: Record<string, string> = {
      stroke: 'Stroke color', fill: 'Fill', strokeWidth: 'Stroke width',
      left: 'X position', top: 'Y position', width: 'Width', height: 'Height',
      scaleX: 'Scale X', scaleY: 'Scale Y', angle: 'Rotation',
      rx: 'Radius X', ry: 'Radius Y', x1: 'Start X', y1: 'Start Y',
      x2: 'End X', y2: 'End Y', path: 'Path', text: 'Text',
      fontSize: 'Font size', fontFamily: 'Font family', opacity: 'Opacity',
      flipX: 'Flip X', flipY: 'Flip Y',
    };
    return labels[prop] ?? prop;
  }

  function openConflictModal(
    conflicts: MergeConflict[],
    cleanObjects: (Record<string, unknown> | null)[],
    oursData: string,
    branchNames: BranchNames,
  ): void {
    pendingMerge = { conflicts, cleanObjects, oursData, branchNames, resolved: false };

    const list = document.getElementById('conflictList');
    if (!list) return;
    list.innerHTML = '';

    const totalConflicts = conflicts.reduce((s, c) => s + c.propConflicts.length, 0);
    const summaryEl = document.getElementById('conflictSummary');
    if (summaryEl) {
      summaryEl.textContent =
        `${conflicts.length} object(s) with ${totalConflicts} property conflict(s). ` +
        `Choose which version to keep for each property.`;
    }

    conflicts.forEach((conflict, ci) => {
      const objEl = document.createElement('div');
      objEl.className = 'conflict-obj';

      const header = document.createElement('div');
      header.className = 'conflict-obj-header';
      header.innerHTML =
        `<span>⊞</span><b>${conflict.label}</b>` +
        `<span style="margin-left:auto;color:var(--tx3)">${conflict.propConflicts.length} conflict(s)</span>`;
      objEl.appendChild(header);

      conflict.propConflicts.forEach((pc, pi) => {
        const propEl = document.createElement('div');
        propEl.className = 'conflict-prop';

        const nameSpan = document.createElement('span');
        nameSpan.className = 'prop-name';
        nameSpan.textContent = getPropLabel(pc.prop);
        propEl.appendChild(nameSpan);

        const oursBtn = createConflictOption('ours', `← Ours (${branchNames.ours})`, formatPropValue(pc.prop, pc.ours), pc.chosen === 'ours', ci, pi);
        const vsSpan = document.createElement('span');
        vsSpan.className = 'prop-vs'; vsSpan.textContent = 'vs';
        const theirsBtn = createConflictOption('theirs', `Theirs (${branchNames.theirs}) →`, formatPropValue(pc.prop, pc.theirs), pc.chosen === 'theirs', ci, pi);

        propEl.appendChild(oursBtn);
        propEl.appendChild(vsSpan);
        propEl.appendChild(theirsBtn);
        objEl.appendChild(propEl);
      });

      list.appendChild(objEl);
    });

    updateConflictStats();
    openModal('conflictModal');
  }

  function createConflictOption(
    choice: 'ours' | 'theirs',
    labelText: string,
    valHtml: string,
    selected: boolean,
    ci: number,
    pi: number,
  ): HTMLElement {
    const el = document.createElement('div');
    el.className = 'prop-option' + (selected ? ` selected-${choice}` : '');
    el.innerHTML =
      `<div class="opt-label" style="color:var(${choice === 'ours' ? '--a1' : '--a3'})">${labelText}</div>` +
      `<div class="opt-val">${valHtml}</div>`;
    el.addEventListener('click', () => selectConflictChoice(ci, pi, choice, el));
    return el;
  }

  function selectConflictChoice(
    ci: number,
    pi: number,
    choice: 'ours' | 'theirs',
    clickedEl: HTMLElement,
  ): void {
    if (!pendingMerge) return;
    pendingMerge.conflicts[ci].propConflicts[pi].chosen = choice;
    const propEl = clickedEl.closest('.conflict-prop');
    if (propEl) {
      propEl.querySelectorAll('.prop-option').forEach((el) => {
        el.classList.remove('selected-ours', 'selected-theirs');
      });
    }
    clickedEl.classList.add(choice === 'ours' ? 'selected-ours' : 'selected-theirs');
    updateConflictStats();
  }

  function resolveAllOurs(): void {
    if (!pendingMerge) return;
    pendingMerge.conflicts.forEach((c) => {
      c.propConflicts.forEach((pc) => { pc.chosen = 'ours'; });
    });
    document.querySelectorAll('.prop-option').forEach((el) => {
      const choice = (el as HTMLElement).dataset.choice;
      el.classList.remove('selected-ours', 'selected-theirs');
      if (choice === 'ours') el.classList.add('selected-ours');
    });
    rebuildConflictChoiceUI();
    updateConflictStats();
  }

  function resolveAllTheirs(): void {
    if (!pendingMerge) return;
    pendingMerge.conflicts.forEach((c) => {
      c.propConflicts.forEach((pc) => { pc.chosen = 'theirs'; });
    });
    rebuildConflictChoiceUI();
    updateConflictStats();
  }

  function rebuildConflictChoiceUI(): void {
    // Re-apply selected class to all prop-option elements after bulk resolve
    document.querySelectorAll('.conflict-prop').forEach((propEl) => {
      propEl.querySelectorAll('.prop-option').forEach((optEl) => {
        // The options carry their CI/PI via closure references in click listeners;
        // instead we walk the DOM and use the displayed label to infer choice.
        optEl.classList.remove('selected-ours', 'selected-theirs');
      });
    });
    // Re-render fully
    if (pendingMerge) {
      const { conflicts, cleanObjects, oursData, branchNames } = pendingMerge;
      openConflictModal(conflicts, cleanObjects, oursData, branchNames);
    }
  }

  function updateConflictStats(): void {
    if (!pendingMerge) return;
    let oursCount = 0, theirsCount = 0, total = 0;
    pendingMerge.conflicts.forEach((c) => {
      c.propConflicts.forEach((pc) => {
        total++;
        if (pc.chosen === 'ours') oursCount++;
        else theirsCount++;
      });
    });
    const statsEl = document.getElementById('conflictStats');
    if (statsEl) {
      statsEl.innerHTML =
        `<b>${oursCount}</b> ours · <b>${theirsCount}</b> theirs · <b>${total}</b> total`;
    }
  }

  function applyMergeResolution(): void {
    if (!pendingMerge) return;
    const { conflicts, cleanObjects, oursData, branchNames } = pendingMerge;
    const baseParsed = JSON.parse(oursData) as Record<string, unknown>;

    const finalObjects = [...cleanObjects];
    let conflictIdx = 0;
    finalObjects.forEach((obj, i) => {
      if (obj === null) {
        const conflict = conflicts[conflictIdx++];
        const merged = { ...conflict.oursObj };
        conflict.propConflicts.forEach((pc: ConflictChoice) => {
          merged[pc.prop] = pc.chosen === 'ours' ? pc.ours : pc.theirs;
        });
        finalObjects[i] = merged;
      }
    });

    baseParsed.objects = finalObjects.filter(Boolean);
    const mergedData = JSON.stringify(baseParsed);

    const { targetBranch, sourceBranch, targetSHA, sourceSHA } = branchNames;
    const sha = git.generateSha();
    git.commits[sha] = {
      sha, parent: targetSHA, parents: [targetSHA, sourceSHA],
      message: `Merge '${sourceBranch}' into '${targetBranch}' (${conflicts.length} conflict(s) resolved)`,
      ts: Date.now(), canvas: mergedData, branch: targetBranch, isMerge: true,
    };
    git.branches[targetBranch] = sha;

    canvas.loadCanvasData(mergedData);
    canvas.clearDirty();
    closeModal('conflictModal');
    pendingMerge = null;
    doRenderTimeline();
    updateUI();
    showToast(`✓ Merge complete — ${conflicts.length} conflict(s) resolved`);
  }

  // ─── Name modal ────────────────────────────────────────────────────────────

  function setName(): void {
    const n = (document.getElementById('nameInput') as HTMLInputElement | null)?.value.trim();
    if (!n) return;
    myName = n;
    if (ws.isConnected()) {
      ws.send({ type: 'profile', name: myName, color: myColor });
    }
    closeModal('nameModal');
  }

  // ─── Timeline scroll controls ──────────────────────────────────────────────

  function tlScrollLeft(): void {
    const el = document.getElementById('tlscroll');
    if (el) el.scrollLeft -= 200;
  }
  function tlScrollRight(): void {
    const el = document.getElementById('tlscroll');
    if (el) el.scrollLeft += 200;
  }

  // ─── Collaboration panel ───────────────────────────────────────────────────

  function connectToPeer(): void {
    collab.connectToPeerUI(myName, myColor);
  }

  function copyPeerId(): void {
    collab.copyPeerId();
  }

  function toggleCollabPanel(): void {
    collab.toggleCollabPanel();
  }

  // ─── Bootstrap ────────────────────────────────────────────────────────────

  function init(): void {
    canvas.init();
    const initData = JSON.stringify({ version: '5.3.1', objects: [], background: '#0a0a0f' });
    git.init(initData);
    doRenderTimeline();
    updateUI();

    // Connect to the room derived from the URL (or 'default')
    const initialRoom = collab.getRoomFromUrl();
    const inputEl = document.getElementById('remotePeerInput') as HTMLInputElement | null;
    if (inputEl) inputEl.value = initialRoom;
    const myPeerEl = document.getElementById('myPeerId');
    if (myPeerEl) myPeerEl.textContent = collab.roomInviteLink(initialRoom);
    ws.connect(initialRoom, myName, myColor);

    openModal('nameModal');
    setTimeout(() => (document.getElementById('nameInput') as HTMLInputElement | null)?.focus(), 200);

    // Close panel / popup on outside click
    document.addEventListener('click', (e) => {
      const panel = document.getElementById('collab-panel');
      const target = e.target as HTMLElement;
      if (
        panel?.classList.contains('open') &&
        !panel.contains(target) &&
        !target.closest('#topbar')
      ) {
        collab.toggleCollabPanel();
      }
      const popup = document.getElementById('commit-popup');
      if (popup?.classList.contains('open') && !popup.contains(target)) {
        closeCommitPopup();
      }
    });
  }

  init();

  // ─── Public API (same as old createSketchGitApp) ───────────────────────────

  return {
    setTool: (t: string) => canvas.setTool(t),
    updateStrokeColor: (v: string) => canvas.updateStrokeColor(v),
    updateFillColor: (v: string) => canvas.updateFillColor(v),
    toggleFill: () => canvas.toggleFill(),
    setStrokeWidth: (w: number) => canvas.setStrokeWidth(w),
    zoomIn: () => canvas.zoomIn(),
    zoomOut: () => canvas.zoomOut(),
    resetZoom: () => canvas.resetZoom(),
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
    tlScrollRight,
  };
}
