import "./globals.css";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Providers } from "@/components/providers";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { headers, cookies } from "next/headers";

export const metadata: Metadata = {
  title: "SketchGit",
  description: "Collaborative visual git playground"
};

/** P085 – Mobile viewport: ensures the page renders at device width instead
 *  of the browser's default 980px virtual viewport, which would make all UI
 *  elements appear tiny on phones.  interactive-widget=resizes-content prevents
 *  the virtual keyboard from hiding the canvas on iOS/Android. */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  interactiveWidget: "resizes-content",
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
    <html lang={locale} className={`${themeClass}`}>
      <head>
        {/*
          dangerouslySetInnerHTML is safe here: foucScript is a static,
          hardcoded string defined two lines above — no user input is ever
          interpolated into it, so there is no XSS vector. A prior "security"
          change replaced this with `<script>{foucScript}</script>` (JSX text
          children) to avoid dangerouslySetInnerHTML on principle, but that
          swapped a non-issue for a real bug: browsers parse <script> content
          as raw/unescaped, while React's hydration for a <script> tag with a
          plain string child expects standard HTML-entity-escaped text —
          the mismatch triggers React error #418 (hydration failed) on every
          page load, which aborts hydration for the whole tree and breaks
          client-side interactivity site-wide (confirmed via a live app: the
          WS connection, sign-in redirect, and canvas app all failed until
          this was reverted). dangerouslySetInnerHTML is the correct,
          Next.js-recommended pattern for injecting a static blocking script.
        */}
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
