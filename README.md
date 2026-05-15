# Azure DevOps YAML Pipeline Viewer (with Template Support)

A VS Code extension that renders Azure DevOps YAML pipelines as interactive flowcharts with full recursive template resolution.

> Tired of scrolling through nested YAML and mentally stitching together templates spread across repositories? This extension does it for you.

<!-- TODO: Add screenshots here -->

## Features

### Visualization
- Renders pipeline stages as a directed graph with orthogonal connectors and dependency arrows
- Expand and collapse stages to inspect jobs and individual steps
- Color-coded **stage types** (Build, Deploy, Validate, Detect, Sync, Test, NuGet, Database, etc.)
- Color-coded **step types** (VSBuild, NuGet, PowerShell, Bash, SonarQube, Cmd, etc.)
- Template type badges on headers (Pipeline, Stages, Jobs, Steps)
- Conditional stages shown with dashed borders; skipped stages are dimmed
- `continueOnError` and condition expressions displayed at every level

### Template Resolution
- Recursively resolves `template:` references for stages, jobs, and steps
- Cross-repository template support with automatic sibling-folder detection
- Manual repository-to-folder mapping via `adoPipelineViewer.templateRepositoryMappings`
- Configurable max recursion depth (`adoPipelineViewer.maxTemplateDepth`, default 10)
- Parameter evaluation for `${{ if }}` conditional blocks with `eq`, `ne`, `and`, `or`
- Caller parameters forwarded and displayed when navigating into templates

### Toolbar
- **Expand All / Collapse All** -- toggle all stages open or closed
- **Zoom In (+) / Zoom Out (-) / Reset** -- scale the flowchart from 30% to 200%
- **View Source** -- jump straight to the YAML source file in the editor
- **Theme Selector** -- switch between System, Dark, and Light themes (persisted per panel)

### Navigation
- Click any template step to navigate into its resolved template in a new panel
- Navigated template files are revealed in the Explorer sidebar
- Right-click any `.yml` or `.yaml` file in the Explorer to visualize it
- Editor title bar button on YAML files for one-click visualization

### Inline Details
- Click any step to expand its inline script content
- Task inputs, parameters, and display names shown per step
- Variable definitions listed in the header metadata

## Configuration

| Setting | Type | Default | Description |
|---|---|---|---|
| `adoPipelineViewer.templateRepositoryMappings` | `object` | `{}` | Map repository aliases to local folder paths. Example: `{ "templates": "C:/Git/MyTemplates" }` |
| `adoPipelineViewer.maxTemplateDepth` | `number` | `10` | Maximum depth for recursive template resolution |

## Limitations

- **No runtime data.** This is a static visualizer that parses YAML files locally. It does not connect to Azure DevOps APIs or show run results.
- **Template resolution requires local clones.** Referenced template repositories must be cloned on your machine, either as sibling folders or mapped via settings.
- **Limited expression evaluation.** Only `eq`, `ne`, `and`, and `or` functions inside `${{ if }}` blocks are supported. Complex runtime expressions or variable expansions are not evaluated.
- **No variable group resolution.** Variable groups referenced from Azure DevOps library are not fetched or expanded.
- **Single-file parsing.** `extends` and multi-file pipeline composition beyond `template:` references may not be fully supported.

## Getting Started

1. Install the extension
2. Open any `.yml` or `.yaml` Azure DevOps pipeline file
3. Click the hierarchy icon in the editor title bar, or right-click the file in the Explorer and select **Visualize ADO Pipeline**
4. If your pipeline uses templates from another repository, clone that repo locally as a sibling folder -- or configure the mapping in settings

## Troubleshooting

**Two icons showing for the command:**
You have duplicate extension folders. Check `~/.vscode/extensions/` for both `local.azure-pipeline-viewer-*` and `pires11d.azure-pipeline-viewer-*`. Remove the `local` one and reload.

**Templates not resolving:**
Ensure the template repository is cloned locally and either:
- Lives in a sibling folder to the pipeline's repo, OR
- Is explicitly mapped in `adoPipelineViewer.templateRepositoryMappings`

**Extension not activating:**
The extension only activates on `.yml` and `.yaml` files. Open one first.

## License

[Apache License 2.0](LICENSE)
