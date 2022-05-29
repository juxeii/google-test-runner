import * as vscode from 'vscode';
import * as path from 'path';
import { logInfo, logDebug, logError, outputChannelGT } from '../utils/logger';
import { buildTest, buildTests } from './testbuild';
import { observeTestResult } from './testevaluation';
import { createLeafItemsByRoot } from './testcontroller';
import { runTest } from './testexecution';
import { getFileContents, getGTestLogFile } from '../utils/fsutils';
import { loadSharedLibsOnDebug } from '../utils/configuration';
import { ExtEnvironment } from '../extension';
import { TargetByInfo } from '../parsing/buildninja';

export type RunEnvironment = {
    testRun: vscode.TestRun;
    testController: vscode.TestController;
    targetInfoByFile: Map<string, TargetByInfo>;
    runRequest: vscode.TestRunRequest;
    leafItemsByRootItem: Map<vscode.TestItem, vscode.TestItem[]>;
}

export function initRunProfiles(extEnvironment: ExtEnvironment) {
    extEnvironment.testController.createRunProfile('Run Tests', vscode.TestRunProfileKind.Run, createRunHandler(extEnvironment), true);
    if (!vscode.extensions.getExtension('ms-vscode.cpptools')) {
        logInfo('ms-vscode.cpptools extension is not installed. Test debugging is disabled.');
    }
    else {
        extEnvironment.testController.createRunProfile('Debug Tests', vscode.TestRunProfileKind.Debug, createDebugHandler(extEnvironment), true);
    }
}

function createDebugHandler(env: ExtEnvironment) {
    return async function debugHandler(
        runRequest: vscode.TestRunRequest,
        token: vscode.CancellationToken
    ) {
        if (!runRequest.include || runRequest.include.length > 1) {
            logInfo('Only one testcase at a time is supported for debugging.');
            return;
        }

        const testItem = runRequest.include[0];
        const targetName = env.targetInfoByFile.get(testItem.uri!.fsPath)!.name;
        buildTest(targetName, testItem).subscribe({
            next(rootItem) { logDebug(`Debug build finished.`) },
            error(err) { logError(`Debug build failed!`) },
            complete() { debug() }
        });

        function debug() {
            printBlock('Debug session started.');
            const targetFile = env.targetInfoByFile.get(testItem.uri!.fsPath)!.targetFile;
            const cwd = path.dirname(targetFile);
            const workspaceFolder = vscode.workspace.workspaceFolders![0];
            const testCaseName = testItem.label;
            logInfo(`Debugging testcase ${testCaseName} in executable ${targetFile}.`);

            vscode.debug.onDidTerminateDebugSession((e) => {
                printBlock('Debug session ended.');
            });

            vscode.debug.startDebugging(workspaceFolder, {
                'name': 'GTestRunner Debug',
                'type': 'cppdbg',
                'request': 'launch',
                'program': targetFile,
                'stopAtEntry': false,
                'cwd': cwd,
                'externalConsole': false,
                "symbolLoadInfo": {
                    "loadAll": loadSharedLibsOnDebug(),
                    "exceptionList": ""
                },
            });
        }
    }
}

function createRunHandler(env: ExtEnvironment) {
    return async function runHandler(
        runRequest: vscode.TestRunRequest,
        token: vscode.CancellationToken
    ) {
        const testRun = startRun(env.testController, runRequest);
        const runEnvironment = initializeRunEnvironment(env, runRequest, testRun);

        const testRunSubscription = buildTests(runEnvironment)
            .flatMap(rootItem => observeTestExecution(rootItem, runEnvironment))
            .flatMap(rootItem => observeTestResult(rootItem, runEnvironment))
            .subscribe({
                next(rootItem) { logDebug(`Test evaluation done for ${rootItem.uri}`) },
                error(error: Error) { onTestRunFinishedWithError(testRun, error) },
                complete() { onAllRunsCompleted(testRun, runEnvironment) }
            });

        const cancelListener = token.onCancellationRequested(() => {
            skipItemsOnCancel(runEnvironment);
            testRunSubscription.unsubscribe();
            testRun.end();
            cancelListener.dispose();
            printBlock('Test run cancelled.');
        });
    }
}

function observeTestExecution(rootItem: vscode.TestItem, runEnvironment: RunEnvironment) {
    const filePath = rootItem.uri?.fsPath!;
    const targetFile = runEnvironment.targetInfoByFile.get(filePath)?.targetFile;

    logDebug(`Running test executable ${targetFile} ...`);
    const leafItems = runEnvironment.leafItemsByRootItem.get(rootItem)!;
    return runTest({ rootItem: rootItem, leafItems: leafItems, targetInfoByFile: runEnvironment.targetInfoByFile });
}

function startRun(testController: vscode.TestController, runRequest: vscode.TestRunRequest) {
    printBlock('Starting test run...');
    const testRun = testController.createTestRun(runRequest);
    showItemSpinners(testController, runRequest, testRun);
    return testRun;
}

function showItemSpinners(testController: vscode.TestController, runRequest: vscode.TestRunRequest, testRun: vscode.TestRun) {
    if (runRequest.include) {
        runRequest.include.forEach(item => testRun.started(item));
    } else {
        testController.items.forEach(item => testRun.started(item));
    }
}

function skipItemsOnCancel(runEnvironment: RunEnvironment) {
    if (runEnvironment.runRequest.include) {
        runEnvironment.runRequest.include.forEach(item => runEnvironment.testRun.skipped(item));
    } else {
        runEnvironment.testController.items.forEach(item => runEnvironment.testRun.skipped(item));
    }
}

function initializeRunEnvironment(env: ExtEnvironment, runRequest: vscode.TestRunRequest, testRun: vscode.TestRun) {
    const leafItemsByRootItem = createLeafItemsByRoot(env.testController, runRequest);
    const runEnvironment: RunEnvironment = {
        testRun: testRun,
        testController: env.testController,
        targetInfoByFile: env.targetInfoByFile,
        runRequest: runRequest,
        leafItemsByRootItem: leafItemsByRootItem
    }
    return runEnvironment;
}

function onTestRunFinishedWithError(run: vscode.TestRun, err: Error) {
    run.end();
    printBlock(`Test run finished with error message: ${err.message}`);
}

function onAllRunsCompleted(run: vscode.TestRun, runEnvironment: RunEnvironment) {
    run.end();
    showLogFiles(runEnvironment);
    printBlock('Test run completed.');
}

function showLogFiles(runEnvironment: RunEnvironment) {
    [...runEnvironment.leafItemsByRootItem.keys()].forEach(rootItem => {
        const gTestLogFile = getGTestLogFile(rootItem.uri!).uri;
        logInfo(`Log file for ${rootItem.id}: ${gTestLogFile}`);

        outputChannelGT.appendLine('***********************************************');
        const logFileText = getFileContents(gTestLogFile.fsPath);
        outputChannelGT.show(true);
        outputChannelGT.appendLine(logFileText);
        outputChannelGT.appendLine('***********************************************');
    });
}

function printBlock(blockText: string) {
    logInfo('***********************************************');
    logInfo(blockText);
    logInfo('***********************************************');
}