import * as vscode from 'vscode';
import * as path from 'path';
import { Fixture, TargetInfo, testMetaData } from './types';
import * as rj from './resultjson';
import * as cfg from './configuration';
import { spawnShell } from './system';
import { TestCase, GTestType, TestInfo } from './types';
import { logger } from './logger';
import { buildTests } from './buildtests';
import { runConfiguration } from './extension';

type RootRunItems = {
    rootId: string;
    fixtures: Set<vscode.TestItem>;
    testcases: Set<vscode.TestItem>;
}

export function createTestController(runConfiguration: Map<string, TargetInfo>) {
    let testController = vscode.tests.createTestController('GoogleTestController', 'GoogleTestController');
    testController.createRunProfile('Run Tests', vscode.TestRunProfileKind.Run, createRunHandler(testController, runConfiguration), true);
    return testController;
}

function createRunHandler(testController: vscode.TestController, runConfiguration: Map<string, TargetInfo>) {
    return async function runHandler(
        request: vscode.TestRunRequest,
        token: vscode.CancellationToken
    ) {
        const requestedItems: vscode.TestItem[] = [];
        if (request.include) {
            request.include.forEach(item => requestedItems.push(item));
        } else {
            testController.items.forEach(item => requestedItems.push(item));
        }

        //let RootRunItemsById: RootRunItems = { roots: [], fixtures: [], testcases: [] };
        let rootRunItemsById = new Map<string, RootRunItems>();
        function fillItemIntoRootRunItems(item: vscode.TestItem, rootRunItems: RootRunItems) {
            if (!item.parent) {
                logger().debug(`Item ${item.id} is root.`);
                rootRunItems.rootId = item.id;
            }
            else if (item.children.size === 0) {
                logger().debug(`Item ${item.id} is testcase.`);
                rootRunItems.testcases.add(item);
            }
            else {
                logger().debug(`Item ${item.id} is fixture.`);
                rootRunItems.fixtures.add(item);
            }
        }

        requestedItems.forEach(item => {
            const baseName = path.parse(item.uri!.path).base;
            logger().debug(`Item ${item.id} testing for root uri is ${item.uri} baseName ${baseName}.`);
            if (!rootRunItemsById.has(baseName)) {
                rootRunItemsById.set(baseName, { rootId: baseName, fixtures: new Set(), testcases: new Set() });
                logger().debug(`Added new root entry ${baseName}.`);
            }
            let rootRunItems = rootRunItemsById.get(baseName)!;
            fillItemIntoRootRunItems(item, rootRunItems);
        });

        const targets = Array.from(rootRunItemsById.keys())
            .map(rootItemId => {
                const targetName = path.parse(rootItemId).name;
                logger().debug(`found target ${targetName}`);
                return targetName;
            });

        buildTests(targets, () => onBuildDone(testController, request, rootRunItemsById, runConfiguration), () => logger().info(`Build failed, damn!`));
    }
}

function createRunFilter(runItems: RootRunItems) {
    if (runItems.fixtures.size === 0 && runItems.testcases.size === 0) {
        logger().debug(`No filter for ${runItems.rootId} needed`);
        return '';
    }
    let filter = '';
    runItems.fixtures.forEach(fixture => {
        const fixtureFilter = fixture.id + '*:';
        filter += fixtureFilter;
        logger().debug(`Add fixture filter ${fixtureFilter}. Current filter is ${filter}`);
    });
    runItems.testcases.
        forEach(testcase => {
            if (runItems.fixtures.has(testcase.parent!)) {
                logger().debug(`Testcase filter for testcase ${testcase.id} not needed. Testcase is in fixture ${testcase.parent!.id}`);
            }
            else {
                const testCaseFilter = testcase.id + ':';
                filter += testCaseFilter;
                logger().debug(`Add testcase filter ${testCaseFilter}. Current filter is ${filter}`);
            }
        });
    logger().debug(`Final filter for ${runItems.rootId} is ${filter}`);
    return filter;
}


function onBuildDone(testController: vscode.TestController, request: vscode.TestRunRequest, rootRunItemsById: Map<string, RootRunItems>, runConfiguration: Map<string, TargetInfo>) {
    logger().info('Starting test run...');
    const run = testController.createTestRun(request);
    // Get execution files from TargetInfo. TargetInfo is in runConfiguration
    Array.from(rootRunItemsById.values()).map(rootRunItems => {
        logger().info(`rootRunItems.rootId is ${rootRunItems.rootId}`);
        const targetFile = runConfiguration.get(rootRunItems.rootId)!.targetFile;
        logger().info(`targetFile is targetFile ${targetFile}`);
        const filter = createRunFilter(rootRunItems);
        const baseName = path.parse(rootRunItems.rootId).name;
        const jsonResultFile = `test_detail_for_${baseName}`;
        runTarget(targetFile, filter, jsonResultFile);
    });

    run.end();
    logger().info('Test run finished.');
}

function runTarget(targetFile: string, filter: string, jsonResultFile: string) {
    //const cmd = `cd ${cfg.getBuildFolder()} && ` + targetFile + ` --gtest_filter=${filter} --gtest_output=json:${jsonFileName}`;
    const cmd = `cd ${cfg.getBuildFolder()} && ` + targetFile + ` --gtest_filter=${filter} --gtest_output=json:${jsonResultFile}`;
    spawnShell(cmd, (code) => {
        onTestTargetRunDone();
    }, (err) => onTestTargetRunFailed());
}

function onTestTargetRunDone() {
    logger().info('onTestTargetRun');
}

function onTestTargetRunFailed() {
    logger().info('onTestTargetRun failed');
}

async function onJSONResultAvailable(buildFolder: string, jsonFileName: string, run: vscode.TestRun, testInfos: TestInfo[]) {
    const jsonResultUri = vscode.Uri.file(`${buildFolder} /${jsonFileName}`);
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
