export function parseAllowedOrigins(rawOrigins: string | undefined, defaultOrigin: string): Set<string> {
  const raw = rawOrigins?.trim() || defaultOrigin;
  return new Set(
    raw
      .split(",")
      .map((o) => {
        const trimmed = o.trim();
        try {
          return new URL(trimmed).origin;
        } catch {
          return trimmed;
        }
      })
      .filter(Boolean),
  );
}
