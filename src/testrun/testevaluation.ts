import * as vscode from 'vscode';
import * as path from 'path';
import * as rj from '../resultjson';
import { RunEnvironment } from './testrun';
import { logInfo, logDebug, logError } from '../utils/logger';
import { getJSONResultFile, lastPathOfDocumentUri } from '../utils/utils';

export async function evaluateTestResult(rootItem: vscode.TestItem,
    runEnvironment: RunEnvironment,
    onTestEvaluationDone: (item: vscode.TestItem) => void,
    onTestEvaluationFailed: (item: vscode.TestItem) => void) {
    const testReportById = await createTestReportById(rootItem);
    if (hasEvaluatedWithoutErrors(rootItem, runEnvironment, testReportById)) {
        onTestEvaluationDone(rootItem);
    }
    else {
        onTestEvaluationFailed(rootItem);
    }
}

function createTestReportById(rootItem: vscode.TestItem) {
    const jsonResultFile = getJSONResultFile(rootItem.uri!);
    logDebug(`Evaluating json result file ${jsonResultFile.baseName}`);
    return rj.createTestReportById(jsonResultFile.uri);
}

function hasEvaluatedWithoutErrors(rootItem: vscode.TestItem, runEnvironment: RunEnvironment, testReportById: Map<string, rj.TestReport[]>) {
    return runEnvironment.leafItemsByRootItem.get(rootItem!)!.reduce((testState, currentItem) => {
        const testReportsForItem = testReportById.get(currentItem.id);
        if (!testReportsForItem) {
            logError(`Testreport for ${currentItem.id} not found in test file!`);
            return false;
        }
        evaluteItem(currentItem, testReportsForItem, runEnvironment.testRun);
        return testState;
    }, true);
}

function evaluteItem(item: vscode.TestItem, testReportsForItem: rj.TestReport[], testRun: vscode.TestRun) {
    logDebug(`Looking for test result of leaf item ${item.id} `);
    const testCaseFailures = testReportsForItem.filter(report => {
        return !report.hasPassed;
    });

    if (testCaseFailures.length === 0) {
        processPassedTestcase(testRun, item);
    }
    else {
        processFailedTestcase(testRun, item, testCaseFailures[0].failures[0]);
    }
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