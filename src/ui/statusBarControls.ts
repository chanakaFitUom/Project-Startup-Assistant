import * as vscode from "vscode";

export interface StatusBarVisibility {
  enabled: boolean;
  showStartAll: boolean;
  showStopAll: boolean;
  showRefresh: boolean;
  showProfile: boolean;
}

export class StatusBarControls implements vscode.Disposable {
  private readonly startAll: vscode.StatusBarItem;
  private readonly stopAll: vscode.StatusBarItem;
  private readonly refresh: vscode.StatusBarItem;
  private readonly profileIndicator: vscode.StatusBarItem;

  constructor() {
    this.startAll = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 110);
    this.startAll.name = "Project Startup: Start All";
    this.startAll.text = "$(play-circle) Start All";
    this.startAll.command = "projectStartup.startAll";
    this.startAll.tooltip = "Start all checked services in Project Startup.";

    this.stopAll = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 109);
    this.stopAll.name = "Project Startup: Stop All";
    this.stopAll.text = "$(circle-slash) Stop All";
    this.stopAll.command = "projectStartup.stopAll";
    this.stopAll.tooltip = "Stop all running services started by Project Startup.";

    this.refresh = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 108);
    this.refresh.name = "Project Startup: Refresh";
    this.refresh.text = "$(refresh) Refresh";
    this.refresh.command = "projectStartup.refresh";
    this.refresh.tooltip = "Rescan workspace and refresh detected project list.";

    this.profileIndicator = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 107);
    this.profileIndicator.name = "Project Startup: Active Profile";
    this.profileIndicator.command = "projectStartup.switchProfile";
    this.profileIndicator.tooltip = "Switch active startup profile used for service definitions.";
    this.profileIndicator.text = "$(symbol-enum) Profile: Auto";
  }

  public setProfile(profileName?: string): void {
    this.profileIndicator.text = `$(symbol-enum) Profile: ${profileName ?? "Auto"}`;
  }

  public applyVisibility(visibility: StatusBarVisibility): void {
    if (!visibility.enabled) {
      this.hide();
      return;
    }
    if (visibility.showStartAll) {
      this.startAll.show();
    } else {
      this.startAll.hide();
    }
    if (visibility.showStopAll) {
      this.stopAll.show();
    } else {
      this.stopAll.hide();
    }
    if (visibility.showRefresh) {
      this.refresh.show();
    } else {
      this.refresh.hide();
    }
    if (visibility.showProfile) {
      this.profileIndicator.show();
    } else {
      this.profileIndicator.hide();
    }
  }

  public hide(): void {
    this.startAll.hide();
    this.stopAll.hide();
    this.refresh.hide();
    this.profileIndicator.hide();
  }

  public dispose(): void {
    this.startAll.dispose();
    this.stopAll.dispose();
    this.refresh.dispose();
    this.profileIndicator.dispose();
  }
}
