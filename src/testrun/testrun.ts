import * as vscode from 'vscode'
import { buildTests } from './testbuild'
import { observeTestResult } from './testevaluation'
import { createLeafItemsByRoot } from './testcontroller'
import { runTest } from './testexecution'
import { ExtEnvironment } from '../extension'
import { TargetByInfo } from '../parsing/buildninja'
import { startDebug } from './testdebug'
import { getFileContents, getGTestLogFile } from '../utils/fsutils'
import { logInfo, logDebug, outputChannelGT, logDelimiterLine, printBlock } from '../utils/logger'

export type RunEnvironment = {
    testRun: vscode.TestRun
    testController: vscode.TestController
    targetInfoByFile: Map<string, TargetByInfo>
    runRequest: vscode.TestRunRequest
    leafItemsByRootItem: Map<vscode.TestItem, vscode.TestItem[]>
}

export const initRunProfiles = (extEnvironment: ExtEnvironment) => {
    extEnvironment.testController.createRunProfile('Run Tests', vscode.TestRunProfileKind.Run, createRunHandler(extEnvironment), true)
    if (!vscode.extensions.getExtension('ms-vscode.cpptools')) {
        logInfo('ms-vscode.cpptools extension is not installed. Test debugging is disabled.')
    }
    else {
        extEnvironment.testController.createRunProfile('Debug Tests', vscode.TestRunProfileKind.Debug, createDebugHandler(extEnvironment), true)
    }
}

const createDebugHandler = (env: ExtEnvironment) =>
    async function debugHandler(
        runRequest: vscode.TestRunRequest,
        token: vscode.CancellationToken
    ) {
        startDebug(env, runRequest);
    }

const createRunHandler = (env: ExtEnvironment) =>
    async function runHandler(
        runRequest: vscode.TestRunRequest,
        token: vscode.CancellationToken
    ) {
        const testRun = startRun(env.testController, runRequest)
        const runEnvironment = initializeRunEnvironment(env, runRequest, testRun)

        const testRunSubscription = buildTests(runEnvironment)
            .flatMap(rootItem => observeTestExecution(rootItem, runEnvironment))
            .flatMap(rootItem => observeTestResult(rootItem, runEnvironment))
            .subscribe({
                next(rootItem) { logDebug(`Test evaluation done for ${rootItem.uri}`) },
                error(error: Error) { onTestRunFinishedWithError(testRun, error) },
                complete() { onAllRunsCompleted(testRun, runEnvironment) }
            })

        const cancelListener = token.onCancellationRequested(() => {
            testRunSubscription.unsubscribe()
            skipItemsOnCancel(runEnvironment)
            testRun.end()
            cancelListener.dispose()
            printBlock('Test run cancelled.')
        })
    }

const observeTestExecution = (rootItem: vscode.TestItem, runEnvironment: RunEnvironment) => {
    const filePath = rootItem.uri?.fsPath!
    const targetFile = runEnvironment.targetInfoByFile.get(filePath)?.targetFile

    logDebug(`Running test executable ${targetFile} ...`)
    const leafItems = runEnvironment.leafItemsByRootItem.get(rootItem)!
    return runTest({ rootItem: rootItem, leafItems: leafItems, targetInfoByFile: runEnvironment.targetInfoByFile })
}

const startRun = (testController: vscode.TestController, runRequest: vscode.TestRunRequest) => {
    printBlock('Starting test run...')
    const testRun = testController.createTestRun(runRequest)
    showItemSpinners(testController, runRequest, testRun)
    return testRun
}

const showItemSpinners = (testController: vscode.TestController, runRequest: vscode.TestRunRequest, testRun: vscode.TestRun) => {
    if (runRequest.include) {
        runRequest.include.forEach(item => testRun.started(item))
    } else {
        testController.items.forEach(item => testRun.started(item))
    }
}

const skipItemsOnCancel = (runEnvironment: RunEnvironment) => {
    if (runEnvironment.runRequest.include) {
        runEnvironment.runRequest.include.forEach(item => runEnvironment.testRun.skipped(item))
    } else {
        runEnvironment.testController.items.forEach(item => runEnvironment.testRun.skipped(item))
    }
}

const initializeRunEnvironment = (env: ExtEnvironment, runRequest: vscode.TestRunRequest, testRun: vscode.TestRun): RunEnvironment => {
    const leafItemsByRootItem = createLeafItemsByRoot(env.testController, runRequest)
    return {
        testRun: testRun,
        testController: env.testController,
        targetInfoByFile: env.targetInfoByFile,
        runRequest: runRequest,
        leafItemsByRootItem: leafItemsByRootItem
    }
}

const onTestRunFinishedWithError = (run: vscode.TestRun, err: Error) => {
    run.end()
    printBlock(`Test run finished with error message: ${err.message}`)
}

const onAllRunsCompleted = (run: vscode.TestRun, runEnvironment: RunEnvironment) => {
    run.end()
    showLogFiles(runEnvironment)
    printBlock('Test run completed.')
}

const showLogFiles = (runEnvironment: RunEnvironment) =>
    [...runEnvironment.leafItemsByRootItem.keys()].forEach(rootItem => {
        const gTestLogFile = getGTestLogFile(rootItem.uri!).uri
        logInfo(`Log file for ${rootItem.id}: ${gTestLogFile}`)

        outputChannelGT.appendLine(logDelimiterLine)
        const logFileText = getFileContents(gTestLogFile.fsPath)
        outputChannelGT.show(true)
        outputChannelGT.appendLine(logFileText)
        outputChannelGT.appendLine(logDelimiterLine)
    })