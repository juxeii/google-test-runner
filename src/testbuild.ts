
import * as cfg from './configuration';
import { spawnShell } from './system';
import { logInfo, logDebug } from './logger';

export async function buildTests(targets: Array<string>, onBuildDone: () => void, onBuildFailed: () => void) {
    const targetsParameter = targets.join(" ");
    logInfo(`Building required test executables for target(s) ${targetsParameter}.`);

    const buildFolder = cfg.getBuildFolder();
    const cmd = `cd ${buildFolder} && ninja ${targetsParameter}`;
    spawnShell(cmd, (code) => processExitCode(code, onBuildDone, onBuildFailed), logDebug);
}

function processExitCode(code: number, onBuildDone: () => void, onBuildFailed: () => void) {
    logDebug(`Build exited with code ${code}`);
    if (code === 1) {
        logInfo(`Building targets failed!. No testcases were executed!`);
        onBuildFailed();
    }
    else {
        logInfo(`Building test executables done.`);
        onBuildDone();
    }
}