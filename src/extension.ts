import * as vscode from 'vscode';
import * as path from 'path';
import * as cfg from './configuration';
import { targetMappingFileName, buildNinjaFile } from './constants';
import { execShell } from './system';
import { createTestController } from './testrun';
import { parseDocument } from './testdiscovery';
import { logger } from './logger';

export function activate(context: vscode.ExtensionContext) {
    logger().info(`${cfg.extensionName} activated.`);
    initExtension(context);
}

function initExtension(context: vscode.ExtensionContext) {
    initConfigurationListeners(context);
    initComponents(context);
}

function initComponents(context: vscode.ExtensionContext) {
    if (!cfg.isConfigurationValid()) {
        showMisConfigurationMessage();
        return;
    }

    let testController = initTestController(context);
    initDocumentListeners(testController);
    parseCurrentEditor(testController);

    logConfigurationDone();
}

function parseCurrentEditor(testController: vscode.TestController) {
    const currentWindow = vscode.window.activeTextEditor;
    if (currentWindow) {
        parseDocument(currentWindow.document, testController);
    }
}

function initTestController(context: vscode.ExtensionContext) {
    let testController = createTestController();
    context.subscriptions.push(testController);
    return testController;
}

function initConfigurationListeners(context: vscode.ExtensionContext) {
    let buildNinjaListener = createListenerForNinjaBuildFile(context);
    context.subscriptions.push(buildNinjaListener);
    let buildFolder = cfg.getBuildFolder();
    logger().info(`Listening to ${buildNinjaFile} file creation/changes in build folder ${buildFolder}.`);

    vscode.workspace.onDidChangeConfiguration(event => {
        if (cfg.hasConfigurationChanged(event)) {
            initComponents(context);
        }
    });
}

function initDocumentListeners(testController: vscode.TestController) {
    vscode.workspace.onDidOpenTextDocument(document => parseDocument(document, testController));
    vscode.workspace.onDidSaveTextDocument(document => parseDocument(document, testController));
    vscode.workspace.onDidCloseTextDocument(document => {
        const baseName = path.parse(document.uri.path).base;
        testController.items.delete(baseName);
    })
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

function createListenerForNinjaBuildFile(context: vscode.ExtensionContext) {
    let buildFolder = cfg.getBuildFolder();
    let listener = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(buildFolder, `${buildNinjaFile}`)
    );
    listener.onDidCreate(uri => {
        logger().info(`${buildNinjaFile} created at ${uri}.`);
        createTargetMappingFile(buildFolder);
        initComponents(context);
    });
    listener.onDidChange(uri => {
        logger().info(`${buildNinjaFile} changed at ${uri}.`);
        createTargetMappingFile(buildFolder);
    });
    return listener;
}

async function createTargetMappingFile(buildFolder: string) {
    execShell(`cd ${buildFolder} && ninja -t targets all > ${targetMappingFileName}`);
}

export function deactivate() {
}
