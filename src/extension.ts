import * as vscode from 'vscode';
import * as path from 'path';
import * as cfg from './configuration';
import { execShell } from './system';
import { createTestController } from './testrun';
import { discoverGTestMacros } from './macrodiscovery';
import { updateTestControllerFromDocument } from './testcontroller';
import { logDebug, logInfo } from './logger';
import { discoverTestCasesFromMacros } from './testdiscovery';
import { lastPathOfDocumentUri } from './utils';

export const buildNinjaFile = "build.ninja";
export let targetMappingFileContents = '';
let buildNinjaListener: vscode.FileSystemWatcher;
let parsedFiles = new Set<vscode.Uri>();
let noTestFiles = new Set<vscode.Uri>();
const targetMappingFileName = "targets.out";

export function activate(context: vscode.ExtensionContext) {
    logInfo(`${cfg.extensionName} activated.`);
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
    resetStatus(testController);
    processConfigurationStatus(context, testController);
}

function resetStatus(testController: vscode.TestController) {
    const noItems: vscode.TestItem[] = [];
    testController.items.replace(noItems);
    parsedFiles.clear();
    noTestFiles.clear();
}

async function processConfigurationStatus(context: vscode.ExtensionContext, testController: vscode.TestController) {
    if (cfg.isConfigurationValid()) {
        await loadTargetMappings();
        logConfigurationDone();
        parseCurrentEditor(context, testController);
    }
    else {
        showMisConfigurationMessage();
        resetStatus(testController);
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
        logDebug(`File ${document.uri} has no tests. No need to reparse.`);
        return false;
    }

    if (parsedFiles.has(document.uri) && !document.isDirty) {
        return false;
    }

    const languageName = document.languageId;
    return languageName && languageName === "cpp";
}

async function fillTestControllerWithTestCasesFromDocument(context: vscode.ExtensionContext, document: vscode.TextDocument, testController: vscode.TestController) {
    const macros = await discoverGTestMacros(document);
    const testCases = discoverTestCasesFromMacros(macros);
    if (testCases.length < 1) {
        noTestFiles.add(document.uri);
        logDebug(`Adding ${document.uri} to set of files with no tests.`);
        return;
    }

    noTestFiles.delete(document.uri);
    updateTestControllerFromDocument(document, testController, testCases);
    logDebug(`Current testcontroller item size ${testController.items.size}`);
    parsedFiles.add(document.uri);
}

function initTestController(context: vscode.ExtensionContext) {
    let testController = createTestController();
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
        logDebug(`onDidChangeActiveTextEditor ${editor.document.uri}`);
        if (!isDocumentValidForParsing(editor.document)) {
            return;
        }
        fillTestControllerWithTestCasesFromDocument(context, editor.document, testController);
    });
    // let openTextDocumentListener = vscode.workspace.onDidOpenTextDocument(document => {
    //     logDebug(`onDidOpenTextDocument ${document.uri.path}`);
    //     fillTestControllerWithTestCasesFromDocument(context, document, testController);
    // });
    let saveTextDocumentListener = vscode.workspace.onDidSaveTextDocument(document => {
        logDebug(`onDidSaveTextDocument ${document.uri}`);
        fillTestControllerWithTestCasesFromDocument(context, document, testController);
    });
    let closeTextDocumentListener = vscode.workspace.onDidCloseTextDocument(document => {
        const baseName = lastPathOfDocumentUri(document.uri);
        testController.items.delete(baseName);
    })
    context.subscriptions.push(activeTextEditorListener);
    //context.subscriptions.push(openTextDocumentListener);
    context.subscriptions.push(saveTextDocumentListener);
    context.subscriptions.push(closeTextDocumentListener);
}

function logConfigurationDone() {
    let buildFolder = cfg.getBuildFolder();
    logInfo(`Configuring GoogleTestRunner with ${buildNinjaFile} in ${buildFolder} done.`);
}

function showMisConfigurationMessage() {
    let buildFolder = cfg.getBuildFolder();
    const misconfiguredMsg = `GoogleTestRunner needs the ${buildNinjaFile} file to work. Please run cmake configure at least once with your configured build folder ${buildFolder}.`;
    logInfo(misconfiguredMsg);
    vscode.window.showWarningMessage(misconfiguredMsg)
}

function createBuildNinjaListener(context: vscode.ExtensionContext, testController: vscode.TestController) {
    let buildFolder = cfg.getBuildFolder();
    let listener = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(buildFolder, `${buildNinjaFile}`)
    );
    listener.onDidCreate(uri => {
        logInfo(`${buildNinjaFile} created at ${uri}.`);
        onNewBuildFolder(context, testController);
    });
    listener.onDidChange(uri => {
        logInfo(`${buildNinjaFile} changed at ${uri}.`);
        resetStatus(testController);
        loadTargetMappings();
    });
    listener.onDidDelete(uri => {
        logInfo(`${buildNinjaFile} deleted ${uri}.`);
        processConfigurationStatus(context, testController);
    });
    context.subscriptions.push(listener);
    logInfo(`Listening to ${buildNinjaFile} file creation/changes in build folder ${buildFolder}.`);
    return listener;
}

async function loadTargetMappings() {
    await createTargetMappingFile();
    const buildFolder = cfg.getBuildFolder()
    const targetMappingUri = vscode.Uri.file(path.join(buildFolder, targetMappingFileName));
    const rawContents = await vscode.workspace.fs.readFile(targetMappingUri);
    const unfilteredText = rawContents.toString()

    const lineFilterRegExp = /(CXX_COMPILER__|CXX_EXECUTABLE_LINKER__)/;
    targetMappingFileContents = unfilteredText.split('\n').filter(line => line.match(lineFilterRegExp)).join('\n');

    logDebug(`unfilteredText size ${unfilteredText.length} targetMappingFileContents size ${targetMappingFileContents.length}`);
}

async function createTargetMappingFile() {
    const buildFolder = cfg.getBuildFolder();
    await execShell(`cd ${buildFolder} && ninja -t targets all > ${targetMappingFileName}`);
    logDebug(`Created target mappings file ${targetMappingFileName}`);
}

export function deactivate() {
}
