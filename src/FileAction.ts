import { Observable } from 'rxjs';
import * as vscode from 'vscode';
export interface FileAction {
  uri: vscode.Uri;
  action: string;
  didChange$: Observable<vscode.TextDocumentChangeEvent>,
  willSave$: Observable<vscode.TextDocumentWillSaveEvent>
}
