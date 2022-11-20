import * as vscode from 'vscode';
import * as path from 'path';
import { logDebug, logError } from '../utils/logger';
import { ExtEnvironment } from '../extension';
import { initRunProfiles } from './testrun';
import { observeTestCasesUpdates, TestCasesUpdate } from '../documentcontroller';
import { TestCase } from '../parsing/testdiscovery';

export const initTestController = (environment: ExtEnvironment) => {
    initRunProfiles(environment)
    observeTestCasesUpdates(environment).subscribe(testCasesUpdate => {
        if (testCasesUpdate.testCases.length === 0) {
            removeDocumentItems(testCasesUpdate.document, environment)
        }
        else {
            updateTestControllerFromDocument(testCasesUpdate, environment.testController)
        }
    })
}

export const removeDocumentItems = (document: vscode.TextDocument, environment: ExtEnvironment) => {
    const fileName = path.basename(document.uri.fsPath)
    environment.testController.items.delete(fileName)
}


const updateTestControllerFromDocument = (testCasesUpdate: TestCasesUpdate, testController: vscode.TestController) => {
    const rootItemId = path.parse(testCasesUpdate.document.uri.path).base
    const rootItem = addFixtureItem(testController, rootItemId, testController.items, testCasesUpdate.document)
    const fixtures = detectFixtures(testCasesUpdate.testCases)

    fixtures.forEach((fixtureTestCases, fixtureId) => processFixture(fixtureTestCases, fixtureId, testController, rootItem, testCasesUpdate.document))
}

const addFixtureItem = (testController: vscode.TestController, fixtureId: string, parent: vscode.TestItemCollection, document: vscode.TextDocument) => {
    const fixtureItem = testController.createTestItem(fixtureId, fixtureId, document.uri)
    parent.add(fixtureItem)
    logDebug(`Added fixture item ${fixtureItem.id}`)
    return fixtureItem
}

const processFixture = (fixtureTestCases: TestCase[],
    fixtureId: string,
    testController: vscode.TestController,
    rootItem: vscode.TestItem,
    document: vscode.TextDocument) => {
    if (fixtureTestCases.length > 1) {
        const fixtureItem = addFixtureItem(testController, fixtureId, rootItem.children, document)
        fixtureTestCases.forEach(testCase => addTestCaseItem(testController, testCase, document, fixtureItem))
    }
    else {
        addTestCaseItem(testController, fixtureTestCases[0], document, rootItem)
    }
}

const lineNoToRange = (lineNo: number) => {
    const position = new vscode.Position(lineNo, 0)
    return new vscode.Range(position, position)
}

const addTestCaseItem = (testController: vscode.TestController, testCase: TestCase, document: vscode.TextDocument, parent: vscode.TestItem) => {
    const testCaseItem = testController.createTestItem(testCase.id, testCase.id, document.uri)
    testCaseItem.range = lineNoToRange(testCase.lineNo - 1)
    parent.children.add(testCaseItem)
    logDebug(`Added testCaseItem ${testCaseItem.id} to parent ${parent.id}`)
    return testCaseItem
}

const detectFixtures = (testCases: TestCase[]) => {
    let testCasesByFixture = new Map<string, TestCase[]>()
    testCases.forEach(testCase => addTestCaseToFixture(testCase, testCasesByFixture))
    return testCasesByFixture
}

const addTestCaseToFixture = (testCase: TestCase, testCasesByFixture: Map<string, TestCase[]>) => {
    const fixtureName = testCase.id.match(/[^\.]*/)![0]
    if (fixtureName) {
        logDebug(`Fixture id testcase ${testCase.id} is ${fixtureName}`)
        let currentTestCases = testCasesByFixture.get(fixtureName)
        if (!currentTestCases) {
            currentTestCases = []
        }
        currentTestCases.push(testCase)
        testCasesByFixture.set(fixtureName, currentTestCases)
    }
    else {
        logError(`testCase.fixture did not match regex for ${testCase.fixture}!`)
    }
}

export const createLeafItemsByRoot = (testController: vscode.TestController, request: vscode.TestRunRequest): Map<vscode.TestItem, vscode.TestItem[]> => {
    const roots = rootItems(testController, request)
    const leafItemsByRootItem = new Map<vscode.TestItem, vscode.TestItem[]>()
    roots.forEach(item => leafItemsByRootItem.set(item, []))
    assignLeafItems(testController, request, leafItemsByRootItem)
    return leafItemsByRootItem
}

const rootItems = (testController: vscode.TestController, request: vscode.TestRunRequest) => {
    const roots = new Set<vscode.TestItem>()
    if (request.include) {
        request.include.forEach(item => roots.add(getRoot(item)))
    }
    else {
        testController.items.forEach(item => roots.add(item))
    }
    roots.forEach(item => logDebug(`Root item is ${item.id}`))
    return roots
}

const assignLeafItems = (testController: vscode.TestController, request: vscode.TestRunRequest, leafItemsByRootItem: Map<vscode.TestItem, vscode.TestItem[]>) => {
    if (request.include) {
        request.include.forEach(item => assignItemToMap(item, leafItemsByRootItem))
    }
    else {
        testController.items.forEach(item => assignItemToMap(item, leafItemsByRootItem))
    }
}

export const assignItemToMap = (item: vscode.TestItem, leafItemsByRootItem: Map<vscode.TestItem, vscode.TestItem[]>) => {
    if (item.children.size === 0) {
        const rootItem = getRoot(item)
        const leafs = leafItemsByRootItem.get(rootItem)!
        leafs.push(item)
        leafItemsByRootItem.set(rootItem, leafs)
    }
    else {
        item.children.forEach(item => assignItemToMap(item, leafItemsByRootItem))
    }
}

const getRoot = (item: vscode.TestItem): vscode.TestItem => {
    if (!item.parent) {
        return item
    }
    return getRoot(item.parent)
}