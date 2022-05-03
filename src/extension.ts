import * as vscode from 'vscode';
import * as fs from 'fs';
import * as R from 'fp-ts/Reader';
import { Option, none } from 'fp-ts/lib/Option'
import * as path from 'path';
import * as cfg from './utils/configuration';
import { logDebug, logError, logInfo } from './utils/logger';
import { TargetByInfo, createTargetByFileMapping } from './utils/utils';
import { pipe } from 'fp-ts/lib/function';
import { createTestController } from './testrun/testrun';
import { createBuildNinjaListener, createConfigurationListener, disposeOptionalListener, listenForChangeOnBuildNinja, listenForCreateOnBuildNinja, listenForDeleteOnBuildNinja } from './listener';
import { observeTestCases, ParseResult } from './documentcontrol';
import { updateTestControllerFromDocument } from './testrun/testcontroller';

export const buildNinjaFile = 'build.ninja';
export let targetFileByUri: Map<string, TargetByInfo>;

export type ExtEnvironment = {
    context: vscode.ExtensionContext;
    testController: vscode.TestController;
    buildNinjaFileName: string;
    buildFolder: () => string;
    buildNinjaListener: Option<vscode.FileSystemWatcher>;
}

export function activate(context: vscode.ExtensionContext) {
    logInfo(`${cfg.extensionName} activated.`);

    const environment = createExtEnvironment(context);
    const configHandler = (event: vscode.ConfigurationChangeEvent): void => onConfigurationChange(event)(environment);
    const configListener = createConfigurationListener(configHandler)
    registerDisposables(configListener)(environment);
    onNewBuildFolder(environment);
}

const createExtEnvironment = (context: vscode.ExtensionContext): ExtEnvironment => {
    return {
        context: context,
        testController: initTestController(context),
        buildNinjaFileName: buildNinjaFile,
        buildFolder: cfg.getBuildFolder,
        buildNinjaListener: none
    }
}

const onNewBuildFolder = (env: ExtEnvironment): void => {
    if (!fs.existsSync(env.buildFolder())) {
        showInvalidBuildFolderMessage(env.buildFolder())
        return;
    }
    logDebug(`Build folder is ${env.buildFolder()}.`);
    resetExt(env);
}

const showInvalidBuildFolderMessage = (invalidFolder: string) => {
    const misconfiguredMsg = `The provided build folder ${invalidFolder} does not exist. Please change to an existing build folder via settings menu.`;
    logError(misconfiguredMsg);
    vscode.window.showWarningMessage(misconfiguredMsg)
}

const resetExt = (env: ExtEnvironment): void => {
    pipe(
        resetData,
        R.chain(createBuildNinjaListener),
        R.chain(initBuildNinjaListener),
        R.chain(processBuildManifest)
    )(env);
}

const initBuildNinjaListener = (listener: vscode.FileSystemWatcher): R.Reader<ExtEnvironment, void> => {
    const createListener = listenForCreateOnBuildNinja(listener, onBuildNinjaCreate);
    const changeListener = listenForChangeOnBuildNinja(listener, onBuildNinjaChange);
    const deleteListener = listenForDeleteOnBuildNinja(listener, onBuildNinjaDelete);
    return registerDisposables(createListener, changeListener, deleteListener);
}

const processBuildManifest = (): R.Reader<ExtEnvironment, void> => env => {
    if (!isBuildNinjaFilePresent()) {
        buildManifestMissingMessage(env.buildFolder());
    }
    else {
        targetFileByUri = createTargetByFileMapping();
        observeTestCases().subscribe({
            next(parseResult) { onNewParseResult(parseResult)(env); },
            error(err) { logError(`Error occured while observing test cases from documents!`) }
        });
    }
}

const onNewParseResult = (parseResult: ParseResult): R.Reader<ExtEnvironment, void> => env => {
    const testCases = parseResult.testCases;
    const document = parseResult.document;
    if (testCases.length === 0) {
        logDebug(`No more testcases in ${document.uri}. Removing items from test controller.`);
        const fileName = path.basename(document.uri.fsPath);
        env.testController.items.delete(fileName);
    }
    else {
        updateTestControllerFromDocument(parseResult.document, env.testController, parseResult.testCases);
        logDebug(`Current testcontroller item size ${env.testController.items.size}`);
    }
}

const resetData = (): R.Reader<ExtEnvironment, void> => env => {
    logDebug(`Resetting extension because of build configuration change.`);
    env.testController.items.replace([]);
    disposeOptionalListener(env.buildNinjaListener);
}

const initTestController = (context: vscode.ExtensionContext): vscode.TestController => {
    const testController = createTestController();
    context.subscriptions.push(testController);
    return testController;
}

const onConfigurationChange = (event: vscode.ConfigurationChangeEvent): R.Reader<ExtEnvironment, void> => env => {
    if (cfg.hasBuildFolderChanged(event)) {
        onNewBuildFolder(env);
    }
};

const onBuildNinjaCreate = (buildNinjaUri: vscode.Uri): R.Reader<ExtEnvironment, void> => env => {
    logDebug(`${env.buildNinjaFileName} created at ${buildNinjaUri}.`);
    resetExt(env);
};

const onBuildNinjaChange = (buildNinjaUri: vscode.Uri): R.Reader<ExtEnvironment, void> => env => {
    logDebug(`${env.buildNinjaFileName} changed at ${buildNinjaUri}.`);
    resetExt(env);
};

const onBuildNinjaDelete = (buildNinjaUri: vscode.Uri): R.Reader<ExtEnvironment, void> => env => {
    logDebug(`${env.buildNinjaFileName} deleted ${buildNinjaUri}.`);
    resetExt(env);
};

const registerDisposables = (...disposables: vscode.Disposable[]): R.Reader<ExtEnvironment, void> => env => {
    disposables.forEach(disposable => env.context.subscriptions.push(disposable))
};

const isBuildNinjaFilePresent = (): boolean => {
    const buildNinjaPath = path.join(cfg.getBuildFolder(), buildNinjaFile);
    return fs.existsSync(buildNinjaPath);
}

const buildManifestMissingMessage = (buildFolder: string): void => {
    const noBuildManifestMessage = `GoogleTestRunner needs the ${buildNinjaFile} file to work. Please run cmake configure at least once with your configured build folder ${buildFolder}.`;
    logInfo(noBuildManifestMessage);
    vscode.window.showWarningMessage(noBuildManifestMessage)
}

export function deactivate() {
}