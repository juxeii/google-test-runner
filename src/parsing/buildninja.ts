import fs = require('fs');
import { resolve, join } from 'path';
import { logDebug } from '../utils/logger';
import * as cfg from '../utils/configuration';

export type TargetByInfo = {
    name: string;
    targetFile: string;
}

export const createTargetByFileMapping = (): Map<string, TargetByInfo> => {
    const buildFolder = cfg.getBuildFolder();
    const pathf = join(buildFolder, cfg.buildNinjaFileName);
    const rawContents = fs.readFileSync(pathf);
    return fillMappingWithTargetInfo(rawContents.toString());
}

const fillMappingWithTargetInfo = (fileContents: string): Map<string, TargetByInfo> => {
    const buildFolder = cfg.getBuildFolder();
    const relPathByTarget = createTargetFileByTargetMapping(fileContents);
    const fileAndTargetRegExp = new RegExp(/^.*CXX_COMPILER__(\w+)_.+\s+((..)?(?:\/(?:\w|\.|-)+)+).*/, 'gm');

    const targetByFileMapping = [...fileContents.matchAll(fileAndTargetRegExp)].reduce((targetByFileMapping: Map<string, TargetByInfo>, match: RegExpMatchArray) => {
        const target = match[1];
        const path = match[2];
        const relTargetFile = relPathByTarget.get(target);
        if (relTargetFile) {
            const sourceFile = resolve(buildFolder, path)
            const targetFile = resolve(buildFolder, relTargetFile)
            targetByFileMapping.set(sourceFile, { name: target, targetFile: targetFile });
        }
        return targetByFileMapping;
    }, new Map<string, TargetByInfo>());
    logDebug(`Mapped ${targetByFileMapping.size} targets from build manifest.`);
    return targetByFileMapping;
}

const createTargetFileByTargetMapping = (fileContents: string): Map<string, string> => {
    const targetFileRegex = new RegExp(/^build (.*):.*CXX_EXECUTABLE_LINKER__(\w+)_/, 'gm');
    return [...fileContents.matchAll(targetFileRegex)].reduce((targetFileByTarget: Map<string, string>, match: RegExpMatchArray) => {
        const targetFile = match[1];
        const target = match[2];
        targetFileByTarget.set(target, targetFile);
        return targetFileByTarget;
    }, new Map<string, string>());
}