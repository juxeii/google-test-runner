
import * as vscode from 'vscode';
import * as cfg from '../utils/configuration';
import { startProcess } from '../utils/system';
import { logInfo, logDebug } from '../utils/logger';
import { RunEnvironment } from './testrun';
import { ExtEnvironment } from '../extension';
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
    return startProcess(cmd, true).flatMap(code => Observable.of(rootItem));
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