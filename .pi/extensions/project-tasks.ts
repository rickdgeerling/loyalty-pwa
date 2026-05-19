/**
 * Project Tasks Extension
 *
 * Project-specific build, lint, and format tools for loyalty-pwa.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "build",
    label: "Build",
    description: "Run the project build with pnpm",
    promptSnippet: "Run the project build with pnpm",
    parameters: {},
    async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
      const result = await pi.exec("pnpm", ["run", "build"], {
        cwd: ctx.cwd,
      });
      return {
        content: [
          {
            type: "text",
            text: result.stdout || result.stderr || `exit code ${result.code}`,
          },
        ],
        details: { exitCode: result.code },
      };
    },
  });

  pi.registerTool({
    name: "lint",
    label: "Lint",
    description: "Lint the project with eslint",
    promptSnippet: "Lint the project with eslint",
    parameters: {},
    async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
      const result = await pi.exec("pnpm", ["run", "lint"], {
        cwd: ctx.cwd,
      });
      return {
        content: [
          {
            type: "text",
            text: result.stdout || result.stderr || `exit code ${result.code}`,
          },
        ],
        details: { exitCode: result.code },
      };
    },
  });

  pi.registerTool({
    name: "format",
    label: "Format",
    description: "Format code with prettier",
    promptSnippet: "Format code with prettier",
    parameters: {},
    async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
      const result = await pi.exec("pnpm", ["run", "format"], {
        cwd: ctx.cwd,
      });
      return {
        content: [
          {
            type: "text",
            text: result.stdout || result.stderr || `exit code ${result.code}`,
          },
        ],
        details: { exitCode: result.code },
      };
    },
  });
}
