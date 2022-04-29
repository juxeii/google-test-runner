import * as vscode from 'vscode';
import * as path from 'path';
import * as cfg from './configuration';
import fs = require('fs');
import { buildNinjaFile } from '../extension';

export type TargetByInfo = {
    name: string;
    targetFile: string;
}

export async function createTargetByFileMapping() {
    const buildFolder = cfg.getBuildFolder();
    let pathf = path.join(buildFolder, buildNinjaFile);
    const rawContents = fs.readFileSync(pathf);
    return fillMappingWithTargetInfo(rawContents.toString());
}

function fillMappingWithTargetInfo(fileContents: string) {
    let relPathByTarget = createTargetFileByTargetMapping(fileContents);
    let targetByFileMapping = new Map<string, TargetByInfo>();
    const fileAndTargetRegExp = new RegExp(/.*CXX_COMPILER__(\w+)_.+?((?:\/(?:\w|\.|-)+)+).*/, 'g');
    let match;
    while (match = fileAndTargetRegExp.exec(fileContents)) {
        const absPath = match[2];
        const target = match[1];
        const targetFile = relPathByTarget.get(target);
        if (targetFile) {
            targetByFileMapping.set(absPath, { name: target, targetFile: targetFile });
        }
    }
    return targetByFileMapping;
}

function createTargetFileByTargetMapping(fileContents: string) {
    let targetFileByTarget = new Map<string, string>();
    const targetFileRegex = new RegExp(/build (.*):.*CXX_EXECUTABLE_LINKER__(\w+)_/, 'g');
    let match;
    while (match = targetFileRegex.exec(fileContents)) {
        const targetFile = match[1];
        const target = match[2];
        targetFileByTarget.set(target, targetFile);
    }
    return targetFileByTarget;
}

export function lastPathOfDocumentUri(uri: vscode.Uri) {
    return path.basename(uri.path, '.cpp');
}

export function getGTestLogFile(uri: vscode.Uri) {
    const baseName = 'gtestLog_' + lastPathOfDocumentUri(uri!);
    const gTestLogFile = createBuildFolderUriForFilName(baseName);
    return { uri: gTestLogFile, baseName: baseName };
}

export function getJSONResultFile(uri: vscode.Uri) {
    const baseName = 'test_detail_for_' + lastPathOfDocumentUri(uri!);
    const jsonResultFile = createBuildFolderUriForFilName(baseName);
    return { uri: jsonResultFile, baseName: baseName };
}

export function createBuildFolderUriForFilName(fileName: string) {
    const buildFolder = cfg.getBuildFolder();
    return vscode.Uri.file(path.join(buildFolder, fileName));
}