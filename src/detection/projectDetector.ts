import * as path from "path";
import { ProjectType, ScanResult } from "../types";

const SERVICE_HINT_FOLDERS = new Set(["frontend", "backend", "api", "server", "service", "services", "apps", "worker", "workers", "database", "db"]);

const FILE_TYPE_LOOKUP: Array<{ names: string[]; projectType: ProjectType }> = [
  { names: ["package.json", "pnpm-workspace.yaml", "nx.json", "turbo.json"], projectType: "node" },
  { names: ["requirements.txt", "pyproject.toml", "Pipfile", "poetry.lock", "manage.py", "main.py", "app.py", "server.py"], projectType: "python" },
  { names: ["pom.xml", "build.gradle"], projectType: "java" },
  { names: ["appsettings.json"], projectType: "dotnet" },
  { names: ["go.mod", "main.go"], projectType: "go" },
  { names: ["Cargo.toml"], projectType: "rust" },
  { names: ["composer.json"], projectType: "php" },
  { names: ["Gemfile"], projectType: "ruby" },
  { names: ["mix.exs"], projectType: "elixir" },
  { names: ["docker-compose.yml", "docker-compose.yaml", "Dockerfile"], projectType: "docker" }
];

export interface ServiceCandidate {
  id: string;
  name: string;
  absolutePath: string;
  relativePath: string;
  projectType: ProjectType;
  markerFiles: string[];
}

function toTitleCase(value: string): string {
  return value
    .replace(/[-_]/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function detectProjectTypeFromMarkers(markerFiles: string[]): ProjectType {
  if (markerFiles.some((marker) => marker.toLowerCase().endsWith(".csproj"))) {
    return "dotnet";
  }
  for (const lookup of FILE_TYPE_LOOKUP) {
    if (markerFiles.some((marker) => lookup.names.includes(marker))) {
      return lookup.projectType;
    }
  }
  return "unknown";
}

export class ProjectDetector {
  public detectServices(scanResult: ScanResult): ServiceCandidate[] {
    const directoryToMarkers = new Map<string, Set<string>>();
    const workspacePath = scanResult.workspaceFolder.uri.fsPath;

    for (const [fileName, uris] of scanResult.filesByName.entries()) {
      for (const uri of uris) {
        const serviceDir = path.dirname(uri.fsPath);
        const markerSet = directoryToMarkers.get(serviceDir) ?? new Set<string>();
        markerSet.add(fileName);
        directoryToMarkers.set(serviceDir, markerSet);
      }
    }

    for (const filePath of scanResult.fileSet.values()) {
      const relative = path.relative(workspacePath, filePath);
      const parts = relative.split(path.sep);
      for (let i = 0; i < parts.length; i += 1) {
        const folder = parts[i].toLowerCase();
        if (!SERVICE_HINT_FOLDERS.has(folder)) {
          continue;
        }
        const hintDir = path.join(workspacePath, ...parts.slice(0, i + 1));
        if (!directoryToMarkers.has(hintDir)) {
          directoryToMarkers.set(hintDir, new Set<string>());
        }
      }
    }

    if (!directoryToMarkers.size) {
      return [];
    }

    const candidates: ServiceCandidate[] = [];
    for (const [absolutePath, markerSet] of directoryToMarkers.entries()) {
      const relativePath = path.relative(workspacePath, absolutePath) || ".";
      const folderName = relativePath === "." ? path.basename(workspacePath) : path.basename(absolutePath);
      const markerFiles = [...markerSet];
      const projectType = detectProjectTypeFromMarkers(markerFiles);
      const id = relativePath.replace(/[\\/]/g, "-").toLowerCase();

      candidates.push({
        id,
        name: toTitleCase(folderName),
        absolutePath,
        relativePath,
        projectType,
        markerFiles
      });
    }

    return candidates.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  }
}
