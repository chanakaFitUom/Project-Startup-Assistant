import * as vscode from "vscode";
import { ServiceDefinition } from "../types";

type UtilityId =
  | "utility-start-all"
  | "utility-stop-all"
  | "utility-restart-all"
  | "utility-run-tests"
  | "utility-build"
  | "utility-refresh";

type TreeNode = GroupNode | ServiceNode | UtilityNode;

interface GroupNode {
  type: "group";
  id: "services" | "utilities";
}

interface ServiceNode {
  type: "service";
  service: ServiceDefinition;
}

interface UtilityNode {
  type: "utility";
  utilityId: UtilityId;
}

export class ProjectTreeViewProvider implements vscode.TreeDataProvider<TreeNode> {
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<TreeNode | undefined | null | void>();
  public readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;
  private services: ServiceDefinition[] = [];
  private showUtilitiesSection = true;
  private serviceDetailsMode: "compact" | "detailed" = "compact";

  public setServices(services: ServiceDefinition[]): void {
    this.services = services;
    this.refresh();
  }

  public refresh(): void {
    this.onDidChangeTreeDataEmitter.fire();
  }

  public setShowUtilitiesSection(show: boolean): void {
    this.showUtilitiesSection = show;
    this.refresh();
  }

  public setServiceDetailsMode(mode: "compact" | "detailed"): void {
    this.serviceDetailsMode = mode;
    this.refresh();
  }

  public getTreeItem(element: TreeNode): vscode.TreeItem {
    if (element.type === "group") {
      const item = new vscode.TreeItem(
        element.id === "services" ? "Services" : "Utilities",
        vscode.TreeItemCollapsibleState.Expanded
      );
      item.id = element.id;
      item.iconPath = new vscode.ThemeIcon(element.id === "services" ? "server-process" : "tools");
      item.tooltip =
        element.id === "services"
          ? "Detected and configured projects you can run."
          : "Quick actions for all services (start, stop, build, test, refresh).";
      return item;
    }

    if (element.type === "service") {
      const service = element.service;
      const enabled = service.enabled !== false;
      const item = new vscode.TreeItem(`${enabled ? "$(check)" : "$(circle-large-outline)"} ${service.name}`, vscode.TreeItemCollapsibleState.None);
      const isRunning = service.status === "running";
      const frameworkLabel = service.framework ?? this.toProjectTypeLabel(service.projectType);
      const identityParts: string[] = [];
      identityParts.push(`[${frameworkLabel}]`);
      if (service.detectedPort) {
        identityParts.push(`:${service.detectedPort}`);
      }
      const healthText =
        service.status === "stopped" ? "stopped" : service.health === "healthy" ? "healthy" : service.health === "unhealthy" ? "unhealthy" : "starting";
      const healthBadge =
        healthText === "healthy"
          ? "● healthy"
          : healthText === "unhealthy"
            ? "✖ unhealthy"
            : healthText === "starting"
              ? "◐ starting"
              : "○ stopped";
      if (this.serviceDetailsMode === "compact") {
        item.description = `${healthBadge} • ${identityParts.join(" ")}`;
      } else {
        const confidence = service.confidence ? ` • confidence:${service.confidence}` : "";
        const source = service.source ? ` • ${service.source}` : "";
        item.description = `${healthBadge} • ${identityParts.join(" ")} • path:${service.path}${source}${confidence}`;
      }
      item.tooltip = `${service.name}
Purpose: ${enabled ? "Included in Start All" : "Excluded from Start All"}
Path: ${service.path}
Command: ${service.command}
Type: ${service.projectType}
Health: ${healthText}
Hint: Right-click to edit command or toggle startup selection.`;
      item.contextValue = isRunning ? "service-running" : "service-stopped";
      item.iconPath = new vscode.ThemeIcon(this.frameworkIcon(service.framework, service.projectType));
      item.command = {
        command: isRunning ? "projectStartup.stopService" : "projectStartup.startService",
        title: isRunning ? "Stop Service" : "Start Service",
        arguments: [service]
      };
      return item;
    }

    const utilityMeta: Record<
      UtilityId,
      { label: string; icon: string; command: string; tooltip: string; args?: unknown[] }
    > = {
      "utility-start-all": {
        label: "Start All",
        icon: "play-circle",
        command: "projectStartup.startAll",
        tooltip: "Start all checked services."
      },
      "utility-stop-all": {
        label: "Stop All",
        icon: "circle-slash",
        command: "projectStartup.stopAll",
        tooltip: "Stop all currently running services."
      },
      "utility-restart-all": {
        label: "Restart All",
        icon: "debug-restart",
        command: "projectStartup.restartAll",
        tooltip: "Restart all services to reload latest code and config."
      },
      "utility-run-tests": {
        label: "Run Tests",
        icon: "beaker",
        command: "projectStartup.runTests",
        tooltip: "Run test command for one service or all services."
      },
      "utility-build": {
        label: "Build Project",
        icon: "tools",
        command: "projectStartup.buildProject",
        tooltip: "Run build command for one service or all services."
      },
      "utility-refresh": {
        label: "Refresh",
        icon: "refresh",
        command: "projectStartup.refresh",
        tooltip: "Rescan workspace and update detected projects."
      }
    };

    const meta = utilityMeta[element.utilityId];
    const item = new vscode.TreeItem(meta.label, vscode.TreeItemCollapsibleState.None);
    item.contextValue = element.utilityId;
    item.description = "Click to run";
    item.tooltip = meta.tooltip;
    item.iconPath = new vscode.ThemeIcon(meta.icon);
    item.command = {
      command: meta.command,
      title: meta.label,
      arguments: meta.args
    };
    return item;
  }

  public getChildren(element?: TreeNode): TreeNode[] {
    if (!element) {
      const roots: TreeNode[] = [{ type: "group", id: "services" }];
      if (this.showUtilitiesSection) {
        roots.push({ type: "group", id: "utilities" });
      }
      return roots;
    }

    if (element.type === "group" && element.id === "services") {
      return this.services.map((service) => ({ type: "service", service }));
    }

    if (element.type === "group" && element.id === "utilities") {
      return [
        { type: "utility", utilityId: "utility-start-all" },
        { type: "utility", utilityId: "utility-stop-all" },
        { type: "utility", utilityId: "utility-restart-all" },
        { type: "utility", utilityId: "utility-run-tests" },
        { type: "utility", utilityId: "utility-build" },
        { type: "utility", utilityId: "utility-refresh" }
      ];
    }

    return [];
  }

  private frameworkIcon(framework: string | undefined, projectType: ServiceDefinition["projectType"]): string {
    const key = framework?.toLowerCase() ?? "";
    if (key.includes("docker")) {
      return "package";
    }
    if (key.includes("prisma")) {
      return "database";
    }
    if (key.includes("next") || key.includes("vite") || key.includes("svelte") || key.includes("react")) {
      return "browser";
    }
    if (key.includes("nestjs") || key.includes("express") || key.includes("django") || key.includes("flask") || key.includes("fastapi")) {
      return "server-process";
    }
    if (key.includes("spring")) {
      return "symbol-class";
    }
    if (key.includes("phoenix")) {
      return "flame";
    }
    if (key.includes("rails")) {
      return "symbol-string";
    }

    switch (projectType) {
      case "node":
        return "symbol-method";
      case "python":
        return "symbol-function";
      case "java":
        return "symbol-class";
      case "dotnet":
        return "symbol-namespace";
      case "go":
        return "symbol-struct";
      case "rust":
        return "tools";
      case "php":
        return "symbol-key";
      case "ruby":
        return "symbol-string";
      case "elixir":
        return "flame";
      case "docker":
        return "package";
      default:
        return "symbol-misc";
    }
  }

  private toProjectTypeLabel(projectType: ServiceDefinition["projectType"]): string {
    switch (projectType) {
      case "dotnet":
        return ".NET";
      default:
        return projectType.charAt(0).toUpperCase() + projectType.slice(1);
    }
  }
}
