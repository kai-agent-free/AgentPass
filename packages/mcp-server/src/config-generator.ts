/**
 * MCP Configuration Generator.
 *
 * Generates the Claude Code MCP config snippet for AgentPass,
 * making it easy for users to integrate the server.
 */

import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

/**
 * Resolve the default path to the compiled MCP server entry point (dist/index.js).
 */
function defaultServerPath(): string {
  const thisFile = fileURLToPath(import.meta.url);
  const srcDir = dirname(thisFile);
  // When running from dist/, srcDir === <pkg>/dist — index.js is a sibling.
  // When running from src/ (ts-node / vitest), go up to pkg root then into dist/.
  if (srcDir.endsWith("/dist") || srcDir.endsWith("\\dist")) {
    return resolve(srcDir, "index.js");
  }
  return resolve(srcDir, "..", "dist", "index.js");
}

export interface McpConfig {
  mcpServers: {
    agentpass: {
      command: string;
      args: string[];
      env: Record<string, string>;
    };
  };
}

/**
 * Generate the Claude Code MCP configuration object.
 *
 * @param options.serverPath - Override the path to the compiled server entry
 */
export function generateMcpConfig(options?: {
  serverPath?: string;
}): McpConfig {
  const serverPath = options?.serverPath ?? defaultServerPath();

  return {
    mcpServers: {
      agentpass: {
        command: "node",
        args: [serverPath],
        env: {},
      },
    },
  };
}

/**
 * Print the MCP config to stdout with setup instructions.
 */
export function printMcpConfig(options?: { serverPath?: string }): void {
  const config = generateMcpConfig(options);

  console.log("Add the following to your Claude Code MCP configuration:\n");
  console.log(JSON.stringify(config, null, 2));
  console.log(
    "\nCopy the JSON above into your Claude Code MCP settings file.",
  );
}
