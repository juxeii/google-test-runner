import * as vscode from 'vscode';
import * as path from 'path';
import * as cfg from './configuration';
import { spawnShell } from './system';
import { logInfo, logDebug, logError } from './logger';
import { buildTests } from './testbuild';
import { getTargetFileForDocument, getTargetForDocument, lastPathOfDocumentUri } from './utils';
import { evaluateJSONResult } from './testevaluate';
import { targetMappingFileContents } from './extension';

export type RunEnvironment = {
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
            //const targetName = path.parse(uri.path).name;
            const targetName = getTargetForDocument(targetMappingFileContents, uri);
            logDebug(`Found build target ${targetName} for uri ${uri}`);
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
        const targetFile = getTargetFileForDocument(uri);
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
        evaluateJSONResult(runEnvironment, jsonResultFile, run, runsCompletedEmitter, uri);
    }, error => onTestTargetRunFailed(error, targetFile, runsCompletedEmitter));
}

function onTestTargetRunFailed(error: string, targetFile: string, runsCompletedEmitter: vscode.EventEmitter<void>) {
    logError(`Test run for target file ${targetFile} failed with error ${error}`);
    runsCompletedEmitter.fire();
}

function onAllRunsCompleted(run: vscode.TestRun) {
    run.end();
    logInfo('All test runs completed.');
}