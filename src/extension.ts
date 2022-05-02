import * as vscode from 'vscode';
import * as fs from 'fs';
import * as R from 'fp-ts/Reader';
import * as path from 'path';
import * as cfg from './utils/configuration';
import { logDebug, logError, logInfo } from './utils/logger';
import { TargetByInfo, createTargetByFileMapping, lastPathOfDocumentUri } from './utils/utils';
import { pipe } from 'fp-ts/lib/function';
import { createTestController } from './testrun/testrun';
import { discoverGTestMacros } from './parsing/macrodiscovery';
import { discoverTestCasesFromMacros } from './parsing/testdiscovery';
import { updateTestControllerFromDocument } from './testrun/testcontroller';

export const buildNinjaFile = 'build.ninja';
export let targetFileByUri: Map<string, TargetByInfo>;

type ExtEnvironment = {
    context: vscode.ExtensionContext;
    testController: vscode.TestController;
    buildNinjaFileName: string;
    buildFolder: () => string;
    buildFolderListener: vscode.FileSystemWatcher | undefined;
    activeTextEditorListener: vscode.Disposable | undefined;
    saveTextDocumentListener: vscode.Disposable | undefined;
    closeTextDocumentListener: vscode.Disposable | undefined;
    parsedFiles: Set<vscode.Uri>;
    noTestFiles: Set<vscode.Uri>;
}

export function activate(context: vscode.ExtensionContext) {
    logInfo(`${cfg.extensionName} activated.`);

    const environment = createExtEnvironment(context);
    pipe(
        context,
        createConfigurationListener,
        R.chain(registerDisposable),
        R.chain(onNewBuildFolder)
    )(environment);
}

const createExtEnvironment = (context: vscode.ExtensionContext): ExtEnvironment => {
    return {
        context: context,
        testController: initTestController(context),
        buildNinjaFileName: buildNinjaFile,
        buildFolder: cfg.getBuildFolder,
        buildFolderListener: undefined,
        activeTextEditorListener: undefined,
        saveTextDocumentListener: undefined,
        closeTextDocumentListener: undefined,
        parsedFiles: new Set<vscode.Uri>(),
        noTestFiles: new Set<vscode.Uri>()
    }
}

const onNewBuildFolder = (): R.Reader<ExtEnvironment, void> => env => {
    if (!fs.existsSync(env.buildFolder())) {
        showInvalidBuildFolderMessage(env.buildFolder())
        return;
    }
    logDebug(`Build folder is ${env.buildFolder()}.`);
    resetExt(env);
}

const resetExt = (env: ExtEnvironment): void => {
    pipe(
        resetData,
        R.chain(createBuildNinjaListener),
        R.chain(listenForCreateOnBuildNinja),
        R.chain(listenForChangeOnBuildNinja),
        R.chain(listenForDeleteOnBuildNinja),
        R.chain(registerDisposable),
        R.chain(processBuildManifest)
    )(env);
}

const processBuildManifest = (): R.Reader<ExtEnvironment, void> => env => {
    if (!isBuildNinjaFilePresent()) {
        buildManifestMissingMessage(env.buildFolder());
    }
    else {
        pipe(
            initExtDataForNewManifest(),
            R.chain(initDocumentListeners),
            R.chain(parseCurrentDocument)
        )(env);
    }
}

const resetData = (): R.Reader<ExtEnvironment, void> => env => {
    logDebug(`Resetting extension because of build configuration change.`);
    env.testController.items.replace([]);
    env.parsedFiles.clear();
    env.noTestFiles.clear();
    if (env.buildFolderListener) {
        env.buildFolderListener.dispose();
    }
}

const initExtDataForNewManifest = (): R.Reader<ExtEnvironment, void> => env => {
    targetFileByUri = createTargetByFileMapping();
    if (env.activeTextEditorListener) {
        env.activeTextEditorListener.dispose();
        env.saveTextDocumentListener!.dispose();
        env.closeTextDocumentListener!.dispose();
    }
}

const parseCurrentDocument = (): R.Reader<ExtEnvironment, void> => env => {
    const currentWindow = vscode.window.activeTextEditor;
    if (currentWindow) {
        fillTestControllerWithTestCasesFromDocument(currentWindow.document)(env);
    }
}

const fillTestControllerWithTestCasesFromDocument = (document: vscode.TextDocument): R.Reader<ExtEnvironment, void> => async env => {
    if (!isDocumentValidForParsing(document)(env)) {
        return;
    }
    handleValidDocument(document)(env);
}

const handleValidDocument = (document: vscode.TextDocument): R.Reader<ExtEnvironment, void> => async env => {
    const macros = await discoverGTestMacros(document);
    const testCases = discoverTestCasesFromMacros(macros);
    if (testCases.length < 1) {
        env.noTestFiles.add(document.uri);
        logDebug(`Adding ${document.uri} to set of files with no tests.`);
        return;
    }

    env.noTestFiles.delete(document.uri);
    updateTestControllerFromDocument(document, env.testController, testCases);
    logDebug(`Current testcontroller item size ${env.testController.items.size}`);
    env.parsedFiles.add(document.uri);
}

const isDocumentValidForParsing = (document: vscode.TextDocument): R.Reader<ExtEnvironment, boolean> => env => {
    if (document.uri.scheme != 'file') {
        return false;
    }
    if (env.noTestFiles.has(document.uri)) {
        logDebug(`File ${document.uri} has no tests. No need to reparse.`);
        return false;
    }
    if (env.parsedFiles.has(document.uri) && !document.isDirty) {
        return false;
    }
    return document.languageId === "cpp";
}

const initDocumentListeners = (): R.Reader<ExtEnvironment, void> => env => {
    env.activeTextEditorListener = vscode.window.onDidChangeActiveTextEditor(editor => {
        if (!editor) {
            return;
        }
        fillTestControllerWithTestCasesFromDocument(editor.document)(env);
    });
    env.saveTextDocumentListener = vscode.workspace.onDidSaveTextDocument(document => {
        handleValidDocument(document)(env);
    });
    env.closeTextDocumentListener = vscode.workspace.onDidCloseTextDocument(document => {
        const fileName = path.basename(document.uri.fsPath);
        env.testController.items.delete(fileName);
    })
    env.context.subscriptions.push(env.activeTextEditorListener);
    env.context.subscriptions.push(env.saveTextDocumentListener);
    env.context.subscriptions.push(env.closeTextDocumentListener);
}

const initTestController = (context: vscode.ExtensionContext): vscode.TestController => {
    let testController = createTestController();
    context.subscriptions.push(testController);
    return testController;
}

const createConfigurationListener = (context: vscode.ExtensionContext): R.Reader<ExtEnvironment, vscode.Disposable> => env => {
    const configurationListener = vscode.workspace.onDidChangeConfiguration(event => {
        if (cfg.hasBuildFolderChanged(event)) {
            onNewBuildFolder()(env);
        }
    });
    context.subscriptions.push(configurationListener);
    logDebug(`Created configuration listener.`);
    return configurationListener;
};

const createBuildNinjaListener = (): R.Reader<ExtEnvironment, vscode.FileSystemWatcher> => env => {
    logInfo(`Listening to ${env.buildNinjaFileName} file creation/changes in build folder ${env.buildFolder()}.`);
    const listener = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(env.buildFolder(), `${buildNinjaFile}`)
    );
    env.buildFolderListener = listener;
    return listener;
};

const listenForCreateOnBuildNinja = (listener: vscode.FileSystemWatcher): R.Reader<ExtEnvironment, vscode.FileSystemWatcher> => env => {
    listener.onDidCreate(uri => {
        logInfo(`${env.buildNinjaFileName} created at ${uri}.`);
        resetExt(env);
    });
    return listener;
};

const listenForChangeOnBuildNinja = (listener: vscode.FileSystemWatcher): R.Reader<ExtEnvironment, vscode.FileSystemWatcher> => env => {
    listener.onDidChange(uri => {
        logInfo(`${env.buildNinjaFileName} changed at ${uri}.`);
        resetExt(env);
    });
    return listener;
};

const listenForDeleteOnBuildNinja = (listener: vscode.FileSystemWatcher): R.Reader<ExtEnvironment, vscode.FileSystemWatcher> => env => {
    listener.onDidDelete(uri => {
        logInfo(`${env.buildNinjaFileName} deleted ${uri}.`);
        resetExt(env);
    });
    return listener;
};

const showInvalidBuildFolderMessage = (invalidFolder: string) => {
    const misconfiguredMsg = `The provided build folder ${invalidFolder} does not exist. Please change to an existing build folder via settings menu.`;
    logError(misconfiguredMsg);
    vscode.window.showWarningMessage(misconfiguredMsg)
}

const registerDisposable = (disposable: vscode.Disposable): R.Reader<ExtEnvironment, void> => env => {
    env.context.subscriptions.push(disposable);
};

const isBuildNinjaFilePresent = (): boolean => {
    let buildNinjaPath = path.join(cfg.getBuildFolder(), buildNinjaFile);
    return fs.existsSync(buildNinjaPath);
}

const buildManifestMissingMessage = (buildFolder: string): void => {
    const noBuildManifestMessage = `GoogleTestRunner needs the ${buildNinjaFile} file to work. Please run cmake configure at least once with your configured build folder ${buildFolder}.`;
    logInfo(noBuildManifestMessage);
    vscode.window.showWarningMessage(noBuildManifestMessage)
}

export function deactivate() {
}