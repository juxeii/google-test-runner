import * as vscode from 'vscode';
import * as path from 'path';
import * as cfg from './configuration';
import { targetMappingFileContents } from '../extension';
import { logDebug } from './logger';
import { execShell } from './system';

export function getTargetForDocument(targetFileContents: string, uri: vscode.Uri) {
    const baseName = path.parse(uri.path).base;
    const targetMatchRegEx = new RegExp("(?<=" + baseName + "\.o: CXX_COMPILER__).*(?=_)", "m");
    const fileMatch = targetMatchRegEx.exec(targetFileContents.toString());
    return fileMatch![0];
}

export function getTargetFileForDocument(uri: vscode.Uri) {
    const buildFolder = cfg.getBuildFolder();
    const target = getTargetForDocument(targetMappingFileContents, uri);
    const targetMappingFileMatchRegEx = new RegExp("(.+" + target + "): (?:CXX_EXECUTABLE_LINKER__).*(?:" + target + ").*");
    const match = targetMappingFileMatchRegEx.exec(targetMappingFileContents.toString());
    return path.join(buildFolder, match![1]);
}

export function lastPathOfDocumentUri(uri: vscode.Uri) {
    return path.basename(uri.path, '.cpp');
}

export async function loadTargetMappings(targetMappingFileName: string) {
    await createTargetMappingFile(targetMappingFileName);
    const targetMappingUri = createBuildFolderUriForFilName(targetMappingFileName);
    const rawContents = await vscode.workspace.fs.readFile(targetMappingUri);
    const unfilteredText = rawContents.toString()
    const lineFilterRegExp = /(CXX_COMPILER__|CXX_EXECUTABLE_LINKER__)/;
    const targetMappingFileContents = unfilteredText.split('\n').filter(line => line.match(lineFilterRegExp)).join('\n');

    return targetMappingFileContents;
}

async function createTargetMappingFile(targetMappingFileName: string) {
    const buildFolder = cfg.getBuildFolder();
    await execShell(`cd ${buildFolder} && ninja -t targets all > ${targetMappingFileName}`);
    logDebug(`Created target mappings file ${targetMappingFileName}`);
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