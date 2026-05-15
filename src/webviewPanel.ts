import * as vscode from 'vscode';
import { PipelineModel, PipelineParser } from './pipelineParser';

export class PipelineViewerPanel {
  public static currentPanel: PipelineViewerPanel | undefined;
  private static readonly viewType = 'adoPipelineViewer';
  private readonly panel: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];

  public static createOrShow(extensionUri: vscode.Uri, model: PipelineModel) {
    const column = vscode.ViewColumn.Active;

    if (PipelineViewerPanel.currentPanel) {
      PipelineViewerPanel.currentPanel.panel.reveal(column);
      PipelineViewerPanel.currentPanel.update(model);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      PipelineViewerPanel.viewType,
      `Pipeline: ${model.fileName}`,
      column,
      { enableScripts: true, retainContextWhenHidden: true }
    );

    PipelineViewerPanel.currentPanel = new PipelineViewerPanel(panel, model);
  }

  private constructor(panel: vscode.WebviewPanel, model: PipelineModel) {
    this.panel = panel;
    this.update(model);

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

    this.panel.webview.onDidReceiveMessage(msg => {
      if (msg.command === 'openFile' && msg.path) {
        const uri = vscode.Uri.file(msg.path);
        vscode.workspace.openTextDocument(uri).then(doc => {
          vscode.window.showTextDocument(doc);
        });
      }
      if (msg.command === 'visualizeTemplate' && msg.path) {
        try {
          const workspaceFolders = vscode.workspace.workspaceFolders?.map(f => f.uri.fsPath) || [];
          const config = vscode.workspace.getConfiguration('adoPipelineViewer');
          const manualMappings = config.get<Record<string, string>>('templateRepositoryMappings', {});
          const maxDepth = config.get<number>('maxTemplateDepth', 10);
          const parser = new PipelineParser(workspaceFolders, manualMappings, maxDepth);
          const newModel = parser.parse(msg.path);
          // Apply caller params from the navigation source (step inputs)
          if (msg.callerParams && typeof msg.callerParams === 'object') {
            newModel.callerParams = { ...newModel.callerParams, ...msg.callerParams };
          }
          const newPanel = vscode.window.createWebviewPanel(
            'adoPipelineViewer',
            `Pipeline: ${newModel.fileName}`,
            vscode.ViewColumn.Active,
            { enableScripts: true, retainContextWhenHidden: true }
          );
          // Each navigated template gets its own panel instance
          new PipelineViewerPanel(newPanel, newModel);
          // Reveal navigated file in Explorer
          const navUri = vscode.Uri.file(msg.path);
          vscode.commands.executeCommand('revealInExplorer', navUri);
        } catch (err: any) {
          vscode.window.showErrorMessage(`Template parse error: ${err.message}`);
        }
      }
    }, null, this.disposables);
  }

  private update(model: PipelineModel) {
    this.panel.title = `Pipeline: ${model.fileName}`;
    this.panel.webview.html = this.getHtml(model);
  }

  private dispose() {
    PipelineViewerPanel.currentPanel = undefined;
    this.panel.dispose();
    for (const d of this.disposables) { d.dispose(); }
    this.disposables = [];
  }

  private getHtml(model: PipelineModel): string {
    const nonce = getNonce();
    const modelJson = JSON.stringify(model)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

    return /*html*/`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}' 'unsafe-inline'; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Pipeline Viewer</title>
<style nonce="${nonce}">
  ${this.getStyles()}
</style>
</head>
<body>
<div id="app">
  <header id="header"></header>
  <div id="toolbar">
    <button id="btnExpandAll" title="Expand All">Expand All</button>
    <button id="btnCollapseAll" title="Collapse All">Collapse All</button>
    <button id="btnZoomIn" title="Zoom In">+</button>
    <button id="btnZoomOut" title="Zoom Out">-</button>
    <button id="btnResetZoom" title="Reset Zoom">Reset</button>
    <button id="btnOpenSource" title="Open YAML source file">View Source</button>
    <span class="toolbar-sep"></span>
    <label class="toolbar-label" for="themeSelect">Theme:</label>
    <select id="themeSelect" title="Color theme">
      <option value="system">System</option>
      <option value="dark">Dark</option>
      <option value="light">Light</option>
    </select>
  </div>
  <div id="canvas-wrapper">
    <div id="canvas"></div>
  </div>
</div>
<script nonce="${nonce}">
  const MODEL = JSON.parse(decodeURIComponent("${encodeURIComponent(JSON.stringify(model))}"));
  ${this.getScript()}
</script>
</body>
</html>`;
  }

  private getStyles(): string {
    return /*css*/`
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  font-family: var(--vscode-font-family, 'Segoe UI', sans-serif);
  background: var(--vscode-editor-background, #1e1e1e);
  color: var(--vscode-editor-foreground, #cccccc);
  overflow: hidden; height: 100vh;
}
#app { display: flex; flex-direction: column; height: 100vh; }

header {
  padding: 12px 20px;
  background: var(--vscode-titleBar-activeBackground, #2d2d2d);
  border-bottom: 1px solid var(--vscode-panel-border, #444);
  flex-shrink: 0;
}
header h1 { font-size: 16px; font-weight: 600; margin-bottom: 4px; display: inline; }
header .pipeline-name { font-size: 12px; font-weight: 600; opacity: 0.6; margin-bottom: 4px; }
header .meta { font-size: 12px; opacity: 0.7; display: flex; gap: 16px; flex-wrap: wrap; margin-top: 6px; }
header .meta span { display: inline-flex; align-items: center; gap: 4px; }
.label { color: var(--vscode-descriptionForeground, #888); }
.template-type-badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 700; margin-left: 10px; vertical-align: middle; letter-spacing: 0.5px; border: 1px solid; }
.template-type-badge.ttb-pipeline { background: #ef535020; color: #ef5350; border-color: #ef535040; }
.template-type-badge.ttb-pipelineTemplate { background: #f0629220; color: #f06292; border-color: #f0629240; }
.template-type-badge.ttb-stages { background: #ba68c820; color: #ba68c8; border-color: #ba68c840; }
.template-type-badge.ttb-jobs { background: #9575cd20; color: #9575cd; border-color: #9575cd40; }
.template-type-badge.ttb-steps { background: #7986cb20; color: #7986cb; border-color: #7986cb40; }

.header-params { margin-top: 6px; }
.header-params-toggle { font-size: 11px; cursor: pointer; user-select: none; color: #90a4ae; display: inline-flex; align-items: center; gap: 4px; }
.header-params-toggle:hover { color: #b0bec5; }
.param-count { opacity: 0.7; }
.header-params-grid { margin-top: 6px; display: flex; flex-direction: column; gap: 3px; max-width: 500px; }
.header-params-grid.collapsed { display: none; }
.header-param-item { display: flex; gap: 6px; align-items: baseline; font-size: 11px; padding: 2px 0; border-bottom: 1px solid #ffffff08; }
.header-param-key { color: #81d4fa; font-family: monospace; white-space: nowrap; font-weight: 500; }
.header-param-key::after { content: ":"; }
.header-param-val { font-family: monospace; word-break: break-all; }
.header-param-val.param-true { color: #81c784; }
.header-param-val.param-false { color: #f48771; }
.header-param-val.param-str { color: #c5e1a5; }

#toolbar {
  padding: 6px 20px;
  background: var(--vscode-sideBar-background, #252526);
  border-bottom: 1px solid var(--vscode-panel-border, #444);
  display: flex; gap: 8px; flex-shrink: 0;
}
#toolbar button {
  background: var(--vscode-button-secondaryBackground, #3a3d41);
  color: var(--vscode-button-secondaryForeground, #ccc);
  border: 1px solid var(--vscode-panel-border, #555);
  padding: 4px 12px; border-radius: 4px; cursor: pointer; font-size: 12px;
}
#toolbar button:hover {
  background: var(--vscode-button-secondaryHoverBackground, #505050);
}
.toolbar-sep { width: 1px; background: var(--vscode-panel-border, #444); align-self: stretch; margin: 2px 4px; }
.toolbar-label { font-size: 11px; color: var(--vscode-descriptionForeground, #888); align-self: center; }
#themeSelect {
  background: var(--vscode-dropdown-background, #3c3c3c);
  color: var(--vscode-dropdown-foreground, #ccc);
  border: 1px solid var(--vscode-dropdown-border, #555);
  border-radius: 4px; padding: 3px 6px; font-size: 12px; cursor: pointer;
}

/* ===== Theme Overrides ===== */
body[data-theme="dark"] {
  --vscode-editor-background: #1e1e1e;
  --vscode-editor-foreground: #cccccc;
  --vscode-titleBar-activeBackground: #2d2d2d;
  --vscode-sideBar-background: #252526;
  --vscode-panel-border: #444;
  --vscode-editorWidget-background: #2d2d2d;
  --vscode-button-secondaryBackground: #3a3d41;
  --vscode-button-secondaryForeground: #ccc;
  --vscode-button-secondaryHoverBackground: #505050;
  --vscode-descriptionForeground: #888;
  --vscode-focusBorder: #007acc;
  --vscode-dropdown-background: #3c3c3c;
  --vscode-dropdown-foreground: #ccc;
  --vscode-dropdown-border: #555;
}
body[data-theme="light"] {
  --vscode-editor-background: #ffffff;
  --vscode-editor-foreground: #1e1e1e;
  --vscode-titleBar-activeBackground: #f3f3f3;
  --vscode-sideBar-background: #f0f0f0;
  --vscode-panel-border: #d4d4d4;
  --vscode-editorWidget-background: #f8f8f8;
  --vscode-button-secondaryBackground: #e0e0e0;
  --vscode-button-secondaryForeground: #333;
  --vscode-button-secondaryHoverBackground: #d0d0d0;
  --vscode-descriptionForeground: #666;
  --vscode-focusBorder: #0078d4;
  --vscode-dropdown-background: #ffffff;
  --vscode-dropdown-foreground: #333;
  --vscode-dropdown-border: #ccc;
}

#canvas-wrapper { flex: 1; overflow: auto; position: relative; min-height: 0; }
#canvas {
  position: relative; padding: 40px;
  transform-origin: 0 0; min-width: max-content; min-height: max-content;
}

/* ===== Stage Nodes ===== */
.stage-node {
  position: absolute; width: 240px;
  background: var(--vscode-editorWidget-background, #2d2d2d);
  border: 1px solid var(--vscode-panel-border, #555);
  border-radius: 10px; border-left: 5px solid #ce93d8;
  cursor: pointer;
  transition: box-shadow 0.2s, width 0.3s ease, height 0.1s ease;
  overflow: hidden;
}
.stage-node:hover { box-shadow: 0 0 12px rgba(255,255,255,0.08); }
.stage-node.selected { box-shadow: 0 0 0 2px var(--vscode-focusBorder, #007acc); }
.stage-node.expanded { width: 420px; cursor: default; }

.sn-header {
  padding: 10px 12px 6px; font-size: 13px; font-weight: 600;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.sn-sub {
  padding: 0 12px 6px; font-size: 11px; opacity: 0.6;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.sn-badge {
  display: inline-block; padding: 1px 6px; border-radius: 3px;
  font-size: 10px; font-weight: 600; margin-right: 4px;
}
.sn-tag {
  display: inline-block; padding: 1px 5px; border-radius: 3px;
  font-size: 9px; font-weight: 600; margin-right: 4px; opacity: 0.85;
}
.badge-stage { background: #ba68c820; color: #ba68c8; }
.sn-footer {
  padding: 4px 12px 8px; font-size: 10px; opacity: 0.5;
  border-top: 1px solid var(--vscode-panel-border, #444);
}
.stage-node.expanded .sn-footer { display: none; }

.stage-node.conditional { border-style: dashed; }
.stage-node.unresolved { opacity: 0.6; border-style: dotted; }
.stage-node.skipped { opacity: 0.35; }
.stage-node.skipped .sn-header::after {
  content: 'SKIPPED';
  font-size: 8px; font-weight: 700; color: #888;
  background: #88888820; padding: 1px 5px; border-radius: 3px;
  margin-left: 6px; vertical-align: middle;
}

.type-build    { border-left-color: #4fc3f7; }
.type-deploy   { border-left-color: #81c784; }
.type-validate { border-left-color: #ffb74d; }
.type-detect   { border-left-color: #4dd0e1; }
.type-sync     { border-left-color: #a177e9; }
.type-template { border-left-color: #9e9e9e; }
.type-generic  { border-left-color: #c0866c; }
.type-test     { border-left-color: #f06292; }
.type-nuget    { border-left-color: #ffca28; }
.type-database { border-left-color: #4db6ac; }

.badge-build    { background: #4fc3f720; color: #4fc3f7; }
.badge-deploy   { background: #81c78420; color: #81c784; }
.badge-validate { background: #ffb74d20; color: #ffb74d; }
.badge-detect   { background: #4dd0e120; color: #4dd0e1; }
.badge-sync     { background: #b388ff20; color: #a177e9; }
.badge-template { background: #9e9e9e20; color: #9e9e9e; }
.badge-generic  { background: #d8af9320; color: #c0866c; }
.badge-test     { background: #f0629220; color: #f06292; }
.badge-nuget    { background: #ffca2820; color: #ffca28; }
.badge-database { background: #4db6ac20; color: #4db6ac; }

.cond-label {
  font-size: 10px; color: #ffb74d;
  padding: 2px 8px; background: #ffb74d15;
  border-radius: 3px; margin: 0 12px 6px; display: block;
  word-break: break-all;
}
.tpl-label {
  font-size: 10px; color: #9e9e9e;
  padding: 2px 8px; display: block; margin: 0 12px 4px;
  word-break: break-all;
}
.sn-nav {
  font-size: 10px; color: #7986cb; cursor: pointer; opacity: 0.8;
  padding: 2px 12px 4px; display: block;
}
.sn-nav:hover { opacity: 1; text-decoration: underline; }

/* ===== Expanded Inner Content ===== */
.stage-inner {
  display: none; padding: 6px 10px 10px;
  border-top: 1px solid var(--vscode-panel-border, #444);
}
.stage-node.expanded .stage-inner { display: block; }

/* Job cards inside a stage */
.job-card {
  margin: 6px 0; border-radius: 8px;
  border: 1px solid var(--vscode-panel-border, #444);
  background: var(--vscode-editor-background, #1e1e1e);
  overflow: hidden;
}
.job-header {
  padding: 7px 10px; font-size: 12px; font-weight: 600;
  display: flex; align-items: center; gap: 6px; cursor: pointer;
  background: var(--vscode-titleBar-activeBackground, #2d2d2d);
}
.job-header:hover { background: #3a3d41; }
.job-badge {
  font-size: 9px; padding: 1px 5px; border-radius: 3px; font-weight: 700;
  flex-shrink: 0;
}
.job-badge-job { background: #9575cd20; color: #9575cd; }
.job-badge-deploy { background: #9575cd20; color: #9575cd; }
.job-header .job-name {
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1;
}
.job-header .job-nav {
  font-size: 10px; color: #7986cb; opacity: 0.7; cursor: pointer; flex-shrink: 0;
}
.job-header .job-nav:hover { opacity: 1; text-decoration: underline; }
.job-meta {
  font-size: 10px; opacity: 0.5; padding: 2px 10px 4px;
}

/* Steps container inside a job (always visible when job is inside expanded stage) */
.job-steps {
  padding: 4px 6px 6px;
}

/* ===== Step Flow (inside job) ===== */
.step-flow-item {
  display: flex; align-items: stretch; margin-bottom: 0; position: relative;
}
.step-flow-connector {
  width: 20px; display: flex; flex-direction: column; align-items: center; flex-shrink: 0;
}
.step-flow-dot {
  width: 8px; height: 8px; border-radius: 50%;
  border: 2px solid #555; background: var(--vscode-editor-background, #1e1e1e);
  flex-shrink: 0; z-index: 1;
}
.step-flow-line { width: 2px; flex: 1; background: #444; }
.step-flow-card {
  flex: 1; padding: 5px 8px; margin-left: 6px;
  border-radius: 5px; font-size: 11px;
  border-left: 3px solid #555;
  background: var(--vscode-editorWidget-background, #2d2d2d);
  display: flex; flex-direction: column; gap: 1px;
  margin-top: 2px; margin-bottom: 2px;
}
.step-flow-card .sf-name { font-weight: 600; font-size: 11px; }
.step-flow-card .sf-type { font-size: 9px; opacity: 0.5; }
.step-flow-card .sf-tpl { font-size: 9px; color: #7986cb; word-break: break-all; }
.sf-type-label { font-size: 8px; font-weight: 700; padding: 1px 4px; border-radius: 2px; margin-bottom: 2px; display: inline-block; }
.sf-label-step { background: #7986cb20; color: #7986cb; }
.sf-label-task { background: #42a5f520; color: #42a5f5; }

.step-flow-card.sf-template { border-left-color: #7986cb; cursor: pointer; }
.step-flow-card.sf-template:hover { background: #7986cb15; }
.step-flow-card.sf-template .sf-nav { font-size: 9px; color: #7986cb; opacity: 0.8; }
.step-flow-card.sf-task { border-left-color: #42a5f5; }
.step-flow-card.sf-script, .step-flow-card.sf-powershell, .step-flow-card.sf-bash { border-left-color: #b39ddb; }
.step-flow-card.sf-cmd { border-left-color: #b39ddb; }
.step-flow-card.sf-sonarqube { border-left-color: #4caf93; }
.step-flow-card.sf-checkout { border-left-color: #81c784; }

.step-flow-dot.dot-template { border-color: #7986cb; background: #7986cb; }
.step-flow-dot.dot-task { border-color: #42a5f5; }
.step-flow-dot.dot-script, .step-flow-dot.dot-powershell, .step-flow-dot.dot-bash { border-color: #b39ddb; }
.step-flow-dot.dot-cmd { border-color: #b39ddb; }
.step-flow-dot.dot-sonarqube { border-color: #4caf93; }
.step-flow-dot.dot-checkout { border-color: #81c784; }

.sf-task-badge { font-size: 9px; padding: 1px 4px; border-radius: 3px; background: #42a5f520; color: #42a5f5; display: inline-block; margin-top: 1px; font-family: monospace; }
.sf-task-badge.tb-vsbuild { background: #2196f320; color: #64b5f6; }
.sf-task-badge.tb-nuget { background: #ffb74d20; color: #ffb74d; }
.sf-task-badge.tb-dotnet { background: #7c4dff20; color: #b388ff; }
.sf-task-badge.tb-powershell { background: #b39ddb20; color: #b39ddb; }
.sf-task-badge.tb-publish { background: #66bb6a20; color: #81c784; }
.sf-task-badge.tb-download { background: #26a69a20; color: #80cbc4; }
.sf-task-badge.tb-copy { background: #78909c20; color: #b0bec5; }
.sf-task-badge.tb-sonarqube { background: #4caf9320; color: #4caf93; }
.sf-task-badge.tb-cmd { background: #b39ddb20; color: #b39ddb; }
.sf-condition { font-size: 9px; color: #ffa726; margin-top: 2px; word-break: break-all; }
.sf-condition::before { content: "IF "; font-weight: 700; }
.sf-continue { font-size: 9px; color: #ef5350; margin-top: 1px; }
.sf-inputs { margin-top: 3px; font-size: 9px; }
.sf-inputs-toggle { cursor: pointer; color: #90a4ae; user-select: none; }
.sf-inputs-toggle:hover { color: #b0bec5; }
.sf-inputs-list { margin-top: 2px; padding-left: 6px; border-left: 1px solid #444; display: none; }
.sf-inputs-list.expanded { display: block; }
.sf-input-row { display: flex; gap: 4px; padding: 1px 0; line-height: 1.3; }
.sf-input-key { color: #81d4fa; font-family: monospace; white-space: nowrap; }
.sf-input-val { color: #c5e1a5; font-family: monospace; word-break: break-all; }
.sf-input-val.truncated { cursor: pointer; }
.sf-input-val.truncated:hover { text-decoration: underline; text-decoration-style: dotted; }
.sf-script-full { display: none; white-space: pre-wrap; font-family: monospace; font-size: 9px; color: #c5e1a5; background: #1a1a1a; border: 1px solid #333; border-radius: 3px; padding: 4px 6px; margin-top: 2px; max-height: 200px; overflow-y: auto; }
.sf-script-full.expanded { display: block; }

.child-flow { margin-top: 6px; padding: 6px 6px 4px 10px; border-top: 1px solid #7986cb25; border-radius: 4px; background: #7986cb06; }
.child-flow .step-flow-connector { display: none; }
.child-flow .step-flow-card { margin-left: 0; border-left-width: 2px; }
.child-flow .step-flow-item { margin-bottom: 4px; }

.direct-steps { max-width: 500px; }
.direct-jobs { max-width: 500px; }
.direct-jobs .job-card { margin-bottom: 12px; }

/* ===== SVG Connectors ===== */
svg.connectors {
  position: absolute; top: 0; left: 0;
  pointer-events: none; overflow: visible;
}
svg.connectors path {
  fill: none; stroke: var(--vscode-panel-border, #555); stroke-width: 2;
}
svg.connectors polygon { fill: var(--vscode-panel-border, #555); }
`;
  }

  private getScript(): string {
    return /*js*/`
(function() {
  try {
  var vscode = acquireVsCodeApi();
  var canvas = document.getElementById('canvas');
  var zoom = 1;
  var expandedStages = {};

  function esc(s) {
    if (s === null || s === undefined) return '';
    var d = document.createElement('div');
    d.textContent = String(s);
    return d.innerHTML;
  }

  // -- Header --
  var header = document.getElementById('header');
  var hasName = MODEL.name && MODEL.name !== 'Unnamed Pipeline';
  var metaItems = '';
  if (MODEL.templateType === 'pipeline') {
    metaItems = '<span><span class="label">Trigger:</span> ' + esc(MODEL.trigger) + '</span>'
      + '<span><span class="label">PR:</span> ' + esc(MODEL.pr) + '</span>'
      + '<span><span class="label">Pool:</span> ' + esc(MODEL.pool) + '</span>'
      + '<span><span class="label">Stages:</span> ' + MODEL.stages.length + '</span>';
  } else if (MODEL.templateType === 'pipelineTemplate' || MODEL.templateType === 'stages') {
    var totalJobs = 0, totalSteps = 0;
    MODEL.stages.forEach(function(s) {
      if (!s.jobs) return;
      totalJobs += s.jobs.length;
      s.jobs.forEach(function(j) { totalSteps += (j.steps ? j.steps.length : 0); });
    });
    metaItems = '<span><span class="label">Stages:</span> ' + MODEL.stages.length + '</span>'
      + '<span><span class="label">Jobs:</span> ' + totalJobs + '</span>'
      + '<span><span class="label">Steps:</span> ' + totalSteps + '</span>';
  } else if (MODEL.templateType === 'jobs') {
    var totalJobs = 0, totalSteps = 0;
    MODEL.stages.forEach(function(s) {
      if (!s.jobs) return;
      totalJobs += s.jobs.length;
      s.jobs.forEach(function(j) { totalSteps += (j.steps ? j.steps.length : 0); });
    });
    metaItems = '<span><span class="label">Jobs:</span> ' + totalJobs + '</span>'
      + '<span><span class="label">Steps:</span> ' + totalSteps + '</span>';
  } else {
    var totalSteps = 0;
    MODEL.stages.forEach(function(s) {
      if (!s.jobs) return;
      s.jobs.forEach(function(j) { totalSteps += (j.steps ? j.steps.length : 0); });
    });
    metaItems = '<span><span class="label">Steps:</span> ' + totalSteps + '</span>';
  }
  var typeLabels = { pipeline: 'PIPELINE', pipelineTemplate: 'PIPELINE TEMPLATE', stages: 'STAGE TEMPLATE', jobs: 'JOB TEMPLATE', steps: 'STEP TEMPLATE' };
  var typeBadge = '<span class="template-type-badge ttb-' + MODEL.templateType + '">' + typeLabels[MODEL.templateType] + '</span>';
  header.innerHTML = '<h1>' + esc(MODEL.fileName) + typeBadge + '</h1>'
    + (hasName ? '<div class="pipeline-name">' + esc(MODEL.name) + '</div>' : '')
    + '<div class="meta">' + metaItems + '</div>';

  // Show caller params if present
  if (MODEL.callerParams && Object.keys(MODEL.callerParams).length > 0) {
    var paramKeys = Object.keys(MODEL.callerParams);
    var paramsHtml = '<div class="header-params">';
    paramsHtml += '<div class="header-params-toggle" data-toggle-header-params="1">';
    paramsHtml += '<span class="label">Params</span> <span class="param-count">(' + paramKeys.length + ')</span> &#9662;</div>';
    paramsHtml += '<div class="header-params-grid collapsed">';
    paramKeys.forEach(function(k) {
      var v = MODEL.callerParams[k];
      var display = (typeof v === 'object') ? JSON.stringify(v) : String(v);
      if (display.length > 60) display = display.substring(0, 57) + '...';
      var cls = (v === true) ? 'param-true' : (v === false) ? 'param-false' : 'param-str';
      paramsHtml += '<div class="header-param-item">';
      paramsHtml += '<span class="header-param-key">' + esc(k) + '</span>';
      paramsHtml += '<span class="header-param-val ' + cls + '">' + esc(display) + '</span>';
      paramsHtml += '</div>';
    });
    paramsHtml += '</div></div>';
    header.innerHTML += paramsHtml;
  }

  // -- Layout --
  var stages = MODEL.stages;
  var stageMap = {};
  stages.forEach(function(s) { stageMap[s.name] = s; });

  function computeLayers() {
    var layers = {}, vis = {};
    function getLayer(name) {
      if (vis[name]) return layers[name] || 0;
      vis[name] = true;
      var s = stageMap[name];
      if (!s) { layers[name] = 0; return 0; }
      // Filter to only resolved dependencies (skip unresolved parameter refs and missing stages)
      // Also skip dependencies on skipped stages -- use the skipped stage's own deps instead
      var resolvedDeps = getEffectiveDeps(s);
      if (resolvedDeps.length === 0) { layers[name] = 0; return 0; }
      var mx = 0;
      resolvedDeps.forEach(function(dep) {
        mx = Math.max(mx, getLayer(dep) + 1);
      });
      layers[name] = mx; return mx;
    }

    // Get effective dependencies, collapsing through skipped stages
    function getEffectiveDeps(s) {
      var direct = (s.dependsOn || []).filter(function(d) {
        return stageMap[d] && !/\$\{\{/.test(d);
      });
      var result = [];
      for (var i = 0; i < direct.length; i++) {
        var dep = stageMap[direct[i]];
        if (dep && dep.skipped) {
          // Collapse through skipped stage: use its deps instead
          var collapsed = getEffectiveDeps(dep);
          for (var j = 0; j < collapsed.length; j++) {
            if (result.indexOf(collapsed[j]) === -1) result.push(collapsed[j]);
          }
        } else {
          if (result.indexOf(direct[i]) === -1) result.push(direct[i]);
        }
      }
      return result;
    }

    stages.forEach(function(s) { getLayer(s.name); });

    // Second pass: stages with ALL unresolved deps that got layer 0
    // should be placed after the nearest preceding stage in document order
    stages.forEach(function(s, idx) {
      if (idx === 0) return;
      var hasDeps = s.dependsOn && s.dependsOn.length > 0;
      var resolvedDeps = hasDeps ? getEffectiveDeps(s) : [];
      // If stage has deps but none resolved, place it after the highest-layer predecessor
      if (hasDeps && resolvedDeps.length === 0 && (layers[s.name] || 0) === 0) {
        var bestLayer = 0;
        for (var j = idx - 1; j >= 0; j--) {
          bestLayer = Math.max(bestLayer, (layers[stages[j].name] || 0));
        }
        layers[s.name] = bestLayer + 1;
      }
    });
    var groups = {}, maxLayer = 0;
    stages.forEach(function(s) {
      var layer = layers[s.name] || 0;
      if (!groups[layer]) groups[layer] = [];
      groups[layer].push(s);
      maxLayer = Math.max(maxLayer, layer);
    });
    return { layers: layers, groups: groups, maxLayer: maxLayer };
  }

  var lo = computeLayers();
  var NODE_W = 240, NODE_W_EXP = 420, H_GAP = 80, V_GAP = 50, PAD = 40;
  var nodePositions = {};

  // -- Build stage nodes --
  function buildStageHtml(s) {
    var h = '<div class="sn-header">';
    h += '<span class="sn-badge badge-stage">STAGE</span> ';
    h += '<span class="sn-tag badge-' + s.type + '">' + s.type.toUpperCase() + '</span> ';
    h += esc(s.displayName) + '</div>';
    if (s.name !== s.displayName) h += '<div class="sn-sub">' + esc(s.name) + '</div>';
    if (s.isConditional && s.conditionalExpr)
      h += '<div class="cond-label">if: ' + esc(s.conditionalExpr) + '</div>';
    if (s.templateRef)
      h += '<div class="tpl-label">tpl: ' + esc(s.templateRef) + '</div>';
    if (s.templateRef && s.resolvedPath) {
      var stageNavAttr = ' data-nav-path="' + esc(s.resolvedPath) + '"';
      if (s.parameters && Object.keys(s.parameters).length > 0) {
        stageNavAttr += " data-nav-params='" + esc(JSON.stringify(s.parameters)) + "'";
      }
      h += '<div class="sn-nav"' + stageNavAttr + '>Click to visualize &rarr;</div>';
    }
    // Stage parameters
    var stageParamKeys = s.parameters ? Object.keys(s.parameters) : [];
    if (stageParamKeys.length > 0) {
      h += '<div class="sf-inputs stage-params">';
      h += '<span class="sf-inputs-toggle" data-toggle-inputs="1">';
      h += 'params (' + stageParamKeys.length + ') &#9662;</span>';
      h += '<div class="sf-inputs-list">';
      stageParamKeys.forEach(function(k) {
        var val = s.parameters[k] || '';
        if (val.length > 80) val = val.substring(0, 77) + '...';
        h += '<div class="sf-input-row"><span class="sf-input-key">' + esc(k) + ':</span>';
        h += '<span class="sf-input-val">' + esc(val) + '</span></div>';
      });
      h += '</div></div>';
    }
    var stageJobs = s.jobs || [];
    h += '<div class="sn-footer">' + stageJobs.length + ' job(s), '
      + stageJobs.reduce(function(sum, j) { return sum + (j.steps ? j.steps.length : 0); }, 0)
      + ' step(s)</div>';

    // Inner content (visible when expanded)
    h += '<div class="stage-inner">';
    if (!s.jobs || s.jobs.length === 0) {
      h += '<div style="opacity:0.4;padding:10px;text-align:center;font-size:11px">No jobs resolved</div>';
    }
    (s.jobs || []).forEach(function(job, ji) {
      h += buildJobHtml(job, ji);
    });
    h += '</div>';
    return h;
  }

  function buildJobHtml(job, ji) {
    var badgeCls = job.isDeployment ? 'job-badge-deploy' : 'job-badge-job';
    var badgeText = 'JOB';
    var navAttr = '';
    if (job.templateRef && job.resolvedPath) {
      navAttr = ' data-nav-path="' + esc(job.resolvedPath) + '"';
      if (job.parameters && Object.keys(job.parameters).length > 0) {
        navAttr += " data-nav-params='" + esc(JSON.stringify(job.parameters)) + "'";
      }
    }

    var h = '<div class="job-card">';
    h += '<div class="job-header">';
    h += '<span class="job-badge ' + badgeCls + '">' + badgeText + '</span>';
    h += '<span class="job-name">' + esc(job.displayName) + '</span>';
    if (job.templateRef && job.resolvedPath) {
      h += '<span class="job-nav"' + navAttr + '>open &rarr;</span>';
    }
    h += '</div>';

    if (job.environment || job.templateRef) {
      h += '<div class="job-meta">';
      if (job.environment) h += 'Env: ' + esc(job.environment);
      if (job.environment && job.templateRef) h += ' | ';
      if (job.templateRef) h += 'Tpl: ' + esc(job.templateRef);
      h += '</div>';
    }

    // Job parameters
    var jobParamKeys = job.parameters ? Object.keys(job.parameters) : [];
    if (jobParamKeys.length > 0) {
      h += '<div class="sf-inputs job-params">';
      h += '<span class="sf-inputs-toggle" data-toggle-inputs="1">';
      h += 'params (' + jobParamKeys.length + ') &#9662;</span>';
      h += '<div class="sf-inputs-list">';
      jobParamKeys.forEach(function(k) {
        var val = job.parameters[k] || '';
        if (val.length > 80) val = val.substring(0, 77) + '...';
        h += '<div class="sf-input-row"><span class="sf-input-key">' + esc(k) + ':</span>';
        h += '<span class="sf-input-val">' + esc(val) + '</span></div>';
      });
      h += '</div></div>';
    }

    h += '<div class="job-steps">';
    h += renderStepFlow(job.steps);
    h += '</div></div>';
    return h;
  }

  function getTaskBadgeClass(name) {
    var lower = (name || '').toLowerCase();
    if (lower.indexOf('vsbuild') >= 0) return 'tb-vsbuild';
    if (lower.indexOf('nuget') >= 0) return 'tb-nuget';
    if (lower.indexOf('dotnetcore') >= 0 || lower.indexOf('usedotnet') >= 0) return 'tb-dotnet';
    if (lower.indexOf('powershell') >= 0) return 'tb-powershell';
    if (lower.indexOf('publish') >= 0) return 'tb-publish';
    if (lower.indexOf('download') >= 0) return 'tb-download';
    if (lower.indexOf('copy') >= 0) return 'tb-copy';
    if (lower.indexOf('sonar') >= 0) return 'tb-sonarqube';
    if (lower.indexOf('cmdline') >= 0 || lower.indexOf('cmd') >= 0) return 'tb-cmd';
    return '';
  }

  function renderStepFlow(steps) {
    if (!steps || steps.length === 0)
      return '<div style="opacity:0.4;padding:6px;font-size:10px">No steps</div>';
    var html = '';
    steps.forEach(function(step, i) {
      var isLast = (i === steps.length - 1);
      var navAttr = '';
      if (step.type === 'template' && step.resolvedPath) {
        navAttr = ' data-nav-path="' + esc(step.resolvedPath) + '"';
        // Store inputs as caller params for navigation
        if (step.inputs && Object.keys(step.inputs).length > 0) {
          navAttr += " data-nav-params='" + esc(JSON.stringify(step.inputs)) + "'";
        }
      }
      html += '<div class="step-flow-item">';
      html += '<div class="step-flow-connector"><div class="step-flow-dot dot-' + step.type + '"></div>';
      if (!isLast) html += '<div class="step-flow-line"></div>';
      html += '</div>';
      html += '<div class="step-flow-card sf-' + step.type + '"' + navAttr + '>';
      // Consistent type label
      var stepLabel = (step.type === 'template') ? 'STEP' : (step.type === 'checkout') ? 'STEP' : 'TASK';
      var stepLabelCls = (step.type === 'template') ? 'sf-label-step' : 'sf-label-task';
      html += '<span class="sf-type-label ' + stepLabelCls + '">' + stepLabel + '</span>';
      html += '<div class="sf-name">' + esc(step.displayName) + '</div>';
      // Task badge with version (e.g. VSBuild@1)
      if (step.type === 'task' || step.type === 'cmd' || step.type === 'sonarqube') {
        var bc = getTaskBadgeClass(step.name);
        html += '<span class="sf-task-badge ' + bc + '">' + esc(step.name) + '</span>';
      } else if (step.type !== 'template') {
        html += '<div class="sf-type">' + esc(step.type) + '</div>';
      }
      if (step.templateRef) html += '<div class="sf-tpl">template: ' + esc(step.templateRef) + '</div>';
      // Condition
      if (step.condition) {
        html += '<div class="sf-condition">' + esc(step.condition) + '</div>';
      }
      // ContinueOnError
      if (step.continueOnError) {
        html += '<div class="sf-continue">continueOnError: true</div>';
      }
      // Inputs
      var inputKeys = step.inputs ? Object.keys(step.inputs) : [];
      if (inputKeys.length > 0) {
        html += '<div class="sf-inputs">';
        html += '<span class="sf-inputs-toggle" data-toggle-inputs="1">';
        html += 'inputs (' + inputKeys.length + ') &#9662;</span>';
        html += '<div class="sf-inputs-list">';
        inputKeys.forEach(function(k) {
          var val = step.inputs[k] || '';
          var isLong = val.length > 80;
          var display = isLong ? val.substring(0, 77) + '...' : val;
          html += '<div class="sf-input-row"><span class="sf-input-key">' + esc(k) + ':</span>';
          if (isLong) {
            html += '<span class="sf-input-val truncated" data-toggle-script="1">' + esc(display) + '</span></div>';
            html += '<div class="sf-script-full">' + esc(val) + '</div>';
          } else {
            html += '<span class="sf-input-val">' + esc(display) + '</span></div>';
          }
        });
        html += '</div></div>';
      }
      if (step.type === 'template' && step.resolvedPath)
        html += '<div class="sf-nav">Click to visualize &rarr;</div>';
      // Child steps rendered INSIDE the step card for visual containment
      if (step.childSteps && step.childSteps.length > 0)
        html += '<div class="child-flow">' + renderStepFlow(step.childSteps) + '</div>';
      html += '</div></div>';
    });
    return html;
  }

  // -- Render based on template type --
  var directSteps = (MODEL.templateType === 'steps' && stages.length === 1
    && stages[0].jobs && stages[0].jobs.length === 1
    && stages[0].jobs[0].steps);
  var directJobs = (MODEL.templateType === 'jobs' && stages.length === 1
    && stages[0].jobs && stages[0].jobs.length > 0);

  if (directSteps) {
    // Step template: render steps directly without stage/job wrapper
    var stepContainer = document.createElement('div');
    stepContainer.className = 'direct-steps';
    stepContainer.innerHTML = renderStepFlow(stages[0].jobs[0].steps);
    canvas.appendChild(stepContainer);
    canvas.style.padding = '20px';
  } else if (directJobs) {
    // Job template: render jobs directly without stage wrapper
    var jobContainer = document.createElement('div');
    jobContainer.className = 'direct-jobs';
    stages[0].jobs.forEach(function(job, ji) {
      jobContainer.innerHTML += buildJobHtml(job, ji);
    });
    canvas.appendChild(jobContainer);
    canvas.style.padding = '20px';
  } else {
  // -- Render all stage nodes --
  for (var col = 0; col <= lo.maxLayer; col++) {
    var cs = lo.groups[col] || [];
    var x = PAD + col * (NODE_W + H_GAP);
    cs.forEach(function(s, ri) {
      var y = PAD + ri * 120;
      nodePositions[s.name] = { x: x, y: y, w: NODE_W, h: 70 };
      var div = document.createElement('div');
      div.className = 'stage-node type-' + s.type;
      if (s.isConditional) div.classList.add('conditional');
      if (!s.templateResolved && s.templateRef) div.classList.add('unresolved');
      if (s.skipped) div.classList.add('skipped');
      div.style.left = x + 'px';
      div.style.top = y + 'px';
      div.setAttribute('data-stage', s.name);
      div.innerHTML = buildStageHtml(s);
      canvas.appendChild(div);
    });
  }
  } // end else (stage rendering)

  // -- Wire click events (delegate on canvas) --
  canvas.addEventListener('click', function(e) {
    // Inputs toggle
    var toggle = e.target.closest('[data-toggle-inputs]');
    if (toggle) {
      e.stopPropagation();
      var list = toggle.parentElement.querySelector('.sf-inputs-list');
      if (list) list.classList.toggle('expanded');
      return;
    }
    // Script full-text expand
    var scriptToggle = e.target.closest('[data-toggle-script]');
    if (scriptToggle) {
      e.stopPropagation();
      var fullBlock = scriptToggle.parentElement.nextElementSibling;
      if (fullBlock && fullBlock.classList.contains('sf-script-full')) {
        fullBlock.classList.toggle('expanded');
      }
      return;
    }
    // Template step / stage / job navigation (highest priority - do not toggle stage)
    var navCard = e.target.closest('[data-nav-path]');
    if (navCard) {
      e.stopPropagation();
      var navParams = {};
      var rawParams = navCard.getAttribute('data-nav-params');
      if (rawParams) { try { navParams = JSON.parse(rawParams); } catch(ex) {} }
      vscode.postMessage({ command: 'visualizeTemplate', path: navCard.getAttribute('data-nav-path'), callerParams: navParams });
      return;
    }
    // Stage toggle (only if clicking the stage header area, not inner content)
    var stageEl = e.target.closest('.stage-node');
    if (stageEl) {
      // If click is inside stage-inner, do nothing (let inner events handle)
      var inner = e.target.closest('.stage-inner');
      if (inner) return;
      var name = stageEl.getAttribute('data-stage');
      if (name) toggleStage(name);
    }
  });

  function toggleStage(name) {
    var el = canvas.querySelector('[data-stage="' + CSS.escape(name) + '"]');
    if (!el) return;
    if (expandedStages[name]) {
      el.classList.remove('expanded');
      delete expandedStages[name];
    } else {
      el.classList.add('expanded');
      expandedStages[name] = true;
    }
    relayout();
  }

  function expandAll() {
    stages.forEach(function(s) {
      var el = canvas.querySelector('[data-stage="' + CSS.escape(s.name) + '"]');
      if (el) { el.classList.add('expanded'); expandedStages[s.name] = true; }
    });
    // Expand all param/input toggles too
    canvas.querySelectorAll('.sf-inputs-list').forEach(function(list) {
      list.classList.add('expanded');
    });
    // Expand header params grid
    var hpGrid = document.querySelector('.header-params-grid');
    if (hpGrid) hpGrid.classList.remove('collapsed');
    relayout();
  }

  function collapseAll() {
    stages.forEach(function(s) {
      var el = canvas.querySelector('[data-stage="' + CSS.escape(s.name) + '"]');
      if (el) el.classList.remove('expanded');
    });
    expandedStages = {};
    // Collapse all param/input toggles too
    canvas.querySelectorAll('.sf-inputs-list').forEach(function(list) {
      list.classList.remove('expanded');
    });
    // Collapse header params grid
    var hpGrid = document.querySelector('.header-params-grid');
    if (hpGrid) hpGrid.classList.add('collapsed');
    relayout();
  }

  // -- Relayout: measure heights, reposition, redraw connectors --
  function relayout() {
    // Update widths based on expanded state
    document.querySelectorAll('.stage-node').forEach(function(el) {
      var nm = el.getAttribute('data-stage');
      if (nm && nodePositions[nm]) {
        var isExp = expandedStages[nm];
        nodePositions[nm].w = isExp ? NODE_W_EXP : NODE_W;
        el.style.width = nodePositions[nm].w + 'px';
      }
    });
    // Let the DOM reflow before measuring heights
    requestAnimationFrame(function() {
      document.querySelectorAll('.stage-node').forEach(function(el) {
        var nm = el.getAttribute('data-stage');
        if (nm && nodePositions[nm]) {
          nodePositions[nm].h = el.getBoundingClientRect().height / zoom;
        }
      });
      // Compute column X positions dynamically based on widest node per column
      var colX = [];
      var xCursor = PAD;
      for (var c = 0; c <= lo.maxLayer; c++) {
        colX[c] = xCursor;
        var maxW = NODE_W;
        (lo.groups[c] || []).forEach(function(s) {
          if (nodePositions[s.name]) maxW = Math.max(maxW, nodePositions[s.name].w);
        });
        xCursor += maxW + H_GAP;
      }
      // Apply horizontal and vertical positions
      for (var c = 0; c <= lo.maxLayer; c++) {
        var cStages = lo.groups[c] || [];
        var yOff = PAD;
        cStages.forEach(function(s) {
          nodePositions[s.name].x = colX[c];
          nodePositions[s.name].y = yOff;
          yOff += nodePositions[s.name].h + V_GAP;
          var el = canvas.querySelector('[data-stage="' + CSS.escape(s.name) + '"]');
          if (el) {
            el.style.left = colX[c] + 'px';
            el.style.top = nodePositions[s.name].y + 'px';
          }
        });
      }
      renderConnectors();
    });
  }

  // Initial layout
  relayout();

  // -- Orthogonal Connectors --
  function renderConnectors() {
    var old = canvas.querySelector('svg.connectors');
    if (old) old.remove();
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.classList.add('connectors');
    var maxX = 0, maxY = 0;
    Object.values(nodePositions).forEach(function(p) {
      maxX = Math.max(maxX, p.x + p.w + PAD * 2);
      maxY = Math.max(maxY, p.y + p.h + PAD * 2);
    });
    svg.setAttribute('width', String(maxX));
    svg.setAttribute('height', String(maxY));
    svg.style.width = maxX + 'px';
    svg.style.height = maxY + 'px';

    stages.forEach(function(s) {
      var to = nodePositions[s.name];
      if (!to) return;
      var deps = (s.dependsOn || []).filter(function(d) {
        return nodePositions[d] && !/\$\{\{/.test(d);
      });
      deps.forEach(function(dn) {
        var from = nodePositions[dn];
        if (from) drawEdge(svg, from, to);
      });
    });
    canvas.insertBefore(svg, canvas.firstChild);
  }

  function drawEdge(svg, from, to) {
    var x1 = from.x + from.w, y1 = from.y + from.h / 2;
    var x2 = to.x, y2 = to.y + to.h / 2;
    var midX = (x1 + x2) / 2, r = 8, d;
    if (Math.abs(y1 - y2) < 2) {
      d = 'M ' + x1 + ' ' + y1 + ' L ' + x2 + ' ' + y2;
    } else if (y2 > y1) {
      d = 'M ' + x1 + ' ' + y1 + ' L ' + (midX - r) + ' ' + y1
        + ' Q ' + midX + ' ' + y1 + ' ' + midX + ' ' + (y1 + r)
        + ' L ' + midX + ' ' + (y2 - r)
        + ' Q ' + midX + ' ' + y2 + ' ' + (midX + r) + ' ' + y2
        + ' L ' + x2 + ' ' + y2;
    } else {
      d = 'M ' + x1 + ' ' + y1 + ' L ' + (midX - r) + ' ' + y1
        + ' Q ' + midX + ' ' + y1 + ' ' + midX + ' ' + (y1 - r)
        + ' L ' + midX + ' ' + (y2 + r)
        + ' Q ' + midX + ' ' + y2 + ' ' + (midX + r) + ' ' + y2
        + ' L ' + x2 + ' ' + y2;
    }
    var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    svg.appendChild(path);
    var a = 6;
    var poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    poly.setAttribute('points',
      (x2 - a) + ',' + (y2 - a/2) + ' ' + x2 + ',' + y2 + ' ' + (x2 - a) + ',' + (y2 + a/2));
    svg.appendChild(poly);
  }

  // -- Toolbar (always visible for all template types) --
  document.getElementById('btnExpandAll').addEventListener('click', expandAll);
  document.getElementById('btnCollapseAll').addEventListener('click', collapseAll);
  document.getElementById('btnZoomIn').addEventListener('click', function() {
    zoom = Math.min(zoom + 0.1, 2);
    canvas.style.transform = 'scale(' + zoom + ')';
  });
  document.getElementById('btnZoomOut').addEventListener('click', function() {
    zoom = Math.max(zoom - 0.1, 0.3);
    canvas.style.transform = 'scale(' + zoom + ')';
  });
  document.getElementById('btnResetZoom').addEventListener('click', function() {
    zoom = 1; canvas.style.transform = 'scale(1)';
  });
  document.getElementById('btnOpenSource').addEventListener('click', function() {
    vscode.postMessage({ command: 'openFile', path: MODEL.filePath });
  });

  // -- Theme switcher --
  var themeSelect = document.getElementById('themeSelect');
  var savedState = vscode.getState() || {};
  if (savedState.theme) {
    themeSelect.value = savedState.theme;
    if (savedState.theme !== 'system') {
      document.body.setAttribute('data-theme', savedState.theme);
    }
  }
  themeSelect.addEventListener('change', function() {
    var val = themeSelect.value;
    if (val === 'system') {
      document.body.removeAttribute('data-theme');
    } else {
      document.body.setAttribute('data-theme', val);
    }
    vscode.setState(Object.assign({}, vscode.getState() || {}, { theme: val }));
  });

  // Header params toggle
  var hpToggle = document.querySelector('[data-toggle-header-params]');
  if (hpToggle) {
    hpToggle.addEventListener('click', function() {
      var grid = hpToggle.parentElement.querySelector('.header-params-grid');
      if (grid) grid.classList.toggle('collapsed');
    });
  }

  } catch(err) {
    document.getElementById('canvas').innerHTML =
      '<div style="color:#f44;padding:40px;font-size:14px;"><b>Render Error:</b><pre>'
      + String(err.stack || err) + '<\\/pre><\\/div>';
  }
})();`;
  }
}

function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 32; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}
