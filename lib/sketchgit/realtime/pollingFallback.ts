/**
 * PollingFallback – REST-based read/write fallback when the WebSocket server
 * is unreachable (e.g. deployed on Vercel without a dedicated WS backend).
 *
 * When active it:
 *  - Polls `GET /api/rooms/[roomId]/commits?canvas=true` every POLL_INTERVAL_MS
 *    and dispatches synthetic WsMessage objects for commits not yet seen locally.
 *  - Provides `postCommit()` to persist new commits via REST instead of WS.
 *
 * The caller is responsible for starting/stopping this class in response to
 * WsClient status changes.  All WS-only features (live cursors, draw sync,
 * presenter mode) remain unavailable while polling is active.
 */

import { WsMessage } from '../types';
import { logger } from '../logger';

/** How often to check for new commits from peers (milliseconds). */
export const POLL_INTERVAL_MS = 5_000;

/** Commit shape returned by GET /api/rooms/[roomId]/commits?canvas=true */
export interface PolledCommit {
  sha: string;
  parent: string | null;
  parents: string[];
  branch: string;
  message: string;
  ts: number;
  canvas: string;
  isMerge: boolean;
}

export class PollingFallback {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private active = false;
  private knownShas = new Set<string>();

  /**
   * @param roomId    – room to poll (must match the WsClient roomId)
   * @param onMessage – callback to receive synthetic WsMessage objects
   */
  constructor(
    private readonly roomId: string,
    private readonly onMessage: (msg: WsMessage) => void,
  ) {}

  /**
   * Start polling.  Pass the set of commit SHAs already in the local git model
   * so the first poll does not re-dispatch commits the client already has.
   */
  start(initialShas: Set<string>): void {
    if (this.active) return;
    this.knownShas = new Set(initialShas);
    this.active = true;
    // Run an immediate poll so the UI is up-to-date right away.
    void this._poll();
    this.intervalId = setInterval(() => void this._poll(), POLL_INTERVAL_MS);
  }

  /** Stop polling. Safe to call multiple times. */
  stop(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.active = false;
  }

  isActive(): boolean {
    return this.active;
  }

  /**
   * Persist a commit to the database via REST.
   * Called by WsClient.send() when routing a commit message in polling mode.
   */
  async postCommit(sha: string, commit: unknown): Promise<void> {
    try {
      const res = await fetch(
        `/api/rooms/${encodeURIComponent(this.roomId)}/commits`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sha, commit }),
        },
      );
      if (!res.ok) {
        logger.warn(
          { status: res.status },
          '[PollingFallback] Failed to POST commit',
        );
      }
    } catch (err) {
      logger.warn(
        { error: err instanceof Error ? err.message : String(err) },
        '[PollingFallback] Network error posting commit',
      );
    }
  }

  // ─── Internal ──────────────────────────────────────────────────────────────

  private async _poll(): Promise<void> {
    if (!this.active) return;
    try {
      const res = await fetch(
        `/api/rooms/${encodeURIComponent(this.roomId)}/commits?take=50&canvas=true`,
      );
      if (!res.ok) {
        logger.warn(
          { status: res.status },
          '[PollingFallback] Failed to poll commits',
        );
        return;
      }
      const body = (await res.json()) as { commits: PolledCommit[] };
      for (const c of body.commits) {
        if (!this.knownShas.has(c.sha)) {
          this.knownShas.add(c.sha);
          this.onMessage({
            type: 'commit',
            sha: c.sha,
            commit: {
              parent: c.parent,
              parents: c.parents,
              branch: c.branch,
              message: c.message,
              ts: c.ts,
              canvas: c.canvas,
              isMerge: c.isMerge,
            },
          });
        }
      }
    } catch (err) {
      logger.warn(
        { error: err instanceof Error ? err.message : String(err) },
        '[PollingFallback] Error polling commits',
      );
    }
  }
}
