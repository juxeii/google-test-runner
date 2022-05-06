import * as vscode from 'vscode';
import * as cfg from '../utils/configuration';
import { startProcess } from '../utils/system';
import { logDebug } from '../utils/logger';
import { getGTestLogFile, getJSONResultFile, TargetByInfo } from '../utils/utils';
import { Observable } from 'observable-fns';

export function runTest(runParams: { rootItem: vscode.TestItem, leafItems: vscode.TestItem[], targetInfoByFile: Map<string, TargetByInfo> }) {
    const rootItemUri = runParams.rootItem.uri!;
    const targetFile = runParams.targetInfoByFile.get(rootItemUri.fsPath)?.targetFile;
    const filter = createRunFilter(runParams.leafItems);
    const jsonResultFile = getJSONResultFile(runParams.rootItem.uri!).baseName;
    const verbosityLevel = cfg.gtestVerbosityLevel();
    const gtestLogFile = getGTestLogFile(rootItemUri).baseName;
    const cmd = `cd ${cfg.getBuildFolder()} && ${targetFile} --gtest_filter=${filter} --gtest_output=json:${jsonResultFile} --verbose ${verbosityLevel} | tee ${gtestLogFile}`;

    return startProcess(cmd, false).flatMap(code => Observable.of(runParams.rootItem));
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