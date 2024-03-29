import * as vscode from 'vscode'
import * as R from 'fp-ts/Reader'
import { logDebug } from './utils/logger'
import { discoverGTestMacros } from './parsing/macrodiscovery'
import { discoverTestCasesFromMacros, TestCase } from './parsing/testdiscovery'
import { DocumentUpdate, DocumentUpdateInfo, observeDocumentUpdates } from './utils/listener'
import { ExtEnvironment } from './extension'

export type TestCasesUpdate = {
    document: vscode.TextDocument
    testCases: TestCase[]
}

export const observeTestCasesUpdates = (environment: ExtEnvironment) => {
    logDebug(`Creating document controller`)

    return observeDocumentUpdates()
        .filter(updateInfo => filterUpdateInfo(updateInfo, environment))
        .map(updateInfo => updateInfo2TestCasesUpdate(updateInfo, environment))
}

const filterUpdateInfo = (updateInfo: DocumentUpdateInfo, environment: ExtEnvironment) =>
    isInBuildManifest(updateInfo.document)(environment) &&
    !(updateInfo.updateType === DocumentUpdate.SWITCHED_ACTIVE && environment.parsedDocuments.has(updateInfo.document))

const updateInfo2TestCasesUpdate = (updateInfo: DocumentUpdateInfo, environment: ExtEnvironment) => {
    const document = updateInfo.document
    if (updateInfo.updateType === DocumentUpdate.SAVED || updateInfo.updateType === DocumentUpdate.SWITCHED_ACTIVE) {
        const testCases = createTestCases(document)
        environment.parsedDocuments.add(document)
        return { document: document, testCases: testCases }

    }
    environment.parsedDocuments.delete(document)
    return { document: document, testCases: [] }
}

const createTestCases = (document: vscode.TextDocument) => {
    const macros = discoverGTestMacros(document)
    return discoverTestCasesFromMacros(macros)
}

const isInBuildManifest = (document: vscode.TextDocument): R.Reader<ExtEnvironment, boolean> => env => env.targetInfoByFile.has(document.uri.fsPath)