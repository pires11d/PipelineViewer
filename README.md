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
- Template type badges on headers (see [Template Type Hierarchy](#template-type-hierarchy) below)
- Conditional stages shown with dashed borders; skipped stages are dimmed
- Skipped-stage dependency collapsing (arrows route through skipped stages to the real targets)
- `continueOnError` and condition expressions displayed at every level
- Stage and job parameters displayed with expandable toggles
- Deployment job lifecycle hooks (`preDeploy`, `deploy`, `routeTraffic`, `postRouteTraffic`, `on.failure`, `on.success`) parsed and shown as labeled steps

### Template Resolution
- Recursively resolves `template:` references for stages, jobs, and steps
- Full `extends:` keyword support (resolves the extended template as the pipeline root)
- Cross-repository template support with automatic sibling-folder detection
- Workspace-recursive folder search (up to 5 levels deep, skipping `.git`, `node_modules`, etc.)
- Manual repository-to-folder mapping via `adoPipelineViewer.templateRepositoryMappings`
- Configurable max recursion depth (`adoPipelineViewer.maxTemplateDepth`, default 10)
- Parameter evaluation for `${{ if }}` conditional blocks with `eq`, `ne`, `and`, `or`
- Caller parameters forwarded and displayed when navigating into templates
- ADO conditional YAML preprocessing: handles `${{ if }}` blocks inside arrays (which standard YAML parsers reject) and deduplicates conditional keys automatically

### Toolbar
- **Expand All / Collapse All** -- toggle all stages open or closed (also expands/collapses all parameter and input toggles)
- **Zoom In (+) / Zoom Out (-) / Reset** -- scale the flowchart from 30% to 200%
- **View Source** -- jump straight to the YAML source file in the editor
- **Theme Selector** -- switch between System, Dark, and Light themes (persisted per panel)

### Navigation
- Click any template step to navigate into its resolved template in a new panel
- Click job template references to navigate into their resolved templates
- Click stage template references to navigate into their resolved templates
- Navigated template files are revealed in the Explorer sidebar
- Right-click any `.yml` or `.yaml` file in the Explorer to visualize it
- Editor title bar button on YAML files for one-click visualization

### Inline Details
- Click any step to expand its inline script content (full text shown in a scrollable code block)
- Task inputs, parameters, and display names shown per step
- Stage and job parameters shown with expandable toggles
- Variable definitions listed in the header metadata
- Caller parameters shown in the header with color-coded values (green for `true`, red for `false`, lime for strings)

---

## Template Type Hierarchy

When a file is visualized, the extension classifies it and displays a colored badge in the header. The classification follows a gradient from high-level orchestrators down to atomic step definitions:

| Badge &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; | Classification | Detected When | Description |
|:------|:---------------|:--------------|:------------|
| ![Pipeline](https://img.shields.io/badge/PIPELINE-ef5350?style=flat-square&labelColor=ef535020) | Pipeline | File has `trigger`, `pool`, or uses `extends` | The entry-point YAML file that ADO executes directly |
| ![Pipeline Template](https://img.shields.io/badge/PIPELINE_TEMPLATE-f06292?style=flat-square&labelColor=f0629220) | Pipeline Template | File defines multiple `stages:` and is referenced via `extends` | A multi-stage orchestrator template |
| ![Stage Template](https://img.shields.io/badge/STAGE_TEMPLATE-ba68c8?style=flat-square&labelColor=ba68c820) | Stage Template | File defines a single stage (or `stages:` with one entry) | A reusable stage definition |
| ![Job Template](https://img.shields.io/badge/JOB_TEMPLATE-9575cd?style=flat-square&labelColor=9575cd20) | Job Template | File defines `jobs:` without wrapping stages | A reusable job definition |
| ![Step Template](https://img.shields.io/badge/STEP_TEMPLATE-7986cb?style=flat-square&labelColor=7986cb20) | Step Template | File defines `steps:` without wrapping jobs or stages | A reusable step sequence |
| ![Task](https://img.shields.io/badge/TASK-42a5f5?style=flat-square&labelColor=42a5f520) | Resolved Task | Leaf node inside a resolved step template | A concrete ADO task (e.g., `PowerShell@2`, `VSBuild@1`) -- not a file classification |

> The color gradient flows from **warm red** (high-level pipeline) through **pink** and **purple** to **light blue** (low-level steps), making it easy to identify at a glance where you are in the template hierarchy.

---

## Stage Type Colors

Stages are automatically classified by name and display name keywords, then color-coded:

| Color | Stage Type | Keyword Triggers |
|:------|:-----------|:-----------------|
| ![Build](https://img.shields.io/badge/-4fc3f7?style=flat-square) | Build | `build`, `restore` |
| ![Deploy](https://img.shields.io/badge/-81c784?style=flat-square) | Deploy | `deploy`, `sign` |
| ![Validate](https://img.shields.io/badge/-ffb74d?style=flat-square) | Validate | `validat`, `alert` |
| ![Detect](https://img.shields.io/badge/-ff7043?style=flat-square) | Detect | `detect`, `determine`, `extract` |
| ![Sync](https://img.shields.io/badge/-a177e9?style=flat-square) | Sync | `synchroniz`, `backfill`, `drift`, `sync` |
| ![Test](https://img.shields.io/badge/-f06292?style=flat-square) | Test | `test` |
| ![NuGet](https://img.shields.io/badge/-ffca28?style=flat-square) | NuGet | `nuget` |
| ![Database](https://img.shields.io/badge/-388e3c?style=flat-square) | Database | `database` |
| ![Template](https://img.shields.io/badge/-9e9e9e?style=flat-square) | Template | Unresolved template reference |
| ![Generic](https://img.shields.io/badge/-c0866c?style=flat-square) | Generic | No keyword match (fallback) |

---

## Step Type Colors

Individual steps within jobs are color-coded by their left border:

| Color | Step Type | Description |
|:------|:----------|:------------|
| ![Template](https://img.shields.io/badge/-7986cb?style=flat-square) | Template | A `template:` reference (clickable, navigable) |
| ![Task](https://img.shields.io/badge/-42a5f5?style=flat-square) | Task | An ADO `task:` (e.g., `VSBuild@1`, `NuGetCommand@2`) |
| ![Script](https://img.shields.io/badge/-b39ddb?style=flat-square) | Script / PowerShell / Bash / Cmd | Inline script steps |
| ![SonarQube](https://img.shields.io/badge/-4caf93?style=flat-square) | SonarQube | SonarQube analysis tasks |
| ![Checkout](https://img.shields.io/badge/-81c784?style=flat-square) | Checkout | `checkout: self` or `checkout: none` |

## Configuration

| Setting | Type | Default | Description |
|---|---|---|---|
| `adoPipelineViewer.templateRepositoryMappings` | `object` | `{}` | Map repository aliases to local folder paths. Example: `{ "templates": "C:/Git/MyTemplates" }` |
| `adoPipelineViewer.maxTemplateDepth` | `number` | `10` | Maximum depth for recursive template resolution |

## Limitations

- **No runtime data.** This is a static visualizer that parses YAML files locally. It does not connect to Azure DevOps APIs or show run results.
- **Template resolution requires local clones.** Referenced template repositories must be cloned on your machine, either as sibling folders (auto-detected) or mapped via settings.
- **Limited expression evaluation.** Only `eq`, `ne`, `and`, and `or` functions inside `${{ if }}` blocks are supported. Complex runtime expressions, variable expansions, and `each` loops are not evaluated.
- **No variable group resolution.** Variable groups referenced from Azure DevOps library are not fetched or expanded.
- **No runtime variable expansion.** Pipeline variables (e.g., `$(Build.SourceBranch)`) are displayed as-is, not resolved to values.

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
