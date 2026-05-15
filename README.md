# Azure DevOps YML Pipeline Viewer with Template Support

A VS Code extension that visualizes Azure DevOps YML pipelines as interactive flowcharts with full recursive template resolution.

## Features

- Renders pipeline stages as a directed graph with orthogonal connectors
- Recursively resolves `template:` references (stages, jobs, steps) across repositories
- Expand/collapse stages to inspect jobs and individual steps
- Click template steps to navigate into their resolved templates
- Displays conditions, parameters, inputs, and `continueOnError` at every level
- Parameter evaluation for `${{ if }}` conditional blocks with `eq`/`ne`/`and`/`or`
- Color-coded stage types (Build, Deploy, Validate, Detect, Sync, etc.)
- Color-coded step types (VSBuild, NuGet, PowerShell, Bash, SonarQube, Cmd, etc.)
- Inline script expansion on click (independent of Expand/Collapse All)
- Zoom controls and responsive layout

## Troubleshooting

**Two icons showing for the command:**
You have duplicate extension folders. Check `~/.vscode/extensions/` for both `local.azure-pipeline-viewer-*` and `pires11d.azure-pipeline-viewer-*`. Remove the `local` one and reload.

**Templates not resolving:**
Ensure the template repository is cloned locally and either:
- Lives in a sibling folder to the pipeline's repo, OR
- Is explicitly mapped in `adoPipelineViewer.templateRepositoryMappings`

**Extension not activating:**
The extension only activates on `.yml` and `.yaml` files. Open one first.
