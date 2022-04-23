import * as vscode from 'vscode';
import * as path from 'path';
import * as cfg from './configuration';
import { targetMappingFileName, buildNinjaFile } from './constants';
import { execShell } from './system';
import { createTestController } from './testrun';
import { parseDocument } from './testdiscovery';
import { updateTestControllerFromDocument } from './testcontroller';
import { logger } from './logger';
import { TargetInfo } from './types';
import { createTargetInfoForDocument } from './runconfig';


let buildNinjaListener: vscode.FileSystemWatcher;
export let runConfiguration = new Map<string, TargetInfo>();
let noTestFiles = new Set<vscode.Uri>();

export function activate(context: vscode.ExtensionContext) {
    logger().info(`${cfg.extensionName} activated.`);
    initExtension(context);
}

function initExtension(context: vscode.ExtensionContext) {
    let testController = initTestController(context);
    initDocumentListeners(context, testController);
    initConfigurationListener(context, testController);
    buildNinjaListener = createBuildNinjaListener(context, testController);
    processConfigurationStatus(context, testController);
}

function onNewBuildFolder(context: vscode.ExtensionContext, testController: vscode.TestController) {
    buildNinjaListener.dispose();
    buildNinjaListener = createBuildNinjaListener(context, testController);
    processConfigurationStatus(context, testController);
}

function processConfigurationStatus(context: vscode.ExtensionContext, testController: vscode.TestController) {
    if (cfg.isConfigurationValid()) {
        createTargetMappingFile();
        parseCurrentEditor(context, testController);
        logConfigurationDone();
    }
    else {
        showMisConfigurationMessage();
        const noItems: vscode.TestItem[] = [];
        testController.items.replace(noItems);
        runConfiguration.clear();
        noTestFiles.clear();
    }
}

function parseCurrentEditor(context: vscode.ExtensionContext, testController: vscode.TestController) {
    const currentWindow = vscode.window.activeTextEditor;
    if (currentWindow && isDocumentValidForParsing(currentWindow.document)) {
        fillTestControllerWithTestCasesFromDocument(context, currentWindow.document, testController);
    }
}

function isDocumentValidForParsing(document: vscode.TextDocument) {
    if (document.uri.scheme != 'file') {
        return false;
    }

    if (noTestFiles.has(document.uri)) {
        logger().debug(`File ${document.uri} has no tests. No need to reparse.`);
        return false;
    }

    const baseName = path.parse(document.uri.path).base;
    if (runConfiguration.has(baseName) && !document.isDirty) {
        return false;
    }

    const languageName = document.languageId;
    return languageName && languageName === "cpp";
}

async function fillTestControllerWithTestCasesFromDocument(context: vscode.ExtensionContext, document: vscode.TextDocument, testController: vscode.TestController) {
    const testCases = await parseDocument(document, testController);
    if (testCases.length < 1) {
        noTestFiles.add(document.uri);
        logger().debug(`Adding ${document.uri} to set of files with no tests.`);
        return;
    }

    //context.workspaceState.update(document.uri.path, testCases);
    noTestFiles.delete(document.uri);
    updateTestControllerFromDocument(document, testController, testCases);
    logger().debug(`Current testcontroller item size ${testController.items.size}`);
    let targetInfo = await createTargetInfoForDocument(document, testController);
    const baseName = path.parse(document.uri.path).base;
    runConfiguration.set(baseName, targetInfo);
}

function initTestController(context: vscode.ExtensionContext) {
    let testController = createTestController(runConfiguration);
    context.subscriptions.push(testController);
    return testController;
}

function initConfigurationListener(context: vscode.ExtensionContext, testController: vscode.TestController) {
    const changeConfigurationListener = vscode.workspace.onDidChangeConfiguration(event => {
        if (cfg.hasConfigurationChanged(event)) {
            onNewBuildFolder(context, testController);
        }
    });
    context.subscriptions.push(changeConfigurationListener);
}

function initDocumentListeners(context: vscode.ExtensionContext, testController: vscode.TestController) {
    let activeTextEditorListener = vscode.window.onDidChangeActiveTextEditor(editor => {
        if (!editor) {
            return;
        }
        logger().debug(`onDidChangeActiveTextEditor ${editor.document.uri}`);
        if (!isDocumentValidForParsing(editor.document)) {
            return;
        }
        fillTestControllerWithTestCasesFromDocument(context, editor.document, testController);
    });
    // let openTextDocumentListener = vscode.workspace.onDidOpenTextDocument(document => {
    //     logger().debug(`onDidOpenTextDocument ${document.uri.path}`);
    //     fillTestControllerWithTestCasesFromDocument(context, document, testController);
    // });
    let saveTextDocumentListener = vscode.workspace.onDidSaveTextDocument(document => {
        logger().debug(`onDidSaveTextDocument ${document.uri}`);
        fillTestControllerWithTestCasesFromDocument(context, document, testController);
    });
    let closeTextDocumentListener = vscode.workspace.onDidCloseTextDocument(document => {
        const baseName = path.parse(document.uri.path).base;
        testController.items.delete(baseName);
    })
    context.subscriptions.push(activeTextEditorListener);
    //context.subscriptions.push(openTextDocumentListener);
    context.subscriptions.push(saveTextDocumentListener);
    context.subscriptions.push(closeTextDocumentListener);
}

function logConfigurationDone() {
    let buildFolder = cfg.getBuildFolder();
    logger().info(`Configuring GoogleTestRunner with ${buildNinjaFile} in ${buildFolder} done.`);
}

function showMisConfigurationMessage() {
    let buildFolder = cfg.getBuildFolder();
    const misconfiguredMsg = `GoogleTestRunner needs the ${buildNinjaFile} file to work. Please run cmake configure at least once with your configured build folder ${buildFolder}.`;
    logger().info(misconfiguredMsg);
    vscode.window.showWarningMessage(misconfiguredMsg)
}

function createBuildNinjaListener(context: vscode.ExtensionContext, testController: vscode.TestController) {
    let buildFolder = cfg.getBuildFolder();
    let listener = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(buildFolder, `${buildNinjaFile}`)
    );
    listener.onDidCreate(uri => {
        logger().info(`${buildNinjaFile} created at ${uri}.`);
        onNewBuildFolder(context, testController);
    });
    listener.onDidChange(uri => {
        logger().info(`${buildNinjaFile} changed at ${uri}.`);
        createTargetMappingFile();
    });
    listener.onDidDelete(uri => {
        logger().info(`${buildNinjaFile} deleted ${uri}.`);
        processConfigurationStatus(context, testController);
    });
    context.subscriptions.push(listener);
    logger().info(`Listening to ${buildNinjaFile} file creation/changes in build folder ${buildFolder}.`);
    return listener;
}

function createTargetMappingFile() {
    const buildFolder = cfg.getBuildFolder();
    execShell(`cd ${buildFolder} && ninja -t targets all > ${targetMappingFileName}`);
}

export function deactivate() {
}
