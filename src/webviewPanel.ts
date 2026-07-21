import * as vscode from 'vscode';
import * as crypto from 'crypto';
import * as fs from 'fs';
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
      if (msg.command === 'exportPng' && msg.dataUrl) {
        this.savePng(msg.dataUrl, msg.fileName);
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
        // Only count real references: a `template:` value whose basename matches
        // this file. Matching on raw text produced false positives from comments
        // and from filenames embedded in longer ones (e.g. 'preprod-deploy.yml'
        // inside 'create-preprod-deploy.yml').
        if (this.referencesTemplate(text, fileName)) {
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

  // Write a base64 data URL (data:image/png;base64,...) to a user-chosen path.
  private async savePng(dataUrl: string, fileName?: string) {
    const match = /^data:image\/png;base64,(.+)$/.exec(dataUrl);
    if (!match) {
      vscode.window.showErrorMessage('Export failed: unexpected image data.');
      return;
    }
    const defaultName = (fileName || 'pipeline.png').replace(/[\\/:*?"<>|]/g, '_');
    const folders = vscode.workspace.workspaceFolders;
    const defaultUri = folders && folders.length > 0
      ? vscode.Uri.joinPath(folders[0].uri, defaultName)
      : vscode.Uri.file(defaultName);
    const target = await vscode.window.showSaveDialog({
      defaultUri,
      filters: { Images: ['png'] },
    });
    if (!target) { return; }
    try {
      fs.writeFileSync(target.fsPath, Buffer.from(match[1], 'base64'));
      const open = 'Open';
      const choice = await vscode.window.showInformationMessage(`Diagram exported to ${target.fsPath}`, open);
      if (choice === open) {
        vscode.commands.executeCommand('vscode.open', target);
      }
    } catch (err: any) {
      vscode.window.showErrorMessage(`Export failed: ${err.message}`);
    }
  }

  // True if the text has a `template:` reference whose basename matches fileName.
  // Handles quoted values and @repo-alias suffixes; ignores non-template mentions.
  private referencesTemplate(text: string, fileName: string): boolean {
    const target = fileName.toLowerCase();
    const re = /template\s*:\s*['"]?([^'"\n#]+)/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      let ref = m[1].trim();
      const at = ref.lastIndexOf('@');
      if (at > 0) { ref = ref.substring(0, at); }
      const base = ref.replace(/\\/g, '/').split('/').pop() || '';
      if (base.toLowerCase() === target) { return true; }
    }
    return false;
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
    <button id="btnExportPng" title="Export the diagram as a PNG image">Export PNG</button>
    <span class="toolbar-sep"></span>
    <label class="toolbar-label" for="themeSelect">Theme:</label>
    <select id="themeSelect" title="Color theme">
      <option value="system">System</option>
      <option value="dark">Dark</option>
      <option value="light">Light</option>
    </select>
  </div>
  <div id="inspector-bar">
    <span class="inspector-label">Inspect</span>
    <button id="btnParams" class="inspector-btn ins-params" title="Adjust run parameters and preview which stages run" disabled>Parameters</button>
    <button id="btnVariables" class="inspector-btn ins-vars" title="Show variable groups and inline variables" disabled>Variables</button>
    <button id="btnExcluded" class="inspector-btn ins-skip" title="Show or hide the skipped-stages list" disabled>Skipped</button>
  </div>
  <div id="param-panel" class="param-panel hidden"></div>
  <div id="vars-panel" class="vars-panel hidden"></div>
  <div id="callers-panel" class="callers-panel hidden"></div>
  <div id="skipped-panel" class="skipped-panel hidden"></div>
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
  return crypto.randomBytes(24).toString('base64').replace(/[^a-zA-Z0-9]/g, '');
}
