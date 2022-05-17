import * as vscode from 'vscode';
import * as cfg from './utils/configuration';
import { logDebug, logInfo } from './utils/logger';
import { TargetByInfo } from './parsing/buildninja';
import { initTestController, removeDocumentItems } from './testrun/testcontroller';
import { observeTargetInfoUpdates } from './listener';

export type ExtEnvironment = {
    context: vscode.ExtensionContext;
    testController: vscode.TestController;
    targetInfoByFile: Map<string, TargetByInfo>;
    parsedDocuments: Set<vscode.TextDocument>;
}

export function activate(context: vscode.ExtensionContext) {
    logInfo(`${cfg.extensionName} activated.`);

    const environment = createExtEnvironment(context);
    subscribeToBuildManifestUpdates(environment);
}

const subscribeToBuildManifestUpdates = (environment: ExtEnvironment): void => {
    const isTestControllerReady = { isReady: false };
    observeTargetInfoUpdates().subscribe(targetByFileMapping => {
        environment.targetInfoByFile.clear();
        for (const [file, targetInfo] of targetByFileMapping) {
            environment.targetInfoByFile.set(file, targetInfo);
        }
        logDebug(`Resync parsed documents on build manifest change.`);

        environment.parsedDocuments.forEach(document => {
            if (!environment.targetInfoByFile.has(document.uri.fsPath)) {
                environment.parsedDocuments.delete(document);
                removeDocumentItems(document, environment);
            }
        });
        if (!isTestControllerReady.isReady) {
            initTestController(environment);
            isTestControllerReady.isReady = true;
        }
    });
}

const createExtEnvironment = (context: vscode.ExtensionContext): ExtEnvironment => {
    return {
        context: context,
        testController: createTestController(context),
        targetInfoByFile: new Map<string, TargetByInfo>(),
        parsedDocuments: new Set<vscode.TextDocument>()
    };
}

const createTestController = (context: vscode.ExtensionContext): vscode.TestController => {
    const testController = vscode.tests.createTestController('GoogleTestController', 'GoogleTestController');
    context.subscriptions.push(testController);
    return testController;
}

export function deactivate() { }