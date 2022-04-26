import * as vscode from 'vscode';
import * as path from 'path';
import * as rj from './resultjson';
import * as cfg from './configuration';
import { RunEnvironment } from './testrun';
import { logInfo, logDebug, logError } from './logger';
import { lastPathOfDocumentUri } from './utils';

export async function evaluateTestResult(rootItem: vscode.TestItem,
    runEnvironment: RunEnvironment,
    onTestEvaluationDone: (item: vscode.TestItem) => void,
    onTestEvaluationFailed: (item: vscode.TestItem) => void) {
    const baseName = lastPathOfDocumentUri(rootItem.uri!);
    const jsonResultFile = `test_detail_for_${baseName}`;
    logDebug(`Evaluating json result file ${jsonResultFile}`);

    const buildFolder = cfg.getBuildFolder();
    const jsonResultFileUri = vscode.Uri.file(path.join(buildFolder, jsonResultFile));
    const testReportById = await rj.createTestReportById(jsonResultFileUri);

    let evaluationSuccess = true;
    runEnvironment.leafItemsByRootItem.get(rootItem!)!.forEach(item => {
        if (!evaluateItem(item, testReportById, runEnvironment.testRun)) {
            evaluationSuccess = false;
        }
    });
    if (evaluationSuccess) {
        onTestEvaluationDone(rootItem);
    }
    else {
        onTestEvaluationFailed(rootItem);
    }
}

function evaluateItem(item: vscode.TestItem, testReportById: Map<string, rj.TestReport[]>, testRun: vscode.TestRun) {
    logDebug(`Looking for test result of leaf item ${item.id} `);
    const testReports = testReportById.get(item.id);
    if (testReports) {
        logDebug(`Testreport found for ${item.id}`);
        const testCaseFailures = testReports.filter(report => {
            return !report.hasPassed;
        });

        if (testCaseFailures.length === 0) {
            processPassedTestcase(testRun, item);
        }
        else {
            processFailedTestcase(testRun, item, testCaseFailures[0].failures[0]);
        }
        return true;
    }
    else {
        logError(`Testcase item for id ${item.id} not found!`);
        return false;
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