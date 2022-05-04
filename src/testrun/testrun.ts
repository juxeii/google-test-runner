import * as vscode from 'vscode';
import * as path from 'path';
import { logInfo, logDebug, logError } from '../utils/logger';
import { buildTest, buildTests } from './testbuild';
import { observeTestResult } from './testevaluation';
import { createLeafItemsByRoot } from './testcontroller';
import { runTest } from './testexecution';
import { getGTestLogFile } from '../utils/utils';
import { targetInfoByFile } from '../extension';
import { loadSharedLibsOnDebug } from '../utils/configuration';

export type RunEnvironment = {
    testRun: vscode.TestRun;
    testController: vscode.TestController;
    runRequest: vscode.TestRunRequest;
    leafItemsByRootItem: Map<vscode.TestItem, vscode.TestItem[]>;
}

export function createTestController() {
    const testController = vscode.tests.createTestController('GoogleTestController', 'GoogleTestController');
    testController.createRunProfile('Run Tests', vscode.TestRunProfileKind.Run, createRunHandler(testController), true);
    testController.createRunProfile('Debug Tests', vscode.TestRunProfileKind.Debug, createDebugHandler(testController), true);
    return testController;
}

function createDebugHandler(testController: vscode.TestController) {
    return async function debugHandler(
        runRequest: vscode.TestRunRequest,
        token: vscode.CancellationToken
    ) {

        if (!vscode.extensions.getExtension('ms-vscode.cpptools')) {
            logInfo('Please install ms-vscode.cpptools extension in order to debug testcases!');
            return;
        }
        if (!runRequest.include || runRequest.include.length > 1) {
            logInfo('Only one testcase at a time is supported for debugging.');
            return;
        }

        const testItem = runRequest.include[0];
        const targetName = targetInfoByFile.get(testItem.uri!.fsPath)!.name;
        buildTest(targetName, testItem).subscribe({
            next(rootItem) { logDebug(`Debug build finished.`) },
            error(err) { logError(`Debug build failed!`) },
            complete() { debug() }
        });

        function debug() {
            printBlock('Debug session started.');
            const targetFile = targetInfoByFile.get(testItem.uri!.fsPath)!.targetFile;
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

function createRunHandler(testController: vscode.TestController) {
    return async function runHandler(
        runRequest: vscode.TestRunRequest,
        token: vscode.CancellationToken
    ) {
        const testRun = startRun(testController, runRequest);
        const runEnvironment = initializeRunEnvironment(testController, runRequest, testRun);

        const testRunSubscription = buildTests(runEnvironment)
            .flatMap(rootItem => observeTestExecutation(rootItem, runEnvironment))
            .flatMap(rootItem => observeTestResult(rootItem, runEnvironment))
            .subscribe({
                next(rootItem) { logDebug(`Test evaluation done for ${rootItem.uri}`) },
                error(err) { onTestRunFinishedWithError(testRun) },
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

function observeTestExecutation(rootItem: vscode.TestItem, runEnvironment: RunEnvironment) {
    const filePath = rootItem.uri?.fsPath!;
    const targetFile = targetInfoByFile.get(filePath)?.targetFile;

    logDebug(`Running test executable ${targetFile} ...`);
    const leafItems = runEnvironment.leafItemsByRootItem.get(rootItem)!;
    return runTest({ rootItem: rootItem, leafItems: leafItems });
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

function initializeRunEnvironment(testController: vscode.TestController, runRequest: vscode.TestRunRequest, testRun: vscode.TestRun) {
    const leafItemsByRootItem = createLeafItemsByRoot(testController, runRequest);
    const runEnvironment: RunEnvironment = {
        testRun: testRun,
        testController: testController,
        runRequest: runRequest,
        leafItemsByRootItem: leafItemsByRootItem
    }
    return runEnvironment;
}

function onTestRunFinishedWithError(run: vscode.TestRun) {
    run.end();
    printBlock('Test run finished with errors.');
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
    });
}

function printBlock(blockText: string) {
    logInfo('***********************************************');
    logInfo(blockText);
    logInfo('***********************************************');
}