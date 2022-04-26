import * as vscode from 'vscode';
import * as path from 'path';
import { logDebug, logError } from '../utils/logger';
import { TestCase } from '../types';

export function updateTestControllerFromDocument(document: vscode.TextDocument, testController: vscode.TestController, testCases: TestCase[]) {
    const rootItemId = path.parse(document.uri.path).base;
    const rootItem = addFixtureItem(testController, rootItemId, testController.items, document);
    const fixtures = detectFixtures(testCases);

    fixtures.forEach((fixtureTestCases, fixtureId) => processFixture(fixtureTestCases, fixtureId, testController, rootItem, document));
}

function processFixture(fixtureTestCases: TestCase[],
    fixtureId: string,
    testController: vscode.TestController,
    rootItem: vscode.TestItem,
    document: vscode.TextDocument) {
    if (fixtureTestCases.length > 1) {
        const fixtureItem = addFixtureItem(testController, fixtureId, rootItem.children, document);
        fixtureTestCases.forEach(testCase => addTestCaseItem(testController, testCase, document, fixtureItem));
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
        logDebug(`Fixture id testcase ${testCase.id} is ${fixtureName}`);
        let currentTestCases = testCasesByFixture.get(fixtureName);
        if (!currentTestCases) {
            currentTestCases = [];
        }
        currentTestCases.push(testCase);
        testCasesByFixture.set(fixtureName, currentTestCases);
    }
    else {
        logError(`testCase.fixture did not match regex for ${testCase.fixture}`);
    }
}

export function createLeafItemsByRoot(testController: vscode.TestController, request: vscode.TestRunRequest): Map<vscode.TestItem, vscode.TestItem[]> {
    let roots = rootItems(testController, request);
    let leafItemsByRootItem = new Map<vscode.TestItem, vscode.TestItem[]>();
    roots.forEach(item => leafItemsByRootItem.set(item, []));
    assignLeafItems(testController, request, leafItemsByRootItem);
    leafItemsByRootItem.forEach((leafs, root) => {

        logDebug(`Root item ${root.id} has leafs`);
        leafs.forEach(leaf => {

            logDebug(`leaf item ${leaf.label}`);
        });
    });

    return leafItemsByRootItem;
}

function rootItems(testController: vscode.TestController, request: vscode.TestRunRequest) {
    let roots = new Set<vscode.TestItem>();
    if (request.include) {
        request.include.forEach(item => roots.add(getRoot(item)));
    }
    else {
        testController.items.forEach(item => roots.add(item));
    }
    roots.forEach(item => logDebug(`Root item is ${item.id}`));
    return roots;
}

function assignLeafItems(testController: vscode.TestController, request: vscode.TestRunRequest, leafItemsByRootItem: Map<vscode.TestItem, vscode.TestItem[]>) {
    if (request.include) {
        request.include.forEach(item => assignItemToMap(item, leafItemsByRootItem));
    }
    else {
        testController.items.forEach(item => assignItemToMap(item, leafItemsByRootItem));
    }
}

export function assignItemToMap(item: vscode.TestItem, leafItemsByRootItem: Map<vscode.TestItem, vscode.TestItem[]>) {
    if (item.children.size === 0) {
        const rootItem = getRoot(item);
        let leafs = leafItemsByRootItem.get(rootItem)!;
        leafs.push(item);
        leafItemsByRootItem.set(rootItem, leafs);
    }
    else {
        item.children.forEach(item => assignItemToMap(item, leafItemsByRootItem))
    }
}

function getRoot(item: vscode.TestItem): vscode.TestItem {
    if (!item.parent) {
        return item;
    }
    return getRoot(item.parent);
}