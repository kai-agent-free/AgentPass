import { describe, it, expect } from "vitest";
import { ProxyManager } from "./proxy-config.js";

describe("ProxyManager", () => {
  describe("getProxyForDomain", () => {
    it("returns per-domain proxy when configured", () => {
      const manager = new ProxyManager({
        default_proxy: "socks5://default:1080",
        per_domain: new Map([["github.com", "socks5://github:1080"]]),
      });

      expect(manager.getProxyForDomain("github.com")).toBe(
        "socks5://github:1080",
      );
    });

    it("falls back to default proxy when no per-domain match exists", () => {
      const manager = new ProxyManager({
        default_proxy: "socks5://default:1080",
        per_domain: new Map([["github.com", "socks5://github:1080"]]),
      });

      expect(manager.getProxyForDomain("example.com")).toBe(
        "socks5://default:1080",
      );
    });

    it("returns undefined for domains in the no-proxy list", () => {
      const manager = new ProxyManager({
        default_proxy: "socks5://default:1080",
        per_domain: new Map([["localhost", "socks5://local:1080"]]),
        no_proxy: ["localhost"],
      });

      expect(manager.getProxyForDomain("localhost")).toBeUndefined();
    });

    it("returns undefined when no proxy is configured at all", () => {
      const manager = new ProxyManager();
      expect(manager.getProxyForDomain("example.com")).toBeUndefined();
    });

    it("uses rotation when enabled and no default/per-domain proxy exists", () => {
      const manager = new ProxyManager({
        rotation_enabled: true,
        proxy_pool: ["socks5://a:1080", "socks5://b:1080"],
      });

      const first = manager.getProxyForDomain("example.com");
      const second = manager.getProxyForDomain("example.com");
      expect(first).toBe("socks5://a:1080");
      expect(second).toBe("socks5://b:1080");
    });

    it("prefers per-domain proxy over default and rotation", () => {
      const manager = new ProxyManager({
        default_proxy: "socks5://default:1080",
        per_domain: new Map([["special.com", "socks5://special:1080"]]),
        rotation_enabled: true,
        proxy_pool: ["socks5://pool:1080"],
      });

      expect(manager.getProxyForDomain("special.com")).toBe(
        "socks5://special:1080",
      );
    });

    it("prefers default proxy over rotation", () => {
      const manager = new ProxyManager({
        default_proxy: "socks5://default:1080",
        rotation_enabled: true,
        proxy_pool: ["socks5://pool:1080"],
      });

      expect(manager.getProxyForDomain("example.com")).toBe(
        "socks5://default:1080",
      );
    });
  });

  describe("proxy pool rotation (round-robin)", () => {
    it("cycles through proxies in order", () => {
      const pool = ["socks5://a:1080", "socks5://b:1080", "socks5://c:1080"];
      const manager = new ProxyManager({
        rotation_enabled: true,
        proxy_pool: pool,
      });

      expect(manager.rotateProxy()).toBe("socks5://a:1080");
      expect(manager.rotateProxy()).toBe("socks5://b:1080");
      expect(manager.rotateProxy()).toBe("socks5://c:1080");
      expect(manager.rotateProxy()).toBe("socks5://a:1080");
    });

    it("returns undefined when pool is empty", () => {
      const manager = new ProxyManager({ rotation_enabled: true });
      expect(manager.rotateProxy()).toBeUndefined();
    });
  });

  describe("addProxy / removeProxy", () => {
    it("adds a proxy to the pool", () => {
      const manager = new ProxyManager({ rotation_enabled: true });
      manager.addProxy("socks5://new:1080");
      expect(manager.rotateProxy()).toBe("socks5://new:1080");
    });

    it("removes a proxy from the pool", () => {
      const manager = new ProxyManager({
        rotation_enabled: true,
        proxy_pool: ["socks5://a:1080", "socks5://b:1080"],
      });

      manager.removeProxy("socks5://a:1080");
      expect(manager.rotateProxy()).toBe("socks5://b:1080");
      expect(manager.rotateProxy()).toBe("socks5://b:1080");
    });

    it("does nothing when removing a proxy not in the pool", () => {
      const manager = new ProxyManager({
        rotation_enabled: true,
        proxy_pool: ["socks5://a:1080"],
      });

      manager.removeProxy("socks5://nonexistent:1080");
      expect(manager.rotateProxy()).toBe("socks5://a:1080");
    });
  });

  describe("setDomainProxy", () => {
    it("sets a sticky proxy for a domain", () => {
      const manager = new ProxyManager();
      manager.setDomainProxy("github.com", "socks5://gh:1080");
      expect(manager.getProxyForDomain("github.com")).toBe("socks5://gh:1080");
    });
  });

  describe("addNoProxy / isNoProxy", () => {
    it("adds a domain to the no-proxy list", () => {
      const manager = new ProxyManager({
        default_proxy: "socks5://default:1080",
      });

      expect(manager.isNoProxy("localhost")).toBe(false);
      manager.addNoProxy("localhost");
      expect(manager.isNoProxy("localhost")).toBe(true);
      expect(manager.getProxyForDomain("localhost")).toBeUndefined();
    });

    it("does not duplicate domains in the no-proxy list", () => {
      const manager = new ProxyManager({ no_proxy: ["localhost"] });
      manager.addNoProxy("localhost");
      // isNoProxy still works correctly
      expect(manager.isNoProxy("localhost")).toBe(true);
    });
  });
});
