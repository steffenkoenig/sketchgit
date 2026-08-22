/**
 * OpenTelemetry shutdown handle (P061).
 *
 * The SDK itself is started by lib/otelRegister.mjs, loaded via `--import`
 * before tsx's loader (see that file for why). server.ts imports this module
 * normally and calls shutdownTelemetry() from its graceful-shutdown handler,
 * after the drain window completes, so the final span/metric batch flushes
 * before the process exits.
 */
import type { NodeSDK } from "@opentelemetry/sdk-node";

declare global {
  var __sketchgitOtelSdk: NodeSDK | undefined;
}

export async function shutdownTelemetry(): Promise<void> {
  await globalThis.__sketchgitOtelSdk?.shutdown();
}
