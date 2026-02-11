/**
 * Proxy configuration and management for browser automation.
 *
 * Supports per-domain proxy assignment, a default proxy, a no-proxy bypass
 * list, and round-robin rotation across a configurable proxy pool.
 */

export interface ProxyConfig {
  /** Default SOCKS5 or HTTP proxy URL applied when no per-domain match exists. */
  default_proxy?: string;
  /** Map of domain to dedicated proxy URL. */
  per_domain: Map<string, string>;
  /** Domains that must bypass any proxy. */
  no_proxy: string[];
  /** Whether round-robin rotation is enabled. */
  rotation_enabled: boolean;
  /** Pool of proxy URLs used for rotation. */
  proxy_pool: string[];
}

/**
 * Manages proxy selection for browser sessions.
 *
 * Resolution order for `getProxyForDomain`:
 * 1. If the domain is in the no-proxy list, returns `undefined`.
 * 2. If a per-domain proxy is configured, returns it.
 * 3. If a default proxy is set, returns it.
 * 4. If rotation is enabled and the pool is non-empty, returns the next proxy via round-robin.
 * 5. Otherwise returns `undefined`.
 */
export class ProxyManager {
  private readonly config: ProxyConfig;
  private rotationIndex = 0;

  constructor(config?: Partial<ProxyConfig>) {
    this.config = {
      default_proxy: config?.default_proxy,
      per_domain: config?.per_domain ?? new Map<string, string>(),
      no_proxy: config?.no_proxy ? [...config.no_proxy] : [],
      rotation_enabled: config?.rotation_enabled ?? false,
      proxy_pool: config?.proxy_pool ? [...config.proxy_pool] : [],
    };
  }

  /**
   * Resolve the proxy URL that should be used for the given domain.
   *
   * @returns The proxy URL, or `undefined` if the domain should connect directly.
   */
  getProxyForDomain(domain: string): string | undefined {
    if (this.isNoProxy(domain)) {
      return undefined;
    }

    const perDomain = this.config.per_domain.get(domain);
    if (perDomain !== undefined) {
      return perDomain;
    }

    if (this.config.default_proxy !== undefined) {
      return this.config.default_proxy;
    }

    if (this.config.rotation_enabled && this.config.proxy_pool.length > 0) {
      return this.rotateProxy();
    }

    return undefined;
  }

  /** Add a proxy URL to the rotation pool. */
  addProxy(proxy: string): void {
    this.config.proxy_pool.push(proxy);
  }

  /** Remove a proxy URL from the rotation pool. */
  removeProxy(proxy: string): void {
    const idx = this.config.proxy_pool.indexOf(proxy);
    if (idx !== -1) {
      this.config.proxy_pool.splice(idx, 1);
      // Keep rotationIndex within bounds
      if (this.config.proxy_pool.length > 0) {
        this.rotationIndex = this.rotationIndex % this.config.proxy_pool.length;
      } else {
        this.rotationIndex = 0;
      }
    }
  }

  /** Assign a sticky proxy to a specific domain. */
  setDomainProxy(domain: string, proxy: string): void {
    this.config.per_domain.set(domain, proxy);
  }

  /** Add a domain to the no-proxy bypass list. */
  addNoProxy(domain: string): void {
    if (!this.config.no_proxy.includes(domain)) {
      this.config.no_proxy.push(domain);
    }
  }

  /** Check whether a domain should bypass proxy. */
  isNoProxy(domain: string): boolean {
    return this.config.no_proxy.includes(domain);
  }

  /**
   * Return the next proxy from the pool using round-robin.
   *
   * @returns The next proxy URL, or `undefined` if the pool is empty.
   */
  rotateProxy(): string | undefined {
    if (this.config.proxy_pool.length === 0) {
      return undefined;
    }
    const proxy = this.config.proxy_pool[this.rotationIndex];
    this.rotationIndex =
      (this.rotationIndex + 1) % this.config.proxy_pool.length;
    return proxy;
  }
}
