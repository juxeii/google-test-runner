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

type RunEnvironment = {
    testController: vscode.TestController;
    request: vscode.TestRunRequest;
    runConfiguration: Map<string, TargetInfo>;
    requestedItems: vscode.TestItem[];
    rootRunItemsById: Map<string, RootRunItems>;
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

        let runEnvironment: RunEnvironment = {
            testController: testController,
            request: request,
            runConfiguration: runConfiguration,
            requestedItems: requestedItems,
            rootRunItemsById: rootRunItemsById
        }

        buildTests(targets, () => onBuildDone(runEnvironment), () => logger().info(`Build failed, damn!`));
    }
}

function createRunFilter(runItems: RootRunItems) {
    if (runItems.fixtures.size === 0 && runItems.testcases.size === 0) {
        logger().debug(`No filter for ${runItems.rootId} needed`);
        return '*';
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


function onBuildDone(runEnvironment: RunEnvironment) {
    logger().info('Starting test run...');
    const run = runEnvironment.testController.createTestRun(runEnvironment.request);
    // Get execution files from TargetInfo. TargetInfo is in runConfiguration

    let noOfRuns = 0;
    let runsCompletedEmitter = new vscode.EventEmitter<void>();
    let runCompletedListener = runsCompletedEmitter.event(() => {
        ++noOfRuns;
        logger().info(`noOfRuns ${noOfRuns}`);
        if (noOfRuns == runEnvironment.rootRunItemsById.size) {
            onAllRunsCompleted(run);
            runCompletedListener.dispose();
        }
    });

    Array.from(runEnvironment.rootRunItemsById.values()).forEach(rootRunItems => {
        logger().info(`rootRunItems.rootId is ${rootRunItems.rootId}`);
        const targetFile = runConfiguration.get(rootRunItems.rootId)!.targetFile;
        logger().info(`targetFile is targetFile ${targetFile}`);
        const filter = createRunFilter(rootRunItems);
        const baseName = path.parse(rootRunItems.rootId).name;
        const jsonResultFile = `test_detail_for_${baseName}`;
        runTarget(runEnvironment, targetFile, filter, jsonResultFile, run, runsCompletedEmitter);
    });
}

function runTarget(runEnvironment: RunEnvironment, targetFile: string, filter: string, jsonResultFile: string, run: vscode.TestRun, runsCompletedEmitter: vscode.EventEmitter<void>) {
    const cmd = `cd ${cfg.getBuildFolder()} && ${targetFile} --gtest_filter=${filter} --gtest_output=json:${jsonResultFile}`;
    spawnShell(cmd, (code) => {
        onJSONResultAvailable(runEnvironment, jsonResultFile, run, runsCompletedEmitter);
    }, (err) => onTestTargetRunFailed());
}

function onTestTargetRunFailed() {
    logger().info('onTestTargetRun failed');
}

function onAllRunsCompleted(run: vscode.TestRun) {
    run.end();
    logger().info('All test runs completed.');
}

async function onJSONResultAvailable(runEnvironment: RunEnvironment, jsonResultFile: string, run: vscode.TestRun, runsCompletedEmitter: vscode.EventEmitter<void>) {
    const buildFolder = cfg.getBuildFolder();
    const jsonResultFileUri = vscode.Uri.file(path.join(buildFolder, jsonResultFile));
    logger().debug(`jsonResultFileUri ${jsonResultFileUri}`);
    const testReportById = await rj.createTestReportById(jsonResultFileUri);

    //let itemResultById = new Map<string, >();

    function evalItem(item: vscode.TestItem) {
        if (item.children.size > 0) {
            item.children.forEach(evalItem);
        }
        logger().debug(`Looking for test result of item ${item.id}`);
        const testReports = testReportById.get(item.id);
        if (testReports) {
            logger().debug(`Testrepor found for ${item.id}`);
            const testCaseFailures = testReports.filter(report => {
                return !report.hasPassed;
            });

            if (testCaseFailures.length === 0) {
                processPassedTestcase(run, item);
            }
            else {
                processFailedTestcase(run, item, testCaseFailures[0].failures[0]);
            }
        }
        else {
            logger().error(`Testcase item for id ${item.id} not found!`);
        }
    }
    runEnvironment.requestedItems.forEach(evalItem)
    logger().debug(`Firing result evalutaion end`);
    runsCompletedEmitter.fire();
}

function processPassedTestcase(run: vscode.TestRun, item: vscode.TestItem) {
    logger().info(`Testcase ${item.id} passed.`);
    run.passed(item);
}

function processFailedTestcase(run: vscode.TestRun, item: vscode.TestItem, failure: rj.TestFailure) {
    logger().info(`Testcase ${item.id} failed.`);
    let failureMessage = failure.message;
    if (failure.param) {
        failureMessage += '\n' + `Failure parameter: ${failure.param}`;
    }
    const failureMessageForDocument = createFailureMessageForDocument(item, failureMessage, failure);
    //let lineNo = failure.lineNo;
    //failureMessageForDocument.location = new vscode.Location(item.uri!, new vscode.Position(lineNo, 0));
    run.failed(item, failureMessageForDocument);
}

function createFailureMessageForDocument(item: vscode.TestItem, failureMessage: string, failure: rj.TestFailure) {
    const message = new vscode.TestMessage(failureMessage.substring(failureMessage.indexOf("\n") + 1));
    const lineNo = failure.lineNo;
    message.location = new vscode.Location(item.uri!, new vscode.Position(lineNo, 0));
    return message;
}
