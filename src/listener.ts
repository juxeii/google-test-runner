import * as vscode from 'vscode';
import { logDebug, logInfo } from './utils/logger';
import { map, Option } from 'fp-ts/lib/Option';
import { pipe } from 'fp-ts/lib/function';
import * as cfg from './utils/configuration';
import { multicast, Observable } from 'observable-fns';

export const enum BuildNinjaUpdate {
    CREATE,
    CHANGE,
    DELETE
};

export const observeConfiguration = (): Observable<vscode.ConfigurationChangeEvent> => {
    return multicast(new Observable<vscode.ConfigurationChangeEvent>(observer => {
        const configurationListener = vscode.workspace.onDidChangeConfiguration((event) => observer.next(event));
        logDebug(`Created configuration listener.`);
        return () => {
            logDebug(`Unsubscribing from configuration updates.`);
            configurationListener.dispose();
        };
    }));
};

export const observeBuildNinja = (buildNinjaFileName: string): Observable<BuildNinjaUpdate> => {
    const buildNinjaListener = createBuildNinjaListener(buildNinjaFileName);
    return multicast(new Observable<BuildNinjaUpdate>(observer => {
        listenForCreateOnBuildNinja(buildNinjaListener, (_) => observer.next(BuildNinjaUpdate.CREATE));
        listenForChangeOnBuildNinja(buildNinjaListener, (_) => observer.next(BuildNinjaUpdate.CHANGE));
        listenForDeleteOnBuildNinja(buildNinjaListener, (_) => observer.next(BuildNinjaUpdate.DELETE));

        return () => {
            logDebug(`Unsubscribing from ${buildNinjaFileName} file updates.`);
            buildNinjaListener.dispose();
        };
    }));
};

const createBuildNinjaListener = (buildNinjaFileName: string): vscode.FileSystemWatcher => {
    const buildFolder = cfg.getBuildFolder();
    const listener = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(buildFolder, buildNinjaFileName)
    );
    logInfo(`Listening to ${buildNinjaFileName} file creation/changes in build folder ${buildFolder}.`);
    return listener;
};

const listenForCreateOnBuildNinja = (listener: vscode.FileSystemWatcher, uriHandler: (uri: vscode.Uri) => void): vscode.FileSystemWatcher => {
    listener.onDidCreate(uriHandler);
    logDebug(`Created build ninja on create listener.`);
    return listener;
};

const listenForChangeOnBuildNinja = (listener: vscode.FileSystemWatcher, uriHandler: (uri: vscode.Uri) => void): vscode.FileSystemWatcher => {
    listener.onDidChange(uriHandler);
    logDebug(`Created build ninja on change listener.`);
    return listener;
};

const listenForDeleteOnBuildNinja = (listener: vscode.FileSystemWatcher, uriHandler: (uri: vscode.Uri) => void): vscode.FileSystemWatcher => {
    listener.onDidDelete(uriHandler);
    logDebug(`Created build ninja on delete listener.`);
    return listener;
};

export const listenForChangeInEditor = (editorHandler: (editor: vscode.TextEditor) => void): vscode.Disposable => {
    const disposable = vscode.window.onDidChangeActiveTextEditor(editor => {
        if (!editor) {
            return;
        }
        editorHandler(editor);
    });
    logDebug(`Created editor change listener.`);
    return disposable;
};

export const listenForDocumentSave = (documentHandler: (editor: vscode.TextDocument) => void): vscode.Disposable => {
    const disposable = vscode.workspace.onDidSaveTextDocument(documentHandler);
    logDebug(`Created document save listener.`);
    return disposable;
};

export const listenForDocumentClose = (documentHandler: (editor: vscode.TextDocument) => void): vscode.Disposable => {
    const disposable = vscode.workspace.onDidCloseTextDocument(documentHandler);
    logDebug(`Created document close listener.`);
    return disposable;
};

export const disposeOptionalListener = (listener: Option<vscode.Disposable>): void => {
    pipe(
        listener,
        map(l => l.dispose())
    );
}