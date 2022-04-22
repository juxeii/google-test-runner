import * as vscode from 'vscode';
import * as path from 'path';
import * as cfg from './configuration';
import { TestCase, GTestType } from './types';
import { regexp } from './constants';
import { logger } from './logger';

export async function parseDocument(document: vscode.TextDocument, testController: vscode.TestController) {
    let testCases: TestCase[] = [];

    logger().debug(`Discovering testcases in document ${document.uri}`);
    testCases = await discoverTestCasesInDocument(document);
    if (testCases.length < 1) {
        logger().debug(`No testcases found in document ${document.uri}`);
    }
    return testCases;
}

async function discoverTestCasesInDocument(document: vscode.TextDocument) {
    const reg = regexp.TESTCASE_REGEXP;
    const text = document.getText();
    const testCases: TestCase[] = [];

    let match;
    while (match = reg.exec(text)) {
        let testCase = testCaseFromMatch(match, document);
        testCases.push(testCase);
    }
    return testCases;
}

function testCaseFromMatch(match: RegExpExecArray, document: vscode.TextDocument) {
    const startPos = document.positionAt(match.index);
    const macro = match[1];
    const fixture = match[2];
    const name = match[3];
    let gTestType = detectTestCaseType(macro);
    let id = "";
    if (gTestType === GTestType.Parameter) {
        id = name + "/" + fixture;
    }
    else if (gTestType === GTestType.ParameterSuite) {
        id = fixture + "/" + name;
    }
    else {
        id = fixture + "." + name;
    }

    let testCase: TestCase = {
        fixture: fixture,
        name: name,
        id: id,
        lineNo: startPos.line,
        gTestType: gTestType
    };
    return testCase;
}

function detectTestCaseType(testCaseMacro: string) {
    switch (testCaseMacro) {
        case "TEST":
            return GTestType.Free;
        case "TEST_F":
            return GTestType.Fixture;
        case "TEST_P":
            return GTestType.Parameter;
        case "INSTANTIATE_TEST_SUITE_P":
            return GTestType.ParameterSuite
        default:
            return GTestType.None;
    }
}