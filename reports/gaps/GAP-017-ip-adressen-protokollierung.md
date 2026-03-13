# GAP-017 – IP-Adressen-Protokollierung (IP Address Logging and Retention)

**Status:** ⚠️ Partial  
**Priority:** 🟠 High  
**Category:** DSGVO / DDG  
**Effort Estimate:** 2–4 hours  

---

## 1. Description

The application's custom WebSocket server (`server.ts`) captures and stores IP addresses in memory for per-IP connection limiting. Additionally, the Pino structured logger writes IP addresses to the server logs when connection limits are reached. Neither the retention period for in-memory IP counters nor the server log retention is documented or limited. Under DDG § 19 (formerly TMG § 15) and DSGVO Art. 5 Abs. 1 lit. e (storage limitation), usage data including IP addresses must be deleted as soon as it is no longer necessary.

---

## 2. Applicable Law

| Law / Regulation | Paragraph / Article | Requirement |
|---|---|---|
| DDG 2024 | § 19 Abs. 1 | Controller may collect usage data (Nutzungsdaten) only to the extent necessary |
| DDG 2024 | § 19 Abs. 2 | Nutzungsdaten must be deleted after the purpose is fulfilled |
| DSGVO 2016/679 | Art. 5 Abs. 1 lit. e | Storage limitation: data must not be retained longer than necessary |
| DSGVO 2016/679 | Art. 6 Abs. 1 lit. f | Legitimate interest (rate limiting/security) – requires proportionality |
| DSGVO 2016/679 | Art. 13 Abs. 2 lit. a | Retention periods for IP addresses must be disclosed in privacy policy |

> **DDG § 19** (Digitale-Dienste-Gesetz, in force since May 2024) replaced TMG § 15. The substantive rule is the same: usage data (Nutzungsdaten) – which includes IP addresses, access timestamps, and pages accessed – may be collected and processed only to the extent and for the duration necessary for enabling the service.

---

## 3. Current State

### 3.1 In-Memory IP Counter (WebSocket Rate Limiting)

**File:** `server.ts`, lines 201 and 871:

```typescript
const connectionsPerIp = new Map<string, number>();
// ...
const ip = (req.socket.remoteAddress ?? "unknown").replace(/^::ffff:/, "");
connectionsPerIp.set(ip, (connectionsPerIp.get(ip) ?? 0) + 1);
```

**Problem:** The `connectionsPerIp` Map accumulates IP → connection-count entries with **no expiry or cleanup**. Every IP that ever connects is retained in memory for the lifetime of the server process. There is no TTL, no cleanup interval, and no maximum size limit.

### 3.2 Proxy Layer IP Rate Limiting

**File:** `proxy.ts`, lines 143–146:

The proxy layer extracts IPs for rate limiting (Redis-backed or in-memory). The Redis rate-limiter uses 60-second sliding windows (TTL auto-expires). This is acceptable – Redis entries expire automatically.

### 3.3 Pino Logger Writes IPs to Logs

**File:** `server.ts`, line 875 (example):

```typescript
logger.warn({ ip }, "ws: connection limit reached for IP");
```

Pino writes structured JSON to stdout/stderr. If log aggregation is configured (e.g., Grafana Loki, CloudWatch, Papertrail), IP addresses are persisted in the log store. The retention period for these logs is not documented.

### 3.4 No Privacy Policy Disclosure

The current privacy policy draft (GAP-002) does not mention IP address logging, its purpose, or retention period.

---

## 4. What Needs to Be Done

### 4.1 Fix In-Memory IP Counter – Add Cleanup Interval

The `connectionsPerIp` Map should be periodically cleared or use a decrement-on-disconnect pattern:

**Option A: Decrement on disconnect (most accurate)**

```typescript
// In server.ts – increment on connect
connectionsPerIp.set(ip, (connectionsPerIp.get(ip) ?? 0) + 1);

// In ws.on('close') handler – decrement on disconnect
ws.on('close', () => {
  const count = (connectionsPerIp.get(ip) ?? 1) - 1;
  if (count <= 0) {
    connectionsPerIp.delete(ip);  // Remove entry completely
  } else {
    connectionsPerIp.set(ip, count);
  }
});
```

This ensures IPs are automatically removed once all connections from that IP are closed.

**Option B: Periodic full reset**

```typescript
// Reset every hour – simple but loses accurate counts transiently
setInterval(() => { connectionsPerIp.clear(); }, 60 * 60 * 1000);
```

Option A is preferred because it is accurate and has no retention at all for disconnected IPs.

### 4.2 Document Server Log Retention Policy

Decide on a **maximum retention period** for server logs and document it in:
1. The privacy policy (`/privacy` – see GAP-002)
2. The VVT (Verarbeitungsverzeichnis – GAP-008)

**Recommended retention periods for IP-containing logs:**

| Log Type | Recommended Retention | Rationale |
|---|---|---|
| Application error logs | 30 days | Sufficient for debugging; minimal PII |
| WebSocket connection logs (incl. IPs) | 7 days | Rate-limit analysis; short enough to minimize PII retention |
| Access logs (Nginx/reverse proxy) | 7–14 days | Standard practice; DSGVO-compliant |
| Security incident logs | 90 days | Incident response window |

Configure log rotation with these retention periods:
- If self-hosted: use `logrotate` on the server with `rotate 7` for daily logs
- If using a log aggregation service: set retention policy to 7 or 14 days in the service settings

### 4.3 Pseudonymise IP Addresses in Logs

Consider **truncating IP addresses** before logging to reduce PII exposure:

```typescript
// Helper function in server.ts
function pseudoIp(ip: string): string {
  // For IPv4: mask last octet (192.168.1.x → 192.168.1.0)
  const ipv4 = ip.match(/^(\d+\.\d+\.\d+\.)\d+$/);
  if (ipv4) return ipv4[1] + '0';
  // For IPv6: mask last 64 bits
  const parts = ip.split(':');
  if (parts.length > 4) return parts.slice(0, 4).join(':') + '::';
  return ip;
}

// Then in logging:
logger.warn({ ip: pseudoIp(ip) }, "ws: connection limit reached for IP");
```

Truncated IPs still identify the network but not the individual device, reducing the PII value of logs. This is recommended by several German DPA guidance documents.

**Important:** If pseudonymised IPs are used for rate limiting (the `connectionsPerIp` Map), the rate limiting must still be based on the **full IP** internally (only pseudonymise for logging). The in-memory Map should use the full IP for accuracy but should not be logged.

### 4.4 Update Privacy Policy

Add to the privacy policy (GAP-002), under a "Server Logs" or "Usage Data" section:

```
Serverprotokolle und IP-Adressen

Beim Besuch unserer Website und beim Verbindungsaufbau mit unserem Dienst 
erfasst der Server automatisch Verbindungsdaten, darunter Ihre IP-Adresse, 
den verwendeten Browser-Typ, die aufgerufene URL und den Zeitstempel.

Zweck: Betrieb und Sicherheit des Dienstes (z. B. Schutz vor Missbrauch 
und Brute-Force-Angriffen).

Rechtsgrundlage: Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse).

Speicherdauer: IP-Adressen in Serverprotokollen werden nach [7/14/30] Tagen 
automatisch gelöscht.

IP-Adressen für aktive Verbindungslimits werden nur für die Dauer der 
Websocket-Verbindung gespeichert und nach Verbindungstrennnung sofort gelöscht.
```

### 4.5 Add to VVT (GAP-008)

Add a new processing activity row to the Verarbeitungsverzeichnis:

| Field | Value |
|---|---|
| **Activity** | IP-Adressen-Protokollierung (Server Logs) |
| **Purpose** | Rate limiting, security, abuse prevention |
| **Legal basis** | Art. 6 Abs. 1 lit. f (legitimate interest) |
| **Data subjects** | All visitors (authenticated and anonymous) |
| **Data categories** | IP address, timestamp, connection type |
| **Retention** | [7/14] days (server logs); real-time only (in-memory rate limiter) |
| **Technical measures** | Pseudonymisation in logs; TTL on in-memory counters |

---

## 5. Verification

1. Review `connectionsPerIp` Map: confirm entries are deleted on WebSocket close.
2. Server logs: IP addresses are pseudonymised (last octet masked).
3. Log retention policy configured in server log rotation or aggregation service.
4. Privacy policy contains IP address logging disclosure with retention period.
