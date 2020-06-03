'use strict';

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { VsConfig } from './config';
import { ContextMenuActions } from './ContextMenuActions';
import { FileAction } from './FileAction';
import { ProgressUpdate } from './ProgressUpdate';


const CHOOSE_ACTION = 'extension.chooseAction';
const RUN_ACTIONS = 'extension.runActions';
const TIMEOUT = 280;

function getFileActionString(fa: FileAction) {
    let s = `${path.basename(fa.uri.fsPath)} => ${fa.action}`;
    // s += Object.keys(fa).filter(k => !['action', 'uri'].includes(k)).map(k => `${k.padStart(10)}:${_.get(fa, k)}, `);
    return s;
}

const getEnabledActions = () => vscode.workspace.getConfiguration().get('contextMenuActions.actions') as Array<string>;


const applyActions = async (uris: vscode.Uri[], actions = getEnabledActions()) => {
    const progressOptions: vscode.ProgressOptions = {
        location: vscode.ProgressLocation.Notification,
        title: `Running `,
        cancellable: true
    };

    const cma = new ContextMenuActions(new VsConfig());
    const cmaActions = cma.getAllFileActions(uris, actions);
    const inc = (1 / cmaActions.length) * 100;
    const cmaIter = cma.fileActionGenerator(cmaActions);
    await vscode.window.withProgress(progressOptions, async (progress: vscode.Progress<ProgressUpdate>, cancellationToken: vscode.CancellationToken) => {
        while (true) {
            const cmaAction = await cmaIter.next(cancellationToken.isCancellationRequested);

            const result = await cmaAction.value;
            console.log('%s done. %s', getFileActionString(result.action), result.didTimeout ? 'Timed out.' : '');

            progress.report({
                message: "",
                increment: inc
            });
            if (cmaAction.done) {
                break;
            }
        }
    });
    cma.dispose();
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