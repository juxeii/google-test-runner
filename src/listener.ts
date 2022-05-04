import * as vscode from 'vscode';
import { logDebug, logInfo } from './utils/logger';
import { map, Option } from 'fp-ts/lib/Option';
import { pipe } from 'fp-ts/lib/function';
import * as cfg from './utils/configuration';
import { multicast, Observable } from 'observable-fns';

export const enum BuildNinjaUpdate {
    CREATED,
    CHANGED,
    DELETED
};

export const observeBuildFolderChange = (): Observable<string> => {
    return multicast(new Observable<string>(observer => {
        const configurationListener = vscode.workspace.onDidChangeConfiguration(event => {
            if (cfg.hasBuildFolderChanged(event)) {
                observer.next(cfg.getBuildFolder());
            }
        });
        logDebug(`Created listener for new build folder configurations.`);
        observer.next(cfg.getBuildFolder());
        return () => {
            logDebug(`Unsubscribing from build folder updates.`);
            configurationListener.dispose();
        };
    }));
};

export const observeBuildNinja = (buildNinjaFileName: string): Observable<BuildNinjaUpdate> => {
    const buildNinjaListener = createBuildNinjaListener(buildNinjaFileName);
    return multicast(new Observable<BuildNinjaUpdate>(observer => {
        listenForCreateOnBuildNinja(buildNinjaListener, (_) => observer.next(BuildNinjaUpdate.CREATED));
        listenForChangeOnBuildNinja(buildNinjaListener, (_) => observer.next(BuildNinjaUpdate.CHANGED));
        listenForDeleteOnBuildNinja(buildNinjaListener, (_) => observer.next(BuildNinjaUpdate.DELETED));

        if (cfg.isBuildNinjaFilePresent()) {
            observer.next(BuildNinjaUpdate.CREATED)
        }
        else {
            observer.next(BuildNinjaUpdate.DELETED)
        }
        const buildFolder = cfg.getBuildFolder();
        return () => {
            logDebug(`Unsubscribing from ${buildNinjaFileName} file updates in previous build folder ${buildFolder}.`);
            buildNinjaListener.dispose();
        };
    }));
};

const createBuildNinjaListener = (buildNinjaFileName: string): vscode.FileSystemWatcher => {
    const buildFolder = cfg.getBuildFolder();
    const listener = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(buildFolder, buildNinjaFileName)
    );
    logInfo(`Created file listener for ${buildNinjaFileName} in build folder ${buildFolder}.`);
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

export const observeDidChangeActiveEditor = (): Observable<vscode.TextEditor> => {
    return multicast(new Observable<vscode.TextEditor>(observer => {
        const disposable = vscode.window.onDidChangeActiveTextEditor(editor => {
            if (!editor) {
                return;
            }
            observer.next(editor);
        });
        logDebug(`Listening to didChangeActiveEditor updates.`);
        return () => {
            logDebug(`Unsubscribing from didChangeActiveEditor updates.`);
            disposable.dispose();
        };
    }));
};

export const observeDidSaveTextDocument = (): Observable<vscode.TextDocument> => {
    return multicast(new Observable<vscode.TextDocument>(observer => {
        const disposable = vscode.workspace.onDidSaveTextDocument(document => observer.next(document));
        logDebug(`Listening to didSaveTextDocument updates.`);
        return () => {
            logDebug(`Unsubscribing from didSaveTextDocument updates.`);
            disposable.dispose();
        };
    }));
};

export const observeDidCloseTextDocument = (): Observable<vscode.TextDocument> => {
    return multicast(new Observable<vscode.TextDocument>(observer => {
        const disposable = vscode.workspace.onDidCloseTextDocument(document => observer.next(document));
        logDebug(`Listening to didCloseTextDocument updates.`);
        return () => {
            logDebug(`Unsubscribing from didCloseTextDocument updates.`);
            disposable.dispose();
        };
    }));
};

export const disposeOptionalListener = (listener: Option<vscode.Disposable>): void => {
    pipe(
        listener,
        map(l => l.dispose())
    );
}