import * as vscode from 'vscode'
import * as cfg from './utils/configuration'
import { logDebug, logError, logInfo } from './utils/logger'
import { createTargetByFileMapping, TargetByInfo } from './parsing/buildninja'
import { initTestController, removeDocumentItems } from './testrun/testcontroller'
import { FileUpdate, observeFileUpdates } from './utils/listener'
import { Observable, Subscription, SubscriptionObserver } from 'observable-fns'
import { doesPathExist } from './utils/fsutils'
import { IO } from 'fp-ts/lib/IO'
const commandExistsSync = require('command-exists').sync

export type ExtEnvironment = {
    context: vscode.ExtensionContext
    testController: vscode.TestController
    targetInfoByFile: Map<string, TargetByInfo>
    parsedDocuments: Set<vscode.TextDocument>
}

export function activate(context: vscode.ExtensionContext) {
    logInfo(`${cfg.extensionName} activated.`)

    if (!isEnvironmentValid()) {
        return
    }
    const environment = createExtEnvironment(context)
    subscribeToBuildManifestUpdates(environment)
}

const isEnvironmentValid = () => {
    logDebug(`Checking environment...`)
    if (commandExistsSync('ninja')) {
        logDebug(`Ninja does exist.`)
    }
    else {
        const errorMessage = 'Ninja does not exist! Make sure you have a working environment sourced!'
        logError(errorMessage)
        showErrorMessage(errorMessage)()
        return false
    }
    logDebug(`Environment seems fine.`)
    return true
}

const subscribeToBuildManifestUpdates = (environment: ExtEnvironment) => {
    const isTestControllerReady = { isReady: false }
    observeTargetInfoUpdates().subscribe(targetByFileMapping => {
        fillTargetInfo(targetByFileMapping, environment)
        resyncDocuments(environment)
        if (!isTestControllerReady.isReady) {
            initTestController(environment)
            isTestControllerReady.isReady = true
        }
    })
}

const fillTargetInfo = (targetByFileMapping: Map<string, TargetByInfo>, environment: ExtEnvironment) => {
    environment.targetInfoByFile.clear()
    for (const [file, targetInfo] of targetByFileMapping) {
        environment.targetInfoByFile.set(file, targetInfo)
    }
}

const resyncDocuments = (environment: ExtEnvironment) => {
    logDebug(`Resync parsed documents on build manifest change.`)

    environment.parsedDocuments.forEach(document => {
        if (!environment.targetInfoByFile.has(document.uri.fsPath)) {
            environment.parsedDocuments.delete(document)
            removeDocumentItems(document, environment)
        }
    })
}

const createExtEnvironment = (context: vscode.ExtensionContext) => {
    return {
        context: context,
        testController: createTestController(context),
        targetInfoByFile: new Map<string, TargetByInfo>(),
        parsedDocuments: new Set<vscode.TextDocument>()
    }
}

const createTestController = (context: vscode.ExtensionContext) => {
    const testController = vscode.tests.createTestController('GoogleTestController', 'GoogleTestController')
    context.subscriptions.push(testController)
    return testController
}

const observeTargetInfoUpdates = (): Observable<Map<string, TargetByInfo>> =>
    new Observable<Map<string, TargetByInfo>>(observer => {
        let targetInfoSubscription: Subscription<FileUpdate>
        observeBuildFolderChange().subscribe(folder => {
            if (!doesPathExist(folder)) {
                showInvalidBuildFolderMessage()
            }

            if (targetInfoSubscription) {
                targetInfoSubscription.unsubscribe()
            }
            targetInfoSubscription = emitTargetInfo(observer)
        })

        return () => {
            logDebug(`Unsubscribing from build folder updates.`)
            targetInfoSubscription.unsubscribe()
        }
    })

const observeBuildFolderChange = () =>
    new Observable<string>(observer => {
        const configurationListener = vscode.workspace.onDidChangeConfiguration(event => {
            if (cfg.hasBuildFolderChanged(event)) {
                observer.next(cfg.getBuildFolder())
            }
        })
        logDebug(`Created listener for new build folder configurations.`)
        observer.next(cfg.getBuildFolder())
        return () => {
            logDebug(`Unsubscribing from build folder updates.`)
            configurationListener.dispose()
        }
    })

const emitTargetInfo = (observer: SubscriptionObserver<Map<string, TargetByInfo>>) =>
    observeFileUpdates(cfg.buildNinjaPath()).subscribe(update => {
        if (update === FileUpdate.DELETED) {
            showBuildManifestMissingMessage()
            observer.next(new Map<string, TargetByInfo>())
        }
        else {
            observer.next(createTargetByFileMapping())
        }
    })

const showInvalidBuildFolderMessage = () => {
    const misconfiguredMsg = `The provided build folder ${cfg.getBuildFolder()} does not exist. Please change to an existing build folder via settings menu.`
    logError(misconfiguredMsg)
    showWarningMessage(misconfiguredMsg)()
}

const showBuildManifestMissingMessage = () => {
    const noBuildManifestMessage = `GoogleTestRunner needs the ${cfg.buildNinjaFileName} file to work. Please run cmake configure at least once with your configured build folder ${cfg.getBuildFolder()}.`
    logInfo(noBuildManifestMessage)
    showWarningMessage(noBuildManifestMessage)()
}

export const showWarningMessage = (message: string): IO<void> => () => vscode.window.showWarningMessage(message)

export const showErrorMessage = (message: string): IO<void> => () => vscode.window.showErrorMessage(message)

export function deactivate() { }