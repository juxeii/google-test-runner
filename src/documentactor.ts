import * as vscode from 'vscode';
import { logDebug } from './utils/logger';
import { discoverGTestMacros } from './parsing/macrodiscovery';
import { discoverTestCasesFromMacros } from './parsing/testdiscovery';
import { TestCase } from './types';
import { observeDidChangeActiveEditor, observeDidCloseTextDocument, observeDidSaveTextDocument } from './listener';
import { updateTestControllerFromDocument } from './testrun/testcontroller';
import path = require('path');
import { AnyEventObject, createMachine, interpret, InterpreterFrom, Receiver, Sender } from 'xstate';
import * as R from 'fp-ts/Reader';
import { ExtEnvironment } from './extension';
import { TargetByInfo } from './parsing/buildninja';

type DocumentEnvironment = {
    testController: vscode.TestController;
    documentFsmByUri: Map<vscode.TextDocument, DocumentFsm>;
    targetInfoByFile: Map<string, TargetByInfo>;
}

type FsmEnvironment = {
    testController: vscode.TestController;
    document: vscode.TextDocument;
}

const onStart = () => {
    logDebug(`Document FSM: Enter start.`);
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
        id: "documentfsm",
        initial: "start",
        context: environment,
        states: {
            start: {
                invoke: {
                    id: 'parseDocument',
                    src: () => (callback) => parseDocument(callback)(environment)
                },
                onEntry: onStart,
                on: {
                    PARSED_TESTS: "onTestsPresent",
                    PARSED_NO_TESTS: "onTestsAbsent"
                },
            },
            onTestsPresent: {
                onEntry: onTestsPresent,
                on: {
                    SAVED: "start"
                },
            },
            onTestsAbsent: {
                onEntry: onTestsAbsent,
                on: {
                    SAVED: "start"
                }
            }
        }
    }
);
type DocumentFsm = InterpreterFrom<typeof createDocumentMachine>;

export const createDocumentActor = (extEnvironment: ExtEnvironment, receive: Receiver<AnyEventObject>): () => void => {
    logDebug(`Creating document actor`);
    const environment = createEnvironment(extEnvironment);
    subscribeDocumentListeners()(environment);

    receive(event => {
        if (event.type === 'RESYNC') {
            logDebug(`Document actor received RESYNC`);
            syncDocumentUrisAfterBuildNinjaChange()(environment);
            parseActiveDocument()(environment);
        }
    });

    return () => resetDocumentEnvironment()(environment);
}

const subscribeDocumentListeners = (): R.Reader<DocumentEnvironment, void> => environment => {
    observeDidChangeActiveEditor().subscribe(editor => onEditorSwitch(editor)(environment));
    observeDidSaveTextDocument().subscribe(document => onDocumentSave(document)(environment));
    observeDidCloseTextDocument().subscribe(document => onDocumentClose(document)(environment));
}

const parseActiveDocument = (): R.Reader<DocumentEnvironment, void> => env => {
    const editor = vscode.window.activeTextEditor;
    if (editor) {
        onEditorSwitch(editor)(env);
    }
}

const createEnvironment = (extEnvironment: ExtEnvironment): DocumentEnvironment => {
    return {
        testController: extEnvironment.testController,
        documentFsmByUri: new Map<vscode.TextDocument, DocumentFsm>(),
        targetInfoByFile: extEnvironment.targetInfoByFile
    }
}

const resetDocumentEnvironment = (): R.Reader<DocumentEnvironment, void> => env => {
    logDebug(`Called reset on document controller`);
    env.documentFsmByUri.clear();
    env.testController.items.replace([]);
}

const syncDocumentUrisAfterBuildNinjaChange = (): R.Reader<DocumentEnvironment, void> => env => {
    logDebug(`Filtering documents build manifest change.`);
    env.documentFsmByUri.forEach((_, document) => {
        if (!env.targetInfoByFile.has(document.uri.fsPath)) {
            removeDocumentItems(document, env.testController);
        }
    });
    env.documentFsmByUri = new Map([...env.documentFsmByUri].filter(([document, _]) => env.targetInfoByFile.has(document.uri.fsPath)));
}

const createDocumentFsm = (document: vscode.TextDocument): R.Reader<DocumentEnvironment, DocumentFsm> => env => {
    const fsmEnvironment: FsmEnvironment = {
        testController: env.testController,
        document: document
    }
    const documentMachine = createDocumentMachine(fsmEnvironment);
    const fsm = interpret(documentMachine);
    fsm.start();
    return fsm;
}

const getDocumentFsm = (document: vscode.TextDocument): R.Reader<DocumentEnvironment, DocumentFsm> => env => {
    const fsm = env.documentFsmByUri.get(document);
    if (fsm) {
        return fsm;
    }
    const newFsm = createDocumentFsm(document)(env);
    env.documentFsmByUri.set(document, newFsm);
    return newFsm;
}

const onEditorSwitch = (editor: vscode.TextEditor): R.Reader<DocumentEnvironment, void> => env => {
    const document = editor.document;
    if (isInBuildManifest(document)(env)) {
        getDocumentFsm(document)(env);
    }
};

const onDocumentSave = (document: vscode.TextDocument): R.Reader<DocumentEnvironment, void> => env => {
    if (isInBuildManifest(document)(env)) {
        getDocumentFsm(document)(env).send({ type: 'SAVED' });
    }
};

const onDocumentClose = (document: vscode.TextDocument): R.Reader<DocumentEnvironment, void> => env => {
    env.documentFsmByUri.delete(document);
    removeDocumentItems(document, env.testController);
};

const removeDocumentItems = (document: vscode.TextDocument, testController: vscode.TestController): void => {
    const fileName = path.basename(document.uri.fsPath);
    testController.items.delete(fileName);
}

const parseDocument = (callback: Sender<AnyEventObject>): R.Reader<FsmEnvironment, void> => async env => {
    const testCases = await createTestCases(env.document);
    if (testCases.length < 1) {
        callback({ type: 'PARSED_NO_TESTS' });
    }
    else {
        updateTestControllerFromDocument(env.document, env.testController, testCases);
        callback({ type: 'PARSED_TESTS' });
    }
}

const createTestCases = async (document: vscode.TextDocument): Promise<TestCase[]> => {
    const macros = await discoverGTestMacros(document);
    return discoverTestCasesFromMacros(macros);
};

const isInBuildManifest = (document: vscode.TextDocument): R.Reader<DocumentEnvironment, boolean> => env => {
    return env.targetInfoByFile.has(document.uri.fsPath);
};