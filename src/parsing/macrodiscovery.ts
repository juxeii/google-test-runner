import * as vscode from 'vscode'
import { logDebug } from '../utils/logger'

export const discoverGTestMacros = (document: vscode.TextDocument) => {
    logDebug(`Discovering gtest macros in document ${document.uri}`)
    return [...document.getText().matchAll(GTESTMACRO_REGEXP)]
        .map((match: RegExpMatchArray) => macroFromMatch(match, document))
}

export type GTestMacro = {
    name: string
    fixture: string
    id: string
    lineNo: number
}

const macroFromMatch = (match: RegExpMatchArray, document: vscode.TextDocument) => {
    const macro: GTestMacro = {
        name: match[1],
        fixture: match[2],
        id: match[3],
        lineNo: lineNoFromMatch(match, document)
    }
    logDebug(`Macro name ${match[1]} fixture ${macro.fixture} id ${macro.id}`)
    return macro
}

const lineNoFromMatch = (match: RegExpMatchArray, document: vscode.TextDocument) =>
    document.positionAt(match.index!).line + 1

const GTESTMACRO_REGEXP = /^\b(TEST|TEST_F|TEST_P|TYPED_TEST|TYPED_TEST_P|INSTANTIATE_TEST_SUITE_P|INSTANTIATE_TYPED_TEST_SUITE_P)\(\s*(\w+),\s*(\w+)/gm