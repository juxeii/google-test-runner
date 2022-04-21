import * as vscode from 'vscode';
import * as path from 'path';
import { testMetaData, getBuildFolder } from './extension';
import { spawnShell, execShell } from './system';
import { TestCaseDescriptor, TestCaseType, GTestType, TestInfo } from './types';

export function createTestController(logOutput: vscode.OutputChannel) {
    let testController = vscode.tests.createTestController('GoogleTestController', 'GoogleTestController');
    testController.createRunProfile('Run Tests', vscode.TestRunProfileKind.Run, createRunHandler(testController, logOutput), true);
    return testController;
}

function createRunHandler(testController: vscode.TestController, logOutput: vscode.OutputChannel) {
    return async function runHandler(
        request: vscode.TestRunRequest,
        token: vscode.CancellationToken
    ) {
        let testInfosByTarget = new Map<string, TestInfo[]>();
        //FILL runInfo
        function processItem(item: vscode.TestItem) {
            const itemType = testMetaData.get(item)?.testCaseType;
            if (itemType === TestCaseType.File || itemType === TestCaseType.Fixture) {
                item.children.forEach(processItem)
                return;
            }
            const descriptor = testMetaData.get(item);
            if (!descriptor) {
                return;
            }
            const name = descriptor.name;
            const targetFile = descriptor.targetFile;
            if (!targetFile) {
                return;
            }
            logOutput.appendLine(`adding test ${name}`);

            const testInfo: TestInfo = { item: item, descriptor: descriptor };
            if (!testInfosByTarget.has(targetFile)) {
                let testInfos: TestInfo[] = [];
                testInfos.push(testInfo);
                logOutput.appendLine(`creating map entry for targetFile ${targetFile}`);
                testInfosByTarget.set(targetFile, testInfos);
            }
            else {
                let t = testInfosByTarget.get(targetFile);
                if (t) {
                    t.push(testInfo);
                    testInfosByTarget.set(targetFile, t);
                }
            }
        }

        if (request.include) {
            request.include.forEach(processItem);
        } else {
            logOutput.appendLine(`Running all tests`);
            testController.items.forEach(processItem);
        }

        //BUILD TARGETS
        logOutput.appendLine(`Building required targets...`);
        let buildFailed = false;
        const buildFolder = getBuildFolder();
        const targetsWithSpaces = Array.from(testInfosByTarget.keys(), targetFileName => path.parse(targetFileName).base).join(' ');
        const cmd = `cd ${buildFolder} && ninja ${targetsWithSpaces}`;
        spawnShell(cmd, () => {
            if (!buildFailed) {
                logOutput.appendLine(`Building required targets done.`);
                runTargets(buildFolder, request, testInfosByTarget);
            }
        }, (line) => {
            let buildFailure = /ninja: build stopped/;
            if (buildFailure.exec(line)) {
                logOutput.appendLine(`Building targets failed!. No testcases were executed!`);
                buildFailed = true;
            }
            else
                logOutput.appendLine(`${line}`);
        });
    }

    async function runTargets(buildFolder: string, request: vscode.TestRunRequest, testInfosByTarget: Map<string, TestInfo[]>) {
        const run = testController.createTestRun(request);
        function runTarget(targetFile: string, filter: string, jsonFileName: string, testInfos: TestInfo[]) {
            logOutput.appendLine(`Running targets...`);
            const cmd = `cd ${buildFolder} && ` + targetFile + ` --gtest_filter=${filter} --gtest_output=json:${jsonFileName}`;
            spawnShell(cmd, async () => {
                logOutput.appendLine(`Running targets done. size ${testInfosByTarget.size}`);
                await onJSONResultAvailable(buildFolder, jsonFileName, run, testInfos);
                testInfosByTarget.delete(targetFile);
                if (testInfosByTarget.size === 0) {
                    logOutput.appendLine(`All done, ending.`);
                    run.end();
                }
            }, (line) => logOutput.appendLine(`${line}`));
        }

        testInfosByTarget.forEach((testInfos, targetFile, map) => {
            const runFilter = getRunFilter(testInfos.map(testInfo => testInfo.descriptor));
            const jsonFileName = "test_detail_for_" + path.parse(targetFile).base;
            runTarget(targetFile, runFilter, jsonFileName, testInfos);
        });
    }

    async function onJSONResultAvailable(buildFolder: string, jsonFileName: string, run: vscode.TestRun, testInfos: TestInfo[]) {
        let jsonFileUri = vscode.Uri.file(`${buildFolder}/${jsonFileName}`);
        const jsonResult = await vscode.workspace.fs.readFile(jsonFileUri);
        logOutput.appendLine(`jsonFileUri ${jsonFileUri}`);
        //logOutput.appendLine(`jsonResult ${jsonResult}`);

        const parsedJsonResult = JSON.parse(jsonResult.toString());
        //logOutput.appendLine(`TEST3 ${parsedJsonResult.testsuites[0].testsuite[0].name} ${parsedJsonResult.testsuites.length} `);

        let testsuites: Array<any> = parsedJsonResult.testsuites;
        let itemById = new Map<string, vscode.TestItem>()
        testInfos.forEach(testInfo => itemById.set(testInfo.item.id, testInfo.item));

        for (let i = 0; i < testsuites.length; i++) {
            let testSuiteName = testsuites[i].name;
            let innerTestSuites: Array<any> = testsuites[i].testsuite;
            for (let y = 0; y < innerTestSuites.length; y++) {
                let innerTestSuite: any = innerTestSuites[y];
                let testCaseName = innerTestSuite.name;

                logOutput.appendLine(`testCaseName ${testCaseName}`);

                let isParamTest = innerTestSuite.value_param;
                let testCaseId = "";
                if (isParamTest) {
                    testCaseId = testSuiteName;
                    logOutput.appendLine(`it is a param test  testCaseId ${testCaseId}`);
                }
                else {
                    testCaseId = testSuiteName + "." + testCaseName;
                    logOutput.appendLine(`it is not a param test testCaseId ${testCaseId}`);
                }

                let item = itemById.get(testCaseId);
                if (item) {
                    logOutput.appendLine(`item found ${item.id}`);
                    let failures = innerTestSuite.failures;
                    if (!failures) {
                        logOutput.appendLine(`Testcase ${testCaseId} passed.`);
                        run.passed(item);
                    }
                    else {
                        logOutput.appendLine(`Testcase ${testCaseId} failed.`);
                        let failureMessage: string = failures[0].failure;

                        const message = new vscode.TestMessage(failureMessage.substring(failureMessage.indexOf("\n") + 1));
                        let lineNoRegex = /^.+\:(\d+)/;
                        let lineNoMatch = lineNoRegex.exec(failureMessage);
                        let lineNo: number;
                        if (!lineNoMatch) {
                            lineNo = 1;
                        }
                        else {
                            lineNo = Number(lineNoMatch[1]) - 1;
                            logOutput.appendLine(`found line number ${lineNo}`);
                        }
                        message.location = new vscode.Location(item.uri!, new vscode.Position(lineNo, 0));
                        logOutput.appendLine(`Test1`);
                        run.failed(item, message);
                        logOutput.appendLine(`Test2`);
                    }
                }
                else {
                    logOutput.appendLine(`item not found`);
                }
            }
        }
    }
}

function getRunFilter(descriptors: TestCaseDescriptor[]) {
    let testFilter = "";
    descriptors.forEach(descriptor => {
        const gtestType = descriptor?.gTestType;
        if (gtestType === GTestType.Parameter || gtestType === GTestType.ParameterSuite) {
            testFilter += descriptor.id + ".*:";
        }
        else {
            testFilter += descriptor.id + ":";
        }
    });
    return testFilter;
}