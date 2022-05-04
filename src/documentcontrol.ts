import * as vscode from 'vscode';
import { logDebug, logError } from './utils/logger';
import { discoverGTestMacros } from './parsing/macrodiscovery';
import { discoverTestCasesFromMacros } from './parsing/testdiscovery';
import { targetInfoByFile } from './extension';
import { GTestMacro, TestCase } from './types';
import { Observable, multicast, Subscription } from "observable-fns"
import { SubscriptionObserver } from 'observable-fns/dist/observable';
import { map, none, Option, some } from 'fp-ts/lib/Option';
import { pipe } from 'fp-ts/lib/function';
import { observeDidChangeActiveEditor, observeDidCloseTextDocument, observeDidSaveTextDocument } from './listener';
import { updateTestControllerFromDocument } from './testrun/testcontroller';
import path = require('path');
import { createMachine, EventObject, interpret, InterpreterFrom } from 'xstate';
import * as R from 'fp-ts/Reader';
import { boolean } from 'fp-ts';

type DocumentEnvironment = {
    testController: vscode.TestController;
    listenerForEditorChange: Option<Subscription<vscode.TextEditor>>;
    listenerForDocumentSave: Option<Subscription<vscode.TextDocument>>;
    listenerForDocumentClose: Option<Subscription<vscode.TextDocument>>;
    documentFsmByUri: Map<vscode.Uri, DocumentFsm>;
}

type FsmEnvironment = {
    testController: vscode.TestController;
    document: vscode.TextDocument;
    fsm: DocumentFsm | undefined;
}

const onStart = (environment: FsmEnvironment) => {
    logDebug(`Document FSM: Enter start.`);
    parseDocument()(environment);
}

const onTestsPresent = () => {
    logDebug(`Document FSM: Enter onTestsPresent.`);
}

const onTestsAbsent = (environment: FsmEnvironment) => {
    logDebug(`Document FSM: Enter onTestsAbsent.`);
    removeDocumentItems(environment.document, environment.testController);
}

const createDocumentMachine = (environment: FsmEnvironment) => createMachine(
    {
        id: "document",
        initial: "start",
        context: environment,
        states: {
            start: {
                onEntry: ["onStart"],
                on: {
                    PARSED_TESTS: "onTestsPresent",
                    PARSED_NO_TESTS: "onTestsAbsent"
                },
            },
            onTestsPresent: {
                onEntry: ["onTestsPresent"],
                on: {
                    SAVED: "start"
                },
            },
            onTestsAbsent: {
                onEntry: ["onTestsAbsent"],
                on: {
                    SAVED: "start"
                }
            }
        }
    },
    {
        actions: {
            onStart,
            onTestsPresent,
            onTestsAbsent
        }
    }
);
type DocumentFsm = InterpreterFrom<typeof createDocumentMachine>;

export const initDocumentControl = (testController: vscode.TestController): vscode.Disposable => {
    const environment = createEnvironment(testController);

    resetDocumentEnvironment();
    environment.listenerForEditorChange = some(observeDidChangeActiveEditor().subscribe(editor => onEditorSwitch(editor)(environment)));
    environment.listenerForDocumentSave = some(observeDidSaveTextDocument().subscribe(document => onDocumentSave(document)(environment)));
    environment.listenerForDocumentClose = some(observeDidCloseTextDocument().subscribe(document => onDocumentClose(document)(environment)));
    parseActiveDocument()(environment);

    return new vscode.Disposable(() => resetDocumentEnvironment()(environment));
}

const createEnvironment = (testController: vscode.TestController): DocumentEnvironment => {
    return {
        testController: testController,
        listenerForEditorChange: none,
        listenerForDocumentSave: none,
        listenerForDocumentClose: none,
        documentFsmByUri: new Map<vscode.Uri, DocumentFsm>()
    }
}

const resetDocumentEnvironment = (): R.Reader<DocumentEnvironment, void> => env => {
    logDebug(`Called reset on document controller`);
    unsubscribeDocumentObservers(env.listenerForEditorChange);
    unsubscribeDocumentObservers(env.listenerForDocumentSave);
    unsubscribeDocumentObservers(env.listenerForDocumentClose);
    env.documentFsmByUri.clear();
    env.testController.items.replace([]);
}

const unsubscribeDocumentObservers = <T>(subscription: Option<Subscription<T>>): void => {
    pipe(
        subscription,
        map(s => s.unsubscribe())
    );
}

const createDocumentFsm = (document: vscode.TextDocument): R.Reader<DocumentEnvironment, DocumentFsm> => env => {
    const fsmEnvironment: FsmEnvironment = {
        testController: env.testController,
        document: document,
        fsm: undefined
    }
    const documentMachine = createDocumentMachine(fsmEnvironment);
    const fsm = interpret(documentMachine);
    fsmEnvironment.fsm = fsm;
    fsm.start();
    return fsm;
}

const getDocumentFsm = (document: vscode.TextDocument): R.Reader<DocumentEnvironment, DocumentFsm> => env => {
    const uri = document.uri;
    const fsm = env.documentFsmByUri.get(uri);
    if (fsm) {
        return fsm;
    }
    const newFsm = createDocumentFsm(document)(env);
    env.documentFsmByUri.set(uri, newFsm);
    return newFsm;
}

const onEditorSwitch = (editor: vscode.TextEditor): R.Reader<DocumentEnvironment, void> => env => {
    const document = editor.document;
    if (!isInBuildManifest(document)) {
        return;
    }
    getDocumentFsm(document)(env);
};

const onDocumentSave = (document: vscode.TextDocument): R.Reader<DocumentEnvironment, void> => env => {
    if (!isInBuildManifest(document)) {
        return;
    }
    getDocumentFsm(document)(env).send({ type: 'SAVED' });
};

const onDocumentClose = (document: vscode.TextDocument): R.Reader<DocumentEnvironment, void> => env => {
    const uri = document.uri;
    env.documentFsmByUri.delete(uri);
    removeDocumentItems(document, env.testController);
};

const removeDocumentItems = (document: vscode.TextDocument, testController: vscode.TestController): void => {
    const fileName = path.basename(document.uri.fsPath);
    testController.items.delete(fileName);
}

const parseActiveDocument = (): R.Reader<DocumentEnvironment, void> => env => {
    const editor = vscode.window.activeTextEditor;
    if (editor) {
        onEditorSwitch(editor)(env);
    }
}

const parseDocument = (): R.Reader<FsmEnvironment, void> => async env => {
    const testCases = await createTestCases(env.document);
    if (testCases.length < 1) {
        env.fsm!.send({ type: 'PARSED_NO_TESTS' });
    }
    else {
        updateTestControllerFromDocument(env.document, env.testController, testCases);
        env.fsm!.send({ type: 'PARSED_TESTS' });
    }
}

const createTestCases = async (document: vscode.TextDocument): Promise<TestCase[]> => {
    const macros = await discoverGTestMacros(document);
    return discoverTestCasesFromMacros(macros);
};

const isInBuildManifest = (document: vscode.TextDocument): boolean => {
    return targetInfoByFile.has(document.uri.fsPath);
};