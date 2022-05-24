
import * as vscode from 'vscode';
import * as cfg from '../utils/configuration';
import { foldProcessUpdate, ProcessError, ProcessExit, ProcessExitBySignal, ProcessStdErr, ProcessStdOut, ProcessUpdate, startProcess } from '../utils/process';
import { logInfo, logDebug, logError } from '../utils/logger';
import { RunEnvironment } from './testrun';
import { Observable, SubscriptionObserver } from 'observable-fns';

export function buildTests(runEnvironment: RunEnvironment) {
    return Observable.from(rootItems(runEnvironment)).flatMap(rootItem => {
        const targetInfo = getTargetInfo(rootItem, runEnvironment);
        return buildTest(targetInfo.name, rootItem);
    });
}

export function buildTest(testTarget: string, rootItem: vscode.TestItem) {
    logInfo(`Building test target ${testTarget} ...`);
    const buildFolder = cfg.getBuildFolder();
    const cmd = `cd ${buildFolder} && ninja ${testTarget}`;

    return new Observable<vscode.TestItem>(observer => {
        startProcess(cmd)
            .subscribe({
                next(buildUpate) { handleBuildUpdates(buildUpate, observer) },
                error(processError: ProcessError) {
                    logError(`Test build failed with error ${processError.error.message}`);
                    observer.error(processError.error)
                },
                complete() { observer.next(rootItem); observer.complete(); }
            });
    });
}

function handleBuildUpdates(buildUpate: ProcessUpdate, observer: SubscriptionObserver<vscode.TestItem>) {
    const onBuildUpdate = foldProcessUpdate(
        (processExit: ProcessExit) => {
            logDebug(`Test build exited with code ${processExit.code}`);
            if (processExit.code != 0) {
                observer.error(new Error('Test build failed!'));
            }
        },
        (processExitBySignal: ProcessExitBySignal) => {
            logDebug(`Test build exited with signal ${processExitBySignal.signal}`);
            observer.error(new Error('Test build aborted by signal!'));
        },
        (processStdOut: ProcessStdOut) => logDebug(processStdOut.signal),
        (processStdErr: ProcessStdErr) => logDebug(processStdErr.signal),
    );
    onBuildUpdate(buildUpate);
}

function rootItems(runEnvironment: RunEnvironment) {
    return [...runEnvironment.leafItemsByRootItem.keys()];
}

function getTargetInfo(rootItem: vscode.TestItem, runEnvironment: RunEnvironment) {
    const uri = rootItem.uri!;
    const targetInfo = runEnvironment.targetInfoByFile.get(uri.fsPath)!;
    logDebug(`Found build target ${targetInfo.name} for ${uri}`);
    return targetInfo;
}