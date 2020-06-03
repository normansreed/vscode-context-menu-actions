import path = require('path');
import * as vscode from 'vscode';
export function filterFileTypeAction(uri: vscode.Uri, action: string): boolean {
    const ext = path.extname(uri.fsPath);
    if (/\.ts$/.test(ext)) {
        return true;
    }
    return /format/i.test(action);
}
export const byEventUri = (uri: vscode.Uri) => (e: vscode.TextDocumentChangeEvent) => e.document.uri.toString() === uri.toString();
