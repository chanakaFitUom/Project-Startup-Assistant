import * as vscode from "vscode";

export type ProjectType =
  | "node"
  | "python"
  | "java"
  | "dotnet"
  | "go"
  | "rust"
  | "php"
  | "ruby"
  | "elixir"
  | "docker"
  | "unknown";

export type ServiceStatus = "running" | "stopped";
export type ServiceHealth = "unknown" | "starting" | "healthy" | "unhealthy";
export type DetectionSource = "auto" | "config";

export interface ServiceDefinition {
  id: string;
  name: string;
  path: string;
  command: string;
  projectType: ProjectType;
  source: DetectionSource;
  status: ServiceStatus;
  health: ServiceHealth;
  framework?: string;
  detectedPort?: number;
  healthyPatterns?: string[];
  unhealthyPatterns?: string[];
  testCommand?: string;
  buildCommand?: string;
  autoRestart?: boolean;
  watchGlobs?: string[];
  confidence?: "high" | "medium" | "low";
  enabled?: boolean;
}

export interface ScanResult {
  workspaceFolder: vscode.WorkspaceFolder;
  filesByName: Map<string, vscode.Uri[]>;
  fileSet: Set<string>;
}

export interface ConfigService {
  name: string;
  path: string;
  command: string;
  healthyPatterns?: string[];
  unhealthyPatterns?: string[];
  testCommand?: string;
  buildCommand?: string;
  autoRestart?: boolean;
  watch?: string[];
  enabled?: boolean;
}

export interface ConfigProfile {
  name?: string;
  services: ConfigService[];
}

export interface DevStartupConfig {
  activeProfile?: string;
  services?: ConfigService[];
  profiles?: Record<string, ConfigProfile | ConfigService[]>;
}

export interface ExtractedCommands {
  run: string;
  test?: string;
  build?: string;
  framework?: string;
  detectedPort?: number;
  confidence: "high" | "medium" | "low";
}
