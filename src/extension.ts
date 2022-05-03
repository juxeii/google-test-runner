import * as vscode from 'vscode';
import * as fs from 'fs';
import * as R from 'fp-ts/Reader';
import { Option, none, some } from 'fp-ts/lib/Option'
import * as path from 'path';
import * as cfg from './utils/configuration';
import { logDebug, logError, logInfo } from './utils/logger';
import { TargetByInfo, createTargetByFileMapping } from './utils/utils';
import { pipe } from 'fp-ts/lib/function';
import { createTestController } from './testrun/testrun';
import { BuildNinjaUpdate, observeConfiguration, observeBuildNinja } from './listener';
import { observeTestCases, ParseResult } from './documentcontrol';
import { updateTestControllerFromDocument } from './testrun/testcontroller';
import { IO } from 'fp-ts/lib/IO';
import { Subscription } from 'observable-fns';
import { map } from 'fp-ts/lib/Option';

export const buildNinjaFile = 'build.ninja';
export let targetFileByUri: Map<string, TargetByInfo>;

export type ExtEnvironment = {
    context: vscode.ExtensionContext;
    testController: vscode.TestController;
    buildNinjaFileName: string;
    buildFolder: () => string;
    buildNinjaSubscriber: Option<Subscription<BuildNinjaUpdate>>;
}

export function activate(context: vscode.ExtensionContext) {
    logInfo(`${cfg.extensionName} activated.`);

    const environment = createExtEnvironment(context);
    subscribeToConfigurationUpdates()(environment);
    subscribeToTestCaseUpdatesFromDocuments()(environment);
    onNewBuildFolder(environment);
}

const subscribeToConfigurationUpdates = (): R.Reader<ExtEnvironment, void> => env => {
    observeConfiguration().subscribe({
        next(event) { onConfigurationChange(event)(env); },
        error(_) { logError(`Error occured while observing configuration!`) }
    });
}

const subscribeToTestCaseUpdatesFromDocuments = (): R.Reader<ExtEnvironment, void> => env => {
    observeTestCases().subscribe({
        next(parseResult) { onNewParseResult(parseResult)(env); },
        error(_) { logError(`Error occured while observing test cases from documents!`) }
    });
}

const createExtEnvironment = (context: vscode.ExtensionContext): ExtEnvironment => {
    return {
        context: context,
        testController: initTestController(context),
        buildNinjaFileName: buildNinjaFile,
        buildFolder: cfg.getBuildFolder,
        buildNinjaSubscriber: none
    }
}

const onNewBuildFolder = (env: ExtEnvironment): void => {
    if (!fs.existsSync(env.buildFolder())) {
        showInvalidBuildFolderMessage(env.buildFolder())
        return;
    }
    logDebug(`Resetting extension because of new build folder.`);
    resetExt(env);
}

const showInvalidBuildFolderMessage = (invalidFolder: string) => {
    const misconfiguredMsg = `The provided build folder ${invalidFolder} does not exist. Please change to an existing build folder via settings menu.`;
    logError(misconfiguredMsg);
    vscode.window.showWarningMessage(misconfiguredMsg)
}

const resetExt = (env: ExtEnvironment): void => {
    resetData(env);
    subscribeToBuildNinjaUpdates()(env);
    processBuildManifest()(env);
}

const resetData = (env: ExtEnvironment): void => {
    env.testController.items.replace([]);
    pipe(
        env.buildNinjaSubscriber,
        map(subscriber => subscriber.unsubscribe())
    )
}

const subscribeToBuildNinjaUpdates = (): R.Reader<ExtEnvironment, void> => env => {
    const observer = observeBuildNinja(env.buildNinjaFileName).subscribe({
        next(_) { processBuildManifest()(env); },
        error(_) { logError(`Error occured while observing build ninja updates!`) }
    });
    env.buildNinjaSubscriber = some(observer);
}

const processBuildManifest = (): R.Reader<ExtEnvironment, void> => env => {
    if (!isBuildNinjaFilePresent()) {
        buildManifestMissingMessage(env.buildFolder());
    }
    else {
        logDebug(`Reprocessing build ninja file because of changes.`);
        targetFileByUri = createTargetByFileMapping();
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

const initTestController = (context: vscode.ExtensionContext): vscode.TestController => {
    const testController = createTestController();
    context.subscriptions.push(testController);
    return testController;
}

const onConfigurationChange = (event: vscode.ConfigurationChangeEvent): R.Reader<ExtEnvironment, void> => env => {
    if (cfg.hasBuildFolderChanged(event)) {
        logDebug(`Configuration of build folder changed.`);
        onNewBuildFolder(env);
    }
};

const isBuildNinjaFilePresent = (): boolean => {
    const buildNinjaPath = path.join(cfg.getBuildFolder(), buildNinjaFile);
    return fs.existsSync(buildNinjaPath);
}

const buildManifestMissingMessage = (buildFolder: string): void => {
    const noBuildManifestMessage = `GoogleTestRunner needs the ${buildNinjaFile} file to work. Please run cmake configure at least once with your configured build folder ${buildFolder}.`;
    logInfo(noBuildManifestMessage);
    showWarningMessage(noBuildManifestMessage)();
}

const showWarningMessage = (message: string): IO<void> => () => vscode.window.showWarningMessage(message)

export function deactivate() {
}