
import * as cfg from './configuration';
import { spawnShell } from './system';
import { logInfo, logDebug } from './logger';


export async function buildTests(targets: Array<string>, onBuildDone: () => void, onBuildFailed: () => void) {
    const targetsParameter = targets.join(" ");
    logInfo(`Building required test executables for target(s) ${targetsParameter}.`);

    const buildFolder = cfg.getBuildFolder();
    let hasBuildFailed = false;
    const cmd = `cd ${buildFolder} && ninja ${targetsParameter}`;
    spawnShell(cmd, (code) => {
        logDebug(`Build exited with code ${code}`);
        processBuildDone(hasBuildFailed, onBuildDone);
    }, output => {
        logDebug(output);
        processBuildOutput(output, hasBuildFailed, onBuildFailed);
    });
}

function processBuildDone(buildFailed: boolean, onBuildDone: () => void) {
    if (!buildFailed) {
        logInfo(`Building test executables done.`);
        onBuildDone();
    }
}

function processBuildOutput(output: string, buildFailed: boolean, onBuildFailed: () => void) {
    if (/ninja: build stopped/.exec(output)) {
        logInfo(`Building targets failed!. No testcases were executed!`);
        buildFailed = true;
        onBuildFailed();
    }
}