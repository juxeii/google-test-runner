import * as vscode from 'vscode';
import { logger } from './logger';

export type TestFailure =
    {
        message: string;
        lineNo: number;
    }

export type TestCase =
    {
        name: string;
        valueParameter: string | undefined;
        line: number;
        timestamp: string;
        file: string;
        failures: TestFailure[];
    }

export type TestSuites =
    {
        tests: number;
        failures: number;
        errors: number;
        timestamp: string;
        name: string;
        testCases: TestCase[];
    }

export type TestCaseReport =
    {
        tests: number;
        failures: number;
        errors: number;
        timestamp: string;
        name: string;
        testSuites: TestSuites[];
    }

export async function createTestReportFromJSONFile(resultJSONUri: vscode.Uri) {
    const parsedJSON = await parse(resultJSONUri);
    return fillTestReport(parsedJSON);
}

function fillTestReport(parsedJSON: any) {
    logger().debug(`fillTestReport`);
    logger().debug(`parsedJSON.testsuites.testsuite.length ${parsedJSON.testsuites[0].testsuite.length}`);
    const testCaseReport: TestCaseReport = {
        tests: parsedJSON.tests,
        failures: parsedJSON.failures,
        errors: parsedJSON.errors,
        timestamp: parsedJSON.timestamp,
        name: parsedJSON.name,
        testSuites: fillTestSuites(parsedJSON.testsuites)
    };
    logger().debug(`TestCaseReport structure \
tests ${testCaseReport.tests} \
failures ${testCaseReport.failures} \
errors ${testCaseReport.errors} \
timestamp ${testCaseReport.timestamp} \
name ${testCaseReport.name}`);

    return testCaseReport;
}

function fillTestSuites(testSuitesJSON: Array<any>): TestSuites[] {
    logger().debug(`fillTestSuites len ${testSuitesJSON.length}`);
    return mapJSONArray(testSuitesJSON, testSuiteJSON => {
        logger().debug(`fillTestSuites1 testSuiteJSON.testsuite ${testSuiteJSON.testsuite}`);
        const testSuites: TestSuites =
        {
            tests: testSuiteJSON.tests,
            failures: testSuiteJSON.failures,
            errors: testSuiteJSON.errors,
            timestamp: testSuiteJSON.timestamp,
            name: testSuiteJSON.name,
            testCases: fillTestCases(testSuiteJSON.testsuite)
            //testCases: []
        }
        logger().debug(`fillTestSuites1.1`);
        logger().debug(`TestSuites structure \
tests ${testSuiteJSON.tests} \
failures ${testSuiteJSON.failures} \
errors ${testSuiteJSON.errors} \
timestamp ${testSuiteJSON.timestamp} \
name ${testSuiteJSON.name}`);
        return testSuites;
    });
}

function fillTestCases(testSuiteJSON: Array<any>) {
    logger().debug(`fillTestCases len ${testSuiteJSON.length}`);
    return mapJSONArray(testSuiteJSON, testCaseJSON => {
        logger().debug(`fillTestCases1`);
        const valueParameter = testCaseJSON.valueParameter ? testCaseJSON.valueParameter : undefined;
        logger().debug(`fillTestCases1.1`);

        let failures: TestFailure[] = [];
        if (testCaseJSON.failures) {
            failures = fillFailures(testCaseJSON.failures);
        }
        const testCase: TestCase =
        {
            name: testCaseJSON.name,
            valueParameter: valueParameter,
            line: testCaseJSON.line,
            timestamp: testCaseJSON.timestamp,
            file: testCaseJSON.file,
            failures: failures
        }
        // logger().debug(`TestCase structure name ${testCaseJSON.name}`);
        logger().debug(`TestCase structure \
name ${testCaseJSON.name} \ 
line ${testCaseJSON.line} \
timestamp ${testCaseJSON.timestamp} \
file ${testCaseJSON.file}`);
        return testCase;
    });
}

function fillFailures(failuresJSON: Array<any>): TestFailure[] {
    logger().debug(`fillFailures len ${fillFailures.length}`);
    return mapJSONArray(failuresJSON, failureJSON => {
        const testFailure: TestFailure =
        {
            message: failureJSON.failure,
            lineNo: lineNumberFromFailureMessage(failureJSON.failure)
        }
        logger().debug(`TestFailure structure \
message ${failureJSON.message} \
lineNo ${failureJSON.lineNo}`);
        return testFailure;
    });
}


async function parse(resultJSONUri: vscode.Uri) {
    const jsonResultRaw = await vscode.workspace.fs.readFile(resultJSONUri);
    const jsonResult = jsonResultRaw.toString();
    logger().debug(`JSON result ${jsonResult}`);
    return JSON.parse(jsonResult);
}

function mapJSONArray<T>(jsonArray: Array<any>, handler: (item: any) => T) {
    let resultArray: T[] = [];
    for (let i = 0; i < jsonArray.length; i++) {
        const mapResult = handler(jsonArray[i]);
        resultArray.push(mapResult);
    }
    return resultArray;
}

function forEachTestSuite(testsuites: Array<any>, handler: (testsuite: any) => void) {
    for (let i = 0; i < testsuites.length; i++) {
        handler(testsuites[i]);
    }
}

// function forEachTestCase(jsonResultUri: vscode.Uri, handler: (testsuite: any, testcase: any) => void) {
//     let parsedJsonResult = await parse(jsonResultUri);
//     let testsuites: Array<any> = parsedJsonResult.testsuites;

//     for (let i = 0; i < testsuites.length; i++) {
//         let testsuite: any = testsuites[i];
//         let testcases: Array<any> = testsuites[i].testsuite;
//         for (let y = 0; y < testcases.length; y++) {
//             handler(testcases[y], testsuite);
//         }
//     }
// }

function testcaseId(testcase: any, testsuite: any) {
    const testCaseName = testcase.name;
    const testSuiteName: string = testsuite.name;
    if (isParameterizedTestcase(testcase)) {
        return testSuiteName;
    }
    return testSuiteName + "." + testCaseName;
}

function lineNumberFromFailureMessage(failureMessage: string) {
    let lineNoRegex = /^.+\:(\d+)/;
    let lineNoMatch = lineNoRegex.exec(failureMessage)!;
    return Number(lineNoMatch[1]) - 1;
}

function isParameterizedTestcase(testcase: any) {
    return testcase.value_param;
}

function testsuites(jsonResult: any): Array<any> {
    return jsonResult.testsuites;
}