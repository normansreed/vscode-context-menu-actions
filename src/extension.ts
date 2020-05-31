'use strict';

import * as fs from 'fs';
import * as _ from 'lodash';
import * as path from 'path';
import { AsyncSubject, Subject, of } from 'rxjs';
import { filter, first, timeout, delay } from 'rxjs/operators';
import * as vscode from 'vscode';
import { FileAction } from './FileAction';
import { ProgressUpdate } from './ProgressUpdate';

type FileActionSort = (f: FileAction) => any;

const time = () => new Date().getTime();
const elapsed = (start: number) => time() - start;

const CHOOSE_ACTION = 'extension.chooseAction';
const RUN_ACTIONS = 'extension.runActions';
const TIMEOUT = 150;

function getFileActionString(fa: FileAction) {
    let s = `${path.basename(fa.uri.fsPath)} => ${fa.action}`;
    // s += Object.keys(fa).filter(k => !['action', 'uri'].includes(k)).map(k => `${k.padStart(10)}:${_.get(fa, k)}, `);
    return s;
}

const byEventUri = (uri: vscode.Uri) => (e: vscode.TextDocumentChangeEvent) => e.document.uri.toString() === uri.toString();

const getEnabledActions = () => vscode.workspace.getConfiguration().get('contextMenuActions.actions') as Array<string>;

function filterFileTypeAction(uri: vscode.Uri, action: string): boolean {
    const ext = path.extname(uri.fsPath);
    if (/\.ts$/.test(ext)) {
        return true;
    }
    return /format/i.test(action);
}

const applyActions = async (uris: vscode.Uri[], actions = getEnabledActions()) => {

    const change$ = new Subject<vscode.TextDocumentChangeEvent>();
    const diagnostics$ = new Subject<vscode.DiagnosticChangeEvent>();
    const editor$ = new Subject<vscode.TextEditor>();
    const save$ = new Subject<vscode.TextDocumentWillSaveEvent>();

    const onDidChange = vscode.workspace.onDidChangeTextDocument(e => change$.next(e));
    const onDiagnosticsChange = vscode.languages.onDidChangeDiagnostics(e => diagnostics$.next(e));
    const onEditorChange = vscode.window.onDidChangeActiveTextEditor(e => editor$.next(e));
    const onWillSave = vscode.workspace.onWillSaveTextDocument(e => save$.next(e));

    change$.subscribe(change => {
        const active = vscode.window.activeTextEditor?.document;
        if (active && active?.fileName !== change.document.fileName) {
            console.warn('%s changed, but %s is the active tab!', path.basename(change.document.fileName), path.basename(active.fileName));
        }
        console.log('%s changed', path.basename(change.document.fileName));
    });
    editor$.subscribe(editor => {
        console.log('%s active', editor ? path.basename(editor.document.fileName) : '(none)');
    });

    let allFileActions: FileAction[] = uris.reduce((acts: any[], uri) => {
        const didChange$ = change$.pipe(filter(byEventUri(uri)));
        const willSave$ = save$.pipe(filter(e => e.document.uri.toString() === uri.toString()));
        const uriActions = actions
            .sort(action => /organize|fix/.test(action) ? -1 : 0)
            .filter(action => filterFileTypeAction(uri, action))
            .reduce((facts: any[], action: string) => {
                const fact: FileAction = {
                    uri,
                    action,
                    didChange$: didChange$,
                    willSave$: willSave$
                };
                return [...facts, fact];
            }, []);
        return [...acts, ...uriActions];
    }, []);
    const completedFileActions = [];
    const errors = [];
    const saveAfterFormat = vscode.workspace.getConfiguration().get('contextMenuActions.save') as boolean;
    const closeAfterSave = vscode.workspace.getConfiguration().get('contextMenuActions.close') as boolean;
    const increment = (1 / allFileActions.length) * 100;
    const started = time();

    const progressOptions: vscode.ProgressOptions = {
        location: vscode.ProgressLocation.Notification,
        title: `Running `,
        cancellable: true
    };

    await vscode.window.withProgress(
        progressOptions,
        async (progress: vscode.Progress<ProgressUpdate>, cancellationToken: vscode.CancellationToken) => {
            allFileActions = _.sortBy(allFileActions, fact => fact.action);
            for (let i = 0; i < allFileActions.length && !cancellationToken.isCancellationRequested; i++) {

                const fact = allFileActions[i] as FileAction;
                const filename = path.basename(fact.uri.fsPath);
                console.log(getFileActionString(fact));
                try {
                    const editor = await vscode.window.showTextDocument(fact.uri, { preserveFocus: false, preview: true });
                    await vscode.commands.executeCommand(fact.action, fact.uri);
                    try {
                        const change = await fact.didChange$.pipe(timeout(TIMEOUT), first()).toPromise();
                        console.info('  change observed: ', change);
                    } catch (err) {
                        console.log('   error thrown waiting for pipe: ', err);
                    }

                    if (saveAfterFormat) {
                        await vscode.commands.executeCommand('saveAll');
                        if (closeAfterSave) {
                            await vscode.commands.executeCommand('workbench.action.closeUnmodifiedEditors');
                        }
                    }
                    completedFileActions.push(fact);
                } catch (e) {
                    errors.push({ ...fact, error: e });
                    if (!/seems to be binary/gm.test(e.message)) {
                        vscode.window.showErrorMessage(`Error running ${fact.action} on ${fact.uri.fsPath}: ${e}`);
                    }
                    console.error(e);
                }
                const msPerAction = elapsed(started) / i;
                const remaining = allFileActions.length - i;
                const msRemaining = remaining * msPerAction;
                const timeRemaining = Math.round(msRemaining / 1000);
                progress.report({
                    increment: increment,
                    message: `${i + 1}/${allFileActions.length} ETA ~${timeRemaining}s - ${filename}`
                });
                await of(null).pipe(delay(1000 / 60)).toPromise();
            }
            const message = errors.length > 0 ? vscode.window.showWarningMessage : vscode.window.showInformationMessage;
            message(`
        Completed ${completedFileActions.length} actions 
        in ${elapsed(started)}ms
        ${errors.length > 0 ? errors.length + ' errors encountered' : ''}
        `);
        });
    onEditorChange.dispose();
    onDidChange.dispose();
    onWillSave.dispose();
};

const getRecursiveUris = async (uris: vscode.Uri[]) => {
    let outputUris: vscode.Uri[] = [];
    for (let i = 0; i < uris.length; i++) {
        if (fs.existsSync(uris[i].fsPath)) {
            if (fs.lstatSync(uris[i].fsPath).isDirectory()) {
                outputUris = [...outputUris, ...await vscode.workspace.findFiles({
                    base: uris[i].path,
                    pattern: '**/*'
                })];
            } else {
                outputUris.push(uris[i]);
            }
        }
    }
    return outputUris;
};

function resolveFiles(...args: any[]) {
    if (args.length > 0) {
        if (args[0] instanceof vscode.Uri) {
            const clicked = args[0] as vscode.Uri;
            if (args.length === 2) {
                const selected = args[1] as vscode.Uri[];
                return selected;
            }
            return [clicked];
        } else {
            const selected = args as vscode.SourceControlResourceState[];
            return selected.map(x => x.resourceUri);
        }
    }
    console.warn('No files selected for', args);
    return [];
}

async function promptAction() {
    const allActions = await vscode.commands.getCommands();
    return await vscode.window.showQuickPick(
        [...getEnabledActions(), ...allActions.sort()], { canPickMany: true }
    );
}

export function activate(context: vscode.ExtensionContext) {
    const out = vscode.window.createOutputChannel('context-menu-actions');
    out.show();
    out.appendLine('Started.');
    context.subscriptions.push(...[
        vscode.commands.registerCommand(RUN_ACTIONS, async (...args: any[]) => {
            const f = await getRecursiveUris(resolveFiles(...args));
            await applyActions(f);
        }),

        vscode.commands.registerCommand(CHOOSE_ACTION, async (...args: any[]) => {
            const f = await getRecursiveUris(resolveFiles(...args));
            const actions = await promptAction();
            if (actions) {
                await applyActions(f, actions);
            }
        })
    ]);

}

export function deactivate() {
}