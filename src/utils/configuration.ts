import path = require('path')
import * as vscode from 'vscode'
import * as fs from 'fs'

export const buildNinjaFileName = 'build.ninja'
export const extensionName = 'GoogleTestRunner'
const configurationId = 'googletestrunner'

export const getBuildFolder = () => {
    const buildFolderFromConfig = getConfigurationSetting<string>('buildFolder')
    const workspaceFolder: string = vscode.workspace.workspaceFolders![0].uri.path
    const regExpFolder = /\$\{workspaceFolder\}/
    if (buildFolderFromConfig) {
        return buildFolderFromConfig.replace(regExpFolder, workspaceFolder)
    }
    return buildFolderFromConfig!
}

export const hasBuildFolderChanged = (event: vscode.ConfigurationChangeEvent) =>
    event.affectsConfiguration(configurationId + '.buildFolder')

export const logLevel = () => getConfigurationSetting<string>('logLevel')!

export const gtestVerbosityLevel = () => getConfigurationSetting<string>('gtestVerbosityLevel')!

export const loadSharedLibsOnDebugForGdb = () => getConfigurationSetting<boolean>('loadSharedLibsOnDebug')!

export const legacySupport = () => getConfigurationSetting<boolean>('legacySupport')!

export const debuggerProgram = () => getConfigurationSetting<string>('debugger')!

export const envFile = () => getConfigurationSetting<string>('envFile')!

export const env = () => getConfigurationSetting<any>('env')!

export const buildNinjaPath = () => path.join(getBuildFolder(), buildNinjaFileName)

export const isBuildNinjaFilePresent = () => fs.existsSync(buildNinjaPath())

const getConfiguration = () => vscode.workspace.getConfiguration(configurationId)

function getConfigurationSetting<T>(setting: string) {
    return getConfiguration().get<T>(setting)!
}
