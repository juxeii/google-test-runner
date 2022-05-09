import * as vscode from 'vscode';
import * as path from 'path';
import * as cfg from './configuration';
import fs = require('fs');

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

export const doesFolderExist = (folder: string): boolean => {
    return fs.existsSync(folder);
}