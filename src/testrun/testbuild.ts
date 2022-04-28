
import * as cfg from '../utils/configuration';
import { ProcessHandler, startProcess } from '../utils/system';
import { logInfo, logDebug } from '../utils/logger';
import { RunEnvironment } from './testrun';
import { targetFileByUri } from '../extension';

export function buildTests(runEnvironment: RunEnvironment, handlers: ProcessHandler) {
    const targets = getTargets(runEnvironment).join(" ");
    logInfo(`Building required test executables for target(s) ${targets}.`);

    const buildFolder = cfg.getBuildFolder();
    const cmd = `cd ${buildFolder} && ninja ${targets}`;
    return startProcess(cmd, handlers);
}

function getTargets(runEnvironment: RunEnvironment) {
    return [...runEnvironment.leafItemsByRootItem.keys()].map(item => {
        const uri = item.uri!;
        const targetName = targetFileByUri.get(uri.fsPath)?.name;
        logDebug(`Found build target ${targetName} for ${uri}`);
        return targetName;
    }).filter((v, i, a) => a.indexOf(v) === i);
}