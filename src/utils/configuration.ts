import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { buildNinjaFile } from '../extension';

export const extensionName = 'GoogleTestRunner';

export function getBuildFolder() {
    let config = vscode.workspace.getConfiguration("googletestrunner");
    let buildFolderFromConfig = config.get<string>('buildFolder');
    let workspaceFolder: string = vscode.workspace.workspaceFolders![0].uri.path;
    let re = /\$\{workspaceFolder\}/;
    if (buildFolderFromConfig) {
        return buildFolderFromConfig.replace(re, workspaceFolder);
    }
    return buildFolderFromConfig!;
}

export function hasConfigurationChanged(event: vscode.ConfigurationChangeEvent) {
    return event.affectsConfiguration("googletestrunner.buildFolder");
}

export function isConfigurationValid() {
    return isBuildNinjaFilePresent();
}

function isBuildNinjaFilePresent() {
    let buildNinjaPath = path.join(getBuildFolder(), buildNinjaFile);
    return fs.existsSync(buildNinjaPath);
}
