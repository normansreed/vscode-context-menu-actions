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
        cancellable: true,
    };

    await vscode.window.withProgress(progressOptions, async (progress: vscode.Progress<ProgressUpdate>, cancellationToken: vscode.CancellationToken) => {
        for (let i = 0; i < allFileActions.length && !cancellationToken.isCancellationRequested; i++) {
            const fact = allFileActions[i] as { uri: vscode.Uri, action: string };
            const filename = path.basename(fact.uri.fsPath);

            try {
                await vscode.window.showTextDocument(fact.uri, { preserveFocus: false, preview: true });
                await vscode.commands.executeCommand(fact.action, fact.uri);
                if (saveAfterFormat) {
                    await vscode.commands.executeCommand('workbench.action.files.save');
                    if (closeAfterSave) {
                        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
                    }
                }
                completedFileActions.push(fact);
            } catch (e) {
                errors.push({ ...fact, error: e });
                vscode.window.showErrorMessage('Error running %s on %s: %s', fact.action, fact.uri.fsPath, e);
                console.error(e);
            }

            progress.report({
                increment: increment,
                message: `${i + 1}/${allFileActions.length} - ${filename}`
            });
        }

        vscode.window.showInformationMessage(`
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
    return await vscode.window.showQuickPick(
        getEnabledActions()
    );
}

export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(...[
        vscode.commands.registerCommand(RUN_ACTIONS, async (...args: any[]) => {
            const f = await getRecursiveUris(resolveFiles(...args));
            await applyActions(f);
        }),

        vscode.commands.registerCommand(CHOOSE_ACTION, async (...args: any[]) => {
            const f = await getRecursiveUris(resolveFiles(...args));
            const action = await promptAction();
            if (action) {
                applyActions(f, [action]);
            }
        })
    ]);

}

export function deactivate() {
}