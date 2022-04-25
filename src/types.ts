import * as vscode from 'vscode';

export let testMetaData = new WeakMap<vscode.TestItem, RootFixture | Fixture | TestCase>();

export const enum GTestType {
    TEST,
    TEST_F,
    TEST_P,
    TYPED_TEST,
    TYPED_TEST_P
}

export const enum GTestMacroType {
    TEST,
    TEST_F,
    TEST_P,
    TYPED_TEST,
    TYPED_TEST_P,
    INSTANTIATE_TEST_SUITE_P,
    INSTANTIATE_TYPED_TEST_SUITE_P
}

export type GTestMacro = {
    type: GTestMacroType;
    fixture: string;
    id: string;
    lineNo: number;
}

export type TestCase = {
    fixture: string;
    name: string;
    id: string;
    regExpForId: RegExp;
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

export type TargetInfo = {
    target: string;
    targetFile: string;
}