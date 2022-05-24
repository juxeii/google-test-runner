import * as vscode from 'vscode';
import { logDebug } from './utils/logger';
import { doesPathExist } from './utils/utils';
import { multicast, Observable } from 'observable-fns';

export const enum FileUpdate {
    CREATED,
    CHANGED,
    DELETED
}

export const enum DocumentUpdate {
    SAVED,
    CLOSED,
    SWITCHED_ACTIVE
}

export type DocumentUpdateInfo = {
    document: vscode.TextDocument;
    updateType: DocumentUpdate;
}

export const observeDocumentUpdates = (): Observable<DocumentUpdateInfo> => {
    return multicast(new Observable<DocumentUpdateInfo>(observer => {
        const changeSub = observeDidChangeActiveEditor().subscribe(editor => observer.next({ document: editor.document, updateType: DocumentUpdate.SWITCHED_ACTIVE }));
        const saveSub = observeDidSaveTextDocument().subscribe(document => observer.next({ document: document, updateType: DocumentUpdate.SAVED }));
        const closeSub = observeDidCloseTextDocument().subscribe(document => observer.next({ document: document, updateType: DocumentUpdate.CLOSED }));

        const editor = vscode.window.activeTextEditor;
        if (editor) {
            observer.next({ document: editor.document, updateType: DocumentUpdate.SWITCHED_ACTIVE });
        }
        return () => {
            changeSub.unsubscribe();
            saveSub.unsubscribe();
            closeSub.unsubscribe();
        };
    }));
}

const observeDidChangeActiveEditor = (): Observable<vscode.TextEditor> => {
    return multicast(new Observable<vscode.TextEditor>(observer => {
        const disposable = vscode.window.onDidChangeActiveTextEditor(editor => {
            if (!editor) {
                return;
            }
            observer.next(editor);
        });
        logDebug(`Subscribed to didChangeActiveEditor updates.`);
        return () => {
            logDebug(`Unsubscribed from didChangeActiveEditor updates.`);
            disposable.dispose();
        };
    }));
};

const observeDidSaveTextDocument = (): Observable<vscode.TextDocument> => {
    return multicast(new Observable<vscode.TextDocument>(observer => {
        const disposable = vscode.workspace.onDidSaveTextDocument(observer.next);
        logDebug(`Subscribed to didSaveTextDocument updates.`);
        return () => {
            logDebug(`Unsubscribed from didSaveTextDocument updates.`);
            disposable.dispose();
        };
    }));
};

const observeDidCloseTextDocument = (): Observable<vscode.TextDocument> => {
    return multicast(new Observable<vscode.TextDocument>(observer => {
        const disposable = vscode.workspace.onDidCloseTextDocument(observer.next);
        logDebug(`Subscribed to didCloseTextDocument updates.`);
        return () => {
            logDebug(`Unsubscribed from didCloseTextDocument updates.`);
            disposable.dispose();
        };
    }));
};

export const observeFileUpdates = (file: string): Observable<FileUpdate> => {
    const fileListener = vscode.workspace.createFileSystemWatcher(file);
    return multicast(new Observable<FileUpdate>(observer => {
        fileListener.onDidCreate(_ => observer.next(FileUpdate.CREATED));
        fileListener.onDidChange(_ => observer.next(FileUpdate.CHANGED));
        fileListener.onDidDelete(_ => observer.next(FileUpdate.DELETED));

        if (doesPathExist(file)) {
            observer.next(FileUpdate.CREATED)
        }
        else {
            observer.next(FileUpdate.DELETED)
        }
        return () => {
            logDebug(`Unsubscribed from ${file} updates.`);
            fileListener.dispose();
        };
    }));
};