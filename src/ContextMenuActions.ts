import * as vscode from 'vscode';
import { Config } from './config';
import { FileAction } from './FileAction';
import { filterFileTypeAction, byEventUri } from './filters';
import { of, from } from 'rxjs';
import { Events, VsCodeEvents } from './Events';
import { filter, delay, take, first, timeout } from 'rxjs/operators';
import { FileActionResult } from './FileActionResult';
import { time } from './timing';

async function runAction(action: FileAction): Promise<FileActionResult> {
  const start = time();
  const editor = await vscode.window.showTextDocument(action.uri, { preserveFocus: false, preview: true });
  const done$ = action.didChange$.pipe(timeout(500), first());
  const result = await vscode.commands.executeCommand(action.action, action.uri);
  // action.didChange$.pipe(first()).subscribe(e => {
  //   console.log('%s took %dms', action.action, time() - start);
  // });
  let didTimeout = false;
  try {
    await done$.toPromise();
  } catch (err) {
    didTimeout = true;
  }
  // await of(null).pipe(delay(10), take(1)).toPromise();
  const finish = time();
  return {
    action,
    start,
    finish,
    didTimeout
  };
}

export class ContextMenuActions extends vscode.Disposable {
  events: VsCodeEvents = new VsCodeEvents();

  constructor(private config: Config) {
    super(() => this.dispose());
  }

  getAllFileActions(uris: vscode.Uri[], actions: string[]) {
    return uris
      .sort((a, b) => {
        if (a.fsPath > b.fsPath) {
          return 1;
        } else if (b.fsPath > a.fsPath) {
          return -1;
        }
        return 0;
      })
      .reduce((acc: FileAction[], uri) => {
        const didChange$ = this.events.change$.pipe(filter(byEventUri(uri)));
        const willSave$ = this.events.save$.pipe(filter(e => e.document.uri.toString() === uri.toString()));
        const uriActions = actions
          .filter(action => filterFileTypeAction(uri, action))
          .reduce((facts: FileAction[], action: string) => {
            const fact: FileAction = {
              uri, action, didChange$, willSave$
            };
            return [...facts, fact];
          }, []);
        return [...acc, ...uriActions];
      }, []);
  }

  * fileActionGenerator(fileActions: FileAction[]): Generator<Promise<FileActionResult>, any, boolean> {
    let cancel = false;
    for (let i = 0; i < fileActions.length && !cancel; i++) {
      const action = fileActions[i];

      cancel = yield runAction(action);
    }
    return null;
  }

  dispose() {
    super.dispose();
    this.events.dispose();
  }
}