import { describe, expect, test } from "bun:test";
import { UNKNOWN_VISITOR, addressKey, cleanAddress, visitorAddress, visitorKey } from "./index.js";

const h = (init: Record<string, string>) => new Headers(init);
const CADDY_PEER = "10.0.1.7"; // Traefik on the Docker network, as Caddy sees it
const CF_EDGE = "172.71.10.20"; // inside 172.64.0.0/13

describe("visitor address", () => {
  test("no proxy headers (a local run): nobody to tell apart", () => {
    expect(visitorAddress(undefined)).toBeNull();
    expect(visitorAddress(h({}))).toBeNull();
    expect(visitorKey(h({}))).toBe(UNKNOWN_VISITOR);
  });

  test("only our own hops in the header: still nobody", () => {
    expect(visitorAddress(h({ "x-forwarded-for": `192.168.65.1, ${CADDY_PEER}` }))).toBeNull();
  });

  test("Traefik passes the header on: the address Cloudflare wrote, not what the client sent", () => {
    const xff = `6.6.6.6, 1.2.3.4, 81.250.1.2, ${CF_EDGE}, ${CADDY_PEER}`;
    expect(visitorAddress(h({ "x-forwarded-for": xff }))).toBe("81.250.1.2");
  });

  test("Traefik replaces the header with its peer: a Cloudflare edge, so CF-Connecting-IP", () => {
    const headers = h({ "x-forwarded-for": `${CF_EDGE}, ${CADDY_PEER}`, "cf-connecting-ip": "81.250.1.2" });
    expect(visitorAddress(headers)).toBe("81.250.1.2");
  });

  test("CF-Connecting-IP is ignored when the request did not come through Cloudflare", () => {
    const headers = h({ "x-forwarded-for": `5.5.5.5, ${CADDY_PEER}`, "cf-connecting-ip": "9.9.9.9" });
    expect(visitorAddress(headers)).toBe("5.5.5.5");
    expect(visitorAddress(h({ "x-forwarded-for": CADDY_PEER, "cf-connecting-ip": "9.9.9.9" }))).toBeNull();
  });

  test("a spoofed Cloudflare address on the left changes nothing", () => {
    const headers = h({ "x-forwarded-for": `104.16.0.1, 5.5.5.5, ${CADDY_PEER}`, "cf-connecting-ip": "9.9.9.9" });
    expect(visitorAddress(headers)).toBe("5.5.5.5");
  });

  test("garbage where a proxy would have written an address: trust nothing to its left", () => {
    expect(visitorAddress(h({ "x-forwarded-for": `5.5.5.5, not-an-ip, ${CADDY_PEER}` }))).toBeNull();
  });

  test("plain records work too, and a list of values is joined", () => {
    expect(visitorAddress({ "x-forwarded-for": `5.5.5.5, ${CADDY_PEER}` })).toBe("5.5.5.5");
    expect(visitorAddress({ "x-forwarded-for": ["5.5.5.5", CADDY_PEER] })).toBe("5.5.5.5");
  });

  test("IPv6 visitors behind Cloudflare", () => {
    const xff = `2a01:cb00:1234:5678:abcd::1, 2606:4700::6810:84e5, ${CADDY_PEER}`;
    expect(visitorAddress(h({ "x-forwarded-for": xff }))).toBe("2a01:cb00:1234:5678:abcd::1");
  });
});

describe("address cleaning and keys", () => {
  test("ports, brackets and IPv4-mapped IPv6 are stripped", () => {
    expect(cleanAddress("1.2.3.4:5678")).toBe("1.2.3.4");
    expect(cleanAddress("[2001:db8::1]:443")).toBe("2001:db8::1");
    expect(cleanAddress("::ffff:10.0.0.1")).toBe("10.0.0.1");
    expect(cleanAddress(" 2001:DB8::1 ")).toBe("2001:db8::1");
    expect(cleanAddress("unknown")).toBeNull();
    expect(cleanAddress("")).toBeNull();
  });

  test("IPv4 is keyed by the address, IPv6 by its /64", () => {
    expect(addressKey("81.250.1.2")).toBe("81.250.1.2");
    expect(addressKey("2a01:cb00:1234:5678:abcd::1")).toBe("2a01:cb00:1234:5678::/64");
    expect(addressKey("2a01:cb00:1234:5678::2")).toBe("2a01:cb00:1234:5678::/64");
    expect(addressKey("2a01:cb00::1")).toBe("2a01:cb00:0:0::/64");
    expect(addressKey("2a01:0cb0:0000:0001:1:2:3:4")).toBe("2a01:cb0:0:1::/64");
  });
});
