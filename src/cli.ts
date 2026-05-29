#!/usr/bin/env node
import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { writeFile, access } from "fs/promises";
import { resolve } from "path";
import { loadConfig, ConfigError } from "./config/loader";
import { runStaticAnalysis } from "./analyzers/index";
import { renderTerminal } from "./reporters/terminal";
import { renderJSON } from "./reporters/json";

const STARTER_CONFIG = `# sdb-sigma configuration
name: my-agent
description: Describe what this agent does in one sentence.

agent:
  provider: anthropic
  model: claude-sonnet-4-6
  system_prompt: |
    You are a helpful assistant.
  max_rounds: 4

routing:
  strategy: tool-selection
  types:
    - name: default
      description: Default route.
      tools: []

boundaries: []

state:
  persistence: client-side
  context_window: prompt-injection
  session_isolation: true

control:
  gates: []
  human_approval: false
  max_rounds: 4
  rate_limiting: false

scenarios: []
`;

const program = new Command();
program
  .name("sdb-sigma")
  .description(
    "Audit your agent architecture. Find boundary failures before production does.",
  )
  .version("0.1.0");

program
  .command("init")
  .description("Write a starter sdb-sigma.config.yaml in the current directory")
  .option("-o, --output <path>", "Output path", "sdb-sigma.config.yaml")
  .option("-f, --force", "Overwrite an existing file", false)
  .action(async (opts: { output: string; force: boolean }) => {
    const target = resolve(process.cwd(), opts.output);
    if (!opts.force) {
      try {
        await access(target);
        console.error(
          chalk.hex("#e83842")(
            `Refusing to overwrite ${target}. Pass --force to override.`,
          ),
        );
        process.exitCode = 1;
        return;
      } catch {
        // file does not exist — proceed
      }
    }
    try {
      await writeFile(target, STARTER_CONFIG, "utf8");
      console.log(chalk.hex("#3ECF8E")(`✓ Wrote starter config to ${target}`));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(chalk.hex("#e83842")(`Failed to write config: ${msg}`));
      process.exitCode = 1;
    }
  });

program
  .command("check")
  .description(
    "Run static analysis against a config and print a terminal report",
  )
  .option(
    "-c, --config <path>",
    "Path to sdb-sigma.config.yaml",
    "sdb-sigma.config.yaml",
  )
  .option("--json", "Emit JSON instead of a terminal report", false)
  .action(async (opts: { config: string; json: boolean }) => {
    const spinner = opts.json
      ? null
      : ora({ text: `loading ${opts.config}`, color: "gray" }).start();
    try {
      const config = await loadConfig(opts.config);
      if (spinner) spinner.text = "running static analysis";
      const result = runStaticAnalysis(config);
      if (spinner) spinner.stop();

      if (opts.json) {
        console.log(renderJSON(result));
      } else {
        process.stdout.write(renderTerminal(result));
      }

      const hasErrors = result.promptWarnings.some(
        (w) => w.severity === "error",
      );
      if (hasErrors) process.exitCode = 2;
    } catch (err) {
      if (spinner) spinner.stop();
      if (err instanceof ConfigError) {
        console.error(chalk.hex("#e83842")(err.message));
      } else {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(chalk.hex("#e83842")(msg));
      }
      process.exitCode = 1;
    }
  });

program.parseAsync().catch((err) => {
  console.error(
    chalk.hex("#e83842")(err instanceof Error ? err.message : String(err)),
  );
  process.exit(1);
});
