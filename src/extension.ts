import * as vscode from "vscode";
import * as path from "path";
import { CommandExtractor } from "./commands/commandExtractor";
import { ConfigLoader } from "./config/configLoader";
import { ProjectDetector } from "./detection/projectDetector";
import { ProjectScanner } from "./scanner/projectScanner";
import { buildDetectedServices, preserveRuntimeState } from "./services/serviceBuilder";
import { ServiceManager } from "./services/serviceManager";
import { ConfigService, DevStartupConfig, ExtractedCommands, ServiceDefinition } from "./types";
import { TerminalRunner } from "./terminals/terminalRunner";
import { StatusBarControls, StatusBarVisibility } from "./ui/statusBarControls";
import { ProjectTreeViewProvider } from "./ui/treeViewProvider";

const ACTIVE_PROFILE_KEY = "projectStartup.activeProfile";
const SELECTED_SERVICE_IDS_KEY = "projectStartup.selectedServiceIds";

function slugify(value: string): string {
  return value.replace(/[^a-z0-9_-]/gi, "-").replace(/-+/g, "-").toLowerCase();
}

function serviceFromConfig(configService: {
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
}): ServiceDefinition {
  const normalizedPath = configService.path.trim() || ".";
  const lowerCommand = configService.command.toLowerCase();
  const framework = lowerCommand.includes("prisma")
    ? "Prisma"
    : lowerCommand.includes("next")
      ? "Next.js"
      : lowerCommand.includes("vite")
        ? "Vite"
        : lowerCommand.includes("django")
          ? "Django"
          : lowerCommand.includes("flask")
            ? "Flask"
            : lowerCommand.includes("uvicorn")
              ? "FastAPI"
              : undefined;
  const portMatch = configService.command.match(/(?:--port|-p|localhost:|:)\s?(\d{2,5})/i);
  const detectedPort = portMatch?.[1] ? Number.parseInt(portMatch[1], 10) : undefined;
  return {
    id: slugify(`${normalizedPath}-${configService.name}`),
    name: configService.name,
    path: normalizedPath,
    command: configService.command,
    projectType: "unknown",
    source: "config",
    status: "stopped",
    health: "unknown",
    framework,
    detectedPort,
    healthyPatterns: configService.healthyPatterns,
    unhealthyPatterns: configService.unhealthyPatterns,
    testCommand: configService.testCommand,
    buildCommand: configService.buildCommand,
    autoRestart: configService.autoRestart,
    watchGlobs: configService.watch,
    confidence: "high",
    enabled: configService.enabled ?? true
  };
}

function toConfigService(service: ServiceDefinition): ConfigService {
  return {
    name: service.name,
    path: service.path,
    command: service.command,
    healthyPatterns: service.healthyPatterns,
    unhealthyPatterns: service.unhealthyPatterns,
    testCommand: service.testCommand,
    buildCommand: service.buildCommand,
    autoRestart: service.autoRestart,
    watch: service.watchGlobs,
    enabled: service.enabled ?? true
  };
}

function isValidProfileName(name: string): boolean {
  return /^[A-Za-z0-9._-]+$/.test(name);
}

function updateProfilesInConfig(
  existingRaw: DevStartupConfig | undefined,
  profiles: Record<string, ConfigService[]>,
  activeProfile?: string
): DevStartupConfig {
  return {
    ...existingRaw,
    activeProfile,
    profiles
  };
}

function readUiSettings(): {
  statusBar: StatusBarVisibility;
  showUtilitiesSection: boolean;
  serviceDetailsMode: "compact" | "detailed";
} {
  const config = vscode.workspace.getConfiguration();
  const statusBarEnabled = config.get<boolean>("projectStartup.ui.showStatusBarButtons", true);
  const rawMode = config.get<string>("projectStartup.ui.serviceDetailsMode", "compact");
  const serviceDetailsMode = rawMode === "detailed" ? "detailed" : "compact";
  return {
    statusBar: {
      enabled: statusBarEnabled,
      showStartAll: config.get<boolean>("projectStartup.ui.showStartAllButton", true),
      showStopAll: config.get<boolean>("projectStartup.ui.showStopAllButton", true),
      showRefresh: config.get<boolean>("projectStartup.ui.showRefreshButton", true),
      showProfile: config.get<boolean>("projectStartup.ui.showProfileIndicator", true)
    },
    showUtilitiesSection: config.get<boolean>("projectStartup.ui.showUtilitiesSection", true),
    serviceDetailsMode
  };
}

interface UiToggleOption {
  key: string;
  label: string;
  description: string;
  kind?: "boolean" | "enum";
}

const UI_TOGGLE_OPTIONS: UiToggleOption[] = [
  {
    key: "projectStartup.ui.showStatusBarButtons",
    label: "Status bar controls",
    description: "Show/hide all Project Startup status bar buttons"
  },
  {
    key: "projectStartup.ui.showStartAllButton",
    label: "Start All button",
    description: "Show/hide Start All status bar button"
  },
  {
    key: "projectStartup.ui.showStopAllButton",
    label: "Stop All button",
    description: "Show/hide Stop All status bar button"
  },
  {
    key: "projectStartup.ui.showRefreshButton",
    label: "Refresh button",
    description: "Show/hide Refresh status bar button"
  },
  {
    key: "projectStartup.ui.showProfileIndicator",
    label: "Profile indicator",
    description: "Show/hide profile indicator in status bar"
  },
  {
    key: "projectStartup.ui.showUtilitiesSection",
    label: "Utilities section",
    description: "Show/hide Utilities group in sidebar"
  },
  {
    key: "projectStartup.ui.serviceDetailsMode",
    label: "Service details mode",
    description: "Switch between compact and detailed service rows",
    kind: "enum"
  }
];

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    return;
  }

  const scanner = new ProjectScanner();
  const detector = new ProjectDetector();
  const extractor = new CommandExtractor();
  const configLoader = new ConfigLoader();
  const terminalRunner = new TerminalRunner();
  const serviceManager = new ServiceManager(context, terminalRunner);
  const treeProvider = new ProjectTreeViewProvider();
  const statusBarControls = new StatusBarControls();
  const treeView = vscode.window.createTreeView("projectStartupView", { treeDataProvider: treeProvider });
  context.subscriptions.push(treeView, terminalRunner, serviceManager, statusBarControls);

  const applyUiSettings = (): void => {
    const ui = readUiSettings();
    statusBarControls.applyVisibility(ui.statusBar);
    treeProvider.setShowUtilitiesSection(ui.showUtilitiesSection);
    treeProvider.setServiceDetailsMode(ui.serviceDetailsMode);
  };

  applyUiSettings();

  serviceManager.onDidChangeServices((services) => {
    treeProvider.setServices(services);
  });

  const configuredDefaultProfile = vscode.workspace
    .getConfiguration()
    .get<string>("projectStartup.defaultProfile")
    ?.trim();
  let activeProfile = context.workspaceState.get<string>(ACTIVE_PROFILE_KEY) ?? configuredDefaultProfile;
  let currentServices: ServiceDefinition[] = [];

  const getEnabledServices = (): ServiceDefinition[] => currentServices.filter((service) => service.enabled !== false);

  const detectPreferredInstallCommand = async (servicePath: string): Promise<string> => {
    const hasFile = async (relativePath: string): Promise<boolean> => {
      try {
        await vscode.workspace.fs.stat(vscode.Uri.file(path.join(servicePath, relativePath)));
        return true;
      } catch {
        return false;
      }
    };
    if (await hasFile("pnpm-lock.yaml")) {
      return "pnpm i";
    }
    if (await hasFile("yarn.lock")) {
      return "yarn install";
    }
    if (await hasFile("bun.lockb")) {
      return "bun install";
    }
    return "npm i";
  };

  const ensureNodeInstallReady = async (service: ServiceDefinition): Promise<boolean> => {
    const workspaceRoot = workspaceFolders[0].uri.fsPath;
    const servicePath = service.path === "." ? workspaceRoot : path.join(workspaceRoot, service.path);
    const packageJsonUri = vscode.Uri.file(path.join(servicePath, "package.json"));
    const nodeModulesUri = vscode.Uri.file(path.join(servicePath, "node_modules"));
    try {
      await vscode.workspace.fs.stat(packageJsonUri);
    } catch {
      return true;
    }
    try {
      await vscode.workspace.fs.stat(nodeModulesUri);
      return true;
    } catch {
      const installCommand = await detectPreferredInstallCommand(servicePath);
      const action = await vscode.window.showWarningMessage(
        `Dependencies are missing for "${service.name}". Run ${installCommand} first?`,
        "Run Install",
        "Skip"
      );
      if (action === "Run Install") {
        terminalRunner.runOneOff(`${service.name}: install`, servicePath, installCommand);
        return false;
      }
      return action === "Skip";
    }
  };

  const getServiceAbsolutePath = (service: ServiceDefinition): string => {
    const workspaceRoot = workspaceFolders[0].uri.fsPath;
    return service.path === "." ? workspaceRoot : path.join(workspaceRoot, service.path);
  };

  const diagnoseService = async (service: ServiceDefinition): Promise<string[]> => {
    const issues: string[] = [];
    const absPath = getServiceAbsolutePath(service);
    try {
      await vscode.workspace.fs.stat(vscode.Uri.file(absPath));
    } catch {
      issues.push(`Missing folder: ${service.path}`);
      return issues;
    }
    if (!service.command.trim()) {
      issues.push("No startup command configured");
    }
    try {
      await vscode.workspace.fs.stat(vscode.Uri.file(path.join(absPath, "package.json")));
      try {
        await vscode.workspace.fs.stat(vscode.Uri.file(path.join(absPath, "node_modules")));
      } catch {
        issues.push("Node dependencies not installed (node_modules missing)");
      }
    } catch {
      return issues;
    }
    return issues;
  };

  const runDeveloperDiagnostics = async (): Promise<void> => {
    if (!currentServices.length) {
      vscode.window.showInformationMessage("No services detected. Use 'Project Startup: Add Service' or refresh detection.");
      return;
    }
    const reportLines: string[] = ["Project Startup Assistant - Diagnostics", ""];
    const actionable: Array<{ service: ServiceDefinition; issue: string }> = [];
    for (const service of currentServices) {
      const issues = await diagnoseService(service);
      if (!issues.length) {
        reportLines.push(`- [OK] ${service.name}: ready`);
        continue;
      }
      reportLines.push(`- [WARN] ${service.name}`);
      for (const issue of issues) {
        reportLines.push(`  - ${issue}`);
        actionable.push({ service, issue });
      }
    }

    const doc = await vscode.workspace.openTextDocument({
      content: `${reportLines.join("\n")}\n`,
      language: "markdown"
    });
    await vscode.window.showTextDocument(doc, { preview: false });

    if (!actionable.length) {
      return;
    }
    const first = actionable[0];
    const picks = ["Open Service Folder", "Edit Service Command"];
    if (first.issue.includes("dependencies")) {
      picks.unshift("Run Install");
    }
    const action = await vscode.window.showQuickPick(picks, {
      placeHolder: `Fix "${first.service.name}": ${first.issue}`
    });
    if (!action) {
      return;
    }
    if (action === "Open Service Folder") {
      const uri = vscode.Uri.file(getServiceAbsolutePath(first.service));
      await vscode.commands.executeCommand("revealFileInOS", uri);
      return;
    }
    if (action === "Edit Service Command") {
      await vscode.commands.executeCommand("projectStartup.editServiceCommand", first.service);
      return;
    }
    if (action === "Run Install") {
      const install = await detectPreferredInstallCommand(getServiceAbsolutePath(first.service));
      terminalRunner.runOneOff(`${first.service.name}: install`, getServiceAbsolutePath(first.service), install);
    }
  };

  const openDeveloperAssistant = async (): Promise<void> => {
    const action = await vscode.window.showQuickPick(
      [
        "Show Identified Projects",
        "Select Services To Run",
        "Add Service",
        "Run Diagnostics And Suggested Fixes",
        "Refresh Services"
      ],
      { placeHolder: "Project Startup Developer Assistant" }
    );
    if (!action) {
      return;
    }
    if (action === "Show Identified Projects") {
      await vscode.commands.executeCommand("projectStartup.showDetectedProjects");
      return;
    }
    if (action === "Select Services To Run") {
      await vscode.commands.executeCommand("projectStartup.selectServices");
      return;
    }
    if (action === "Add Service") {
      await vscode.commands.executeCommand("projectStartup.addService");
      return;
    }
    if (action === "Run Diagnostics And Suggested Fixes") {
      await runDeveloperDiagnostics();
      return;
    }
    await vscode.commands.executeCommand("projectStartup.refresh");
  };

  const registerSafeCommand = <T extends unknown[]>(
    command: string,
    handler: (...args: T) => Promise<void> | void
  ): vscode.Disposable =>
    vscode.commands.registerCommand(command, async (...args: T) => {
      try {
        await handler(...args);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const action = await vscode.window.showErrorMessage(
          `Project Startup command failed (${command}): ${message}`,
          "Open Developer Assistant",
          "Retry"
        );
        if (action === "Open Developer Assistant") {
          await openDeveloperAssistant();
        } else if (action === "Retry") {
          await handler(...args);
        }
      }
    });

  const resolveServiceFromArg = async (arg?: ServiceDefinition): Promise<ServiceDefinition | undefined> => {
    if (arg?.id) {
      return currentServices.find((service) => service.id === arg.id);
    }
    if (!currentServices.length) {
      vscode.window.showInformationMessage("No services detected.");
      return undefined;
    }
    const picked = await vscode.window.showQuickPick(
      currentServices.map((service) => ({
        label: service.name,
        description: `${service.path} • ${service.status}`,
        service
      })),
      { placeHolder: "Select a service" }
    );
    return picked?.service;
  };

  const refreshServices = async (showMessage = false): Promise<void> => {
    const workspaceFolder = workspaceFolders[0];
    const configResult = await configLoader.load(workspaceFolder);
    for (const warning of configResult.warnings) {
      vscode.window.showWarningMessage(warning);
    }

    let selectedProfileName = activeProfile;
    if (configResult.exists) {
      const fromProfile = configLoader.resolveServicesFromProfile(configResult, selectedProfileName);
      selectedProfileName = fromProfile.selectedProfile;
      currentServices = fromProfile.services.map(serviceFromConfig);
      statusBarControls.setProfile(selectedProfileName ?? (fromProfile.services.length ? "default" : "empty"));
    } else {
      const scanResult = await scanner.scanWorkspace(workspaceFolder);
      const candidates = detector.detectServices(scanResult);
      const extractedById: Record<string, ExtractedCommands> = {};
      for (const candidate of candidates) {
        const extracted = await extractor.extract(candidate);
        extractedById[candidate.id] = extracted;
      }
      currentServices = buildDetectedServices(candidates, extractedById);
      const selectedServiceIds = context.workspaceState.get<string[]>(SELECTED_SERVICE_IDS_KEY) ?? [];
      if (selectedServiceIds.length) {
        const selectedSet = new Set(selectedServiceIds);
        currentServices = currentServices.map((service) => ({
          ...service,
          enabled: selectedSet.has(service.id)
        }));
      }
      statusBarControls.setProfile("Auto");
    }

    currentServices = preserveRuntimeState(
      currentServices,
      serviceManager.getServices(),
      (serviceId) => terminalRunner.hasTerminal(serviceId)
    );

    serviceManager.setServices(currentServices);
    treeProvider.setServices(serviceManager.getServices());
    applyUiSettings();

    if (showMessage) {
      vscode.window.showInformationMessage(`Project Startup refreshed: ${currentServices.length} services.`);
    } else if (!currentServices.length) {
      vscode.window.showInformationMessage("Project Startup: no services detected.");
    }
  };

  context.subscriptions.push(
    registerSafeCommand("projectStartup.startService", async (arg?: ServiceDefinition) => {
      const service = await resolveServiceFromArg(arg);
      if (!service) {
        return;
      }
      if (service.enabled === false) {
        const action = await vscode.window.showInformationMessage(
          `"${service.name}" is unchecked for startup.`,
          "Enable And Start",
          "Cancel"
        );
        if (action !== "Enable And Start") {
          return;
        }
        service.enabled = true;
      }
      const ready = await ensureNodeInstallReady(service);
      if (!ready) {
        return;
      }
      await serviceManager.startService(service.id);
    }),
    registerSafeCommand("projectStartup.stopService", async (arg?: ServiceDefinition) => {
      const service = await resolveServiceFromArg(arg);
      if (!service) {
        return;
      }
      serviceManager.stopService(service.id);
    }),
    registerSafeCommand("projectStartup.restartService", async (arg?: ServiceDefinition) => {
      const service = await resolveServiceFromArg(arg);
      if (!service) {
        return;
      }
      await serviceManager.restartService(service.id);
    }),
    registerSafeCommand("projectStartup.startAll", async () => {
      const enabledServices = getEnabledServices();
      if (!enabledServices.length) {
        vscode.window.showInformationMessage("No checked services to start. Use 'Project Startup: Select Services To Run'.");
        return;
      }
      for (const service of enabledServices) {
        const ready = await ensureNodeInstallReady(service);
        if (!ready) {
          continue;
        }
        await serviceManager.startService(service.id);
      }
    }),
    registerSafeCommand("projectStartup.stopAll", () => {
      serviceManager.stopAll();
    }),
    registerSafeCommand("projectStartup.restartAll", async () => {
      await serviceManager.restartAll();
    }),
    registerSafeCommand("projectStartup.refresh", async () => {
      scanner.clearCache();
      await refreshServices(true);
    }),
    registerSafeCommand("projectStartup.openServiceTerminal", async (arg?: ServiceDefinition) => {
      const service = await resolveServiceFromArg(arg);
      if (!service) {
        return;
      }
      serviceManager.showServiceTerminal(service.id);
    }),
    registerSafeCommand("projectStartup.runTests", async (arg?: ServiceDefinition) => {
      if (arg?.id) {
        serviceManager.runUtilityForService(arg.id, "test");
        return;
      }
      const runAll = "Run tests for all services";
      const runSingle = "Choose a service";
      const pick = await vscode.window.showQuickPick([runAll, runSingle], { placeHolder: "Run tests" });
      if (!pick) {
        return;
      }
      if (pick === runAll) {
        serviceManager.runUtilityForAll("test");
        return;
      }
      const service = await resolveServiceFromArg();
      if (service) {
        serviceManager.runUtilityForService(service.id, "test");
      }
    }),
    registerSafeCommand("projectStartup.buildProject", async (arg?: ServiceDefinition) => {
      if (arg?.id) {
        serviceManager.runUtilityForService(arg.id, "build");
        return;
      }
      const runAll = "Build all services";
      const runSingle = "Choose a service";
      const pick = await vscode.window.showQuickPick([runAll, runSingle], { placeHolder: "Build project" });
      if (!pick) {
        return;
      }
      if (pick === runAll) {
        serviceManager.runUtilityForAll("build");
        return;
      }
      const service = await resolveServiceFromArg();
      if (service) {
        serviceManager.runUtilityForService(service.id, "build");
      }
    }),
    registerSafeCommand("projectStartup.switchProfile", async () => {
      const workspaceFolder = workspaceFolders[0];
      const configResult = await configLoader.load(workspaceFolder);
      const profileNames = Object.keys(configResult.profiles ?? {});
      if (!profileNames.length) {
        vscode.window.showInformationMessage("No profiles found in .devstartup.json.");
        return;
      }
      const picked = await vscode.window.showQuickPick(profileNames, {
        placeHolder: "Select startup profile"
      });
      if (!picked) {
        return;
      }
      activeProfile = picked;
      await context.workspaceState.update(ACTIVE_PROFILE_KEY, picked);
      await refreshServices(true);
    }),
    registerSafeCommand("projectStartup.manageProfiles", async () => {
      const workspaceFolder = workspaceFolders[0];
      const action = await vscode.window.showQuickPick(
        ["Switch active profile", "Create profile from current services", "Duplicate active profile"],
        { placeHolder: "Profile actions" }
      );
      if (!action) {
        return;
      }

      const configResult = await configLoader.load(workspaceFolder);
      const profiles = { ...(configResult.profiles ?? {}) };

      if (action === "Switch active profile") {
        const profileNames = Object.keys(profiles);
        if (!profileNames.length) {
          vscode.window.showInformationMessage("No profiles available. Create one first.");
          return;
        }
        const picked = await vscode.window.showQuickPick(profileNames, {
          placeHolder: "Select profile"
        });
        if (!picked) {
          return;
        }
        activeProfile = picked;
        await context.workspaceState.update(ACTIVE_PROFILE_KEY, picked);
        await refreshServices(true);
        return;
      }

      if (action === "Create profile from current services") {
        if (!currentServices.length) {
          vscode.window.showInformationMessage("No detected services to save as profile.");
          return;
        }
        const profileName = await vscode.window.showInputBox({
          title: "Create Profile",
          prompt: "Profile name",
          validateInput: (value) => {
            if (!value.trim()) {
              return "Profile name is required.";
            }
            if (!isValidProfileName(value.trim())) {
              return "Use only letters, numbers, dot, dash, or underscore.";
            }
            if (profiles[value.trim()]) {
              return "A profile with this name already exists.";
            }
            return undefined;
          }
        });
        if (!profileName) {
          return;
        }
        profiles[profileName.trim()] = currentServices.map(toConfigService);
        const updated = updateProfilesInConfig(configResult.raw, profiles, profileName.trim());
        await configLoader.save(workspaceFolder, updated);
        activeProfile = profileName.trim();
        await context.workspaceState.update(ACTIVE_PROFILE_KEY, activeProfile);
        await refreshServices(true);
        vscode.window.showInformationMessage(`Profile "${activeProfile}" created.`);
        return;
      }

      if (!activeProfile || !profiles[activeProfile]) {
        vscode.window.showInformationMessage("No active profile to duplicate.");
        return;
      }
      const profileName = await vscode.window.showInputBox({
        title: "Duplicate Profile",
        prompt: `New name for duplicate of "${activeProfile}"`,
        validateInput: (value) => {
          if (!value.trim()) {
            return "Profile name is required.";
          }
          if (!isValidProfileName(value.trim())) {
            return "Use only letters, numbers, dot, dash, or underscore.";
          }
          if (profiles[value.trim()]) {
            return "A profile with this name already exists.";
          }
          return undefined;
        }
      });
      if (!profileName) {
        return;
      }
      const sourceProfile = activeProfile;
      profiles[profileName.trim()] = [...profiles[activeProfile]];
      const updated = updateProfilesInConfig(configResult.raw, profiles, profileName.trim());
      await configLoader.save(workspaceFolder, updated);
      activeProfile = profileName.trim();
      await context.workspaceState.update(ACTIVE_PROFILE_KEY, activeProfile);
      await refreshServices(true);
      vscode.window.showInformationMessage(`Profile "${activeProfile}" created from "${sourceProfile}".`);
    }),
    registerSafeCommand("projectStartup.restartStopped", async () => {
      await serviceManager.restartStopped();
    }),
    registerSafeCommand("projectStartup.customizeUi", async () => {
      while (true) {
        const config = vscode.workspace.getConfiguration();
        const items = UI_TOGGLE_OPTIONS.map((option) => {
          if (option.kind === "enum") {
            const currentMode = config.get<string>(option.key, "compact");
            return {
              label: `$(list-selection) ${option.label}: ${currentMode}`,
              description: option.description,
              option,
              current: currentMode
            };
          }
          const current = config.get<boolean>(option.key, true);
          return {
            label: `${current ? "$(check)" : "$(circle-large-outline)"} ${option.label}`,
            description: option.description,
            option,
            current
          };
        });

        const picked = await vscode.window.showQuickPick(items, {
          placeHolder: "Project Startup UI: toggle a setting (Esc to close)",
          matchOnDescription: true
        });

        if (!picked) {
          break;
        }
        if (picked.option.kind === "enum") {
          const nextMode = picked.current === "compact" ? "detailed" : "compact";
          await config.update(picked.option.key, nextMode, vscode.ConfigurationTarget.Workspace);
        } else {
          await config.update(picked.option.key, !picked.current, vscode.ConfigurationTarget.Workspace);
        }
      }
    }),
    registerSafeCommand("projectStartup.editServiceCommand", async (arg?: ServiceDefinition) => {
      const service = await resolveServiceFromArg(arg);
      if (!service) {
        return;
      }
      const nextCommand = await vscode.window.showInputBox({
        title: `Edit command for ${service.name}`,
        value: service.command,
        prompt: "Run command",
        validateInput: (value) => (!value.trim() ? "Command is required." : undefined)
      });
      if (!nextCommand) {
        return;
      }

      service.command = nextCommand.trim();
      serviceManager.setServices(currentServices);
      treeProvider.setServices(serviceManager.getServices());

      const persist = await vscode.window.showQuickPick(
        ["Persist in .devstartup.json", "Apply for current session only"],
        { placeHolder: "Do you want to persist this command change?" }
      );
      if (persist === "Persist in .devstartup.json") {
        const workspaceFolder = workspaceFolders[0];
        const configResult = await configLoader.load(workspaceFolder);
        const profiles = { ...(configResult.profiles ?? {}) };
        if (activeProfile && profiles[activeProfile]) {
          profiles[activeProfile] = currentServices.map(toConfigService);
          const updated = updateProfilesInConfig(configResult.raw, profiles, activeProfile);
          await configLoader.save(workspaceFolder, updated);
        } else {
          const updated: DevStartupConfig = {
            ...(configResult.raw ?? {}),
            services: currentServices.map(toConfigService)
          };
          await configLoader.save(workspaceFolder, updated);
        }
        vscode.window.showInformationMessage(`Saved command override for "${service.name}".`);
      }
    }),
    registerSafeCommand("projectStartup.selectServices", async () => {
      if (!currentServices.length) {
        vscode.window.showInformationMessage("No services available yet. Refresh detection first.");
        return;
      }
      const picks = await vscode.window.showQuickPick(
        currentServices.map((service) => ({
          label: service.name,
          description: `${service.path} • ${service.projectType}`,
          picked: service.enabled !== false,
          service
        })),
        {
          canPickMany: true,
          placeHolder: "Select services to include in Start All"
        }
      );
      if (!picks) {
        return;
      }
      const selectedIds = new Set(picks.map((item) => item.service.id));
      currentServices = currentServices.map((service) => ({
        ...service,
        enabled: selectedIds.has(service.id)
      }));
      serviceManager.setServices(currentServices);
      treeProvider.setServices(serviceManager.getServices());

      const workspaceFolder = workspaceFolders[0];
      const configResult = await configLoader.load(workspaceFolder);
      if (configResult.exists) {
        const profiles = { ...(configResult.profiles ?? {}) };
        if (activeProfile && profiles[activeProfile]) {
          profiles[activeProfile] = currentServices.map(toConfigService);
          const updated = updateProfilesInConfig(configResult.raw, profiles, activeProfile);
          await configLoader.save(workspaceFolder, updated);
        } else {
          const updated: DevStartupConfig = {
            ...(configResult.raw ?? {}),
            services: currentServices.map(toConfigService)
          };
          await configLoader.save(workspaceFolder, updated);
        }
      } else {
        await context.workspaceState.update(SELECTED_SERVICE_IDS_KEY, [...selectedIds]);
      }
      vscode.window.showInformationMessage(`Selected ${selectedIds.size}/${currentServices.length} services for Start All.`);
    }),
    registerSafeCommand("projectStartup.toggleServiceEnabled", async (arg?: ServiceDefinition) => {
      const service = await resolveServiceFromArg(arg);
      if (!service) {
        return;
      }
      service.enabled = service.enabled === false;
      serviceManager.setServices(currentServices);
      treeProvider.setServices(serviceManager.getServices());
      const workspaceFolder = workspaceFolders[0];
      const configResult = await configLoader.load(workspaceFolder);
      if (configResult.exists) {
        const profiles = { ...(configResult.profiles ?? {}) };
        if (activeProfile && profiles[activeProfile]) {
          profiles[activeProfile] = currentServices.map(toConfigService);
          const updated = updateProfilesInConfig(configResult.raw, profiles, activeProfile);
          await configLoader.save(workspaceFolder, updated);
        } else {
          const updated: DevStartupConfig = {
            ...(configResult.raw ?? {}),
            services: currentServices.map(toConfigService)
          };
          await configLoader.save(workspaceFolder, updated);
        }
      } else {
        const selectedIds = currentServices.filter((item) => item.enabled !== false).map((item) => item.id);
        await context.workspaceState.update(SELECTED_SERVICE_IDS_KEY, selectedIds);
      }
    }),
    registerSafeCommand("projectStartup.addService", async () => {
      const name = await vscode.window.showInputBox({
        title: "Add Service",
        prompt: "Service name",
        validateInput: (value) => (!value.trim() ? "Service name is required." : undefined)
      });
      if (!name) {
        return;
      }
      const relativePath = await vscode.window.showInputBox({
        title: "Add Service",
        prompt: "Folder path (relative to workspace root)",
        value: ".",
        validateInput: (value) => (!value.trim() ? "Folder path is required." : undefined)
      });
      if (!relativePath) {
        return;
      }
      const command = await vscode.window.showInputBox({
        title: "Add Service",
        prompt: "Startup command",
        validateInput: (value) => (!value.trim() ? "Command is required." : undefined)
      });
      if (!command) {
        return;
      }

      const newService: ServiceDefinition = {
        id: slugify(`${relativePath}-${name}-${Date.now()}`),
        name: name.trim(),
        path: relativePath.trim(),
        command: command.trim(),
        projectType: "unknown",
        source: "config",
        status: "stopped",
        health: "unknown",
        confidence: "high",
        enabled: true
      };
      currentServices = [...currentServices, newService];
      serviceManager.setServices(currentServices);
      treeProvider.setServices(serviceManager.getServices());

      const workspaceFolder = workspaceFolders[0];
      const configResult = await configLoader.load(workspaceFolder);
      const profiles = { ...(configResult.profiles ?? {}) };
      if (activeProfile && profiles[activeProfile]) {
        profiles[activeProfile] = currentServices.map(toConfigService);
        const updated = updateProfilesInConfig(configResult.raw, profiles, activeProfile);
        await configLoader.save(workspaceFolder, updated);
      } else {
        const updated: DevStartupConfig = {
          ...(configResult.raw ?? {}),
          services: currentServices.map(toConfigService)
        };
        await configLoader.save(workspaceFolder, updated);
      }
      vscode.window.showInformationMessage(`Service "${newService.name}" added and saved.`);
    }),
    registerSafeCommand("projectStartup.showDetectedProjects", async () => {
      if (!currentServices.length) {
        vscode.window.showInformationMessage("No services detected.");
        return;
      }
      const lines = currentServices.map(
        (service) =>
          `${service.enabled === false ? "[ ]" : "[x]"} ${service.name} - ${service.projectType} - ${service.path} - ${service.command}`
      );
      const doc = await vscode.workspace.openTextDocument({
        content: `Project Startup Assistant - Identified Services\n\n${lines.join("\n")}\n`,
        language: "markdown"
      });
      await vscode.window.showTextDocument(doc, { preview: false });
    }),
    registerSafeCommand("projectStartup.developerAssistant", async () => {
      await openDeveloperAssistant();
    }),
    registerSafeCommand("projectStartup.diagnoseWorkspace", async () => {
      await runDeveloperDiagnostics();
    }),
    registerSafeCommand("projectStartup.runQaVerifyAndInstall", async () => {
      const workspaceFolder = workspaceFolders[0];
      const verifyTask = new vscode.Task(
        { type: "shell" },
        workspaceFolder,
        "Project Startup Verify",
        "project-startup-assistant",
        new vscode.ShellExecution("npm run verify", {
          cwd: workspaceFolder.uri.fsPath
        })
      );

      const execution = await vscode.tasks.executeTask(verifyTask);
      const exitCode = await new Promise<number | undefined>((resolve) => {
        const disposable = vscode.tasks.onDidEndTaskProcess((event) => {
          if (event.execution !== execution) {
            return;
          }
          disposable.dispose();
          resolve(event.exitCode);
        });
      });

      if (exitCode !== 0) {
        const action = await vscode.window.showErrorMessage(
          "Project Startup QA verify failed. Check task terminal output.",
          "Open Terminal"
        );
        if (action === "Open Terminal") {
          await vscode.commands.executeCommand("workbench.action.terminal.focus");
        }
        return;
      }

      const vsixPath = path.join(workspaceFolder.uri.fsPath, "project-startup-assistant.vsix");
      const vsixUri = vscode.Uri.file(vsixPath);
      try {
        await vscode.workspace.fs.stat(vsixUri);
      } catch {
        vscode.window.showInformationMessage("Verify succeeded, but VSIX file was not found.");
        return;
      }

      const action = await vscode.window.showInformationMessage(
        "Verify succeeded. Install the generated VSIX now?",
        "Install VSIX",
        "Reveal VSIX"
      );
      if (action === "Install VSIX") {
        await vscode.commands.executeCommand("workbench.extensions.installExtension", vsixUri);
      } else if (action === "Reveal VSIX") {
        await vscode.commands.executeCommand("revealFileInOS", vsixUri);
      }
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (!event.affectsConfiguration("projectStartup.ui")) {
        return;
      }
      applyUiSettings();
    })
  );

  context.subscriptions.push(
    vscode.window.onDidOpenTerminal((terminal) => {
      const match = currentServices.find((service) => terminal.name === service.name);
      if (match) {
        serviceManager.setStatus(match.id, "running");
      }
    })
  );

  const shellIntegrationWindow = vscode.window as unknown as {
    onDidEndTerminalShellExecution?: (
      listener: (event: { execution: { terminal: vscode.Terminal }; exitCode?: number }) => void
    ) => vscode.Disposable;
  };

  if (shellIntegrationWindow.onDidEndTerminalShellExecution) {
    context.subscriptions.push(
      shellIntegrationWindow.onDidEndTerminalShellExecution((event) => {
        const serviceId = terminalRunner.getServiceIdForTerminal(event.execution.terminal);
        if (!serviceId) {
          return;
        }
        if (typeof event.exitCode === "number" && event.exitCode !== 0) {
          serviceManager.setHealth(serviceId, "unhealthy");
          return;
        }
        serviceManager.setHealth(serviceId, "healthy");
      })
    );
  }

  await refreshServices(false);
}

export function deactivate(): void {
}
