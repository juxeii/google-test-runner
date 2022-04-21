import * as vscode from 'vscode';
import { TestCaseDescriptor, TestCaseType, GTestType, TestInfo } from './types';
import { regexp } from './constants';
import * as path from 'path';
import { spawnShell, execShell } from './system';
import { createTestController } from './testrun';
import { parseDocument } from './testdiscovery';
import { getExtensionLogger } from "@vscode-logging/logger";

export let testMetaData = new WeakMap<vscode.TestItem, TestCaseDescriptor>();

export function getBuildFolder() {
    let config = vscode.workspace.getConfiguration("googletestrunner");
    let buildFolderFromConfig = config.get<string>('buildFolder');
    let workspaceFolder: string = vscode.workspace.rootPath ? vscode.workspace.rootPath : ".";
    let re = /\$\{workspaceFolder\}/;
    if (buildFolderFromConfig) {
        return buildFolderFromConfig.replace(re, workspaceFolder);
    } else {
        return buildFolderFromConfig!;
    }
}

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
    // const logger = getExtensionLogger({
    //     extName: "GoogleTestRunner",
    //     level: "info", // See LogLevel type in @vscode-logging/types for possible logLevels
    //     logPath: context.logPath, // The logPath is only available from the `vscode.ExtensionContext`
    //     logOutputChannel: vscode.window.createOutputChannel("GoogleTestRunner"), // OutputChannel for the logger
    //     sourceLocationTracking: false,
    //     logConsole: false // define if messages should be logged to the consol
    // });

    // logger.info("Hi From logger");

    let logOutput = vscode.window.createOutputChannel("GoogleTestRunner");
    let testController = createTestController(logOutput);
    context.subscriptions.push(testController);

    //Create output channel
    let config = vscode.workspace.getConfiguration("googletestrunner");
    let buildFolderFromConfig = config.get<string>('buildFolder');

    let workspaceFolder: string = vscode.workspace.rootPath ? vscode.workspace.rootPath : ".";
    let re = /\$\{workspaceFolder\}/;
    let buildFolder: string;

    if (buildFolderFromConfig) {
        buildFolder = buildFolderFromConfig.replace(re, workspaceFolder);
    } else {
        return;
    }

    logOutput.appendLine(`GoogleTestRunner started with build folder ${buildFolder}`);

    const currentWindow = vscode.window.activeTextEditor;

    if (currentWindow) {
        parseDocument(currentWindow.document, testController, buildFolder, logOutput);
        logOutput.appendLine(`currentWindow is ${currentWindow.document.uri}`);
    }
    let folders = vscode.workspace.workspaceFolders;
    if (folders) {
        logOutput.appendLine(`Listening to build.ninja file creates/changes workspace ${folders[0].uri.path}`);
        let workspaceRoot = folders[0].uri.path;
        let buildFolder = `${workspaceRoot}/build`;

        let watcher = vscode.workspace.createFileSystemWatcher(
            new vscode.RelativePattern(folders[0], 'build/build.ninja')
        );
        watcher.onDidCreate(uri => {
            logOutput.appendLine(`build.ninja created ${uri}`);
            createGoogleTestFileToTargetMappingFile(workspaceRoot);
        });
        watcher.onDidChange(uri => {
            logOutput.appendLine(`build.ninja changed ${uri}`);
            createGoogleTestFileToTargetMappingFile(workspaceRoot);
        });
        context.subscriptions.push(watcher);

        vscode.workspace.onDidOpenTextDocument(document => parseDocument(document, testController, buildFolder, logOutput));
        vscode.workspace.onDidSaveTextDocument(document => parseDocument(document, testController, buildFolder, logOutput));
        vscode.workspace.onDidCloseTextDocument(document => {
            const baseName = path.parse(document.uri.path).base;
            testController.items.delete(baseName);
        })
    }
}

// this method is called when your extension is deactivated
export function deactivate() {
}

async function createGoogleTestFileToTargetMappingFile(path: string) {
    let buildFolder = `${path}/build`;
    await execShell(`cd ${buildFolder}; ninja -t targets all > targets.out`);
}
