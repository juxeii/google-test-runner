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
        const fixtureItem = createItem(testController, fixtureId, document);
        rootItem.children.add(fixtureItem);
        fixtureTestCases.forEach(testCase => {
            const testCaseItem = createItem(testController, testCase.name, document);
            testCaseItem.range = lineNoToRange(testCase.lineNo);
            logger().debug(`Added item ${testCaseItem.id} to fixtureItem ${fixtureItem.id}`);
            fixtureItem.children.add(testCaseItem);
        });
    });

    // const testId = "testId";
    // const testItem = testController.createTestItem(testId, testId, document.uri);
    // testItem.range = lineNoToRange(52);
    // testController.items.add(testItem);
}

function lineNoToRange(lineNo: number) {
    const position = new vscode.Position(lineNo, 0)
    return new vscode.Range(position, position);
}

function createItem(testController: vscode.TestController, itemId: string, document: vscode.TextDocument) {
    const item = testController.createTestItem(itemId, itemId, document.uri);

    //parent.children.add(item);
    //logger().debug(`Added item ${itemId} to parent ${parent.id}`);
    return item;
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