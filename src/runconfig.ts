import * as vscode from 'vscode';
import * as path from 'path';
import { TargetInfo, TestCase } from './types';
import { logDebug } from './logger';
import * as cfg from './configuration';
import { targetMappingFileName } from './constants';
import { targetMappingFileContents } from './extension';


export async function createTargetInfoForDocument(document: vscode.TextDocument, testController: vscode.TestController) {
    const buildFolder = cfg.getBuildFolder()
    const targetFileContents = (await contentsOfTargetMappingFile(buildFolder)).toString();

    const target = getTargetForDocument(targetFileContents, document.uri);
    const targetFile = getTargetFileForDocument(buildFolder, targetFileContents, document.uri);
    logDebug(`Target for ${document.uri} is ${target} and target file is ${targetFile}.`);

    const targetInfo: TargetInfo = { target: target, targetFile: targetFile };
    return targetInfo;
}

async function contentsOfTargetMappingFile(buildFolder: string) {
    const targetMappingUri = vscode.Uri.file(path.join(buildFolder, targetMappingFileName));
    const text = await vscode.workspace.fs.readFile(targetMappingUri);
    return text;
}

export function getTargetForDocument(targetFileContents: string, uri: vscode.Uri) {
    const baseName = path.parse(uri.path).base;
    const targetMatchRegEx = new RegExp("(?<=" + baseName + "\.o: CXX_COMPILER__).*(?=_)", "m");
    const fileMatch = targetMatchRegEx.exec(targetFileContents.toString());
    return fileMatch![0];
}

export function getTargetFileForDocument(buildFolder: string, targetFileContents: string, uri: vscode.Uri) {
    const target = getTargetForDocument(targetFileContents, uri);
    const targetMappingFileMatchRegEx = new RegExp("(.+" + target + "): (?:CXX_EXECUTABLE_LINKER__).*(?:" + target + ").*");
    const match = targetMappingFileMatchRegEx.exec(targetFileContents.toString());
    return path.join(buildFolder, match![1]);
}

export function getTargetFileForUri(uri: vscode.Uri) {
    const buildFolder = cfg.getBuildFolder();
    const target = getTargetForDocument(targetMappingFileContents, uri);
    const targetMappingFileMatchRegEx = new RegExp("(.+" + target + "): (?:CXX_EXECUTABLE_LINKER__).*(?:" + target + ").*");
    const match = targetMappingFileMatchRegEx.exec(targetMappingFileContents.toString());
    return path.join(buildFolder, match![1]);
}

