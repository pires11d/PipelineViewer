import * as vscode from 'vscode';
import { PipelineParser } from './pipelineParser';
import { PipelineViewerPanel } from './webviewPanel';

export function activate(context: vscode.ExtensionContext) {
  const command = vscode.commands.registerCommand('adoPipelineViewer.visualize', async (uri?: vscode.Uri) => {
    // Determine which file to visualize
    let filePath: string | undefined;

    if (uri) {
      filePath = uri.fsPath;
    } else if (vscode.window.activeTextEditor) {
      filePath = vscode.window.activeTextEditor.document.uri.fsPath;
    }

    if (!filePath) {
      vscode.window.showErrorMessage('No YAML file selected.');
      return;
    }

    if (!filePath.endsWith('.yml') && !filePath.endsWith('.yaml')) {
      vscode.window.showErrorMessage('Selected file is not a YAML file.');
      return;
    }

    try {
      const workspaceFolders = vscode.workspace.workspaceFolders?.map(f => f.uri.fsPath) || [];
      const config = vscode.workspace.getConfiguration('adoPipelineViewer');
      const manualMappings = config.get<Record<string, string>>('templateRepositoryMappings', {});
      const maxDepth = config.get<number>('maxTemplateDepth', 10);

      const parser = new PipelineParser(workspaceFolders, manualMappings, maxDepth);
      const model = parser.parse(filePath);

      PipelineViewerPanel.createOrShow(context.extensionUri, model);
    } catch (err: any) {
      vscode.window.showErrorMessage(`Pipeline parse error: ${err.message}`);
    }
  });

  context.subscriptions.push(command);
}

export function deactivate() {}
