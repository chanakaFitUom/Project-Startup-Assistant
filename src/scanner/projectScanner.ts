import * as path from "path";
import * as vscode from "vscode";
import { ScanResult } from "../types";

const MARKER_PATTERNS = [
  "**/package.json",
  "**/pnpm-lock.yaml",
  "**/pnpm-workspace.yaml",
  "**/yarn.lock",
  "**/bun.lockb",
  "**/schema.prisma",
  "**/requirements.txt",
  "**/pyproject.toml",
  "**/Pipfile",
  "**/poetry.lock",
  "**/manage.py",
  "**/pom.xml",
  "**/build.gradle",
  "**/*.csproj",
  "**/appsettings.json",
  "**/go.mod",
  "**/Cargo.toml",
  "**/composer.json",
  "**/Gemfile",
  "**/mix.exs",
  "**/docker-compose.yml",
  "**/docker-compose.yaml",
  "**/Dockerfile",
  "**/main.py",
  "**/app.py",
  "**/server.py",
  "**/main.go",
  "**/nx.json",
  "**/turbo.json"
];

const EXCLUDE_GLOB = "**/{node_modules,.git,.next,dist,build,out,coverage,.venv,venv,target,.turbo}/**";

export class ProjectScanner {
  private cache = new Map<string, ScanResult>();

  public clearCache(): void {
    this.cache.clear();
  }

  public async scanWorkspace(workspaceFolder: vscode.WorkspaceFolder): Promise<ScanResult> {
    const cacheKey = workspaceFolder.uri.toString();
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const filesByName = new Map<string, vscode.Uri[]>();
    const fileSet = new Set<string>();

    await Promise.all(
      MARKER_PATTERNS.map(async (pattern) => {
        const uris = await vscode.workspace.findFiles(
          new vscode.RelativePattern(workspaceFolder, pattern),
          EXCLUDE_GLOB
        );
        for (const uri of uris) {
          fileSet.add(uri.fsPath);
          const fileName = path.basename(uri.fsPath);
          const existing = filesByName.get(fileName) ?? [];
          existing.push(uri);
          filesByName.set(fileName, existing);
        }
      })
    );

    const result: ScanResult = {
      workspaceFolder,
      filesByName,
      fileSet
    };
    this.cache.set(cacheKey, result);
    return result;
  }
}
