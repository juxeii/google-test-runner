import * as vscode from 'vscode'
import { logDebug } from '../utils/logger'

export const discoverGTestMacros = (document: vscode.TextDocument) => {
    logDebug(`Discovering gtest macros in document ${document.uri}`)
    return [...document.getText().matchAll(GTESTMACRO_REGEXP)]
        .map((match: RegExpMatchArray) => {
            const macro = macroFromMatch(match, document)
            logDebug(`Macro name ${macro.name} lineNo ${macro.lineNo} parameters ${macro.parameters}`)
            return macro
        })
}

export type GTestMacro = {
    lineNo: number
    name: string
    parameters: string[]
}

const macroFromMatch = (match: RegExpMatchArray, document: vscode.TextDocument) => {
    return {
        lineNo: lineNoFromMatch(match, document),
        name: match[1],
        parameters: match[2].split(',').map(element => element.trim())
    }
}

const lineNoFromMatch = (match: RegExpMatchArray, document: vscode.TextDocument) =>
    document.positionAt(match.index!).line + 1

const GTESTMACRO_REGEXP = /^\b(TEST|TEST_F|TEST_P|TYPED_TEST|TYPED_TEST_P|INSTANTIATE_TEST_SUITE_P|INSTANTIATE_TYPED_TEST_SUITE_P)\( *([^)]+?) *\)/gm