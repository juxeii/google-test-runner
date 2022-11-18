import * as vscode from 'vscode';
import * as rj from '../parsing/resultjson';
import { RunEnvironment } from './testrun';
import { logInfo, logDebug, logError } from '../utils/logger';
import { getJSONResultFile } from '../utils/fsutils';
import { createFailureMessage } from '../parsing/failure';
import * as cfg from '../utils/configuration';
import { convertXMLToJSON } from '../utils/xmlutils';

export function observeTestResult(rootItem: vscode.TestItem, runEnvironment: RunEnvironment) {
    return createTestReportById(rootItem)
        .map((testReportById: Map<string, rj.TestReport[]>) => {
            if (!hasEvaluatedWithoutErrors(rootItem, runEnvironment, testReportById)) {
                throw new Error('Internal test evaluation error!');
            }
            return rootItem;
        });
}

function createTestReportById(rootItem: vscode.TestItem) {
    const jsonResultFile = getJSONResultFile(rootItem.uri!);
    logDebug(`Evaluating json result file ${jsonResultFile.baseName}`);

    if (cfg.legacySupport()) {
        logDebug(`Converting XML to proper JSON format.`);
        convertXMLToJSON(jsonResultFile.uri);
    }

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
    const failureMessage = createFailureMessage(item, failure);
    run.failed(item, failureMessage);
}