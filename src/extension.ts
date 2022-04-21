import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { TestCaseDescriptor } from './types';
import { targetMappingFileName, buildNinjaFile } from './constants';
import { execShell } from './system';
import { createTestController } from './testrun';
import { parseDocument } from './testdiscovery';
import { logger } from './logger';

export function activate(context: vscode.ExtensionContext) {
    const extensionName = context.extension.packageJSON.displayName;
    logger().info(`${extensionName} activated.`);
    initExtension(context);
}

function initExtension(context: vscode.ExtensionContext) {
    initConfigurationListeners(context);
    initComponents(context);
}

function hasConfigurationChanged(event: vscode.ConfigurationChangeEvent) {
    return event.affectsConfiguration("googletestrunner.buildFolder");
}

function initComponents(context: vscode.ExtensionContext) {
    if (!isConfigurationValid()) {
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
    let buildFolder = getBuildFolder();
    logger().info(`Listening to ${buildNinjaFile} file creation/changes in build folder ${buildFolder}.`);

    vscode.workspace.onDidChangeConfiguration(event => {
        if (hasConfigurationChanged(event)) {
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
    let buildFolder = getBuildFolder();
    logger().info(`Configuring GoogleTestRunner with ${buildNinjaFile} in ${buildFolder} done.`);
}

function showMisConfigurationMessage() {
    let buildFolder = getBuildFolder();
    const misconfiguredMsg = `GoogleTestRunner needs the ${buildNinjaFile} file to work. Please run cmake configure at least once with your configured build folder ${buildFolder}.`;
    logger().info(misconfiguredMsg);
    vscode.window.showWarningMessage(misconfiguredMsg)
}

function isBuildNinjaFilePresent() {
    let buildNinjaPath = path.join(getBuildFolder(), buildNinjaFile);
    return fs.existsSync(buildNinjaPath);
}

function isConfigurationValid() {
    return isBuildNinjaFilePresent();
}

function createListenerForNinjaBuildFile(context: vscode.ExtensionContext) {
    let buildFolder = getBuildFolder();
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

export let testMetaData = new WeakMap<vscode.TestItem, TestCaseDescriptor>();

export function getBuildFolder() {
    let config = vscode.workspace.getConfiguration("googletestrunner");
    let buildFolderFromConfig = config.get<string>('buildFolder');
    let workspaceFolder: string = vscode.workspace.workspaceFolders![0].uri.path;
    let re = /\$\{workspaceFolder\}/;
    if (buildFolderFromConfig) {
        return buildFolderFromConfig.replace(re, workspaceFolder);
    }
    return buildFolderFromConfig!;
}

async function createTargetMappingFile(buildFolder: string) {
    execShell(`cd ${buildFolder} && ninja -t targets all > ${targetMappingFileName}`);
}

export function deactivate() {
}
