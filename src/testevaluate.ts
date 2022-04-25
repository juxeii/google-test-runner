import * as vscode from 'vscode';
import * as path from 'path';
import * as rj from './resultjson';
import * as cfg from './configuration';
import { RunEnvironment } from './testrun';
import { logInfo, logDebug, logError } from './logger';

export async function evaluateJSONResult(runEnvironment: RunEnvironment,
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