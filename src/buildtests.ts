import * as vscode from 'vscode';
import * as path from 'path';
import { TargetInfo, TestCase } from './types';
import { logger } from './logger';
import * as cfg from './configuration';
import { targetMappingFileName } from './constants';
import { spawnShell } from './system';


export async function buildTests(targets: Array<string>, onBuildDone: () => void, onBuildFailed: () => void) {
    const targetsParameter = targets.join(" ");
    logger().info(`Building required test executables for target(s) ${targetsParameter}.`);

    const buildFolder = cfg.getBuildFolder();
    let hasBuildFailed = false;
    const cmd = `cd ${buildFolder} && ninja ${targetsParameter}`;
    spawnShell(cmd, (code) => {
        logger().debug(`Build exited with code ${code}`);
        processBuildDone(hasBuildFailed, onBuildDone);
    }, output => {
        logger().debug(output);
        processBuildOutput(output, hasBuildFailed, onBuildFailed);
    });
}

function processBuildDone(buildFailed: boolean, onBuildDone: () => void) {
    if (!buildFailed) {
        logger().info(`Building test executables done.`);
        onBuildDone();
    }
}

function processBuildOutput(output: string, buildFailed: boolean, onBuildFailed: () => void) {
    if (/ninja: build stopped/.exec(output)) {
        logger().info(`Building targets failed!. No testcases were executed!`);
        buildFailed = true;
        onBuildFailed();
    }
}