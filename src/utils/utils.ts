import * as vscode from 'vscode';
import * as path from 'path';
import * as cfg from './configuration';
import fs = require('fs');
import { buildNinjaFile } from '../extension';
import { logDebug } from './logger';
import { resolve } from 'path';

export type TargetByInfo = {
    name: string;
    targetFile: string;
}

export async function createTargetByFileMapping() {
    const buildFolder = cfg.getBuildFolder();
    const pathf = path.join(buildFolder, buildNinjaFile);
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
    const targetFileRegex = new RegExp(/build (.*):.*CXX_EXECUTABLE_LINKER__(\w+)_/, 'g');
    [...fileContents.matchAll(targetFileRegex)].forEach(match => {
        const targetFile = match[1];
        const target = match[2];
        targetFileByTarget.set(target, targetFile);
    });
    return targetFileByTarget;
}

export function lastPathOfDocumentUri(uri: vscode.Uri) {
    return path.basename(uri.path, '.cpp');
}

export function getGTestLogFile(uri: vscode.Uri) {
    const baseName = createGTestLogFileName(uri!);
    const gTestLogFile = createBuildFolderUriForFilName(baseName);
    return { uri: gTestLogFile, baseName: baseName };
}

export function getJSONResultFile(uri: vscode.Uri) {
    const baseName = createJSONFileName(uri!);
    const jsonResultFile = createBuildFolderUriForFilName(baseName);
    return { uri: jsonResultFile, baseName: baseName };
}

function createGTestLogFileName(uri: vscode.Uri) {
    return 'gtestLog_' + lastPathOfDocumentUri(uri);
}

function createJSONFileName(uri: vscode.Uri) {
    return 'test_detail_for_' + lastPathOfDocumentUri(uri);
}

export function createBuildFolderUriForFilName(fileName: string) {
    const buildFolder = cfg.getBuildFolder();
    return vscode.Uri.file(path.join(buildFolder, fileName));
}