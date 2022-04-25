import * as vscode from 'vscode';
import * as path from 'path';
import { logDebug } from './logger';
import { TestCase } from './types';


export function updateTestControllerFromDocument(document: vscode.TextDocument, testController: vscode.TestController, testCases: TestCase[]) {
    const rootItemId = path.parse(document.uri.path).base;
    const rootItem = addFixtureItem(testController, rootItemId, testController.items, document);
    const fixtures = detectFixtures(testCases);

    fixtures.forEach((fixtureTestCases, fixtureId) => processFixture(fixtureTestCases, fixtureId, testController, rootItem, document));
    logDebug(` rootItem.children size ${rootItem.children.size} tescases ${testCases.length}`);
}

function processFixture(fixtureTestCases: TestCase[], fixtureId: string, testController: vscode.TestController, rootItem: vscode.TestItem, document: vscode.TextDocument) {
    logDebug(`Fixture is ${fixtureId}`);
    if (fixtureTestCases.length > 1) {
        const fixtureItem = addFixtureItem(testController, fixtureId, rootItem.children, document);
        fixtureTestCases.forEach(testCase => {
            addTestCaseItem(testController, testCase, document, fixtureItem);
        });
    }
    else {
        addTestCaseItem(testController, fixtureTestCases[0], document, rootItem);
    }
}

function lineNoToRange(lineNo: number) {
    const position = new vscode.Position(lineNo, 0)
    return new vscode.Range(position, position);
}

function addTestCaseItem(testController: vscode.TestController, testCase: TestCase, document: vscode.TextDocument, parent: vscode.TestItem) {
    const testCaseItem = testController.createTestItem(testCase.id, testCase.id, document.uri);
    testCaseItem.range = lineNoToRange(testCase.lineNo - 1);
    parent.children.add(testCaseItem);
    logDebug(`Added testCaseItem ${testCaseItem.id} to parent ${parent.id}`);
    return testCaseItem;
}

function addFixtureItem(testController: vscode.TestController, fixtureId: string, parent: vscode.TestItemCollection, document: vscode.TextDocument) {
    const fixtureItem = testController.createTestItem(fixtureId, fixtureId, document.uri);
    parent.add(fixtureItem);
    logDebug(`Added fixture item ${fixtureItem.id}`);
    return fixtureItem;
}

function detectFixtures(testCases: TestCase[]) {
    let testCasesByFixture = new Map<string, TestCase[]>();
    testCases.forEach(testCase => addTestCaseToFixture(testCase, testCasesByFixture));
    return testCasesByFixture;
}

function addTestCaseToFixture(testCase: TestCase, testCasesByFixture: Map<string, TestCase[]>) {
    const fixtureName = testCase.id.match(/[^\.]*/)![0];
    if (fixtureName) {
        logDebug(`fixtureName regex matched ${fixtureName}`);
        logDebug(`Fixture id for adding testcase ${testCase.id} is ${fixtureName}`);
        let currentTestCases = testCasesByFixture.get(fixtureName);
        if (!currentTestCases) {
            currentTestCases = [];
        }
        currentTestCases.push(testCase);
        testCasesByFixture.set(fixtureName, currentTestCases);
    }
    else {
        logDebug(`testCase.fixture did not match regex for ${testCase.fixture}`);
    }
}