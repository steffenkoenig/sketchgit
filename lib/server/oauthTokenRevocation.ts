/**
 * oauthTokenRevocation – GAP-014 §4.4. Explicitly revokes a user's GitHub
 * OAuth token with GitHub when their account is deleted, rather than
 * leaving it "orphaned" (still valid until natural expiry — up to 6 months
 * for a refresh token) once the local Account row is gone.
 *
 * https://docs.github.com/en/apps/oauth-apps/maintaining-oauth-apps/deleting-an-oauth-app-access-token-grant
 */

/**
 * Best-effort: never throws. Account deletion must succeed regardless of
 * whether GitHub's revoke endpoint is reachable — a failed revocation just
 * means the token is only good for the remainder of its natural TTL rather
 * than being invalidated immediately, not a reason to block deletion.
 * No-ops (not an error) when GitHub OAuth isn't configured for this
 * deployment, since a token that was never issued via this app's client
 * credentials can't be revoked with them anyway.
 */
export async function revokeGitHubToken(accessToken: string): Promise<void> {
  const clientId = process.env.GITHUB_ID;
  const clientSecret = process.env.GITHUB_SECRET;
  if (!clientId || !clientSecret) return;

  try {
    const res = await fetch(`https://api.github.com/applications/${clientId}/token`, {
      method: "DELETE",
      headers: {
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ access_token: accessToken }),
    });
    // 204 = revoked. 404 = GitHub already considers it invalid/unknown —
    // both are the desired end state, so only genuinely unexpected
    // responses are logged.
    if (!res.ok && res.status !== 404) {
      console.warn(`[oauthTokenRevocation] GitHub revoke returned ${res.status}`);
    }
  } catch (err) {
    console.warn("[oauthTokenRevocation] GitHub revoke request failed", err);
  }
}
