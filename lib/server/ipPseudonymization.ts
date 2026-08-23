/**
 * ipPseudonymization – GAP-017 §4.3. Masks the low-order bits of an IP
 * address before it's written to server logs, so a log line can still show
 * "this network had a connection-limit event" without persisting an
 * individually-identifying address (recommended by several German DPA
 * guidance documents for DDG §19 / DSGVO Art. 5(1)(e) storage-minimisation).
 *
 * Only for logging: the full, unmasked IP must still be used for the actual
 * per-IP connection-limiting logic (the `connectionsPerIp` Map) — masking it
 * there would let every /24 (IPv4) or /64 (IPv6) network share one counter,
 * breaking the feature the report itself flags as the reason IPs are
 * collected in the first place.
 */

/** Masks the last IPv4 octet (192.168.1.42 → 192.168.1.0) or the low 64 bits of an IPv6 address. */
export function pseudonymizeIp(ip: string): string {
  const ipv4 = ip.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3}\.)\d{1,3}$/);
  if (ipv4) return `${ipv4[1]}0`;

  if (ip.includes(":")) {
    const parts = ip.split(":");
    if (parts.length > 4) return `${parts.slice(0, 4).join(":")}::`;
  }

  return ip;
}
