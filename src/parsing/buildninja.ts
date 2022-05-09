import fs = require('fs');
import { resolve, join } from 'path';
import { logDebug } from '../utils/logger';
import * as cfg from '../utils/configuration';

export type TargetByInfo = {
    name: string;
    targetFile: string;
}

export function createTargetByFileMapping() {
    const buildFolder = cfg.getBuildFolder();
    const pathf = join(buildFolder, cfg.buildNinjaFileName);
    const rawContents = fs.readFileSync(pathf);
    return fillMappingWithTargetInfo(rawContents.toString());
}

function fillMappingWithTargetInfo(fileContents: string) {
    const buildFolder = cfg.getBuildFolder();
    const relPathByTarget = createTargetFileByTargetMapping(fileContents);
    const targetByFileMapping = new Map<string, TargetByInfo>();
    const fileAndTargetRegExp = new RegExp(/^.*CXX_COMPILER__(\w+)_.+\s+((..)?(?:\/(?:\w|\.|-)+)+).*/, 'gm');

    [...fileContents.matchAll(fileAndTargetRegExp)].forEach(match => {
        const target = match[1];
        const path = match[2];
        const relTargetFile = relPathByTarget.get(target);
        if (relTargetFile) {
            const sourceFile = resolve(buildFolder, path)
            const targetFile = resolve(buildFolder, relTargetFile)
            targetByFileMapping.set(sourceFile, { name: target, targetFile: targetFile });
        }
    });
    logDebug(`Mapped ${targetByFileMapping.size} targets from build manifest.`);
    return targetByFileMapping;
}

function createTargetFileByTargetMapping(fileContents: string) {
    let targetFileByTarget = new Map<string, string>();
    const targetFileRegex = new RegExp(/^build (.*):.*CXX_EXECUTABLE_LINKER__(\w+)_/, 'gm');
    [...fileContents.matchAll(targetFileRegex)].forEach(match => {
        const targetFile = match[1];
        const target = match[2];
        targetFileByTarget.set(target, targetFile);
    });
    return targetFileByTarget;
}