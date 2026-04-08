import * as path from "path";
import * as vscode from "vscode";
import { ServiceDefinition, ServiceHealth, ServiceStatus } from "../types";
import { TerminalRunner } from "../terminals/terminalRunner";

interface ServiceRuntime {
  service: ServiceDefinition;
  watcher?: vscode.FileSystemWatcher;
  restartTimeout?: NodeJS.Timeout;
  healthTimer?: NodeJS.Timeout;
}

export class ServiceManager implements vscode.Disposable {
  private readonly runtimes = new Map<string, ServiceRuntime>();
  private readonly onDidChangeServicesEmitter = new vscode.EventEmitter<ServiceDefinition[]>();
  public readonly onDidChangeServices = this.onDidChangeServicesEmitter.event;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly terminalRunner: TerminalRunner
  ) {
    this.context.subscriptions.push(
      this.terminalRunner.onDidTerminalClosed((serviceId) => {
        const runtime = this.runtimes.get(serviceId);
        if (!runtime) {
          return;
        }
        runtime.service.status = "stopped";
        runtime.service.health = "unknown";
        if (runtime.healthTimer) {
          clearTimeout(runtime.healthTimer);
          runtime.healthTimer = undefined;
        }
        this.publish();
      })
    );
  }

  public setServices(services: ServiceDefinition[]): void {
    const currentIds = new Set(services.map((service) => service.id));
    for (const [existingId, runtime] of this.runtimes.entries()) {
      if (currentIds.has(existingId)) {
        continue;
      }
      this.disposeWatcher(runtime);
      if (runtime.service.status === "running") {
        this.terminalRunner.stopService(existingId);
      }
      this.runtimes.delete(existingId);
    }

    for (const service of services) {
      const existing = this.runtimes.get(service.id);
      if (existing) {
        existing.service = service;
        continue;
      }
      this.runtimes.set(service.id, { service });
    }

    for (const runtime of this.runtimes.values()) {
      this.ensureWatcher(runtime);
    }
    this.publish();
  }

  public getServices(): ServiceDefinition[] {
    return [...this.runtimes.values()]
      .map((runtime) => runtime.service)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  public async startService(serviceId: string): Promise<void> {
    const runtime = this.runtimes.get(serviceId);
    if (!runtime) {
      return;
    }
    if (!runtime.service.command.trim()) {
      vscode.window.showWarningMessage(`No startup command detected for "${runtime.service.name}".`);
      return;
    }

    const folderPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!folderPath) {
      return;
    }

    const cwd =
      runtime.service.path === "."
        ? folderPath
        : path.join(folderPath, runtime.service.path);
    this.terminalRunner.runService(serviceId, runtime.service.name, cwd, runtime.service.command);
    runtime.service.status = "running";
    runtime.service.health = "starting";
    if (runtime.healthTimer) {
      clearTimeout(runtime.healthTimer);
    }
    runtime.healthTimer = setTimeout(() => {
      if (runtime.service.status === "running" && runtime.service.health === "starting") {
        runtime.service.health = "healthy";
        this.publish();
      }
    }, 2500);
    this.publish();
  }

  public stopService(serviceId: string): void {
    const runtime = this.runtimes.get(serviceId);
    if (!runtime) {
      return;
    }
    this.terminalRunner.stopService(serviceId);
    runtime.service.status = "stopped";
    runtime.service.health = "unknown";
    if (runtime.healthTimer) {
      clearTimeout(runtime.healthTimer);
      runtime.healthTimer = undefined;
    }
    this.publish();
  }

  public async restartService(serviceId: string): Promise<void> {
    this.stopService(serviceId);
    await this.startService(serviceId);
  }

  public async startAll(): Promise<void> {
    const promises = this.getServices().map((service) => this.startService(service.id));
    await Promise.all(promises);
  }

  public stopAll(): void {
    for (const service of this.getServices()) {
      this.stopService(service.id);
    }
  }

  public async restartAll(): Promise<void> {
    this.stopAll();
    await this.startAll();
  }

  public async restartStopped(): Promise<void> {
    const stopped = this.getServices().filter((service) => service.status === "stopped");
    await Promise.all(stopped.map((service) => this.startService(service.id)));
  }

  public showServiceTerminal(serviceId: string): void {
    const opened = this.terminalRunner.showServiceTerminal(serviceId);
    if (!opened) {
      vscode.window.showInformationMessage("Service terminal is not running yet.");
    }
  }

  public runUtilityForService(serviceId: string, commandType: "test" | "build"): void {
    const runtime = this.runtimes.get(serviceId);
    if (!runtime) {
      return;
    }
    const command = commandType === "test" ? runtime.service.testCommand : runtime.service.buildCommand;
    if (!command) {
      vscode.window.showInformationMessage(`No ${commandType} command for "${runtime.service.name}".`);
      return;
    }
    const folderPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!folderPath) {
      return;
    }
    const cwd = runtime.service.path === "." ? folderPath : path.join(folderPath, runtime.service.path);
    const terminalName = `${runtime.service.name}: ${commandType}`;
    this.terminalRunner.runOneOff(terminalName, cwd, command);
  }

  public runUtilityForAll(commandType: "test" | "build"): void {
    for (const service of this.getServices()) {
      this.runUtilityForService(service.id, commandType);
    }
  }

  public setStatus(serviceId: string, status: ServiceStatus): void {
    const runtime = this.runtimes.get(serviceId);
    if (!runtime) {
      return;
    }
    runtime.service.status = status;
    if (status === "stopped") {
      runtime.service.health = "unknown";
      if (runtime.healthTimer) {
        clearTimeout(runtime.healthTimer);
        runtime.healthTimer = undefined;
      }
    } else if (runtime.service.health === "unknown") {
      runtime.service.health = "starting";
    }
    this.publish();
  }

  public setHealth(serviceId: string, health: ServiceHealth): void {
    const runtime = this.runtimes.get(serviceId);
    if (!runtime) {
      return;
    }
    runtime.service.health = health;
    this.publish();
  }

  private ensureWatcher(runtime: ServiceRuntime): void {
    this.disposeWatcher(runtime);
    if (!runtime.service.autoRestart) {
      return;
    }
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      return;
    }
    const basePath = runtime.service.path === "." ? "." : runtime.service.path;
    const watchGlob = runtime.service.watchGlobs?.[0] ?? "**/*";
    const pattern = new vscode.RelativePattern(path.join(workspaceFolder.uri.fsPath, basePath), watchGlob);
    const watcher = vscode.workspace.createFileSystemWatcher(pattern);
    const onChange = () => {
      if (runtime.service.status !== "running") {
        return;
      }
      if (runtime.restartTimeout) {
        clearTimeout(runtime.restartTimeout);
      }
      runtime.restartTimeout = setTimeout(() => {
        void this.restartService(runtime.service.id);
      }, 500);
    };

    this.context.subscriptions.push(watcher);
    watcher.onDidChange(onChange, this, this.context.subscriptions);
    watcher.onDidCreate(onChange, this, this.context.subscriptions);
    watcher.onDidDelete(onChange, this, this.context.subscriptions);
    runtime.watcher = watcher;
  }

  private disposeWatcher(runtime: ServiceRuntime): void {
    if (runtime.restartTimeout) {
      clearTimeout(runtime.restartTimeout);
      runtime.restartTimeout = undefined;
    }
    if (runtime.healthTimer) {
      clearTimeout(runtime.healthTimer);
      runtime.healthTimer = undefined;
    }
    runtime.watcher?.dispose();
    runtime.watcher = undefined;
  }

  private publish(): void {
    this.onDidChangeServicesEmitter.fire(this.getServices());
  }

  public dispose(): void {
    for (const runtime of this.runtimes.values()) {
      this.disposeWatcher(runtime);
    }
    this.onDidChangeServicesEmitter.dispose();
  }
}
