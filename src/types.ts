import * as vscode from 'vscode';

export let testMetaData = new WeakMap<vscode.TestItem, RootFixture | Fixture | TestCase>();

export const enum GTestType {
    None,
    Free,
    Fixture,
    Parameter,
    ParameterSuite
}

export type TestCase = {
    fixture: string;
    name: string;
    id: string,
    lineNo: number;
    gTestType: GTestType;
}

export type Fixture = {
    id: string;
    testcases: TestCase[];
}

export type RootFixture = {
    id: string,
    target: string;
    targetFile: string;
    fixtures: Fixture[]
}

export type TestInfo = {
    item: vscode.TestItem;
    testcase: TestCase;
}