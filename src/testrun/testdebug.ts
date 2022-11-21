import * as vscode from 'vscode'
import * as path from 'path'
import { buildTest } from './testbuild'
import { ExtEnvironment, showWarningMessage } from '../extension'
import { logInfo, logDebug, logError, printBlock, logWarning } from '../utils/logger'
import { loadSharedLibsOnDebugForGdb, debuggerProgram } from '../utils/configuration'
const commandExistsSync = require('command-exists').sync

export const startDebug = (env: ExtEnvironment, runRequest: vscode.TestRunRequest) => {
    if (!isDebuggingPossible(runRequest)) {
        return
    }
    buildAndDebug(env, runRequest)
}

const buildAndDebug = (env: ExtEnvironment, runRequest: vscode.TestRunRequest) => {
    const testItem = runRequest.include![0]
    const targetName = env.targetInfoByFile.get(testItem.uri!.fsPath)!.name
    buildTest(targetName, testItem)
        .subscribe({
            next() { logDebug(`Debug build finished.`) },
            error() { logError(`Debug build failed!`) },
            complete() { debug(env, testItem) }
        })
}

const isDebuggingPossible = (runRequest: vscode.TestRunRequest) => {
    if (!runRequest.include || runRequest.include.length > 1) {
        logInfo('Only one testcase at a time is supported for debugging.')
        return false
    }

    const debuggerExec = debuggerProgram()
    if (debuggerExec == 'lldb') {
        if (!commandExistsSync('lldb-mi')) {
            const warnMessage = 'lldb-mi not exist! Make sure you have it installed and sourced in your environemnt. Debug seesion failed!'
            logWarning(warnMessage)
            showWarningMessage(warnMessage)()
            return false
        }
    }
    return true
}

const debug = (env: ExtEnvironment, testItem: vscode.TestItem) => {
    printBlock('Debug session started.')
    const targetFile = env.targetInfoByFile.get(testItem.uri!.fsPath)!.targetFile
    const cwd = path.dirname(targetFile)
    const workspaceFolder = vscode.workspace.workspaceFolders![0]
    const testCaseName = testItem.label
    logInfo(`Debugging testcase ${testCaseName} in executable ${targetFile}.`)

    vscode.debug.onDidTerminateDebugSession((e) => printBlock('Debug session ended.'))
    if (debuggerProgram() == 'lldb') {
        startLLDB(workspaceFolder, targetFile, cwd)
    }
    else {
        startGDB(workspaceFolder, targetFile, cwd)
    }
}

const startGDB = (workspaceFolder: vscode.WorkspaceFolder, targetFile: string, cwd: string) => {
    vscode.debug.startDebugging(workspaceFolder, {
        'name': 'GTestRunner Debug',
        'type': 'cppdbg',
        'request': 'launch',
        'program': targetFile,
        'stopAtEntry': false,
        'cwd': cwd,
        'externalConsole': false,
        "symbolLoadInfo": {
            "loadAll": loadSharedLibsOnDebugForGdb(),
            "exceptionList": ""
        },
    })
}

const startLLDB = (workspaceFolder: vscode.WorkspaceFolder, targetFile: string, cwd: string) => {
    vscode.debug.startDebugging(workspaceFolder, {
        'name': 'GTestRunner Debug',
        'type': 'cppdbg',
        'request': 'launch',
        'program': targetFile,
        'stopAtEntry': false,
        'cwd': cwd,
        'externalConsole': false,
        'MIMode': "lldb",
        'miDebuggerPath': 'lldb-mi',
        '"setupCommands': [
            {
                'text': 'settings set symbols.load-on-demand true'
            }
        ]
    })
}