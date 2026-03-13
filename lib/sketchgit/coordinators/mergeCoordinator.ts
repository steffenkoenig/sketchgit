/**
 * MergeCoordinator – owns the merge-modal and conflict-resolution UI workflow.
 *
 * This is the most complex coordinator because a merge can result in either:
 *  a) A clean fast-forward/automatic merge → update canvas + timeline.
 *  b) A conflict set → open the conflict-resolution modal, let the user
 *     choose per-property values, then apply and finalize the merge commit.
 *
 * All conflict state is encapsulated here; nothing leaks to other coordinators.
 */

import { AppContext } from './appContext';
import { PendingMerge, BranchNames, MergeConflict, ConflictChoice } from '../types';
import { showToast } from '../ui/toast';
import { openModal, closeModal } from '../ui/modals';

export class MergeCoordinator {
  /** Accumulated conflict state while the conflict-resolution modal is open. */
  private pendingMerge: PendingMerge | null = null;

  /**
   * @param ctx     – shared subsystem references
   * @param refresh – re-renders timeline + updates UI (provided by app.ts wiring)
   */
  constructor(
    private readonly ctx: AppContext,
    private readonly refresh: () => void,
  ) {}

  // ─── Merge modal ───────────────────────────────────────────────────────────

  openMergeModal(): void {
    const { git } = this.ctx;
    if (git.detached) { showToast('⚠ Cannot merge in detached HEAD', true); return; }
    const targetEl = document.getElementById('mergeTargetName');
    if (targetEl) targetEl.textContent = git.HEAD;
    const sel = document.getElementById('mergeSourceSelect') as HTMLSelectElement | null;
    if (!sel) return;
    sel.replaceChildren();
    for (const b of Object.keys(git.branches).filter((b) => b !== git.HEAD)) {
      const o = document.createElement('option');
      o.value = b; o.textContent = b;
      sel.appendChild(o);
    }
    if (!sel.options.length) { showToast('No other branches to merge', true); return; }
    openModal('mergeModal');
  }

  doMerge(): void {
    const { git, canvas, collab } = this.ctx;
    const sel = document.getElementById('mergeSourceSelect') as HTMLSelectElement | null;
    const src = sel?.value ?? '';
    closeModal('mergeModal');

    const result = git.merge(src);
    if (!result) return;

    if ('done' in result) {
      canvas.loadCanvasData(git.commits[git.branches[git.HEAD]].canvas);
      canvas.clearDirty();
      this.refresh();
      showToast(`✓ Merged '${src}' into '${git.HEAD}'`);
      // P052 – Broadcast the merge commit to peers and persist to DB
      collab.sendCommit(result.sha, git.commits[result.sha]);
    } else if ('conflicts' in result) {
      const conflictResult = result.conflicts;
      const { conflicts, cleanObjects, oursData, branchNames } = conflictResult;
      this._openConflictModal(
        conflicts as MergeConflict[],
        cleanObjects as (Record<string, unknown> | null)[],
        oursData as string,
        branchNames as BranchNames,
      );
      showToast(`⚡ ${conflicts.length} conflict(s) — please resolve`, true);
    }
  }

  // ─── Conflict resolution ───────────────────────────────────────────────────

  resolveAllOurs(): void {
    if (!this.pendingMerge) return;
    this.pendingMerge.conflicts.forEach((c) => {
      c.propConflicts.forEach((pc) => { pc.chosen = 'ours'; });
    });
    this._rebuildConflictChoiceUI();
    this._updateConflictStats();
  }

  resolveAllTheirs(): void {
    if (!this.pendingMerge) return;
    this.pendingMerge.conflicts.forEach((c) => {
      c.propConflicts.forEach((pc) => { pc.chosen = 'theirs'; });
    });
    this._rebuildConflictChoiceUI();
    this._updateConflictStats();
  }

  applyMergeResolution(): void {
    if (!this.pendingMerge) return;
    const { git, canvas, collab } = this.ctx;
    const { conflicts, cleanObjects, oursData, branchNames } = this.pendingMerge;
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
    this.pendingMerge = null;
    this.refresh();
    showToast(`✓ Merge complete — ${conflicts.length} conflict(s) resolved`);
    // P052 – Broadcast the conflict-resolved merge commit to peers and persist to DB
    collab.sendCommit(sha, git.commits[sha]);
  }

  // ─── Private conflict UI helpers ───────────────────────────────────────────

  private _openConflictModal(
    conflicts: MergeConflict[],
    cleanObjects: (Record<string, unknown> | null)[],
    oursData: string,
    branchNames: BranchNames,
  ): void {
    this.pendingMerge = { conflicts, cleanObjects, oursData, branchNames, resolved: false };

    const list = document.getElementById('conflictList');
    if (!list) return;
    list.replaceChildren();

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
      const iconSpan = document.createElement('span');
      iconSpan.textContent = '⊞';
      const labelBold = document.createElement('b');
      labelBold.textContent = conflict.label;
      const countSpan = document.createElement('span');
      countSpan.style.marginLeft = 'auto';
      countSpan.style.color = 'var(--tx3)';
      countSpan.textContent = `${conflict.propConflicts.length} conflict(s)`;
      header.appendChild(iconSpan);
      header.appendChild(labelBold);
      header.appendChild(countSpan);
      objEl.appendChild(header);

      conflict.propConflicts.forEach((pc, pi) => {
        const propEl = document.createElement('div');
        propEl.className = 'conflict-prop';

        const nameSpan = document.createElement('span');
        nameSpan.className = 'prop-name';
        nameSpan.textContent = this._getPropLabel(pc.prop);
        propEl.appendChild(nameSpan);

        const oursBtn = this._createConflictOption('ours', `← Ours (${branchNames.ours})`, pc.prop, pc.ours, pc.chosen === 'ours', ci, pi);
        const vsSpan = document.createElement('span');
        vsSpan.className = 'prop-vs'; vsSpan.textContent = 'vs';
        const theirsBtn = this._createConflictOption('theirs', `Theirs (${branchNames.theirs}) →`, pc.prop, pc.theirs, pc.chosen === 'theirs', ci, pi);

        propEl.appendChild(oursBtn);
        propEl.appendChild(vsSpan);
        propEl.appendChild(theirsBtn);
        objEl.appendChild(propEl);
      });

      list.appendChild(objEl);
    });

    this._updateConflictStats();
    openModal('conflictModal');
  }

  private _createConflictOption(
    choice: 'ours' | 'theirs',
    labelText: string,
    propName: string,
    val: unknown,
    selected: boolean,
    ci: number,
    pi: number,
  ): HTMLElement {
    const el = document.createElement('div');
    el.className = 'prop-option' + (selected ? ` selected-${choice}` : '');

    const labelDiv = document.createElement('div');
    labelDiv.className = 'opt-label';
    labelDiv.style.color = `var(${choice === 'ours' ? '--a1' : '--a3'})`;
    labelDiv.textContent = labelText;

    const valDiv = document.createElement('div');
    valDiv.className = 'opt-val';
    valDiv.appendChild(this._createPropValueElement(propName, val));

    el.appendChild(labelDiv);
    el.appendChild(valDiv);
    el.addEventListener('click', () => this._selectConflictChoice(ci, pi, choice, el));
    return el;
  }

  private _selectConflictChoice(
    ci: number,
    pi: number,
    choice: 'ours' | 'theirs',
    clickedEl: HTMLElement,
  ): void {
    if (!this.pendingMerge) return;
    this.pendingMerge.conflicts[ci].propConflicts[pi].chosen = choice;
    const propEl = clickedEl.closest('.conflict-prop');
    if (propEl) {
      propEl.querySelectorAll('.prop-option').forEach((el) => {
        el.classList.remove('selected-ours', 'selected-theirs');
      });
    }
    clickedEl.classList.add(choice === 'ours' ? 'selected-ours' : 'selected-theirs');
    this._updateConflictStats();
  }

  private _rebuildConflictChoiceUI(): void {
    document.querySelectorAll('.conflict-prop').forEach((propEl) => {
      propEl.querySelectorAll('.prop-option').forEach((optEl) => {
        optEl.classList.remove('selected-ours', 'selected-theirs');
      });
    });
    if (this.pendingMerge) {
      const { conflicts, cleanObjects, oursData, branchNames } = this.pendingMerge;
      this._openConflictModal(conflicts, cleanObjects, oursData, branchNames);
    }
  }

  private _updateConflictStats(): void {
    if (!this.pendingMerge) return;
    let oursCount = 0, theirsCount = 0, total = 0;
    this.pendingMerge.conflicts.forEach((c) => {
      c.propConflicts.forEach((pc) => {
        total++;
        if (pc.chosen === 'ours') oursCount++;
        else theirsCount++;
      });
    });
    const statsEl = document.getElementById('conflictStats');
    if (statsEl) {
      statsEl.replaceChildren();
      const b1 = document.createElement('b'); b1.textContent = String(oursCount);
      const b2 = document.createElement('b'); b2.textContent = String(theirsCount);
      const b3 = document.createElement('b'); b3.textContent = String(total);
      statsEl.append(b1, ' ours · ', b2, ' theirs · ', b3, ' total');
    }
  }

  /** Build a DOM element representing a property value (safe – no innerHTML). */
  private _createPropValueElement(prop: string, val: unknown): HTMLElement {
    const container = document.createElement('span');
    if (val === undefined || val === null) {
      const i = document.createElement('i');
      i.style.opacity = '0.4';
      i.textContent = '—';
      container.appendChild(i);
      return container;
    }
    const v = String(val);
    if (prop === 'stroke' || prop === 'fill') {
      const isColor = /^#[0-9a-fA-F]{3,8}$/.test(v) || v.startsWith('rgb');
      if (isColor && v !== 'transparent') {
        const swatch = document.createElement('span');
        swatch.className = 'color-swatch';
        swatch.style.background = v;
        container.appendChild(swatch);
        container.appendChild(document.createTextNode(v));
        return container;
      }
      if (!v) {
        const i = document.createElement('i');
        i.style.opacity = '0.4';
        i.textContent = 'transparent';
        container.appendChild(i);
        return container;
      }
      container.textContent = v;
      return container;
    }
    if (typeof val === 'number') {
      container.textContent = String(Math.round((val as number) * 100) / 100);
      return container;
    }
    if (prop === 'path' || prop === '_groupObjects') {
      const i = document.createElement('i');
      i.style.opacity = '0.5';
      i.textContent = '[complex data]';
      container.appendChild(i);
      return container;
    }
    container.textContent = v.length > 40 ? v.slice(0, 38) + '…' : v;
    return container;
  }

  private _getPropLabel(prop: string): string {
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
}
