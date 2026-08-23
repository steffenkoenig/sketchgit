import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Security Policy — SketchGit",
  description: "Vulnerability disclosure policy for SketchGit.",
};

/**
 * GAP-011 — the Policy field in /.well-known/security.txt needs somewhere
 * real to point to. Content mirrors SECURITY.md (the repo's existing,
 * already-real disclosure policy) rather than introducing a second,
 * possibly-diverging source of truth.
 */
export default function SecurityPolicyPage() {
  return (
    <main
      style={{
        maxWidth: "640px",
        margin: "0 auto",
        padding: "48px 24px",
        lineHeight: 1.6,
        fontFamily: "'Fira Code', monospace",
      }}
    >
      <h1 style={{ fontSize: "22px", marginBottom: "8px" }}>Security Policy</h1>
      <p style={{ color: "var(--tx2)", marginBottom: "24px" }}>
        Vulnerability disclosure policy for SketchGit.
      </p>

      <h2 style={{ fontSize: "16px", marginTop: "24px", marginBottom: "8px" }}>Reporting a Vulnerability</h2>
      <p>
        Please do not create a public GitHub issue for security vulnerabilities. Instead, email{" "}
        <a href="mailto:sketchgit-security@skonig.de">sketchgit-security@skonig.de</a> with:
      </p>
      <ul style={{ marginLeft: "20px", marginTop: "8px" }}>
        <li>A description of the vulnerability.</li>
        <li>Steps to reproduce.</li>
        <li>Your assessment of the impact.</li>
      </ul>
      <p style={{ marginTop: "8px" }}>
        We will respond within 72 hours and aim to release a fix within 14 days for critical issues.
      </p>

      <h2 style={{ fontSize: "16px", marginTop: "24px", marginBottom: "8px" }}>Responsible Disclosure</h2>
      <p>We follow a 90-day coordinated disclosure policy. We will:</p>
      <ol style={{ marginLeft: "20px", marginTop: "8px" }}>
        <li>Acknowledge receipt of your report within 72 hours.</li>
        <li>Provide a status update within 7 days.</li>
        <li>Credit you in the release notes (if you consent).</li>
      </ol>

      <p style={{ marginTop: "24px", color: "var(--tx2)" }}>
        Thank you for helping keep SketchGit secure.
      </p>
    </main>
  );
}
