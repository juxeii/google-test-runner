import * as vscode from 'vscode';
import * as R from 'fp-ts/Reader';
import { logDebug } from './utils/logger';
import { discoverGTestMacros } from './parsing/macrodiscovery';
import { discoverTestCasesFromMacros } from './parsing/testdiscovery';
import { TestCase } from './types';
import { DocumentUpdate, observeDocumentUpdates } from './listener';
import { ExtEnvironment } from './extension';
import { Observable } from 'observable-fns';

export type TestCasesUpdate = {
    document: vscode.TextDocument;
    testCases: TestCase[];
}

export const observeTestCasesUpdates = (environment: ExtEnvironment): Observable<TestCasesUpdate> => {
    logDebug(`Creating document controller`);

    const documentObserver = observeDocumentUpdates()
        .filter(updateInfo => isInBuildManifest(updateInfo.document)(environment))
        .filter(updateInfo => !(updateInfo.updateType === DocumentUpdate.SWITCHED_ACTIVE && environment.parsedDocuments.has(updateInfo.document)))
        .map(updateInfo => {
            const document = updateInfo.document;
            if (updateInfo.updateType === DocumentUpdate.SAVED || updateInfo.updateType === DocumentUpdate.SWITCHED_ACTIVE) {
                const testCases = createTestCases(document);
                environment.parsedDocuments.add(document);
                return { document: document, testCases: testCases };

            }
            else {
                environment.parsedDocuments.delete(document);
                return { document: document, testCases: [] };
            }
        });
    return documentObserver;
}

const createTestCases = (document: vscode.TextDocument): TestCase[] => {
    const macros = discoverGTestMacros(document);
    return discoverTestCasesFromMacros(macros);
};

const isInBuildManifest = (document: vscode.TextDocument): R.Reader<ExtEnvironment, boolean> => env => {
    return env.targetInfoByFile.has(document.uri.fsPath);
};