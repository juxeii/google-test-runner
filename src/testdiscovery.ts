import * as vscode from 'vscode';
import * as path from 'path';
import * as cfg from './configuration';
import { TestCase, TestCaseType, GTestType } from './types';
import { testMetaData } from './types';
import { regexp } from './constants';
import { logger } from './logger';

export async function parseDocument(document: vscode.TextDocument, testController: vscode.TestController) {
    if (document.uri.scheme != 'file') {
        return;
    }

    const buildFolder = cfg.getBuildFolder();
    const languageName = document.languageId;
    if (languageName && languageName === "cpp") {
        logger().debug(`Discovering testcases in document ${document.uri}`);
        const testcases = await discoverTestCasesInDocument(buildFolder, document);
        if (testcases.length < 1) {
            logger().debug(`No testcases found in document ${document.uri}`);
            return;
        }
        const rootFixture = addNewRootFixture(testController, testcases[0], document);

        testcases.forEach((testCase) => addTestCaseToController(rootFixture, testController, testCase, document))
    }
}

function addTestCaseToController(rootFixture: vscode.TestItem, testController: vscode.TestController, testCase: TestCase, document: vscode.TextDocument) {
    let fixture = rootFixture.children.get(testCase.fixture);
    if (!fixture) {
        fixture = addNewFixture(rootFixture, testController, testCase);
    }
    addTestCaseToFixture(fixture, testController, testCase, document);
}

function addNewRootFixture(testController: vscode.TestController, testCase: TestCase, document: vscode.TextDocument) {
    const baseName = path.parse(document.uri.path).base;
    let rootTestCase: TestCase = {
        fixture: testCase.fixture,
        name: testCase.fixture,
        id: testCase.id,
        target: testCase.target,
        targetFile: testCase.targetFile,
        position: testCase.position,
        gTestType: testCase.gTestType,
        testCaseType: TestCaseType.File
    };
    const rootItem = testController.createTestItem(baseName, baseName);
    testMetaData.set(rootItem, rootTestCase);
    testController.items.add(rootItem);
    logger().debug(`Added root fixture ${rootItem.id}`);
    return rootItem;
}

function addNewFixture(rootItem: vscode.TestItem, testController: vscode.TestController, testCase: TestCase) {
    const newFixture = createFixture(testController, testCase);
    rootItem.children.add(newFixture);
    logger().debug(`Added fixture ${newFixture.id}`);
    return newFixture;
}

function addTestCaseToFixture(fixture: vscode.TestItem, testController: vscode.TestController, testCase: TestCase, document: vscode.TextDocument) {
    const newTestCase = createTestCaseItem(testController, testCase, document)
    fixture.children.add(newTestCase);
    logger().debug(`Added testcase ${newTestCase.id} to fixture ${fixture.id}`);
}

function createFixture(testController: vscode.TestController, testCase: TestCase) {
    let fixtureTestCase: TestCase = {
        fixture: testCase.fixture,
        name: testCase.fixture,
        id: testCase.id,
        target: testCase.target,
        targetFile: testCase.targetFile,
        position: testCase.position,
        gTestType: testCase.gTestType,
        testCaseType: TestCaseType.Fixture
    };
    const item = testController.createTestItem(testCase.fixture, testCase.fixture);
    testMetaData.set(item, fixtureTestCase);
    return item;
}

function createTestCaseItem(testController: vscode.TestController, testCase: TestCase, document: vscode.TextDocument) {
    const item = testController.createTestItem(testCase.id, testCase.name, document.uri);
    testCase.testCaseType = TestCaseType.Testcase;
    testMetaData.set(item, testCase);
    item.range = testCase.position;
    return item;
}

async function discoverTestCasesInDocument(buildFolder: string, document: vscode.TextDocument) {
    const reg = regexp.TESTCASE_REGEXP;
    const text = document.getText();
    const testCases: TestCase[] = [];
    const target = await getTargetForFile(buildFolder, document);
    const targetFile = await getTargetFileOfTarget(buildFolder, target);

    let match;
    while (match = reg.exec(text)) {
        let testCase = testCaseFromMatch(target, targetFile, match, document);
        testCases.push(testCase);
    }
    return testCases;
}

function testCaseFromMatch(target: string, targetFile: string, match: RegExpExecArray, document: vscode.TextDocument) {
    const startPos = document.positionAt(match.index);
    const endPos = document.positionAt(match.index + match[0].length);
    let range = new vscode.Range(startPos, endPos);
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
        target: target,
        targetFile: targetFile,
        position: range,
        gTestType: gTestType,
        testCaseType: TestCaseType.Testcase
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

async function readTargetFile(buildFolder: string) {
    let targetFileUri = vscode.Uri.file(buildFolder + "/targets.out");
    const text = await vscode.workspace.fs.readFile(targetFileUri);
    return text;
}

async function getTargetForFile(buildFolder: string, document: vscode.TextDocument) {
    const baseName = path.parse(document.uri.path).base;
    const targetFileContents = await readTargetFile(buildFolder);
    let targetMatchRegEx = new RegExp("(?<=" + baseName + "\.o: CXX_COMPILER__).*(?=_)", "m");
    let fileMatch = targetMatchRegEx.exec(targetFileContents.toString());
    if (!fileMatch) {
        return "";
    }
    return fileMatch[0];
}

async function getTargetFileOfTarget(buildFolder: string, target: string) {
    const targetFileContents = await readTargetFile(buildFolder);
    let targetFileMatchRegEx = new RegExp("(.+" + target + "): (?:CXX_EXECUTABLE_LINKER__).*(?:" + target + ").*");
    let match = targetFileMatchRegEx.exec(targetFileContents.toString());
    if (!match) {
        return "";
    }
    return match[1];
}