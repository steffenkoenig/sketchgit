/**
 * AppContext – the shared dependency bag passed to every coordinator.
 *
 * Coordinators receive an AppContext instead of individual constructor
 * parameters so that adding a new subsystem does not require changing every
 * coordinator's constructor signature.
 *
 * All fields are the *live* subsystem instances created by `createSketchGitApp`.
 * Coordinators should treat them as read-only references (they own the
 * subsystem lifetime; coordinators do not destroy them).
 */

import { GitModel } from '../git/gitModel';
import { CanvasEngine } from '../canvas/canvasEngine';
import { WsClient } from '../realtime/wsClient';
import { CollaborationManager } from '../realtime/collaborationManager';

export interface AppContext {
  git: GitModel;
  canvas: CanvasEngine;
  collab: CollaborationManager;
  ws: WsClient;
}
