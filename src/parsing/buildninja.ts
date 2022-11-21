import fs = require('fs');
import { resolve } from 'path';
import { logDebug } from '../utils/logger';
import * as cfg from '../utils/configuration';

export type TargetByInfo = {
    name: string
    targetFile: string
}

export const createTargetByFileMapping = () => {
    const rawContents = fs.readFileSync(cfg.buildNinjaPath())
    return fillMappingWithTargetInfo(rawContents.toString())
}

const fillMappingWithTargetInfo = (fileContents: string) => {
    const buildFolder = cfg.getBuildFolder()
    const relPathByTarget = createTargetFileByTargetMapping(fileContents)

    const targetByFileMapping = [...fileContents.matchAll(FILEANDTARGET_REGEXP)]
        .reduce((targetByFileMapping, match) => {
            const target = match[1]
            const path = match[2]
            const relTargetFile = relPathByTarget.get(target)
            if (relTargetFile) {
                const sourceFile = resolve(buildFolder, path)
                const targetFile = resolve(buildFolder, relTargetFile)
                targetByFileMapping.set(sourceFile, { name: target, targetFile: targetFile })
            }
            return targetByFileMapping
        }, new Map<string, TargetByInfo>())
    logDebug(`Mapped ${targetByFileMapping.size} targets from build manifest.`)
    return targetByFileMapping
}

const createTargetFileByTargetMapping = (fileContents: string) =>
    [...fileContents.matchAll(TARGETFILE_REGEXP)]
        .reduce((targetFileByTarget, match) => {
            const targetFile = match[1]
            const target = match[2]
            targetFileByTarget.set(target, targetFile)
            return targetFileByTarget
        }, new Map<string, string>())

const FILEANDTARGET_REGEXP = /^.*CXX_COMPILER__(\w+)_.+\s+((..)?(?:\/(?:\w|\.|-)+)+).*/gm
const TARGETFILE_REGEXP = /^build (.*):.*CXX_EXECUTABLE_LINKER__(\w+)_/gm