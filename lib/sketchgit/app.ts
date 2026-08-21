import { GitModel } from './git/gitModel';
import { CanvasEngine } from './canvas/canvasEngine';
import { WsClient } from './realtime/wsClient';
import { showToast } from './ui/toast';
import { AppContext } from './coordinators/appContext';
import { loadPreferences } from './userPreferences';
import { TimelineCoordinator } from './coordinators/timelineCoordinator';
import { createPublicAPI } from './appAPI';
import { setupCollaborationManager } from './appCollaboration';
import { setupCoordinators } from './appCoordinators';
import { tlScrollLeft, tlScrollRight } from './appScroll';

export function createSketchGitApp() {
  const startupPrefs = loadPreferences();
  const git = new GitModel((msg) => showToast(msg, true));
  const ws = new WsClient();

  let canvas: CanvasEngine;
  let tl: TimelineCoordinator;

  const collab = setupCollaborationManager(
    ws,
    git,
    startupPrefs,
    () => canvas,
    () => tl
  );

  canvas = new CanvasEngine(
    (immediate) => collab.broadcastDraw(immediate),
    (e) => collab.broadcastCursor(e),
    (objectIds) => collab.broadcastLock(objectIds),
    () => collab.broadcastUnlock(),
  );

  const ctx: AppContext = { git, canvas, collab, ws };
  const coords = setupCoordinators(ctx);
  tl = coords.tl;

  coords.collaboration.init();
  coords.tl.initScrollListener();

  return createPublicAPI(
    canvas,
    coords.collaboration,
    coords.commit,
    coords.branch,
    coords.merge,
    collab,
    ws,
    coords.tl,
    coords.outsideClickHandler,
    tlScrollLeft,
    tlScrollRight
  );
}
