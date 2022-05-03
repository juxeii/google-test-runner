import * as vscode from 'vscode';
import * as R from 'fp-ts/Reader';
import { ExtEnvironment } from './extension';
import { logDebug, logInfo } from './utils/logger';
import { map, Option } from 'fp-ts/lib/Option';
import { pipe } from 'fp-ts/lib/function';

export const createConfigurationListener = (configHandler: (event: vscode.ConfigurationChangeEvent) => void): vscode.Disposable => {
    const configurationListener = vscode.workspace.onDidChangeConfiguration(configHandler);
    logDebug(`Created configuration listener.`);
    return configurationListener;
};

export const createBuildNinjaListener = (): R.Reader<ExtEnvironment, vscode.FileSystemWatcher> => env => {
    const listener = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(env.buildFolder(), `${env.buildNinjaFileName}`)
    );
    env.context.subscriptions.push(listener);
    logInfo(`Listening to ${env.buildNinjaFileName} file creation/changes in build folder ${env.buildFolder()}.`);
    return listener;
};

export const listenForCreateOnBuildNinja = (listener: vscode.FileSystemWatcher, uriHandler: (uri: vscode.Uri) => void): vscode.FileSystemWatcher => {
    listener.onDidCreate(uriHandler);
    logDebug(`Created build ninja on create listener.`);
    return listener;
};

export const listenForChangeOnBuildNinja = (listener: vscode.FileSystemWatcher, uriHandler: (uri: vscode.Uri) => void): vscode.FileSystemWatcher => {
    listener.onDidChange(uriHandler);
    logDebug(`Created build ninja on change listener.`);
    return listener;
};

export const listenForDeleteOnBuildNinja = (listener: vscode.FileSystemWatcher, uriHandler: (uri: vscode.Uri) => void): vscode.FileSystemWatcher => {
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