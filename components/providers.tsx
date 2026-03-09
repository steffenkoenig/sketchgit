"use client";

/**
 * SessionProvider wrapper.
 * Client components that call `useSession()` must be descendants of this
 * provider. Wrap the root layout with this component.
 */
import { SessionProvider } from "next-auth/react";
import type { ReactNode } from "react";

export function Providers({ children }: { children: ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
