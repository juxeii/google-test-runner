import * as vscode from 'vscode';
import { logDebug } from '../utils/logger';
import fs = require('fs');
import { Observable } from 'observable-fns';

export type TestFailure =
    {
        message: string;
        lineNo: number;
        param: string | undefined;
    }

export type TestReport =
    {
        name: string;
        fixture: string;
        id: string;
        line: number;
        timestamp: string;
        file: string;
        hasPassed: boolean;
        failures: TestFailure[];
    }

export function createTestReportById(resultJSONUri: vscode.Uri) {
    const parsedJSON = parse(resultJSONUri);

    return Observable.from(parsedJSON.testsuites)
        .flatMap((testSuiteJSON: any) => Observable.from(testSuiteJSON.testsuite))
        .map(createTestReport)
        .reduce((testReportById: Map<string, TestReport[]>, testReport: TestReport) => {
            processTestReport(testReport, testReportById);
            return testReportById;
        }, new Map<string, TestReport[]>())
        .map((testReportById: Map<string, TestReport[]>) => {
            printTestReportById(testReportById);
            return testReportById;
        });
}

function printTestReportById(testReportById: Map<string, TestReport[]>) {
    testReportById.forEach((reports, id) => {
        logDebug(`Testreport with id ${id} passed ${reports[0].hasPassed}`);
    });
    return testReportById;
}

function parse(resultJSONUri: vscode.Uri) {
    const jsonResultRaw = fs.readFileSync(resultJSONUri.fsPath, { encoding: 'utf8', flag: 'r' });
    const jsonResult = jsonResultRaw.toString();
    return JSON.parse(jsonResult);
}

function processTestReport(testReport: TestReport, testReportById: Map<string, TestReport[]>) {
    let currentTestReports = testReportById.get(testReport.id);
    if (!currentTestReports) {
        currentTestReports = [];
    }
    currentTestReports.push(testReport);
    testReportById.set(testReport.id, currentTestReports);
}

function createTestReport(testCaseJSON: any) {
    const parameter = parameterOfTestCaseJSON(testCaseJSON);
    const failures = failuresOfTestCaseJSON(testCaseJSON, parameter);
    const testReport: TestReport =
    {
        name: testCaseJSON.name,
        fixture: testCaseJSON.fixture,
        id: testCaseId(testCaseJSON),
        line: testCaseJSON.line,
        timestamp: testCaseJSON.timestamp,
        file: testCaseJSON.file,
        hasPassed: failures.length === 0,
        failures: failuresOfTestCaseJSON(testCaseJSON, parameter)
    }
    return testReport;
}

function parameterOfTestCaseJSON(testCaseJSON: any) {
    if (testCaseJSON.value_param) {
        return testCaseJSON.value_param;
    }
    else if (testCaseJSON.type_param) {
        return testCaseJSON.type_param;
    }
    return undefined;
}

function failuresOfTestCaseJSON(testCaseJSON: any, parameter: any) {
    if (testCaseJSON.failures) {
        return fillFailures(testCaseJSON.failures, parameter);
    }
    return [];
}

function fillFailures(failuresJSON: Array<any>, paramName: string): TestFailure[] {
    return failuresJSON.map(failureJSON => {
        const testFailure: TestFailure =
        {
            message: failureJSON.failure,
            lineNo: lineNumberFromFailureMessage(failureJSON.failure),
            param: paramName
        }
        return testFailure;
    });
}

function testCaseId(testcase: any) {
    const testCaseName: string = testcase.name;
    const fixtureName: string = testcase.classname;

    if (testcase.type_param) {
        const fixtureNameWildCard = fixtureName.match(/\w+\/(\w+\/)?/)![0];
        return fixtureNameWildCard + "*." + testCaseName;
    }
    if (testcase.value_param) {
        const fixtureNameWildCard = fixtureName.match(/\w+\/\w+/);
        const testCaseNameWildCard = testCaseName.match(/\w+\//);
        return fixtureNameWildCard + "." + testCaseNameWildCard + '*';
    }
    return fixtureName + "." + testCaseName;
}

function lineNumberFromFailureMessage(failureMessage: string) {
    const lineNoRegex = /^.+\:(\d+)/;
    const lineNoMatch = lineNoRegex.exec(failureMessage)!;
    return Number(lineNoMatch[1]) - 1;
}