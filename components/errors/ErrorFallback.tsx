import React from "react";
import { useTranslations } from "next-intl";

type ErrorFallbackProps = {
  error: Error;
  resetError: () => void;
  titleKey: "errors.renderError" | "errors.canvasError" | "errors.timelineError" | "errors.modalError";
  inline?: boolean;
};

export function ErrorFallback({ error, resetError, titleKey, inline }: ErrorFallbackProps) {
  const t = useTranslations();

  if (inline) {
    return (
      <div
        role="alert"
        aria-live="assertive"
        className="flex h-full w-full items-center justify-center bg-zinc-100 p-4 text-center dark:bg-zinc-900"
      >
        <button
          onClick={resetError}
          className="rounded border border-red-300 bg-red-50 px-4 py-2 text-red-800 hover:bg-red-100 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
        >
          {t(titleKey)}
        </button>
      </div>
    );
  }

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="flex min-h-screen flex-col items-center justify-center p-8 text-center"
    >
      <div className="mb-4 rounded-full bg-red-100 p-3 text-red-600 dark:bg-red-900/30 dark:text-red-400">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
      </div>
      <h1 className="mb-2 text-xl font-bold">{t(titleKey)}</h1>
      <p className="mb-6 text-zinc-600 dark:text-zinc-400">
        {t("errors.errorLogged")}
      </p>
      {/* eslint-disable-next-line no-undef */}
      {process.env.NODE_ENV === "development" && error && (
        <pre className="mb-6 max-w-md overflow-auto rounded bg-zinc-100 p-4 text-left text-xs text-red-600 dark:bg-zinc-800">
          {error.message}
        </pre>
      )}
      <button
        onClick={resetError}
        className="rounded bg-black px-6 py-2 font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
      >
        {t("errors.retry")}
      </button>
    </div>
  );
}
