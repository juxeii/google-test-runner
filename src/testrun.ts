import * as vscode from 'vscode';
import * as path from 'path';
import { testMetaData, getBuildFolder } from './extension';
import { spawnShell, execShell } from './system';
import { TestCaseDescriptor, TestCaseType, GTestType, TestInfo } from './types';
import { logger } from './logger';

export function createTestController() {
    let testController = vscode.tests.createTestController('GoogleTestController', 'GoogleTestController');
    testController.createRunProfile('Run Tests', vscode.TestRunProfileKind.Run, createRunHandler(testController), true);
    return testController;
}

function createRunHandler(testController: vscode.TestController) {
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
            logger().info(`adding test ${name}`);

            const testInfo: TestInfo = { item: item, descriptor: descriptor };
            if (!testInfosByTarget.has(targetFile)) {
                let testInfos: TestInfo[] = [];
                testInfos.push(testInfo);
                logger().info(`creating map entry for targetFile ${targetFile}`);
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
            logger().info(`Running all tests`);
            testController.items.forEach(processItem);
        }

        //BUILD TARGETS
        logger().info(`Building required targets...`);
        let buildFailed = false;
        const buildFolder = getBuildFolder();
        const targetsWithSpaces = Array.from(testInfosByTarget.keys(), targetFileName => path.parse(targetFileName).base).join(' ');
        const cmd = `cd ${buildFolder} && ninja ${targetsWithSpaces}`;
        spawnShell(cmd, () => {
            if (!buildFailed) {
                logger().info(`Building required targets done.`);
                runTargets(buildFolder, request, testInfosByTarget);
            }
        }, (line) => {
            let buildFailure = /ninja: build stopped/;
            if (buildFailure.exec(line)) {
                logger().info(`Building targets failed!. No testcases were executed!`);
                buildFailed = true;
            }
            else
                logger().info(`${line}`);
        });
    }

    async function runTargets(buildFolder: string, request: vscode.TestRunRequest, testInfosByTarget: Map<string, TestInfo[]>) {
        const run = testController.createTestRun(request);
        function runTarget(targetFile: string, filter: string, jsonFileName: string, testInfos: TestInfo[]) {
            logger().info(`Running targets...`);
            const cmd = `cd ${buildFolder} && ` + targetFile + ` --gtest_filter=${filter} --gtest_output=json:${jsonFileName}`;
            spawnShell(cmd, async () => {
                logger().info(`Running targets done. size ${testInfosByTarget.size}`);
                await onJSONResultAvailable(buildFolder, jsonFileName, run, testInfos);
                testInfosByTarget.delete(targetFile);
                if (testInfosByTarget.size === 0) {
                    logger().info(`All done, ending.`);
                    run.end();
                }
            }, (line) => logger().info(`${line}`));
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
        logger().info(`jsonFileUri ${jsonFileUri}`);
        //logger().info(`jsonResult ${jsonResult}`);

        const parsedJsonResult = JSON.parse(jsonResult.toString());
        //logger().info(`TEST3 ${parsedJsonResult.testsuites[0].testsuite[0].name} ${parsedJsonResult.testsuites.length} `);

        let testsuites: Array<any> = parsedJsonResult.testsuites;
        let itemById = new Map<string, vscode.TestItem>()
        testInfos.forEach(testInfo => itemById.set(testInfo.item.id, testInfo.item));

        for (let i = 0; i < testsuites.length; i++) {
            let testSuiteName = testsuites[i].name;
            let innerTestSuites: Array<any> = testsuites[i].testsuite;
            for (let y = 0; y < innerTestSuites.length; y++) {
                let innerTestSuite: any = innerTestSuites[y];
                let testCaseName = innerTestSuite.name;

                logger().info(`testCaseName ${testCaseName}`);

                let isParamTest = innerTestSuite.value_param;
                let testCaseId = "";
                if (isParamTest) {
                    testCaseId = testSuiteName;
                    logger().info(`it is a param test  testCaseId ${testCaseId}`);
                }
                else {
                    testCaseId = testSuiteName + "." + testCaseName;
                    logger().info(`it is not a param test testCaseId ${testCaseId}`);
                }

                let item = itemById.get(testCaseId);
                if (item) {
                    logger().info(`item found ${item.id}`);
                    let failures = innerTestSuite.failures;
                    if (!failures) {
                        logger().info(`Testcase ${testCaseId} passed.`);
                        run.passed(item);
                    }
                    else {
                        logger().info(`Testcase ${testCaseId} failed.`);
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
                            logger().info(`found line number ${lineNo}`);
                        }
                        message.location = new vscode.Location(item.uri!, new vscode.Position(lineNo, 0));
                        logger().info(`Test1`);
                        run.failed(item, message);
                        logger().info(`Test2`);
                    }
                }
                else {
                    logger().info(`item not found`);
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