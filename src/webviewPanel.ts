import * as vscode from 'vscode';
import { PipelineModel, PipelineParser } from './pipelineParser';
import { getStyles } from './webviewStyles';
import { getScript } from './webviewScript';

export class PipelineViewerPanel {
  public static currentPanel: PipelineViewerPanel | undefined;
  private static readonly viewType = 'adoPipelineViewer';
  private static allPanels: Set<PipelineViewerPanel> = new Set();
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
      `Diagram: ${model.fileName}`,
      column,
      { enableScripts: true, retainContextWhenHidden: true }
    );

    PipelineViewerPanel.currentPanel = new PipelineViewerPanel(panel, model);
  }

  private constructor(panel: vscode.WebviewPanel, model: PipelineModel) {
    this.panel = panel;
    PipelineViewerPanel.allPanels.add(this);
    this.update(model);

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

    this.panel.webview.onDidReceiveMessage(msg => {
      if (msg.command === 'openFile' && msg.path) {
        const uri = vscode.Uri.file(msg.path);
        vscode.workspace.openTextDocument(uri).then(doc => {
          vscode.window.showTextDocument(doc);
        });
      }
      if (msg.command === 'setTheme' && msg.theme) {
        const config = vscode.workspace.getConfiguration('adoPipelineViewer');
        config.update('theme', msg.theme, vscode.ConfigurationTarget.Global);
        // Broadcast to all other open panels
        for (const p of PipelineViewerPanel.allPanels) {
          if (p !== this) {
            p.panel.webview.postMessage({ command: 'applyTheme', theme: msg.theme });
          }
        }
      }
      if (msg.command === 'findCallers' && msg.filePath) {
        this.findCallers(msg.filePath);
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
            `Diagram: ${newModel.fileName}`,
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
    this.panel.title = `Diagram: ${model.fileName}`;
    this.panel.webview.html = this.getHtml(model);
  }

  // Search workspace for YAML files that reference the given template path
  private async findCallers(filePath: string) {
    const fileName = filePath.replace(/\\/g, '/').split('/').pop() || '';
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || !fileName) {
      this.panel.webview.postMessage({ command: 'callersResult', callers: [] });
      return;
    }
    // Search ALL workspace folders with no file limit
    let allFiles: vscode.Uri[] = [];
    for (const folder of folders) {
      const pattern = new vscode.RelativePattern(folder, '**/*.{yml,yaml}');
      const found = await vscode.workspace.findFiles(pattern, '**/node_modules/**', 5000);
      allFiles = allFiles.concat(found);
    }
    const callers: { name: string; path: string; relPath: string; project: string }[] = [];

    for (const file of allFiles) {
      if (file.fsPath === filePath) { continue; }
      try {
        const doc = await vscode.workspace.openTextDocument(file);
        const text = doc.getText();
        // Match filename preceded by a non-filename character (path sep, space, colon, etc.)
        // This prevents 'preprod-deploy.yml' from matching inside 'create-preprod-deploy.yml'
        const escaped = fileName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const pattern = new RegExp(`(?:^|[^a-zA-Z0-9_-])${escaped}`, 'm');
        if (pattern.test(text)) {
          const parts = file.fsPath.replace(/\\/g, '/').split('/');
          const name = parts.pop() || '';
          // Infer project from folder structure (repo root name)
          const relPath = vscode.workspace.asRelativePath(file, true);
          const project = relPath.split(/[/\\]/)[0] || '';
          callers.push({ name, path: file.fsPath, relPath, project });
        }
      } catch { /* skip unreadable files */ }
    }
    this.panel.webview.postMessage({ command: 'callersResult', callers });
  }

  private dispose() {
    PipelineViewerPanel.currentPanel = undefined;
    PipelineViewerPanel.allPanels.delete(this);
    this.panel.dispose();
    for (const d of this.disposables) { d.dispose(); }
    this.disposables = [];
  }

  private getHtml(model: PipelineModel): string {
    const nonce = getNonce();
    const config = vscode.workspace.getConfiguration('adoPipelineViewer');
    const globalTheme = config.get<string>('theme', 'system');
    const themeAttr = globalTheme !== 'system' ? ` data-theme="${globalTheme}"` : '';

    return /*html*/`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}' 'unsafe-inline'; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Pipeline Viewer</title>
<style nonce="${nonce}">
  ${getStyles()}
</style>
</head>
<body${themeAttr}>
<div id="app">
  <header id="header"></header>
  <div id="toolbar">
    <button id="btnExpandAll" title="Expand All">Expand All</button>
    <button id="btnCollapseAll" title="Collapse All">Collapse All</button>
    <button id="btnZoomIn" title="Zoom In">+</button>
    <button id="btnZoomOut" title="Zoom Out">-</button>
    <button id="btnResetZoom" title="Reset Zoom">Reset</button>
    <button id="btnOpenSource" title="Open YAML source file">View Source</button>
    <button id="btnCalledBy" title="Find pipelines that reference this file">Called By</button>
    <span class="toolbar-sep"></span>
    <label class="toolbar-label" for="themeSelect">Theme:</label>
    <select id="themeSelect" title="Color theme">
      <option value="system">System</option>
      <option value="dark">Dark</option>
      <option value="light">Light</option>
    </select>
  </div>
  <div id="callers-panel" class="callers-panel hidden"></div>
  <div id="canvas-wrapper">
    <div id="canvas"></div>
  </div>
</div>
<script nonce="${nonce}">
  const MODEL = JSON.parse(decodeURIComponent("${encodeURIComponent(JSON.stringify(model))}"));
  const RELATIVE_PATH = ${JSON.stringify(vscode.workspace.asRelativePath(model.filePath, false))};
  ${getScript()}
</script>
</body>
</html>`;
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
