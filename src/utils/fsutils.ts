import * as vscode from 'vscode'
import * as path from 'path'
import * as cfg from './configuration'
import fs = require('fs')

export const lastPathOfDocumentUri = (uri: vscode.Uri) => path.basename(uri.path)

export const getGTestLogFile = (uri: vscode.Uri) => {
    const baseName = createGTestLogFileName(uri!)
    const gTestLogFile = createBuildFolderUriForFilName(baseName)
    return { uri: gTestLogFile, baseName: baseName }
}

export const getJSONResultFile = (uri: vscode.Uri) => {
    const baseName = createJSONFileName(uri!)
    const jsonResultFile = createBuildFolderUriForFilName(baseName)
    return { uri: jsonResultFile, baseName: baseName }
}

const createGTestLogFileName = (uri: vscode.Uri) => 'gtestLog_' + lastPathOfDocumentUri(uri)

const createJSONFileName = (uri: vscode.Uri) => 'test_detail_for_' + lastPathOfDocumentUri(uri)

export const createBuildFolderUriForFilName = (fileName: string) => {
    const buildFolder = cfg.getBuildFolder()
    return vscode.Uri.file(path.join(buildFolder, fileName))
}

export const doesPathExist = (file: string) => fs.existsSync(file)

export const getFileContents = (file: string) => fs.readFileSync(file).toString()