import * as vscode from 'vscode';
import * as path from 'path';
import { TestCase } from './types';
import { logger } from './logger';
import * as cfg from './configuration';


export function updateTestControllerFromDocument(document: vscode.TextDocument, testController: vscode.TestController, testCases: TestCase[]) {
    const fixtures = detectFixtures(testCases);
    fixtures.forEach((fixtureTestCases, fixture, map) => {
        logger().info(`Detected fixture ${fixture}`);
        fixtureTestCases.forEach(testcase => {
            logger().info(`Detected testcase ${testcase.name} in fixture ${fixture} in line ${testcase.lineNo}`);
        });
    });
    const rootItem = addRootItem(testController, document);
    fixtures.forEach((fixtureTestCases, fixtureId) => {
        const fixtureItem = addFixtureItem(testController, fixtureId, rootItem);
        fixtureTestCases.forEach(testCase => {
            addTestCaseItem(testController, testCase, document, fixtureItem);
        });
    });
}

function lineNoToRange(lineNo: number) {
    const position = new vscode.Position(lineNo, 0)
    return new vscode.Range(position, position);
}

function addTestCaseItem(testController: vscode.TestController, testCase: TestCase, document: vscode.TextDocument, parent: vscode.TestItem) {
    const testCaseItem = testController.createTestItem(testCase.id, testCase.id, document.uri);
    testCaseItem.range = lineNoToRange(testCase.lineNo);
    parent.children.add(testCaseItem);
    logger().debug(`Added testCaseItem ${testCaseItem.id} to parent ${parent.id}`);
    return testCaseItem;
}

function addFixtureItem(testController: vscode.TestController, fixtureId: string, parent: vscode.TestItem) {
    const fixtureItem = testController.createTestItem(fixtureId, fixtureId);
    parent.children.add(fixtureItem);
    logger().debug(`Added fixture item ${fixtureItem.id} to parent ${parent.id}`);
    return fixtureItem;
}

function addRootItem(testController: vscode.TestController, document: vscode.TextDocument) {
    const rootItemId = path.parse(document.uri.path).base;
    const rootItem = testController.createTestItem(rootItemId, rootItemId, document.uri);
    testController.items.add(rootItem);
    logger().debug(`Added root item ${rootItem.id} to testController`);
    return rootItem;
}

function detectFixtures(testCases: TestCase[]) {
    let testCasesByFixture = new Map<string, TestCase[]>();
    testCases.forEach(testCase => {
        const fixtureName = testCase.fixture;
        let currentTestCases = testCasesByFixture.get(fixtureName);
        if (!currentTestCases) {
            currentTestCases = [];
        }
        currentTestCases.push(testCase);
        testCasesByFixture.set(fixtureName, currentTestCases);
    });
    return testCasesByFixture;
}