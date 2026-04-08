# Project Startup Assistant

Start multiple services in VS Code like Visual Studio startup projects: detect, select, run, and manage everything from one sidebar.

## Quick Start

1. Open a workspace folder.
2. Open **Project Startup** in the activity bar.
3. Run `Project Startup: Select Services To Run`.
4. Click **Start All**.

![ezgif-65ebe56467c8c7d0](https://github.com/user-attachments/assets/6c92aab5-fd97-49c7-a3ef-29fc10795f97)



## Why Developers Use It

- No need to remember startup commands for frontend/backend/worker services.
- Clear list of identified projects with type, path, command, and health.
- Team-friendly: save startup setup in `.devstartup.json` and share it.
- Local-first workflow (no cloud API dependency).

## Core Features

- Auto-detect services in monorepos and multi-folder workspaces.
- Identify project types from markers, scripts, and dependency hints.
- Run each service in its own VS Code terminal.
- Start only checked services (`Select Services To Run`).
- Manually add services when auto-detection misses a folder.
- Save service command/path selections for future runs.
- Install-assist prompt for Node projects when `node_modules` is missing.
- Built-in Developer Assistant for guided actions when setup is confusing.
- Workspace diagnostics with suggested fixes for common startup blockers.

## UI Hints And Icons

- Service rows show `check` (included in Start All) or `circle` (excluded).
- Health badges: `starting`, `healthy`, `unhealthy`, `stopped`.
- Hover any service to see path, command, project type, and usage hint.
- Hover utility actions (Start All, Stop All, Build, Test, Refresh) to see what each one does.
- Utility actions: Start All, Stop All, Restart All, Run Tests, Build, Refresh.
- Profiles (`switch`, `create`, `duplicate`) for different startup scenarios.
- Health states: starting, healthy, unhealthy, stopped.

## Supported Project Types

- Node.js / TypeScript / JavaScript
- Python
- Java
- .NET
- Go
- Rust
- PHP
- Ruby
- Elixir
- Docker

## Commands

- `Project Startup: Start Service`
- `Project Startup: Stop Service`
- `Project Startup: Restart Service`
- `Project Startup: Start All`
- `Project Startup: Stop All`
- `Project Startup: Restart All`
- `Project Startup: Select Services To Run`
- `Project Startup: Add Service`
- `Project Startup: Show Identified Projects`
- `Project Startup: Developer Assistant`
- `Project Startup: Diagnose Workspace`
- `Project Startup: Refresh Services`
- `Project Startup: Open Service Terminal`
- `Project Startup: Edit Service Command`
- `Project Startup: Manage Profiles`
- `Project Startup: Switch Profile`
- `Project Startup: Customize UI`
- `Project Startup: Run Tests`
- `Project Startup: Build Project`

## Keyboard Shortcuts

- `Ctrl+Alt+S` (`Cmd+Alt+S` on macOS): Start All
- `Ctrl+Alt+X` (`Cmd+Alt+X` on macOS): Stop All
- `Ctrl+Alt+R` (`Cmd+Alt+R` on macOS): Refresh Services

## Screenshots / GIFs

You can add visuals here later:

- `docs/images/overview.png`
- `docs/images/select-services.gif`
- `docs/images/start-all.gif`

## Configuration

If `.devstartup.json` exists, it becomes the source of truth for services.

```json
{
  "activeProfile": "dev",
  "services": [
    {
      "name": "backend",
      "path": "backend",
      "command": "npm run dev",
      "enabled": true,
      "testCommand": "npm run test",
      "buildCommand": "npm run build"
    },
    {
      "name": "worker",
      "path": "worker",
      "command": "npm run worker",
      "enabled": false
    }
  ]
}
```

## Publish / Marketplace Notes

- Repository: [Project-Startup-Assistant](https://github.com/chanakaFitUom/Project-Startup-Assistant.git)
- Keep README screenshots and short GIF demos updated for better marketplace conversion.
- Include concise release notes per version.

## Release Commands

```bash
npm install
npm run verify
npx vsce package --out project-startup-assistant.vsix
code --install-extension project-startup-assistant.vsix
```

Publish to Marketplace after login/setup:

```bash
npx vsce publish patch
```

## Development

```bash
npm install
npm run compile
npm run test
npm run verify
```
