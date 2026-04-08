import * as path from "path";
import * as vscode from "vscode";
import { ConfigService, DevStartupConfig } from "../types";

const CONFIG_FILE_NAME = ".devstartup.json";

function isConfigService(value: unknown): value is ConfigService {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as ConfigService;
  return (
    typeof candidate.name === "string" &&
    typeof candidate.path === "string" &&
    typeof candidate.command === "string" &&
    (candidate.healthyPatterns === undefined || Array.isArray(candidate.healthyPatterns)) &&
    (candidate.unhealthyPatterns === undefined || Array.isArray(candidate.unhealthyPatterns)) &&
    (candidate.enabled === undefined || typeof candidate.enabled === "boolean")
  );
}

function normalizeServices(raw: unknown): ConfigService[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.filter(isConfigService);
}

function normalizeProfiles(
  rawProfiles: DevStartupConfig["profiles"]
): Record<string, ConfigService[]> {
  if (!rawProfiles || typeof rawProfiles !== "object") {
    return {};
  }

  const profiles: Record<string, ConfigService[]> = {};
  for (const [profileName, profileValue] of Object.entries(rawProfiles)) {
    if (Array.isArray(profileValue)) {
      profiles[profileName] = normalizeServices(profileValue);
      continue;
    }
    if (profileValue && typeof profileValue === "object") {
      profiles[profileName] = normalizeServices((profileValue as { services?: unknown }).services);
    }
  }
  return profiles;
}

export class ConfigLoader {
  public async load(workspaceFolder: vscode.WorkspaceFolder): Promise<{
    filePath: string;
    exists: boolean;
    raw?: DevStartupConfig;
    services?: ConfigService[];
    profiles?: Record<string, ConfigService[]>;
    activeProfile?: string;
    warnings: string[];
  }> {
    const filePath = path.join(workspaceFolder.uri.fsPath, CONFIG_FILE_NAME);
    const configUri = vscode.Uri.file(filePath);
    const warnings: string[] = [];

    try {
      await vscode.workspace.fs.stat(configUri);
    } catch {
      return { filePath, exists: false, warnings };
    }

    try {
      const content = await vscode.workspace.fs.readFile(configUri);
      const parsed = JSON.parse(Buffer.from(content).toString("utf8")) as DevStartupConfig;

      const services = normalizeServices(parsed.services);
      const profiles = normalizeProfiles(parsed.profiles);
      const activeProfile = parsed.activeProfile;

      if (parsed.services && services.length === 0) {
        warnings.push("No valid services found in .devstartup.json.");
      }

      for (const [name, profileServices] of Object.entries(profiles)) {
        if (!profileServices.length) {
          warnings.push(`Profile "${name}" has no valid services.`);
        }
      }

      return {
        filePath,
        exists: true,
        raw: parsed,
        services,
        profiles,
        activeProfile,
        warnings
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown parse error";
      warnings.push(`Failed to read ${CONFIG_FILE_NAME}: ${message}`);
      return { filePath, exists: true, warnings };
    }
  }

  public resolveServicesFromProfile(
    result: Awaited<ReturnType<ConfigLoader["load"]>>,
    explicitProfile?: string
  ): { selectedProfile?: string; services: ConfigService[] } {
    const profileName = explicitProfile ?? result.activeProfile;
    const profiles = result.profiles ?? {};

    if (profileName && profiles[profileName]?.length) {
      return { selectedProfile: profileName, services: profiles[profileName] };
    }

    if (result.services?.length) {
      return { services: result.services };
    }

    return { services: [] };
  }

  public async save(
    workspaceFolder: vscode.WorkspaceFolder,
    config: DevStartupConfig
  ): Promise<void> {
    const filePath = path.join(workspaceFolder.uri.fsPath, CONFIG_FILE_NAME);
    const uri = vscode.Uri.file(filePath);
    const backupUri = vscode.Uri.file(`${filePath}.bak`);
    const serialized = JSON.stringify(config, null, 2);
    let existing: Uint8Array | undefined;
    try {
      existing = await vscode.workspace.fs.readFile(uri);
      await vscode.workspace.fs.writeFile(backupUri, existing);
    } catch {}

    try {
      await vscode.workspace.fs.writeFile(uri, Buffer.from(`${serialized}\n`, "utf8"));
    } catch (error) {
      if (existing) {
        await vscode.workspace.fs.writeFile(uri, existing);
      }
      throw error;
    }
  }
}
