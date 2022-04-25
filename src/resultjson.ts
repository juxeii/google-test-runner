import * as vscode from 'vscode';
import { logDebug } from './logger';

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
        parameter: string | undefined;
        line: number;
        timestamp: string;
        file: string;
        hasPassed: boolean;
        failures: TestFailure[];
    }

export async function createTestReportById(resultJSONUri: vscode.Uri) {
    const parsedJSON = await parse(resultJSONUri);

    const testReportById = createTestReports(parsedJSON);
    testReportById.forEach((reports, id) => {
        logDebug(`Testreport with id ${id} passed ${reports[0].hasPassed}`);
    });

    return testReportById;
}

async function parse(resultJSONUri: vscode.Uri) {
    const jsonResultRaw = await vscode.workspace.fs.readFile(resultJSONUri);
    const jsonResult = jsonResultRaw.toString();
    return JSON.parse(jsonResult);
}

function createTestReports(parsedJSON: any) {
    let testReportById = new Map<string, TestReport[]>();
    mapJSONArray(parsedJSON.testsuites, testSuiteJSON => {
        logDebug(`Processing testSuiteJSON ${testSuiteJSON.name}`);

        mapJSONArray(testSuiteJSON.testsuite, testCaseJSON => {
            let parameter = undefined;
            if (testCaseJSON.value_param) {
                parameter = testCaseJSON.value_param;
            }
            else if (testCaseJSON.type_param) {
                parameter = testCaseJSON.type_param;
            }

            let failures: TestFailure[] = [];
            if (testCaseJSON.failures) {
                failures = fillFailures(testCaseJSON.failures, parameter);
            }

            const testReport: TestReport =
            {
                name: testCaseJSON.name,
                fixture: testCaseJSON.fixture,
                id: testCaseId(testCaseJSON),
                parameter: parameter,
                line: testCaseJSON.line,
                timestamp: testCaseJSON.timestamp,
                file: testCaseJSON.file,
                hasPassed: failures.length === 0,
                failures: failures
            }
            logDebug(`Processing testCaseJSON ${testCaseJSON.name} with id ${testReport.id}`);

            let currentTestReports = testReportById.get(testReport.id);
            if (!currentTestReports) {
                currentTestReports = [];
            }
            currentTestReports.push(testReport);
            testReportById.set(testReport.id, currentTestReports);

        });
    });
    return testReportById;
}

function fillFailures(failuresJSON: Array<any>, paramName: string): TestFailure[] {
    logDebug(`fillFailures len ${fillFailures.length}`);
    return mapJSONArray(failuresJSON, failureJSON => {
        const testFailure: TestFailure =
        {
            message: failureJSON.failure,
            lineNo: lineNumberFromFailureMessage(failureJSON.failure),
            param: paramName
        }
        logDebug(`TestFailure structure \
message ${failureJSON.message} \
lineNo ${failureJSON.lineNo}`);
        return testFailure;
    });
}

function mapJSONArray<T>(jsonArray: Array<any>, handler: (item: any) => T) {
    let resultArray: T[] = [];
    for (let i = 0; i < jsonArray.length; i++) {
        const mapResult = handler(jsonArray[i]);
        resultArray.push(mapResult);
    }
    return resultArray;
}

function testCaseId(testcase: any) {
    const testCaseName: string = testcase.name;
    const fixtureName: string = testcase.classname;

    if (testcase.type_param) {
        //Typed test
        const fixtureNameWildCard = fixtureName.match(/\w+\/(\w+\/)?/)![0];
        return fixtureNameWildCard + "*." + testCaseName;
    }
    if (testcase.value_param) {
        //Typed test#
        const fixtureNameWildCard = fixtureName.match(/\w+\/\w+/);
        const testCaseNameWildCard = testCaseName.match(/\w+\//);
        return fixtureNameWildCard + "." + testCaseNameWildCard + '*';
    }
    return fixtureName + "." + testCaseName;
}

function lineNumberFromFailureMessage(failureMessage: string) {
    let lineNoRegex = /^.+\:(\d+)/;
    let lineNoMatch = lineNoRegex.exec(failureMessage)!;
    return Number(lineNoMatch[1]) - 1;
}