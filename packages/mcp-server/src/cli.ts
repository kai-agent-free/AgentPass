#!/usr/bin/env node

/**
 * AgentPass CLI entry point.
 *
 * Commands:
 *   agentpass serve  — start the MCP server (stdio transport)
 *   agentpass demo   — run the E2E demo scenario
 *   agentpass info   — print version and available tools
 *   agentpass config — print MCP config snippet for Claude Code
 */

const VERSION = "0.1.0";

/** Full list of MCP tools registered by the AgentPass server. */
const TOOLS = [
  "create_identity",
  "list_identities",
  "get_identity",
  "store_credential",
  "get_credential",
  "list_credentials",
  "authenticate",
  "check_auth_status",
  "get_email_address",
  "wait_for_email",
  "read_email",
  "extract_verification_link",
  "extract_otp_code",
  "list_emails",
  "get_phone_number",
  "wait_for_sms",
  "extract_otp_from_sms",
] as const;

function printUsage(): void {
  console.log(`
AgentPass v${VERSION} — The Identity Layer for Autonomous AI Agents

Usage:
  agentpass <command>

Commands:
  serve   Start the MCP server (stdio transport)
  demo    Run the E2E demo scenario
  info    Print version and available tools
  config  Print MCP config snippet for Claude Code
  help    Show this help message
`.trim());
}

function printInfo(): void {
  console.log(`AgentPass v${VERSION}`);
  console.log(`\nAvailable MCP tools (${TOOLS.length}):\n`);
  for (const tool of TOOLS) {
    console.log(`  - ${tool}`);
  }
}

async function runServe(): Promise<void> {
  // Dynamic import so we only pull in the full server + MCP SDK when needed
  const { createServer } = await import("./index.js");
  const { StdioServerTransport } = await import(
    "@modelcontextprotocol/sdk/server/stdio.js"
  );

  const server = createServer();
  const transport = new StdioServerTransport();

  const shutdown = async () => {
    await server.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  await server.connect(transport);
}

async function runDemoCommand(): Promise<void> {
  const { runDemo } = await import("./demo/demo-scenario.js");
  const result = await runDemo();

  if (!result.success) {
    console.error("Demo failed.");
    process.exit(1);
  }
}

async function runConfig(): Promise<void> {
  const { printMcpConfig } = await import("./config-generator.js");
  printMcpConfig();
}

export async function main(argv: string[] = process.argv): Promise<void> {
  // argv[0] = node, argv[1] = script path, argv[2] = command
  const command = argv[2] ?? "help";

  switch (command) {
    case "serve":
      await runServe();
      break;
    case "demo":
      await runDemoCommand();
      break;
    case "info":
      printInfo();
      break;
    case "config":
      await runConfig();
      break;
    case "help":
    case "--help":
    case "-h":
      printUsage();
      break;
    default:
      console.error(`Unknown command: ${command}`);
      printUsage();
      process.exit(1);
  }
}

// Export constants for testing
export { VERSION, TOOLS };

// Run if executed directly
main().catch((error: unknown) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
