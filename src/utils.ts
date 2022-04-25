import * as vscode from 'vscode';
import * as path from 'path';
import * as cfg from './configuration';
import { targetMappingFileContents } from './extension';

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
