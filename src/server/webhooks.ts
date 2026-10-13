/**
 * Outbound callbacks for the price-search hook. Bodies are HMAC-SHA256 signed with the
 * workspace's webhook secret; targets must be public https hosts (no SSRF into the
 * container network or cloud metadata).
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { env } from "./env";

export function signBody(secret: string, body: string): string {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

export function verifySignature(secret: string, body: string, header: string | null): boolean {
  if (!header) return false;
  const expected = Buffer.from(signBody(secret, body));
  const got = Buffer.from(header);
  return expected.length === got.length && timingSafeEqual(expected, got);
}

/** Loopback, private, link-local, CGNAT, multicast, reserved — anything not on the public internet. */
export function isPrivateAddress(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split(".").map(Number) as [number, number];
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  if (v === 6) {
    const x = ip.toLowerCase();
    if (x === "::" || x === "::1") return true;
    if (x.startsWith("::ffff:")) return isPrivateAddress(x.slice(7));
    return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(x);
  }
  return true;
}

export class UnsafeCallbackError extends Error {}

/** Shape check at request time (no network). */
export function checkCallbackUrlShape(raw: string): URL {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new UnsafeCallbackError("callbackUrl isn't a valid URL.");
  }
  if (u.username || u.password) throw new UnsafeCallbackError("callbackUrl can't contain credentials.");
  if (env.allowInsecureCallbacks) return u;
  if (u.protocol !== "https:") throw new UnsafeCallbackError("callbackUrl must use https.");
  if (u.hostname === "localhost" || u.hostname.endsWith(".localhost") || u.hostname.endsWith(".internal")) {
    throw new UnsafeCallbackError("callbackUrl must be a public host.");
  }
  if (isIP(u.hostname) && isPrivateAddress(u.hostname)) throw new UnsafeCallbackError("callbackUrl must be a public host.");
  return u;
}

/** Full check right before delivery: every resolved address must be public. */
export async function assertDeliverable(raw: string): Promise<URL> {
  const u = checkCallbackUrlShape(raw);
  if (env.allowInsecureCallbacks) return u;
  const addrs = isIP(u.hostname) ? [{ address: u.hostname }] : await lookup(u.hostname, { all: true });
  if (addrs.length === 0 || addrs.some((a) => isPrivateAddress(a.address))) throw new UnsafeCallbackError("callbackUrl resolves to a private address.");
  return u;
}

export async function deliverWebhook(args: { url: string; secret: string; event: string; payload: unknown; attempts?: number }): Promise<{ delivered: boolean; attempts: number; error?: string }> {
  const body = JSON.stringify(args.payload);
  const maxAttempts = args.attempts ?? 3;
  let lastError = "";
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const url = await assertDeliverable(args.url);
      const res = await fetch(url, {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(10_000),
        headers: {
          "content-type": "application/json",
          "user-agent": "ChefDonns-Webhook/1",
          "x-chefdonn-event": args.event,
          "x-chefdonn-signature": signBody(args.secret, body),
        },
        body,
      });
      if (res.ok) return { delivered: true, attempts: attempt };
      lastError = `HTTP ${res.status}`;
      if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) break;
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      if (e instanceof UnsafeCallbackError) break;
    }
    if (attempt < maxAttempts) await new Promise((r) => setTimeout(r, 1000 * 4 ** (attempt - 1)));
  }
  return { delivered: false, attempts: maxAttempts, error: lastError };
}
