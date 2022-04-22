import * as vscode from 'vscode';
import { logger } from './logger';

export async function parse(resultUri: vscode.Uri) {
    const jsonResultRaw = await vscode.workspace.fs.readFile(resultUri);
    const jsonResult = jsonResultRaw.toString();
    logger().debug(`JSON result ${jsonResult}`);
    return JSON.parse(jsonResult);
}

export function forEachTestSuite(testsuites: Array<any>, handler: (testsuite: any) => void) {
    for (let i = 0; i < testsuites.length; i++) {
        handler(testsuites[i]);
    }
}

export async function forEachTestCase(jsonResultUri: vscode.Uri, handler: (testsuite: any, testcase: any) => void) {
    let parsedJsonResult = await parse(jsonResultUri);
    let testsuites: Array<any> = parsedJsonResult.testsuites;

    for (let i = 0; i < testsuites.length; i++) {
        let testsuite: any = testsuites[i];
        let testcases: Array<any> = testsuites[i].testsuite;
        for (let y = 0; y < testcases.length; y++) {
            handler(testcases[y], testsuite);
        }
    }
}

export function testcaseId(testcase: any, testsuite: any) {
    const testCaseName = testcase.name;
    const testSuiteName: string = testsuite.name;
    if (isParameterizedTestcase(testcase)) {
        return testSuiteName;
    }
    return testSuiteName + "." + testCaseName;
}

export function lineNumberFromFailureMessage(failureMessage: string) {
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