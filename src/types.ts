import * as vscode from 'vscode';

export let testMetaData = new WeakMap<vscode.TestItem, TestCase>();

export const enum GTestType {
    None,
    Free,
    Fixture,
    Parameter,
    ParameterSuite
}

export const enum TestCaseType {
    File,
    Fixture,
    Testcase
}

export type TestCase = {
    fixture: string;
    name: string;
    id: string,
    target: string;
    targetFile: string;
    position: vscode.Range;
    gTestType: GTestType;
    testCaseType: TestCaseType;
}

export type Fixture = {
    id: string,
    target: string;
    targetFile: string;
}

export type TestInfo = {
    item: vscode.TestItem;
    descriptor: TestCase;
}