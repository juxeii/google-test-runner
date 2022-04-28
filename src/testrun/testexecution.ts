import * as vscode from 'vscode';
import * as cfg from '../utils/configuration';
import { ProcessHandler, startProcess } from '../utils/system';
import { logDebug } from '../utils/logger';
import { RunEnvironment } from './testrun';
import { targetFileByUri } from '../extension';
import { getGTestLogFile, getJSONResultFile } from '../utils/utils';

export function runTests(runEnvironment: RunEnvironment, onTestFileExecuted: (item: vscode.TestItem) => void) {
    runEnvironment.leafItemsByRootItem.forEach((leafItems, rootItem) => {
        const rootItemUri = rootItem.uri!;
        const targetFile = targetFileByUri.get(rootItemUri.fsPath)?.targetFile;
        const filter = createRunFilter(leafItems);
        const jsonResultFile = getJSONResultFile(rootItem.uri!).baseName;
        const verbosityLevel = cfg.gtestVerbosityLevel();
        const gtestLogFile = getGTestLogFile(rootItemUri).baseName;
        const cmd = `cd ${cfg.getBuildFolder()} && ${targetFile} --gtest_filter=${filter} --gtest_output=json:${jsonResultFile} --verbose ${verbosityLevel} | tee ${gtestLogFile}`;

        let handlers: ProcessHandler = {
            onDone: (code) => onTestFileExecuted(rootItem),
            onData: logDebug,
            onError: (code) => {
                logDebug(`Execution failed with ${code}`);
                onTestFileExecuted(rootItem);
            }
        }
        const executionTask = startProcess(cmd, handlers);
        runEnvironment.runTasks.push(executionTask);
    });
}

function createRunFilter(items: vscode.TestItem[]) {
    let filter = '';
    items.forEach(item => {
        if (!item.parent) {
            filter = '*';
            logDebug(`No filter for ${item.id} needed`);
            return;
        }
        if (item.children.size > 1 && item.parent) {
            const fixtureFilter = item.id + '*:';
            filter += fixtureFilter;
            logDebug(`Adding fixture filter ${fixtureFilter} for item ${item.id}.Current filter is ${filter} `);
            return;
        }

        if (item.parent && !item.parent.parent) {
            const testCaseFilter = item.id + ':';
            filter += testCaseFilter;
            logDebug(`Adding testcase filter ${testCaseFilter} for item ${item.id}.Current filter is ${filter} `);
            return;
        }

        if (item.parent && item.parent.parent) {
            const testCaseFilter = item.id + ':';
            filter += testCaseFilter;
            logDebug(`Adding testcase filter ${testCaseFilter} for item ${item.id}.Current filter is ${filter} `);
        }
    });
    return filter;
}