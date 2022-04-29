import * as vscode from 'vscode';
import { logInfo, logDebug, logError } from '../utils/logger';
import { buildTests } from './testbuild';
import { observeTestResult } from './testevaluation';
import { createLeafItemsByRoot } from './testcontroller';
import { runTest } from './testexecution';
import { getGTestLogFile } from '../utils/utils';
import { Observable } from 'observable-fns';
import { targetFileByUri } from '../extension';

export type RunEnvironment = {
    testRun: vscode.TestRun;
    testController: vscode.TestController;
    runRequest: vscode.TestRunRequest;
    leafItemsByRootItem: Map<vscode.TestItem, vscode.TestItem[]>;
}

export function createTestController() {
    let testController = vscode.tests.createTestController('GoogleTestController', 'GoogleTestController');
    testController.createRunProfile('Run Tests', vscode.TestRunProfileKind.Run, createRunHandler(testController), true);
    return testController;
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
                error(err) { onTestRunFinishedWithError(testRun, runEnvironment) },
                complete() { onAllRunsCompleted(testRun, runEnvironment) }
            });

        const cancelListener = token.onCancellationRequested(() => {
            skipItemsOnCancel(runEnvironment);
            testRunSubscription.unsubscribe();
            testRun.end();
            cancelListener.dispose();
            logInfo('***********************************************');
            logInfo('Test run cancelled.');
            logInfo('***********************************************');
        });
    }
}

function observeTestExecutation(rootItem: vscode.TestItem, runEnvironment: RunEnvironment) {
    const filePath = rootItem.uri?.fsPath!;
    const targetFile = targetFileByUri.get(filePath)?.targetFile;

    logDebug(`Running test executable ${targetFile} ...`);
    const leafItems = runEnvironment.leafItemsByRootItem.get(rootItem)!;
    return runTest({ rootItem: rootItem, leafItems: leafItems });
}

function startRun(testController: vscode.TestController, runRequest: vscode.TestRunRequest) {
    logInfo('***********************************************');
    logInfo('Starting test run...');
    logInfo('***********************************************');
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

function onTestRunFinishedWithError(run: vscode.TestRun, runEnvironment: RunEnvironment) {
    run.end();
    logInfo('***********************************************');
    logInfo('Test run finished with errors.');
    logInfo('***********************************************');
}

function onAllRunsCompleted(run: vscode.TestRun, runEnvironment: RunEnvironment) {
    run.end();
    logInfo('***********************************************');
    logInfo('Test run completed.');
    showLogFiles(runEnvironment);
    logInfo('***********************************************');
}

function showLogFiles(runEnvironment: RunEnvironment) {
    [...runEnvironment.leafItemsByRootItem.keys()].forEach(rootItem => {
        const gTestLogFile = getGTestLogFile(rootItem.uri!).uri;
        logInfo(`Log file for ${rootItem.id}: ${gTestLogFile}`);
    });
}