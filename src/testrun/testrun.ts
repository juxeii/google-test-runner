import * as vscode from 'vscode';
import { ProcessHandler } from '../utils/system';
import { logInfo, logDebug } from '../utils/logger';
import { buildTests } from './testbuild';
import { evaluateTestResult } from './testevaluation';
import { RunTask } from '../utils/system';
import { createLeafItemsByRoot } from './testcontroller';
import { runTests } from './testexecution';
import { getGTestLogFile } from '../utils/utils';

export type RunEnvironment = {
    testRun: vscode.TestRun;
    testController: vscode.TestController;
    runRequest: vscode.TestRunRequest;
    leafItemsByRootItem: Map<vscode.TestItem, vscode.TestItem[]>
    runTasks: RunTask[];
    testExecutionEmitter: vscode.EventEmitter<void>;
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
        const runEnvironment = initializeRunEnvironment(testController, runRequest, testRun, token);
        startBuild(runEnvironment);
    }
}

function startBuild(runEnvironment: RunEnvironment) {
    const buildHandlers: ProcessHandler = {
        onDone: () => onBuildDone(runEnvironment),
        onData: logDebug,
        onError: () => onBuildFailed(runEnvironment),
        onAbort: (err) => logDebug(`Test build aborted!`)
    }
    const buildTask = buildTests(runEnvironment, buildHandlers);
    runEnvironment.runTasks.push(buildTask);
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

function initializeRunEnvironment(testController: vscode.TestController,
    runRequest: vscode.TestRunRequest,
    testRun: vscode.TestRun,
    token: vscode.CancellationToken) {

    const leafItemsByRootItem = createLeafItemsByRoot(testController, runRequest);
    let noOfExecutedTestFiles = 0;
    let testExecutionEmitter = new vscode.EventEmitter<void>();
    let testExecutionListener = testExecutionEmitter.event(() => {
        ++noOfExecutedTestFiles;
        if (noOfExecutedTestFiles === runEnvironment.leafItemsByRootItem.size) {
            onAllRunsCompleted(runEnvironment.testRun);
            testExecutionListener.dispose();
        }
    });

    const runEnvironment: RunEnvironment = {
        testRun: testRun,
        testController: testController,
        runRequest: runRequest,
        leafItemsByRootItem: leafItemsByRootItem,
        runTasks: [],
        testExecutionEmitter: testExecutionEmitter
    }

    const cancelListener = token.onCancellationRequested(() => {
        logDebug(`Requested cancel on test run.`);
        runEnvironment.runTasks.forEach(runTask => runTask.stop());
        skipItemsOnCancel(runEnvironment);
        testRun.end();
        cancelListener.dispose();
    });
    return runEnvironment;
}

function onBuildFailed(runEnvironment: RunEnvironment) {
    logInfo('Building the test executables failed. Keeping test states before the build.');
    runEnvironment.testRun.end();
}


function onBuildDone(runEnvironment: RunEnvironment) {
    logInfo('Test executables successfully build.');

    logDebug('Running test executables now...');
    runTests(runEnvironment,
        rootItem => onTestExecutionDone(rootItem, runEnvironment));
}

function onTestExecutionDone(rootItem: vscode.TestItem, runEnvironment: RunEnvironment) {
    logDebug(`Test execution for ${rootItem.uri} successful.`);
    logDebug(`Evaluating test results for ${rootItem.uri}`);

    evaluateTestResult(rootItem,
        runEnvironment,
        rootItem => onTestEvaluationDone(rootItem, runEnvironment.testExecutionEmitter),
        rootItem => onTestEvaluationFailed(rootItem, runEnvironment.testExecutionEmitter));
}

function onTestEvaluationDone(rootItem: vscode.TestItem, testExecutionEmitter: vscode.EventEmitter<void>) {
    logDebug(`Test evaluation for ${rootItem.uri} finished.`);
    const gTestLogFile = getGTestLogFile(rootItem.uri!).uri;
    logInfo(`GTest log file: ${gTestLogFile}`);
    logDebug(`Firing done event.`);
    testExecutionEmitter.fire();
}

function onTestEvaluationFailed(rootItem: vscode.TestItem, testExecutionEmitter: vscode.EventEmitter<void>) {
    logDebug(`Test evaluation for ${rootItem.uri} failed.`);
    logDebug(`Firing done event.`);
    testExecutionEmitter.fire();
}

function onAllRunsCompleted(run: vscode.TestRun) {
    run.end();
    logInfo('All tests completed.');
    logInfo('***********************************************');
    logInfo('Test run completed.');
    logInfo('***********************************************');
}