import { readFile } from "fs/promises";
import { resolve, dirname, isAbsolute } from "path";
import { parse as parseYAML } from "yaml";
import { AgentConfigSchema } from "./schema";
import type { AgentConfig } from "../types";

export class ConfigError extends Error {
  public readonly path?: string;
  constructor(message: string, path?: string) {
    super(message);
    this.name = "ConfigError";
    this.path = path;
  }
}

export async function loadConfig(configPath: string): Promise<AgentConfig> {
  const absolutePath = isAbsolute(configPath)
    ? configPath
    : resolve(process.cwd(), configPath);

  let raw: string;
  try {
    raw = await readFile(absolutePath, "utf8");
  } catch {
    throw new ConfigError(
      `Could not read config file at ${absolutePath}`,
      absolutePath,
    );
  }

  let parsed: unknown;
  try {
    parsed = parseYAML(raw);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new ConfigError(
      `Invalid YAML in ${absolutePath}: ${detail}`,
      absolutePath,
    );
  }

  const result = AgentConfigSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .map(
        (issue) =>
          `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`,
      )
      .join("\n");
    throw new ConfigError(
      `Config validation failed for ${absolutePath}:\n${issues}`,
      absolutePath,
    );
  }

  const config = result.data as AgentConfig;
  const configDir = dirname(absolutePath);

  // Resolve agent.system_prompt_file if provided
  if (!config.agent.system_prompt && config.agent.system_prompt_file) {
    const promptPath = isAbsolute(config.agent.system_prompt_file)
      ? config.agent.system_prompt_file
      : resolve(configDir, config.agent.system_prompt_file);
    try {
      config.agent.system_prompt = await readFile(promptPath, "utf8");
    } catch {
      throw new ConfigError(
        `Could not read system_prompt_file at ${promptPath}`,
        promptPath,
      );
    }
  }

  return config;
}
