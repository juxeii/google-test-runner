import * as vscode from 'vscode';
import * as path from 'path';
import { Fixture, testMetaData } from './types';
import * as rj from './resultjson';
import * as cfg from './configuration';
import { spawnShell } from './system';
import { TestCase, GTestType, TestInfo } from './types';
import { logger } from './logger';

export function createTestController() {
    let testController = vscode.tests.createTestController('GoogleTestController', 'GoogleTestController');
    testController.createRunProfile('Run Tests', vscode.TestRunProfileKind.Run, createRunHandler(testController), true);
    return testController;
}

function testInfoFromTestCase(testCase: TestCase, item: vscode.TestItem) {
    const testInfo: TestInfo = { item: item, testcase: testCase };
    return testInfo;
}

function testInfosFromFixture(fixture: Fixture, item: vscode.TestItem) {
    return fixture.testcases.map(testcase => testInfoFromTestCase(testcase, item));
}

function testInfosFromFixtures(fixtures: Fixture[], item: vscode.TestItem) {
    // return fixture.testcases.map(testcase => testInfoFromTestCase(testcase, item));
}

function fillRunInfoWithItem(item: vscode.TestItem, testInfosByTarget: Map<string, TestInfo[]>) {
    const metaData = testMetaData.get(item)!;
    if ("target" in metaData) {
        item.children.forEach(item => fillRunInfoWithItem(item, testInfosByTarget))
        return;
    }

    // const itemType = testMetaData.get(item)?.testCaseType;
    // if (itemType === TestCaseType.File || itemType === TestCaseType.Fixture) {
    //     item.children.forEach(item => fillRunInfoWithItem(item, testInfosByTarget))
    //     return;
    // }
    // const descriptor = testMetaData.get(item);
    // if (!descriptor) {
    //     return;
    // }
    // const targetFile = descriptor.targetFile;
    // if (!targetFile) {
    //     return;
    // }
    // const isTestCase = "gTestType" in metaData;
    // console.log(metaData instanceof TestCase);
    // if (metaData instanceof TestCase) {

    // }
    // logger().debug(`Adding test item ${item.id} to run info.`);

    // const testInfo: TestInfo = { item: item, testcase: descriptor };
    // if (!testInfosByTarget.has(targetFile)) {
    //     let testInfos: TestInfo[] = [];
    //     testInfos.push(testInfo);
    //     logger().info(`creating map entry for targetFile ${targetFile}`);
    //     testInfosByTarget.set(targetFile, testInfos);
    // }
    // else {
    //     let t = testInfosByTarget.get(targetFile);
    //     if (t) {
    //         t.push(testInfo);
    //         testInfosByTarget.set(targetFile, t);
    //     }
    // }
}

function buildTargets(testController: vscode.TestController, testInfosByTarget: Map<string, TestInfo[]>, request: vscode.TestRunRequest) {
    logger().info(`Building required targets...`);
    let buildFailed = false;
    const buildFolder = cfg.getBuildFolder();
    const targetsWithSpaces = Array.from(testInfosByTarget.keys(), targetFileName => path.parse(targetFileName).base).join(' ');
    const cmd = `cd ${buildFolder} && ninja ${targetsWithSpaces}`;
    spawnShell(cmd, () => {
        if (!buildFailed) {
            logger().info(`Building required targets done.`);
            runTargets(testController, buildFolder, request, testInfosByTarget);
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

async function runTargets(testController: vscode.TestController, buildFolder: string, request: vscode.TestRunRequest, testInfosByTarget: Map<string, TestInfo[]>) {
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
        const filter = runFilter(testInfos.map(testInfo => testInfo.testcase));
        const jsonFileName = "test_detail_for_" + path.parse(targetFile).base;
        runTarget(targetFile, filter, jsonFileName, testInfos);
    });
}

async function onJSONResultAvailable(buildFolder: string, jsonFileName: string, run: vscode.TestRun, testInfos: TestInfo[]) {
    const jsonResultUri = vscode.Uri.file(`${buildFolder}/${jsonFileName}`);
    let itemById = new Map<string, vscode.TestItem>()
    testInfos.forEach(testInfo => itemById.set(testInfo.item.id, testInfo.item));

    await rj.forEachTestCase(jsonResultUri, (testcase, testsuite) => {
        let testCaseName = testcase.name;
        logger().info(`testCaseName ${testCaseName}`);

        let testCaseId = rj.testcaseId(testcase, testsuite);
        let item = itemById.get(testCaseId);
        if (item) {
            let failures = testcase.failures;
            if (!failures) {
                processPassedTestcase(run, item);
            }
            else {
                processFailedTestcase(run, item, failures);
            }
        }
        else {
            logger().error(`Testcase item for id ${testCaseId} not found!`);
        }
    });
}

function processPassedTestcase(run: vscode.TestRun, item: vscode.TestItem) {
    logger().info(`Testcase ${item.id} passed.`);
    run.passed(item);
}

function processFailedTestcase(run: vscode.TestRun, item: vscode.TestItem, failures: any) {
    logger().info(`Testcase ${item.id} failed.`);
    const failureMessage: string = failures[0].failure;
    const failureMessageForDocument = createFailureMessageForDocument(item, failureMessage);
    let lineNo = rj.lineNumberFromFailureMessage(failureMessage);
    failureMessageForDocument.location = new vscode.Location(item.uri!, new vscode.Position(lineNo, 0));
    run.failed(item, failureMessageForDocument);
}

function createFailureMessageForDocument(item: vscode.TestItem, failureMessage: string) {
    const message = new vscode.TestMessage(failureMessage.substring(failureMessage.indexOf("\n") + 1));
    let lineNo = rj.lineNumberFromFailureMessage(failureMessage);
    message.location = new vscode.Location(item.uri!, new vscode.Position(lineNo, 0));
    return message;
}

function createRunHandler(testController: vscode.TestController) {
    return async function runHandler(
        request: vscode.TestRunRequest,
        token: vscode.CancellationToken
    ) {
        let testInfosByTarget = new Map<string, TestInfo[]>();
        if (request.include) {
            request.include.forEach(item => fillRunInfoWithItem(item, testInfosByTarget));
        } else {
            testController.items.forEach(item => fillRunInfoWithItem(item, testInfosByTarget));
        }

        let buildFailed = false;
        const buildFolder = cfg.getBuildFolder();
        const targetsWithSpaces = Array.from(testInfosByTarget.keys(), targetFileName => path.parse(targetFileName).base).join(' ');
        logger().info(`Building required targets ${targetsWithSpaces}`);
        const cmd = `cd ${buildFolder} && ninja ${targetsWithSpaces}`;
        buildTargets(testController, testInfosByTarget, request);
    }
}

function runFilter(descriptors: TestCase[]) {
    return descriptors.map(createFilterForId).join("");
}

function createFilterForId(descriptor: TestCase) {
    const gtestType = descriptor.gTestType;
    if (gtestType === GTestType.Parameter || gtestType === GTestType.ParameterSuite) {
        return descriptor.id + '.*:';
    }
    return descriptor.id + ':';
}