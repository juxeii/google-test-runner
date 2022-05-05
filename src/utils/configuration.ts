import path = require('path');
import * as vscode from 'vscode';
import * as fs from 'fs';

export const buildNinjaFileName = 'build.ninja';
export const extensionName = 'GoogleTestRunner';
const configurationId = 'googletestrunner';

export function getBuildFolder() {
    const buildFolderFromConfig = getConfigurationSetting<string>('buildFolder');
    const workspaceFolder: string = vscode.workspace.workspaceFolders![0].uri.path;
    const regExpFolder = /\$\{workspaceFolder\}/;
    if (buildFolderFromConfig) {
        return buildFolderFromConfig.replace(regExpFolder, workspaceFolder);
    }
    return buildFolderFromConfig!;
}

export function hasBuildFolderChanged(event: vscode.ConfigurationChangeEvent) {
    return event.affectsConfiguration(configurationId + '.buildFolder');
}

export function logLevel() {
    return getConfigurationSetting<string>('logLevel')!;
}

export function gtestVerbosityLevel() {
    return getConfigurationSetting<string>('gtestVerbosityLevel')!;
}

export function loadSharedLibsOnDebug() {
    return getConfigurationSetting<boolean>('loadSharedLibsOnDebug')!;
}

export const isBuildNinjaFilePresent = (): boolean => {
    const buildNinjaPath = path.join(getBuildFolder(), buildNinjaFileName);
    return fs.existsSync(buildNinjaPath);
}

function getConfiguration() {
    return vscode.workspace.getConfiguration(configurationId);
}

function getConfigurationSetting<T>(setting: string) {
    return getConfiguration().get<T>(setting)!;
}