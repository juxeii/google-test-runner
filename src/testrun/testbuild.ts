
import * as vscode from 'vscode';
import * as cfg from '../utils/configuration';
import { startProcess } from '../utils/system';
import { logInfo, logDebug } from '../utils/logger';
import { RunEnvironment } from './testrun';
import { targetFileByUri } from '../extension';
import { Observable } from 'observable-fns';

export function buildTests(runEnvironment: RunEnvironment) {
    return Observable.from(rootItems(runEnvironment)).flatMap(rootItem => {
        const targetInfo = getTargetInfo(rootItem);
        return buildTest(targetInfo.name, rootItem);
    });
}

function buildTest(testTarget: string, rootItem: vscode.TestItem) {
    logInfo(`Building test target ${testTarget} ...`);

    const buildFolder = cfg.getBuildFolder();
    const cmd = `cd ${buildFolder} && ninja ${testTarget}`;
    return startProcess(cmd).flatMap(code => Observable.of(rootItem));
}

function rootItems(runEnvironment: RunEnvironment) {
    return [...runEnvironment.leafItemsByRootItem.keys()];
}

function getTargetInfo(rootItem: vscode.TestItem) {
    const uri = rootItem.uri!;
    const targetInfo = targetFileByUri.get(uri.fsPath)!;
    logDebug(`Found build target ${targetInfo.name} for ${uri}`);
    return targetInfo;
}