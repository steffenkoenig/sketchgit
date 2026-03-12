/**
 * P050 – next-intl configuration.
 *
 * Resolves locale from (in priority order):
 *  1. NEXT_LOCALE cookie (set by the locale switcher in AppTopbar)
 *  2. Accept-Language request header
 *  3. Default: "en"
 *
 * Supported locales: en (default), de
 */
import { getRequestConfig } from 'next-intl/server';
import { cookies, headers } from 'next/headers';

const SUPPORTED_LOCALES = ['en', 'de'] as const;
type Locale = typeof SUPPORTED_LOCALES[number];

function resolveLocale(raw: string): Locale {
  const code = raw.split('-')[0]?.toLowerCase() ?? 'en';
  return SUPPORTED_LOCALES.includes(code as Locale) ? (code as Locale) : 'en';
}

export default getRequestConfig(async () => {
  // 1. Cookie takes priority (set by the locale switcher button)
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get('NEXT_LOCALE')?.value;
  const locale: Locale = cookieLocale
    ? resolveLocale(cookieLocale)
    : resolveLocale((await headers()).get('accept-language') ?? 'en');

  const messages = (await import(`./messages/${locale}.json`)) as { default: Record<string, unknown> };
  return { locale, messages: messages.default };
});
