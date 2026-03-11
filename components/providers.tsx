"use client";

/**
 * SessionProvider wrapper.
 * Client components that call `useSession()` must be descendants of this
 * provider. Wrap the root layout with this component.
 *
 * P056: Accepts a `nonce` prop (forwarded from the per-request nonce generated
 * in proxy.ts) so that any inline scripts rendered by child components can
 * include the correct nonce attribute for the nonce-based CSP.
 */
import { SessionProvider } from "next-auth/react";
import type { ReactNode } from "react";

export function Providers({ children, nonce: _nonce }: { children: ReactNode; nonce?: string }) {
  return <SessionProvider>{children}</SessionProvider>;
}
