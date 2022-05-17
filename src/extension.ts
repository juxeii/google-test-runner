import * as vscode from 'vscode';
import * as cfg from './utils/configuration';
import { logInfo } from './utils/logger';
import { TargetByInfo } from './parsing/buildninja';
import { initRunProfiles } from './testrun/testrun';
import { initDocumentController } from './documentcontroller';

export type ExtEnvironment = {
    context: vscode.ExtensionContext;
    testController: vscode.TestController;
    targetInfoByFile: Map<string, TargetByInfo>;
}

export function activate(context: vscode.ExtensionContext) {
    logInfo(`${cfg.extensionName} activated.`);

    const env = createExtEnvironment(context);
    initDocumentController(env);
    initRunProfiles(env);
}

const createExtEnvironment = (context: vscode.ExtensionContext): ExtEnvironment => {
    return {
        context: context,
        testController: initTestController(context),
        targetInfoByFile: new Map<string, TargetByInfo>()
    };
}

const initTestController = (context: vscode.ExtensionContext): vscode.TestController => {
    const testController = vscode.tests.createTestController('GoogleTestController', 'GoogleTestController');
    context.subscriptions.push(testController);
    return testController;
}

export function deactivate() { }