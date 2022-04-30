import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { buildNinjaFile } from '../extension';

export const extensionName = 'GoogleTestRunner';
const configurationId = 'googletestrunner';

export function getBuildFolder() {
    const buildFolderFromConfig = getConfigurationSetting('buildFolder');
    const workspaceFolder: string = vscode.workspace.workspaceFolders![0].uri.path;
    const regExpFolder = /\$\{workspaceFolder\}/;
    if (buildFolderFromConfig) {
        return buildFolderFromConfig.replace(regExpFolder, workspaceFolder);
    }
    return buildFolderFromConfig!;
}

export function hasConfigurationChanged(event: vscode.ConfigurationChangeEvent) {
    return event.affectsConfiguration(configurationId + '.buildFolder');
}

export function isConfigurationValid() {
    return isBuildNinjaFilePresent();
}

export function logLevel() {
    return getConfigurationSetting('logLevel')!;
}

export function gtestVerbosityLevel() {
    return getConfigurationSetting('gtestVerbosityLevel')!;
}

function isBuildNinjaFilePresent() {
    let buildNinjaPath = path.join(getBuildFolder(), buildNinjaFile);
    return fs.existsSync(buildNinjaPath);
}

function getConfiguration() {
    return vscode.workspace.getConfiguration(configurationId);
}

function getConfigurationSetting(setting: string) {
    return getConfiguration().get<string>(setting)!;
}