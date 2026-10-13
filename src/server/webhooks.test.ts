import { describe, expect, it } from "vitest";
import { env } from "./env";
import { checkCallbackUrlShape, isPrivateAddress, signBody, UnsafeCallbackError, verifySignature } from "./webhooks";

describe("webhook signatures", () => {
  it("round-trips and rejects tampering", () => {
    const body = JSON.stringify({ id: "x", status: "done" });
    const sig = signBody("whsec_test", body);
    expect(sig).toMatch(/^sha256=[0-9a-f]{64}$/);
    expect(verifySignature("whsec_test", body, sig)).toBe(true);
    expect(verifySignature("whsec_test", body + " ", sig)).toBe(false);
    expect(verifySignature("other", body, sig)).toBe(false);
    expect(verifySignature("whsec_test", body, null)).toBe(false);
  });
});

describe("SSRF guard", () => {
  it.each(["10.0.0.5", "127.0.0.1", "169.254.169.254", "172.16.3.4", "192.168.1.1", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1"])(
    "%s is private",
    (ip) => {
      expect(isPrivateAddress(ip)).toBe(true);
    },
  );
  it.each(["8.8.8.8", "203.0.113.10", "2606:4700:4700::1111"])("%s is public", (ip) => {
    expect(isPrivateAddress(ip)).toBe(false);
  });

  it("only accepts public https callback URLs", () => {
    const allow = env.allowInsecureCallbacks;
    env.allowInsecureCallbacks = false;
    try {
      expect(checkCallbackUrlShape("https://hooks.example.com/x").hostname).toBe("hooks.example.com");
      for (const bad of ["http://hooks.example.com/x", "https://localhost/x", "https://10.1.2.3/x", "https://user:pw@example.com/", "not a url", "https://metadata.internal/"]) {
        expect(() => checkCallbackUrlShape(bad)).toThrow(UnsafeCallbackError);
      }
    } finally {
      env.allowInsecureCallbacks = allow;
    }
  });
});
