import "./globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Providers } from "@/components/providers";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { headers, cookies } from "next/headers";

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

  // P078 – read THEME cookie server-side to avoid a flash of the wrong theme.
  const cookieStore = await cookies();
  const themeCookie = cookieStore.get("THEME")?.value;
  const themeClass = themeCookie === "light" ? "theme-light" : "";

  // P078 – FOUC prevention: if no cookie is set yet, match prefers-color-scheme
  // on the client before React hydrates.  The nonce is required by P056 CSP.
  const foucScript = `(function(){if(!document.cookie.includes('THEME=')&&window.matchMedia('(prefers-color-scheme: light)').matches){document.documentElement.classList.add('theme-light');}})();`;

  return (
    <html lang={locale} className={themeClass}>
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: foucScript }} />
      </head>
      <body>
        <NextIntlClientProvider messages={messages} locale={locale}>
          <Providers nonce={nonce}>{children}</Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
