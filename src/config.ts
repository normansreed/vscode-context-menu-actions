import * as vscode from 'vscode';
export interface Config {
  readonly enabledActions: string[];
  readonly timeout: number;
  readonly save: boolean;
  readonly close: boolean;
}
export class VsConfig implements Config {
  get enabledActions() {
    return vscode.workspace.getConfiguration().get('contextMenuActions.actions') as Array<string>;
  }

  get timeout() {
    return vscode.workspace.getConfiguration().get('contextMenuActions.actionTimeout') as number;
  }

  get save() {
    return vscode.workspace.getConfiguration().get('contextMenuActions.save') as boolean;
  }

  get close() {
    return vscode.workspace.getConfiguration().get('contextMenuActions.close') as boolean;
  }
}