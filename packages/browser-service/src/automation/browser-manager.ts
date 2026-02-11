import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';

export interface BrowserLaunchOptions {
  /** SOCKS5 or HTTP proxy URL (e.g. "socks5://127.0.0.1:1080") */
  proxy?: string;
  /** Launch in headless mode. Defaults to true. */
  headless?: boolean;
}

const DEFAULT_VIEWPORT = { width: 1280, height: 720 } as const;

const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

/**
 * Manages the Playwright browser lifecycle for AgentPass fallback authentication.
 *
 * Typical usage:
 * ```ts
 * const manager = new BrowserManager();
 * await manager.launch();
 * const page = await manager.newPage();
 * // ... interact with the page ...
 * await manager.close();
 * ```
 */
export class BrowserManager {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;

  /**
   * Launch a Chromium browser instance.
   *
   * @param options.proxy  — Optional proxy server URL.
   * @param options.headless — Run headless (default `true`).
   */
  async launch(options?: BrowserLaunchOptions): Promise<void> {
    const headless = options?.headless ?? true;

    const launchOptions: Parameters<typeof chromium.launch>[0] = {
      headless,
    };

    if (options?.proxy) {
      launchOptions.proxy = { server: options.proxy };
    }

    this.browser = await chromium.launch(launchOptions);

    this.context = await this.browser.newContext({
      viewport: DEFAULT_VIEWPORT,
      userAgent: DEFAULT_USER_AGENT,
    });
  }

  /**
   * Create a new page within the current browser context.
   * The page inherits the viewport and user-agent configured at launch.
   *
   * @throws If the browser has not been launched yet.
   */
  async newPage(): Promise<Page> {
    if (!this.context) {
      throw new Error('Browser not launched. Call launch() first.');
    }
    return this.context.newPage();
  }

  /**
   * Close the browser and release all resources.
   * Safe to call even if the browser was never launched.
   */
  async close(): Promise<void> {
    if (this.context) {
      await this.context.close();
      this.context = null;
    }
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  /** Returns true if a browser instance is currently running. */
  get isRunning(): boolean {
    return this.browser !== null;
  }
}
