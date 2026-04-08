# Changelog

All notable changes to this project will be documented in this file.

## [0.0.3] - 2026-04-08

### Added

- Developer Assistant command for guided setup and troubleshooting flows.
- Workspace diagnostics command with actionable suggestions.
- Service selection workflow to include/exclude services from Start All.
- Manual add-service flow with persisted path/command configuration.
- Install assistant prompts for missing Node dependencies with package manager detection.
- Clearer tree tooltips, utility hints, and status bar help text.

### Changed

- Improved marketplace metadata (repository/homepage/bugs + enhanced description/keywords).
- Improved Node command extraction to avoid guessing when scripts are missing.
- Updated README with new features and release command snippets.

### Fixed

- Added safer command execution wrapper with user-friendly error handling and recovery actions.
- Tightened VSIX packaging exclusions to avoid bundling unrelated local files.

## [0.0.1] - 2026-03-14

### Added

- Initial release of Project Startup Assistant.
- Automatic project and multi-service detection.
- Smart startup command extraction across Node, Python, Java, .NET, Go, Rust, PHP, and Docker.
- Service lifecycle controls (start, stop, restart, start all, stop all).
- Sidebar TreeView with service status and utility actions.
- Status bar mini-buttons for fast control.
- `.devstartup.json` override support with profile switching.
- Optional per-service auto-restart on file changes.
