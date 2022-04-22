import * as vscode from 'vscode';
import * as path from 'path';
import { TargetInfo, TestCase } from './types';
import { logger } from './logger';
import * as cfg from './configuration';
import { targetMappingFileName } from './constants';


export async function createTargetInfoForDocument(document: vscode.TextDocument, testController: vscode.TestController) {
    const buildFolder = cfg.getBuildFolder()
    const targetFileContents = (await contentsOfTargetMappingFile(buildFolder)).toString();

    const target = getTargetForDocument(targetFileContents, document);
    const targetFile = getTargetFileOfTarget(buildFolder, targetFileContents, target);
    logger().debug(`Target for ${document.uri} is ${target} and target file is ${targetFile}.`);

    const targetInfo: TargetInfo = { target: target, targetFile: targetFile };
    return targetInfo;
}

async function contentsOfTargetMappingFile(buildFolder: string) {
    const targetMappingUri = vscode.Uri.file(path.join(buildFolder, targetMappingFileName));
    const text = await vscode.workspace.fs.readFile(targetMappingUri);
    return text;
}

function getTargetForDocument(targetFileContents: string, document: vscode.TextDocument) {
    const baseName = path.parse(document.uri.path).base;
    const targetMatchRegEx = new RegExp("(?<=" + baseName + "\.o: CXX_COMPILER__).*(?=_)", "m");
    const fileMatch = targetMatchRegEx.exec(targetFileContents.toString());
    return fileMatch![0];
}

function getTargetFileOfTarget(buildFolder: string, targetFileContents: string, target: string) {
    const targetMappingFileMatchRegEx = new RegExp("(.+" + target + "): (?:CXX_EXECUTABLE_LINKER__).*(?:" + target + ").*");
    const match = targetMappingFileMatchRegEx.exec(targetFileContents.toString());
    return path.join(buildFolder, match![1]);
}

