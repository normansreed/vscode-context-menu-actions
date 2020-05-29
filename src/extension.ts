'use strict';

import * as fs from 'fs';
import * as vscode from 'vscode';

interface ProgressConfig {
    message?: string;
    increment?: number;
}

const FROM_SCM_CONTEXT = 'extension.applyFileActionsFromScmContext';
const FROM_EDITOR_TILE_CONTEXT = 'extension.applyFileActionsEditorTile';
const FROM_EXPLORER_CONTEXT = 'extension.applyFileActionsFromExplorerContext';


const applyActions = async (uris: vscode.Uri[]) => {
    // Getting current settings
    const actions = vscode.workspace.getConfiguration().get('contextMenuActions.actions') as Array<string>;
    const saveAfterFormat = vscode.workspace.getConfiguration().get('contextMenuActions.save') as boolean;
    const closeAfterSave = vscode.workspace.getConfiguration().get('contextMenuActions.close') as boolean;

    const increment = (1 / uris.length) * 100;

    const progressOptions: vscode.ProgressOptions = {
        location: vscode.ProgressLocation.Notification,
        title: 'Applying actions to files',
        cancellable: true,
    };

    vscode.window.withProgress(progressOptions, async (progress: vscode.Progress<ProgressConfig>, cancellationToken: vscode.CancellationToken) => {
        for (let i = 0; i < uris.length; i++) {
            const uri = uris[i];
            if (cancellationToken.isCancellationRequested) {
                break;
            }
            try {
                progress.report({
                    message: `${i + 1}/${uris.length}`
                });
                await vscode.window.showTextDocument(uris[i], { preserveFocus: false, preview: true });
                actions.forEach(async a => await vscode.commands.executeCommand(a, uri));
                // await vscode.commands.executeCommand('editor.action.formatDocument', uri);
                if (saveAfterFormat) {
                    await vscode.commands.executeCommand('workbench.action.files.save', uri);
                    if (closeAfterSave) {
                        await vscode.commands.executeCommand('workbench.action.closeActiveEditor', uri);
                    }
                }
            } catch (exception) {
                vscode.window.showWarningMessage(`Could not format file ${uri}`);
            }
            progress.report({
                increment: increment,
            });
        }
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

export function activate(context: vscode.ExtensionContext) {


    context.subscriptions.push(...[

        vscode.commands.registerCommand(FROM_SCM_CONTEXT, async (...selectedFiles: vscode.SourceControlResourceState[]) => {
            const uris = await getRecursiveUris(selectedFiles.map(x => x.resourceUri));
            await applyActions(uris);
        }),

        vscode.commands.registerCommand(FROM_EDITOR_TILE_CONTEXT, async (clickedFile: vscode.Uri) => {
            await applyActions([clickedFile]);
        }),

        vscode.commands.registerCommand(FROM_EXPLORER_CONTEXT, async (clickedFile: vscode.Uri, selectedFiles: vscode.Uri[]) => {
            const uris = await getRecursiveUris(selectedFiles || [clickedFile]);
            await applyActions(uris);
        })

    ]);

}

export function deactivate() {
}