import * as vscode from 'vscode';
import { PipelineModel, PipelineParser } from './pipelineParser';

export class PipelineViewerPanel {
  public static currentPanel: PipelineViewerPanel | undefined;
  private static readonly viewType = 'adoPipelineViewer';
  private readonly panel: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];

  public static createOrShow(extensionUri: vscode.Uri, model: PipelineModel) {
    const column = vscode.ViewColumn.Beside;

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
          const newPanel = vscode.window.createWebviewPanel(
            'adoPipelineViewer',
            `Pipeline: ${newModel.fileName}`,
            vscode.ViewColumn.Active,
            { enableScripts: true, retainContextWhenHidden: true }
          );
          // Each navigated template gets its own panel instance
          new PipelineViewerPanel(newPanel, newModel);
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
header h1 { font-size: 16px; font-weight: 600; margin-bottom: 4px; }
header .meta { font-size: 12px; opacity: 0.7; display: flex; gap: 16px; flex-wrap: wrap; }
header .meta span { display: inline-flex; align-items: center; gap: 4px; }
.label { color: var(--vscode-descriptionForeground, #888); }

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
.type-sync     { border-left-color: #b388ff; }
.type-template { border-left-color: #9e9e9e; }
.type-generic  { border-left-color: #ce93d8; }

.badge-build    { background: #4fc3f720; color: #4fc3f7; }
.badge-deploy   { background: #81c78420; color: #81c784; }
.badge-validate { background: #ffb74d20; color: #ffb74d; }
.badge-detect   { background: #4dd0e120; color: #4dd0e1; }
.badge-sync     { background: #b388ff20; color: #b388ff; }
.badge-template { background: #9e9e9e20; color: #9e9e9e; }
.badge-generic  { background: #ce93d820; color: #ce93d8; }

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
.job-badge-job { background: #4fc3f720; color: #4fc3f7; }
.job-badge-deploy { background: #81c78420; color: #81c784; }
.job-header .job-name {
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1;
}
.job-header .job-nav {
  font-size: 10px; color: #4fc3f7; opacity: 0.7; cursor: pointer; flex-shrink: 0;
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
  display: flex; align-items: stretch; margin-bottom: 1px; position: relative;
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
  margin-bottom: 4px;
}
.step-flow-card .sf-name { font-weight: 600; font-size: 11px; }
.step-flow-card .sf-type { font-size: 9px; opacity: 0.5; }
.step-flow-card .sf-tpl { font-size: 9px; color: #ce93d8; word-break: break-all; }

.step-flow-card.sf-template { border-left-color: #ce93d8; cursor: pointer; }
.step-flow-card.sf-template:hover { background: #ce93d815; }
.step-flow-card.sf-template .sf-nav { font-size: 9px; color: #4fc3f7; opacity: 0.8; }
.step-flow-card.sf-task { border-left-color: #4fc3f7; }
.step-flow-card.sf-script, .step-flow-card.sf-powershell, .step-flow-card.sf-bash { border-left-color: #ffb74d; }
.step-flow-card.sf-cmd { border-left-color: #90a4ae; }
.step-flow-card.sf-sonarqube { border-left-color: #4caf93; }
.step-flow-card.sf-checkout { border-left-color: #81c784; }

.step-flow-dot.dot-template { border-color: #ce93d8; background: #ce93d8; }
.step-flow-dot.dot-task { border-color: #4fc3f7; }
.step-flow-dot.dot-script, .step-flow-dot.dot-powershell, .step-flow-dot.dot-bash { border-color: #ffb74d; }
.step-flow-dot.dot-cmd { border-color: #90a4ae; }
.step-flow-dot.dot-sonarqube { border-color: #4caf93; }
.step-flow-dot.dot-checkout { border-color: #81c784; }

.child-flow { margin-left: 22px; border-left: 1px dashed #444; padding-left: 3px; }

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
  header.innerHTML = '<h1>' + esc(MODEL.name) + '</h1>'
    + '<div class="meta">'
    + '<span><span class="label">Source:</span> ' + esc(MODEL.fileName) + '</span>'
    + '<span><span class="label">Trigger:</span> ' + esc(MODEL.trigger) + '</span>'
    + '<span><span class="label">PR:</span> ' + esc(MODEL.pr) + '</span>'
    + '<span><span class="label">Pool:</span> ' + esc(MODEL.pool) + '</span>'
    + '<span><span class="label">Stages:</span> ' + MODEL.stages.length + '</span>'
    + '</div>';

  // Show caller params if present
  if (MODEL.callerParams && Object.keys(MODEL.callerParams).length > 0) {
    var paramsHtml = '<div class="meta" style="margin-top:4px">';
    paramsHtml += '<span class="label">Params:</span> ';
    Object.keys(MODEL.callerParams).forEach(function(k, i) {
      if (i > 0) paramsHtml += ' | ';
      var v = MODEL.callerParams[k];
      var cls = (v === true) ? 'color:#81c784' : (v === false) ? 'color:#f48771' : '';
      paramsHtml += '<span>' + esc(k) + '=<span style="' + cls + '">' + esc(String(v)) + '</span></span>';
    });
    paramsHtml += '</div>';
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
      // Filter to only resolved dependencies (skip unresolved parameter refs)
      var resolvedDeps = s.dependsOn.filter(function(d) {
        return stageMap[d] && !/\$\{\{/.test(d);
      });
      if (resolvedDeps.length === 0) { layers[name] = 0; return 0; }
      var mx = 0;
      resolvedDeps.forEach(function(dep) {
        mx = Math.max(mx, getLayer(dep) + 1);
      });
      layers[name] = mx; return mx;
    }
    stages.forEach(function(s) { getLayer(s.name); });
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
  var NODE_W = 240, NODE_W_EXP = 420, H_GAP = 80, V_GAP = 30, PAD = 40;
  var nodePositions = {};

  // -- Build stage nodes --
  function buildStageHtml(s) {
    var h = '<div class="sn-header"><span class="sn-badge badge-' + s.type + '">'
      + s.type.toUpperCase() + '</span> ' + esc(s.displayName) + '</div>';
    if (s.name !== s.displayName) h += '<div class="sn-sub">' + esc(s.name) + '</div>';
    if (s.isConditional && s.conditionalExpr)
      h += '<div class="cond-label">if: ' + esc(s.conditionalExpr) + '</div>';
    if (s.templateRef)
      h += '<div class="tpl-label">tpl: ' + esc(s.templateRef) + '</div>';
    h += '<div class="sn-footer">' + s.jobs.length + ' job(s), '
      + s.jobs.reduce(function(sum, j) { return sum + j.steps.length; }, 0)
      + ' step(s)</div>';

    // Inner content (visible when expanded)
    h += '<div class="stage-inner">';
    if (s.jobs.length === 0) {
      h += '<div style="opacity:0.4;padding:10px;text-align:center;font-size:11px">No jobs resolved</div>';
    }
    s.jobs.forEach(function(job, ji) {
      h += buildJobHtml(job, ji);
    });
    h += '</div>';
    return h;
  }

  function buildJobHtml(job, ji) {
    var badgeCls = job.isDeployment ? 'job-badge-deploy' : 'job-badge-job';
    var badgeText = 'JOB';
    var navAttr = (job.templateRef && job.resolvedPath)
      ? ' data-job-nav="' + esc(job.resolvedPath) + '"' : '';

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

    h += '<div class="job-steps">';
    h += renderStepFlow(job.steps);
    h += '</div></div>';
    return h;
  }

  function renderStepFlow(steps) {
    if (!steps || steps.length === 0)
      return '<div style="opacity:0.4;padding:6px;font-size:10px">No steps</div>';
    var html = '';
    steps.forEach(function(step, i) {
      var isLast = (i === steps.length - 1);
      var navAttr = (step.type === 'template' && step.resolvedPath)
        ? ' data-nav-path="' + esc(step.resolvedPath) + '"' : '';
      html += '<div class="step-flow-item">';
      html += '<div class="step-flow-connector"><div class="step-flow-dot dot-' + step.type + '"></div>';
      if (!isLast) html += '<div class="step-flow-line"></div>';
      html += '</div>';
      html += '<div class="step-flow-card sf-' + step.type + '"' + navAttr + '>';
      html += '<div class="sf-name">' + esc(step.displayName) + '</div>';
      html += '<div class="sf-type">' + esc(step.type) + '</div>';
      if (step.templateRef) html += '<div class="sf-tpl">' + esc(step.templateRef) + '</div>';
      if (step.type === 'template' && step.resolvedPath)
        html += '<div class="sf-nav">Click to visualize &rarr;</div>';
      html += '</div></div>';
      if (step.childSteps && step.childSteps.length > 0)
        html += '<div class="child-flow">' + renderStepFlow(step.childSteps) + '</div>';
    });
    return html;
  }

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

  // -- Wire click events (delegate on canvas) --
  canvas.addEventListener('click', function(e) {
    // Template step navigation (highest priority - do not toggle stage)
    var navCard = e.target.closest('[data-nav-path]');
    if (navCard) {
      e.stopPropagation();
      vscode.postMessage({ command: 'visualizeTemplate', path: navCard.getAttribute('data-nav-path') });
      return;
    }
    // Job navigation
    var jobNav = e.target.closest('[data-job-nav]');
    if (jobNav) {
      e.stopPropagation();
      vscode.postMessage({ command: 'visualizeTemplate', path: jobNav.getAttribute('data-job-nav') });
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
    relayout();
  }

  function collapseAll() {
    stages.forEach(function(s) {
      var el = canvas.querySelector('[data-stage="' + CSS.escape(s.name) + '"]');
      if (el) el.classList.remove('expanded');
    });
    expandedStages = {};
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
      var deps = s.dependsOn.filter(function(d) {
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

  // -- Toolbar --
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
