'use strict';

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

const time = () => new Date().getTime();
const elapsed = (start: number) => time() - start;

interface ProgressUpdate {
    message?: string;
    increment?: number;
}

const CHOOSE_ACTION = 'extension.chooseAction';
const RUN_ACTIONS = 'extension.runActions';

const getEnabledActions = () => vscode.workspace.getConfiguration().get('contextMenuActions.actions') as Array<string>;

const applyActions = async (uris: vscode.Uri[], actions = getEnabledActions()) => {
    const allFileActions = uris.reduce((acts: any[], uri) => {
        const a = actions.reduce((facts: any[], action: string) => {
            return [...facts, { uri, action }];
        }, []);
        return [...acts, ...a];
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

    await vscode.window.withProgress(progressOptions, async (progress: vscode.Progress<ProgressUpdate>, cancellationToken: vscode.CancellationToken) => {
        for (let i = 0; i < allFileActions.length && !cancellationToken.isCancellationRequested; i++) {
            const fact = allFileActions[i] as { uri: vscode.Uri, action: string };
            const filename = path.basename(fact.uri.fsPath);

            try {
                const editor = await vscode.window.showTextDocument(fact.uri, { preserveFocus: false, preview: true });
                const language = editor.document.languageId;
                const preDiags = vscode.languages.getDiagnostics(fact.uri);
                const result = await vscode.commands.executeCommand(fact.action);
                const postDiags = vscode.languages.getDiagnostics(fact.uri);
                console.log(language, result, preDiags, postDiags);
                // vscode.window.activeTextEditor?.document.save();
                if (saveAfterFormat) {
                    await vscode.commands.executeCommand('workbench.action.files.saveWithoutFormatting');
                    if (closeAfterSave) {
                        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
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
        }
        const message = errors.length > 0 ? vscode.window.showWarningMessage : vscode.window.showInformationMessage;
        message(`
        Completed ${completedFileActions.length} actions 
        in ${elapsed(started)}ms
        ${errors.length > 0 ? errors.length + ' errors encountered' : ''}
        `);
    });
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
        [...getEnabledActions(), ...allActions.sort()]
    );
}

export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(...[
        vscode.commands.registerCommand(RUN_ACTIONS, async (...args: any[]) => {
            const f = await getRecursiveUris(resolveFiles(...args));
            await applyActions(f.sort((a, b) => (a.fsPath > b.fsPath ? 1 : a.fsPath < b.fsPath ? -1 : 0)));
        }),

        vscode.commands.registerCommand(CHOOSE_ACTION, async (...args: any[]) => {
            const f = await getRecursiveUris(resolveFiles(...args));
            const action = await promptAction();
            if (action) {
                await applyActions(f.sort((a, b) => (a.fsPath > b.fsPath ? 1 : a.fsPath < b.fsPath ? -1 : 0)), [action]);
            }
        })
    ]);

}

export function deactivate() {
}