// Who is asking for a new lobby, for the per-visitor creation limit.
//
// The server is never reached directly: Caddy (the client container) proxies
// /colyseus/* to it, and in production Coolify's Traefik and Cloudflare sit in
// front of Caddy. A proxy that trusts the hop before it appends that hop's
// address to X-Forwarded-For, so only the right end of the header was written
// by proxies we know. Anything further left came with the request and can say
// anything.
//
// So the header is read from the right: our own hops (private addresses: the
// Docker networks Caddy and Traefik live on) are skipped, then Cloudflare's
// edges; the first address left is the visitor. When the chain ends at a
// Cloudflare edge (Traefik replaced the header with its own peer), the visitor
// is CF-Connecting-IP, which Cloudflare always sets itself. It is read only
// then, never when the request did not come through Cloudflare.

import { BlockList, isIP } from "node:net";

/** Our own proxies: loopback, private, shared and link-local ranges (Docker networks). */
const OWN_HOPS = new BlockList();
OWN_HOPS.addSubnet("10.0.0.0", 8, "ipv4");
OWN_HOPS.addSubnet("172.16.0.0", 12, "ipv4");
OWN_HOPS.addSubnet("192.168.0.0", 16, "ipv4");
OWN_HOPS.addSubnet("127.0.0.0", 8, "ipv4");
OWN_HOPS.addSubnet("169.254.0.0", 16, "ipv4");
OWN_HOPS.addSubnet("100.64.0.0", 10, "ipv4");
OWN_HOPS.addSubnet("::1", 128, "ipv6");
OWN_HOPS.addSubnet("fc00::", 7, "ipv6");
OWN_HOPS.addSubnet("fe80::", 10, "ipv6");

/** Cloudflare's edge ranges, from https://www.cloudflare.com/ips/. */
const CLOUDFLARE_RANGES = [
  "173.245.48.0/20",
  "103.21.244.0/22",
  "103.22.200.0/22",
  "103.31.4.0/22",
  "141.101.64.0/18",
  "108.162.192.0/18",
  "190.93.240.0/20",
  "188.114.96.0/20",
  "197.234.240.0/22",
  "198.41.128.0/17",
  "162.158.0.0/15",
  "104.16.0.0/13",
  "104.24.0.0/14",
  "172.64.0.0/13",
  "131.0.72.0/22",
  "2400:cb00::/32",
  "2606:4700::/32",
  "2803:f800::/32",
  "2405:b500::/32",
  "2405:8100::/32",
  "2a06:98c0::/29",
  "2c0f:f248::/32",
];
const CLOUDFLARE = new BlockList();
for (const cidr of CLOUDFLARE_RANGES) {
  const [net = "", bits = ""] = cidr.split("/");
  CLOUDFLARE.addSubnet(net, Number(bits), isIP(net) === 6 ? "ipv6" : "ipv4");
}

/** The key shared by every request we can't tell apart (a local run without proxies). */
export const UNKNOWN_VISITOR = "local";

/** A bare address from a header entry: no brackets or port, IPv4-mapped IPv6 unwrapped. Null if it isn't one. */
export function cleanAddress(raw: string | undefined | null): string | null {
  if (!raw) return null;
  let a = raw.trim();
  if (a.startsWith("[")) {
    const end = a.indexOf("]");
    a = end > 0 ? a.slice(1, end) : a.slice(1);
  } else if (/^\d+\.\d+\.\d+\.\d+:\d+$/.test(a)) a = a.slice(0, a.lastIndexOf(":"));
  if (/^::ffff:\d+\.\d+\.\d+\.\d+$/i.test(a)) a = a.slice(7);
  return isIP(a) ? a.toLowerCase() : null;
}

const familyOf = (address: string) => (isIP(address) === 6 ? "ipv6" : "ipv4");
const isOwnHop = (a: string) => OWN_HOPS.check(a, familyOf(a));
const isCloudflare = (a: string) => CLOUDFLARE.check(a, familyOf(a));

/** The first 4 groups of an IPv6 address: one home or phone line usually gets a whole /64. */
function ipv6Prefix64(address: string): string {
  const [head = "", tail] = address.split("::");
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  const groups =
    tail === undefined ? left : [...left, ...Array<string>(Math.max(0, 8 - left.length - right.length)).fill("0"), ...right];
  return `${groups
    .slice(0, 4)
    .map((g) => g.replace(/^0+(?=.)/, ""))
    .join(":")}::/64`;
}

/** The limit key for an address: the address itself for IPv4, its /64 for IPv6. */
export function addressKey(address: string): string {
  return familyOf(address) === "ipv6" ? ipv6Prefix64(address) : address;
}

/** Request headers, as a Headers object or a plain record. */
export type HeaderSource = Headers | Record<string, string | string[] | undefined>;

function readHeader(headers: HeaderSource | undefined, name: string): string | undefined {
  if (!headers) return undefined;
  if (headers instanceof Headers) return headers.get(name) ?? undefined;
  const v = headers[name];
  return Array.isArray(v) ? v.join(",") : v;
}

/**
 * The visitor's address as our proxy chain recorded it, or null when there is
 * nothing to tell visitors apart by (a local run without proxies).
 */
export function visitorAddress(headers: HeaderSource | undefined): string | null {
  const hops = (readHeader(headers, "x-forwarded-for") ?? "")
    .split(",")
    .map((h) => h.trim())
    .filter(Boolean);
  let viaCloudflare = false;
  for (let i = hops.length - 1; i >= 0; i--) {
    const hop = cleanAddress(hops[i]);
    // Not an address where a proxy of ours would have written one: trust nothing further left.
    if (!hop) break;
    if (!viaCloudflare && isOwnHop(hop)) continue;
    if (isCloudflare(hop)) {
      viaCloudflare = true;
      continue;
    }
    return hop;
  }
  return viaCloudflare ? cleanAddress(readHeader(headers, "cf-connecting-ip")) : null;
}

/** The per-visitor limit key for a request's headers. */
export function visitorKey(headers: HeaderSource | undefined): string {
  const address = visitorAddress(headers);
  return address ? addressKey(address) : UNKNOWN_VISITOR;
}
