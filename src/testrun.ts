import * as vscode from 'vscode';
import * as path from 'path';
import * as rj from './resultjson';
import * as cfg from './configuration';
import { spawnShell } from './system';
import { logInfo, logDebug, logError } from './logger';
import { buildTests } from './testbuild';
import { getTargetFileForUri, lastPathOfDocumentUri } from './utils';

type RunEnvironment = {
    testController: vscode.TestController;
    request: vscode.TestRunRequest;
    requestedItemsByDocumentUri: Map<vscode.Uri, vscode.TestItem[]>;
}

export function createTestController() {
    let testController = vscode.tests.createTestController('GoogleTestController', 'GoogleTestController');
    testController.createRunProfile('Run Tests', vscode.TestRunProfileKind.Run, createRunHandler(testController), true);
    return testController;
}

function addItemToRequestedItemsByDocumentId(item: vscode.TestItem, requestedItemsByDocumentUri: Map<vscode.Uri, vscode.TestItem[]>) {
    if (!item.uri) {
        return;
    }
    let currentItems = requestedItemsByDocumentUri.get(item.uri);
    if (!currentItems) {
        currentItems = [];
    }
    currentItems.push(item);
    requestedItemsByDocumentUri.set(item.uri, currentItems);
    logDebug(`Added item ${item.id} to item.uri ${item.uri}.`);
}

function createItemToDocumentUriMapping(testController: vscode.TestController, request: vscode.TestRunRequest) {
    const requestedItemsByDocumentUri = new Map<vscode.Uri, vscode.TestItem[]>();
    if (request.include) {
        request.include.forEach(item => addItemToRequestedItemsByDocumentId(item, requestedItemsByDocumentUri));
    } else {
        testController.items.forEach(item => addItemToRequestedItemsByDocumentId(item, requestedItemsByDocumentUri));
    }
    return requestedItemsByDocumentUri;
}

function createRunHandler(testController: vscode.TestController) {
    return async function runHandler(
        request: vscode.TestRunRequest,
        token: vscode.CancellationToken
    ) {
        const requestedItemsByDocumentUri = createItemToDocumentUriMapping(testController, request);
        const targets = new Set<string>();
        Array.from(requestedItemsByDocumentUri.keys()).forEach(uri => {
            const targetName = path.parse(uri.path).name;
            logDebug(`found target ${targetName} `);
            targets.add(targetName);
        });

        let runEnvironment: RunEnvironment = {
            testController: testController,
            request: request,
            requestedItemsByDocumentUri: requestedItemsByDocumentUri,
        }

        buildTests([...targets], () => onBuildDone(runEnvironment), () => onBuildFailed());
    }
}

function createRunFilter(items: vscode.TestItem[]) {
    let filter = '';
    items.forEach(item => {
        if (!item.parent) {
            filter = '*';
            logDebug(`No filter for ${item.id} needed`);
            return;
        }

        if (item.children.size > 1 && item.parent) {
            const fixtureFilter = item.id + '*:';
            filter += fixtureFilter;
            logDebug(`Adding fixture filter ${fixtureFilter} for item ${item.id}.Current filter is ${filter} `);
            return;
        }

        if (item.parent && !item.parent.parent) {
            const testCaseFilter = item.id + ':';
            filter += testCaseFilter;
            logDebug(`Adding testcase filter ${testCaseFilter} for item ${item.id}.Current filter is ${filter} `);
            return;
        }

        if (item.parent && item.parent.parent) {
            const testCaseFilter = item.id + ':';
            filter += testCaseFilter;
            logDebug(`Adding testcase filter ${testCaseFilter} for item ${item.id}.Current filter is ${filter} `);
        }
    });
    return filter;
}

function onBuildFailed() {
    logInfo('Building the test executables failed. Keeping test states before the build.');
}

async function onBuildDone(runEnvironment: RunEnvironment) {
    logInfo('Starting test run...');
    const run = runEnvironment.testController.createTestRun(runEnvironment.request);

    let noOfRuns = 0;
    let runsCompletedEmitter = new vscode.EventEmitter<void>();
    let runCompletedListener = runsCompletedEmitter.event(() => {
        ++noOfRuns;
        if (noOfRuns === runEnvironment.requestedItemsByDocumentUri.size) {
            onAllRunsCompleted(run);
            runCompletedListener.dispose();
        }
    });

    runEnvironment.requestedItemsByDocumentUri.forEach((items, uri) => {
        const targetFile = getTargetFileForUri(uri);
        const filter = createRunFilter(items);
        const baseName = lastPathOfDocumentUri(uri);
        const jsonResultFile = `test_detail_for_${baseName}`;
        runTarget(runEnvironment, targetFile, filter, jsonResultFile, run, runsCompletedEmitter, uri);
    });
}

function runTarget(runEnvironment: RunEnvironment,
    targetFile: string,
    filter: string,
    jsonResultFile: string,
    run: vscode.TestRun,
    runsCompletedEmitter: vscode.EventEmitter<void>,
    uri: vscode.Uri) {
    const cmd = `cd ${cfg.getBuildFolder()} && ${targetFile} --gtest_filter=${filter} --gtest_output=json:${jsonResultFile} `;
    spawnShell(cmd, (code) => {
        onJSONResultAvailable(runEnvironment, jsonResultFile, run, runsCompletedEmitter, uri);
    }, (err) => onTestTargetRunFailed());
}

function onTestTargetRunFailed() {
    logInfo('onTestTargetRun failed');
}

function onAllRunsCompleted(run: vscode.TestRun) {
    run.end();
    logInfo('All test runs completed.');
}

function evaluateItem(item: vscode.TestItem, testReportById: Map<string, rj.TestReport[]>, run: vscode.TestRun) {
    if (item.children.size > 0) {
        item.children.forEach(item => evaluateItem(item, testReportById, run));
    }
    logDebug(`Looking for test result of item ${item.id} `);
    const testReports = testReportById.get(item.id);
    if (testReports) {
        logDebug(`Testreport found for ${item.id}`);
        const testCaseFailures = testReports.filter(report => {
            return !report.hasPassed;
        });

        if (testCaseFailures.length === 0) {
            processPassedTestcase(run, item);
        }
        else {
            processFailedTestcase(run, item, testCaseFailures[0].failures[0]);
        }
    }
    else {
        logError(`Testcase item for id ${item.id} not found!`);
    }
}

async function onJSONResultAvailable(runEnvironment: RunEnvironment,
    jsonResultFile: string,
    run: vscode.TestRun,
    runsCompletedEmitter: vscode.EventEmitter<void>,
    uri: vscode.Uri) {
    const buildFolder = cfg.getBuildFolder();
    const jsonResultFileUri = vscode.Uri.file(path.join(buildFolder, jsonResultFile));
    const testReportById = await rj.createTestReportById(jsonResultFileUri);


    logDebug(`runEnvironment.requestedItemsByDocumentUri size ${runEnvironment.requestedItemsByDocumentUri.size} uri ${uri} `);
    runEnvironment.requestedItemsByDocumentUri.get(uri)?.forEach(item => {
        logDebug(`Inside ${item.id}`);
        evaluateItem(item, testReportById, run);
    });
    logDebug(`Firing result evalutaion end`);
    runsCompletedEmitter.fire();
}

function processPassedTestcase(run: vscode.TestRun, item: vscode.TestItem) {
    logInfo(`Testcase ${item.id} passed.`);
    run.passed(item);
}

function processFailedTestcase(run: vscode.TestRun, item: vscode.TestItem, failure: rj.TestFailure) {
    logInfo(`Testcase ${item.id} failed.`);
    let failureMessage = failure.message;
    if (failure.param) {
        failureMessage += '\n' + `Failure parameter: ${failure.param} `;
    }
    const failureMessageForDocument = createFailureMessageForDocument(item, failureMessage, failure);
    run.failed(item, failureMessageForDocument);
}

function createFailureMessageForDocument(item: vscode.TestItem, failureMessage: string, failure: rj.TestFailure) {
    const message = new vscode.TestMessage(failureMessage.substring(failureMessage.indexOf("\n") + 1));
    const lineNo = failure.lineNo;
    message.location = new vscode.Location(item.uri!, new vscode.Position(lineNo, 0));
    return message;
}
