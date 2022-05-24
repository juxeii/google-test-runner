import * as vscode from 'vscode';
import * as cfg from '../utils/configuration';
import { foldProcessUpdate, ProcessError, ProcessExit, ProcessExitBySignal, ProcessStdErr, ProcessStdOut, ProcessUpdate, startProcess } from '../utils/process';
import { logDebug, logError } from '../utils/logger';
import { getGTestLogFile, getJSONResultFile } from '../utils/utils';
import { Observable, SubscriptionObserver } from 'observable-fns';
import { TargetByInfo } from '../parsing/buildninja';

export function runTest(runParams: { rootItem: vscode.TestItem, leafItems: vscode.TestItem[], targetInfoByFile: Map<string, TargetByInfo> }) {
    const rootItemUri = runParams.rootItem.uri!;
    const targetFile = runParams.targetInfoByFile.get(rootItemUri.fsPath)?.targetFile;
    const filter = createRunFilter(runParams.leafItems);
    const jsonResultFile = getJSONResultFile(runParams.rootItem.uri!).baseName;
    const verbosityLevel = cfg.gtestVerbosityLevel();
    const gtestLogFile = getGTestLogFile(rootItemUri).baseName;
    const cmd = `cd ${cfg.getBuildFolder()} && ${targetFile} --gtest_filter=${filter} --gtest_output=json:${jsonResultFile} --verbose ${verbosityLevel} | tee ${gtestLogFile}`;

    return new Observable<vscode.TestItem>(observer => {
        startProcess(cmd)
            .subscribe({
                next(testRunUpdate) { handleTestRunUpdates(testRunUpdate, observer) },
                error(processError: ProcessError) {
                    logError(`Test run failed with error ${processError.error.message}`);
                    observer.error(processError.error)
                },
                complete() { observer.next(runParams.rootItem); observer.complete(); }
            });
    });
}

function handleTestRunUpdates(testRunUpdate: ProcessUpdate, observer: SubscriptionObserver<vscode.TestItem>) {
    const onTestRunUpdate = foldProcessUpdate(
        (processExit: ProcessExit) => logDebug(`Test run exited with code ${processExit.code}`),
        (processExitBySignal: ProcessExitBySignal) => logDebug(`Test run exited with signal ${processExitBySignal.signal}`),
        _ => { },
        (processStdErr: ProcessStdErr) => logDebug(processStdErr.signal),
    );
    onTestRunUpdate(testRunUpdate);
}

function createRunFilter(items: vscode.TestItem[]) {
    return items.reduce((filter, item) => {
        if (!item.parent) {
            logDebug(`No filter for ${item.id} needed`);
            filter += '*';
        }
        else if (item.children.size > 1 && item.parent) {
            const fixtureFilter = item.id + '*:';
            logDebug(`Adding fixture filter ${fixtureFilter} for item ${item.id}.Current filter is ${filter} `);
            filter += fixtureFilter;
        }
        else if (item.parent) {
            const testCaseFilter = item.id + ':';
            logDebug(`Adding testcase filter ${testCaseFilter} for item ${item.id}.Current filter is ${filter} `);
            filter += testCaseFilter;
        }
        return filter;
    }, '');
}