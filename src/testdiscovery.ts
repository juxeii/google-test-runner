import * as vscode from 'vscode';
import * as path from 'path';
import { TestCaseDescriptor, TestCaseType, GTestType } from './types';
import { getBuildFolder, testMetaData } from './extension';
import { regexp } from './constants';
import { logger } from './logger';

export async function parseDocument(document: vscode.TextDocument, testController: vscode.TestController) {
    // if (!document.isDirty) {
    //     return;
    // }
    if (document.uri.scheme != 'file') {
        return;
    }
    const buildFolder = getBuildFolder();

    logger().info(`document uri is ${document.uri}`);
    const languageName = document.languageId;
    if (languageName && languageName === "cpp") {
        logger().info(`Current language in file is ${languageName}`);
        const descriptors = await getTestsFromFile(buildFolder, document);

        if (descriptors.length < 1) {
            return;
        }
        let descriptor = descriptors[0];
        const baseName = path.parse(document.uri.path).base;
        let fixtureDescriptor: TestCaseDescriptor = {
            fixture: descriptor.fixture,
            name: descriptor.fixture,
            id: descriptor.id,
            target: descriptor.target,
            targetFile: descriptor.targetFile,
            position: descriptor.position,
            gTestType: descriptor.gTestType,
            testCaseType: TestCaseType.File
        };
        const fileItem = testController.createTestItem(baseName, baseName);

        testMetaData.set(fileItem, fixtureDescriptor);
        testController.items.add(fileItem);

        descriptors.forEach((descriptor, index) => {
            const fixture = fileItem.children.get(descriptor.fixture);
            logger().info(`target is ${descriptor.target}`);

            if (fixture) {
                logger().info(`fixture ${fixture} existing already descriptor.name ${descriptor.name}`);
                const newTestCase = testController.createTestItem(descriptor.id, descriptor.name, document.uri);
                logger().info(`Added id ${descriptor.id}`);
                newTestCase.range = descriptor.position;
                descriptor.testCaseType = TestCaseType.Testcase;
                testMetaData.set(newTestCase, descriptor);
                fixture.children.add(newTestCase);
                logger().info(`descriptor fixture ${descriptor.fixture} 
                name ${descriptor.name} target ${descriptor.target} targetFile ${descriptor.targetFile} 
                gTestType ${descriptor.gTestType} testCaseType ${descriptor.testCaseType}`);
            }
            else {
                logger().info(`fixture ${fixture} not existing, adding it descriptor.name ${descriptor.name}`);
                let fixtureDescriptor: TestCaseDescriptor = {
                    fixture: descriptor.fixture,
                    name: descriptor.fixture,
                    id: descriptor.id,
                    target: descriptor.target,
                    targetFile: descriptor.targetFile,
                    position: descriptor.position,
                    gTestType: descriptor.gTestType,
                    testCaseType: TestCaseType.Fixture
                };
                const newFixture = testController.createTestItem(descriptor.fixture, descriptor.fixture);
                testMetaData.set(newFixture, fixtureDescriptor);
                fileItem.children.add(newFixture);

                const newTestCase = testController.createTestItem(descriptor.id, descriptor.name, document.uri);
                logger().info(`Added id ${descriptor.id}`);
                descriptor.testCaseType = TestCaseType.Testcase;
                testMetaData.set(newTestCase, descriptor);
                newTestCase.range = descriptor.position;
                newFixture.children.add(newTestCase);
            }
        })
    }
}

async function getTestsFromFile(buildFolder: string, document: vscode.TextDocument) {
    const reg = regexp.TESTCASE_REGEXP;
    const text = document.getText();
    const descriptors: TestCaseDescriptor[] = [];
    const target = await getTargetForFile(buildFolder, document);
    const targetFile = await getTargetFileOfTarget(buildFolder, target);

    let match;
    while (match = reg.exec(text)) {
        const startPos = document.positionAt(match.index);
        const endPos = document.positionAt(match.index + match[0].length);
        let range = new vscode.Range(startPos, endPos);
        const macro = match[1];
        const fixture = match[2];
        const name = match[3];
        let gTestType;
        switch (macro) {
            case "TEST":
                gTestType = GTestType.Free;
                break;
            case "TEST_F":
                gTestType = GTestType.Fixture;
                break;
            case "TEST_P":
                gTestType = GTestType.Parameter;
                break;
            case "INSTANTIATE_TEST_SUITE_P":
                //console.log("Found INSTANTIATE_TEST_SUITE_P");
                //vscode.window.showInformationMessage("Found INSTANTIATE_TEST_SUITE_P");
                gTestType = GTestType.ParameterSuite
                    ;
                break;

            default:
                gTestType = GTestType.None;
        }
        let id = "";
        if (gTestType === GTestType.Parameter) {
            id = name + "/" + fixture;
            //vscode.window.showInformationMessage(`Found INSTANTIATE_TEST_SUITE_P id is ${id}`);
        }
        else if (gTestType === GTestType.ParameterSuite) {
            id = fixture + "/" + name;
        }
        else {
            id = fixture + "." + name;
        }

        let descriptor: TestCaseDescriptor = {
            fixture: fixture,
            name: name,
            id: id,
            target: target,
            targetFile: targetFile,
            position: range,
            gTestType: gTestType,
            testCaseType: TestCaseType.Testcase
        };

        descriptors.push(descriptor);
    }
    return descriptors;
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