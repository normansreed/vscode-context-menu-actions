import { Observable, Subject } from 'rxjs';
import * as vscode from 'vscode';

export interface Events {
  change$: Observable<vscode.TextDocumentChangeEvent>;
  diagnostics$: Observable<vscode.DiagnosticChangeEvent>;
  editor$: Observable<vscode.TextEditor>;
  save$: Observable<vscode.TextDocumentWillSaveEvent>;
  open$: Observable<vscode.TextDocument>;
}

export class VsCodeEvents
  extends vscode.Disposable
  implements Events {
  private listeners: vscode.Disposable[] = [];
  constructor() {
    super(() => this.dispose());
    this.listeners = [
      vscode.workspace.onDidChangeTextDocument(e => this.change$.next(e)),
      vscode.languages.onDidChangeDiagnostics(e => this.diagnostics$.next(e)),
      vscode.window.onDidChangeActiveTextEditor(e => this.editor$.next(e)),
      vscode.workspace.onWillSaveTextDocument(e => this.save$.next(e)),
      vscode.workspace.onDidOpenTextDocument(e => this.open$.next(e))
    ];
  }
  public readonly change$ = new Subject<vscode.TextDocumentChangeEvent>();
  public readonly diagnostics$ = new Subject<vscode.DiagnosticChangeEvent>();
  public readonly editor$ = new Subject<vscode.TextEditor>();
  public readonly save$ = new Subject<vscode.TextDocumentWillSaveEvent>();
  public readonly open$ = new Subject<vscode.TextDocument>();

  dispose() {
    super.dispose();
    this.listeners.forEach(l => l.dispose());
  }
}