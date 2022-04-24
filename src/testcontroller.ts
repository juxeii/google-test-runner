import * as vscode from 'vscode';
import * as path from 'path';
import { GTestType, TestCase } from './types';
import { logger } from './logger';
import * as cfg from './configuration';


export function updateTestControllerFromDocument(document: vscode.TextDocument, testController: vscode.TestController, testCases: TestCase[]) {
    const fixtures = detectFixtures(testCases);
    const rootItemId = path.parse(document.uri.path).base;
    const rootItem = addFixtureItem(testController, rootItemId, testController.items, document);
    let alreadyAddedItems: Set<TestCase> = new Set();
    fixtures.forEach((fixtureTestCases, fixtureId) => {
        logger().debug(`Fixture is ${fixtureId}`);
        const fixtureItem = addFixtureItem(testController, fixtureId, rootItem.children, document);
        fixtureTestCases.forEach(testCase => {
            addTestCaseItem(testController, testCase, document, fixtureItem);
            alreadyAddedItems.add(testCase);
        });
    });

    testCases.filter(item => !alreadyAddedItems.has(item)).
        forEach(testCase => {
            logger().debug(`testCaseid ${testCase.id} testCase.lineNo ${testCase.lineNo} gTestType ${testCase.gTestType}`);
            if (testController.items.get(testCase.id)) {
                logger().debug(`Already added.`);
                return;
            }
            logger().debug(`Adding it.`);
            addTestCaseItem(testController, testCase, document, rootItem);
        });
    logger().debug(` rootItem.children size ${rootItem.children.size} tescases ${testCases.length}`);
}

function lineNoToRange(lineNo: number) {
    const position = new vscode.Position(lineNo, 0)
    return new vscode.Range(position, position);
}

function addTestCaseItem(testController: vscode.TestController, testCase: TestCase, document: vscode.TextDocument, parent: vscode.TestItem) {
    const testCaseItem = testController.createTestItem(testCase.id, testCase.id, document.uri);
    testCaseItem.range = lineNoToRange(testCase.lineNo - 1);
    parent.children.add(testCaseItem);
    logger().debug(`Added testCaseItem ${testCaseItem.id} to parent ${parent.id}`);
    return testCaseItem;
}

function addFixtureItem(testController: vscode.TestController, fixtureId: string, parent: vscode.TestItemCollection, document: vscode.TextDocument) {
    const fixtureItem = testController.createTestItem(fixtureId, fixtureId, document.uri);
    parent.add(fixtureItem);
    logger().debug(`Added fixture item ${fixtureItem.id}`);
    return fixtureItem;
}

function detectFixtures(testCases: TestCase[]): Map<string, TestCase[]> {
    let testCasesByFixture = new Map<string, TestCase[]>();
    testCases.forEach(testCase => {
        if (testCase.gTestType === GTestType.TEST_P || testCase.gTestType === GTestType.TYPED_TEST || testCase.gTestType === GTestType.TYPED_TEST_P) {
            return;
        }
        const fixtureName = testCase.fixture;
        let currentTestCases = testCasesByFixture.get(fixtureName);
        if (!currentTestCases) {
            currentTestCases = [];
        }
        currentTestCases.push(testCase);
        testCasesByFixture.set(fixtureName, currentTestCases);
    });

    return new Map([...testCasesByFixture].filter(([, testCases]) => testCases.length > 1));
}