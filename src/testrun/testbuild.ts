
import * as vscode from 'vscode';
import * as cfg from '../utils/configuration';
import { foldProcessUpdate, ProcessUpdate, startProcess } from '../utils/process';
import { logInfo, logDebug, logError } from '../utils/logger';
import { RunEnvironment } from './testrun';
import { Observable } from 'observable-fns';

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
        const subscription = startProcess(cmd)
            .subscribe({
                next(buildUpate) { handleBuildUpdates(buildUpate) },
                error(error: Error) {
                    logError(`Test build failed with: ${error.message}`);
                    observer.error(error)
                },
                complete() { observer.next(rootItem); observer.complete(); }
            });
        return () => subscription.unsubscribe();
    });
}

function handleBuildUpdates(buildUpate: ProcessUpdate) {
    foldProcessUpdate(
        processExit => logDebug(`Test build exited with code ${processExit.code}`),
        processExitBySignal => logDebug(`Test build exited with signal ${processExitBySignal.signal}`),
        processStdOut => logDebug(processStdOut.signal),
        processStdErr => logDebug(processStdErr.signal),
    )(buildUpate);
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