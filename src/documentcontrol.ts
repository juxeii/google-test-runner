import * as vscode from 'vscode';
import { logDebug } from './utils/logger';
import { discoverGTestMacros } from './parsing/macrodiscovery';
import { discoverTestCasesFromMacros } from './parsing/testdiscovery';
import { TestCase } from './types';
import { Observable, multicast } from "observable-fns"
import { SubscriptionObserver } from 'observable-fns/dist/observable';
import { map, none, Option, some } from 'fp-ts/lib/Option';
import { pipe } from 'fp-ts/lib/function';
import { disposeOptionalListener, listenForChangeInEditor, listenForDocumentClose, listenForDocumentSave } from './listener';

type DocumentEnvironment = {
    observer: Option<SubscriptionObserver<ParseResult>>;
    parsedFiles: Set<vscode.Uri>;
    noTestFiles: Set<vscode.Uri>;
    activeTextEditorListener: Option<vscode.Disposable>;
    saveTextDocumentListener: Option<vscode.Disposable>;
    closeTextDocumentListener: Option<vscode.Disposable>;
}

const env: DocumentEnvironment = {
    observer: none,
    parsedFiles: new Set<vscode.Uri>(),
    noTestFiles: new Set<vscode.Uri>(),
    activeTextEditorListener: none,
    saveTextDocumentListener: none,
    closeTextDocumentListener: none
}

export type ParseResult = {
    document: vscode.TextDocument;
    testCases: TestCase[];
}

export const observeTestCases = (): Observable<ParseResult> => {
    resetEnvironment();
    return multicast(new Observable<ParseResult>(observer => {
        env.observer = some(observer);
        env.activeTextEditorListener = some(listenForChangeInEditor(onEditorChange));
        env.saveTextDocumentListener = some(listenForDocumentSave(onDocumentSave));
        env.closeTextDocumentListener = some(listenForDocumentClose(onDocumentClose));
        parseActiveDocument();
    }));
}

const resetEnvironment = (): void => {
    pipe(
        env.observer,
        map(o => o.complete)
    );
    env.noTestFiles.clear();
    env.parsedFiles.clear();
    disposeOptionalListener(env.activeTextEditorListener);
    disposeOptionalListener(env.saveTextDocumentListener);
    disposeOptionalListener(env.closeTextDocumentListener);
}

const onNextParseResult = (parseResult: ParseResult): void => {
    pipe(
        env.observer,
        map(o => o.next(parseResult))
    );
}

const onEditorChange = (editor: vscode.TextEditor): void => {
    const document = editor.document;
    const processCondition = isFileType(document) &&
        isCPlusPlusLanguage(document)
        && !env.noTestFiles.has(document.uri)
        && !(env.parsedFiles.has(document.uri));
    if (processCondition) {
        parseDocument(document);
    }
};

const onDocumentSave = (document: vscode.TextDocument): void => {
    const processCondition = isFileType(document) && isCPlusPlusLanguage(document);
    if (processCondition) {
        parseDocument(document);
    }
};

const onDocumentClose = (document: vscode.TextDocument): void => {
    if (env.parsedFiles.has(document.uri)) {
        onNextParseResult({ document: document, testCases: [] });
    }
};

export const parseActiveDocument = (): void => {
    const currentWindow = vscode.window.activeTextEditor;
    if (currentWindow) {
        const document = currentWindow.document;
        logDebug(`Parsing active document ${document.uri}`);
        parseDocument(document);
    }
}

const parseDocument = async (document: vscode.TextDocument): Promise<void> => {
    const testCases = await createTestCases(document)
    if (testCases.length < 1) {
        env.noTestFiles.add(document.uri);
        logDebug(`Adding ${document.uri} to set of files with no tests.`);
        return;
    }
    else {
        env.noTestFiles.delete(document.uri);
        env.parsedFiles.add(document.uri);
    }
    onNextParseResult({ document: document, testCases: testCases });
}

const createTestCases = async (document: vscode.TextDocument): Promise<TestCase[]> => {
    const macros = await discoverGTestMacros(document);
    return discoverTestCasesFromMacros(macros);
};

const isFileType = (document: vscode.TextDocument): boolean => {
    return document.uri.scheme === 'file';
};

const isCPlusPlusLanguage = (document: vscode.TextDocument): boolean => {
    return document.languageId === 'cpp';
};