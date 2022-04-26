
import * as cfg from './configuration';
import { ProcessHandler, startProcess } from './system';
import { logInfo, logDebug } from './logger';
import { RunEnvironment } from './testrun';
import { getTargetForDocument } from './utils';
import { targetMappingFileContents } from './extension';

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
        const targetName = getTargetForDocument(targetMappingFileContents, uri);
        logDebug(`Found build target ${targetName} for ${uri}`);
        return targetName;
    });
}