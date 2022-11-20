import * as vscode from 'vscode'
import { logDebug } from './logger'
import { doesPathExist } from './fsutils'
import { Observable } from 'observable-fns'

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
    document: vscode.TextDocument
    updateType: DocumentUpdate
}

export const observeDocumentUpdates = () =>
    new Observable<DocumentUpdateInfo>(observer => {
        const changeSub = observeDidChangeActiveEditor().subscribe(editor => observer.next({ document: editor.document, updateType: DocumentUpdate.SWITCHED_ACTIVE }))
        const saveSub = observeDidSaveTextDocument().subscribe(document => observer.next({ document: document, updateType: DocumentUpdate.SAVED }))
        const closeSub = observeDidCloseTextDocument().subscribe(document => observer.next({ document: document, updateType: DocumentUpdate.CLOSED }))

        const editor = vscode.window.activeTextEditor
        if (editor) {
            observer.next({ document: editor.document, updateType: DocumentUpdate.SWITCHED_ACTIVE })
        }
        return () => {
            changeSub.unsubscribe()
            saveSub.unsubscribe()
            closeSub.unsubscribe()
        }
    })

const observeDidChangeActiveEditor = () =>
    new Observable<vscode.TextEditor>(observer => {
        const disposable = vscode.window.onDidChangeActiveTextEditor(editor => {
            if (editor) {
                observer.next(editor)
            }
        })
        logDebug(`Subscribed to didChangeActiveEditor updates.`)
        return () => {
            logDebug(`Unsubscribed from didChangeActiveEditor updates.`)
            disposable.dispose()
        }
    })

const observeDidSaveTextDocument = () =>
    new Observable<vscode.TextDocument>(observer => {
        const disposable = vscode.workspace.onDidSaveTextDocument(document => observer.next(document))
        logDebug(`Subscribed to didSaveTextDocument updates.`)
        return () => {
            logDebug(`Unsubscribed from didSaveTextDocument updates.`)
            disposable.dispose()
        }
    })

const observeDidCloseTextDocument = () =>
    new Observable<vscode.TextDocument>(observer => {
        const disposable = vscode.workspace.onDidCloseTextDocument(document => observer.next(document))
        logDebug(`Subscribed to didCloseTextDocument updates.`)
        return () => {
            logDebug(`Unsubscribed from didCloseTextDocument updates.`)
            disposable.dispose()
        }
    })

export const observeFileUpdates = (file: string) => {
    const fileListener = vscode.workspace.createFileSystemWatcher(file)
    return new Observable<FileUpdate>(observer => {
        fileListener.onDidCreate(_ => observer.next(FileUpdate.CREATED))
        fileListener.onDidChange(_ => observer.next(FileUpdate.CHANGED))
        fileListener.onDidDelete(_ => observer.next(FileUpdate.DELETED))

        if (doesPathExist(file)) {
            observer.next(FileUpdate.CREATED)
        }
        else {
            observer.next(FileUpdate.DELETED)
        }
        return () => {
            logDebug(`Unsubscribed from ${file} updates.`)
            fileListener.dispose()
        }
    })
}