import "./globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Providers } from "@/components/providers";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { headers } from "next/headers";

export const metadata: Metadata = {
  title: "SketchGit",
  description: "Collaborative visual git playground"
};

type RootLayoutProps = {
  children: ReactNode;
};

export default async function RootLayout({ children }: RootLayoutProps) {
  // P050 – resolve locale and messages server-side; pass to the client provider.
  const locale = await getLocale();
  const messages = await getMessages();

  // P056 – read the per-request nonce injected by proxy.ts so Next.js can
  // apply it to hydration scripts and other auto-injected inline scripts.
  const nonce = (await headers()).get("x-nonce") ?? "";

  return (
    <html lang={locale}>
      <body>
        <NextIntlClientProvider messages={messages} locale={locale}>
          <Providers nonce={nonce}>{children}</Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
