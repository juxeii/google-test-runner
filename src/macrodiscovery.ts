import * as vscode from 'vscode';
import { logDebug } from './logger';
import { GTestMacro, GTestMacroType } from './types';

const GTESTMACRO_REGEXP = /^\b(TEST|TEST_F|TEST_P|TYPED_TEST|TYPED_TEST_P|INSTANTIATE_TEST_SUITE_P|INSTANTIATE_TYPED_TEST_SUITE_P)\(\s*(\w+),\s*(\w+)/gm

const gTestMacroTypeByMacroName = new Map<string, GTestMacroType>([
    ["TEST", GTestMacroType.TEST],
    ["TEST_F", GTestMacroType.TEST_F],
    ["TEST_P", GTestMacroType.TEST_P],
    ["TYPED_TEST", GTestMacroType.TYPED_TEST],
    ["TYPED_TEST_P", GTestMacroType.TYPED_TEST_P],
    ["INSTANTIATE_TEST_SUITE_P", GTestMacroType.INSTANTIATE_TEST_SUITE_P],
    ["INSTANTIATE_TYPED_TEST_SUITE_P", GTestMacroType.INSTANTIATE_TYPED_TEST_SUITE_P]
]);

export async function discoverGTestMacros(document: vscode.TextDocument) {
    logDebug(`Discovering gtest macros in document ${document.uri}`);
    return discoverMacrosInDocument(document);
}

function discoverMacrosInDocument(document: vscode.TextDocument) {
    const documentText = document.getText();
    let gTestMacros: GTestMacro[] = [];

    let match;
    while (match = GTESTMACRO_REGEXP.exec(documentText)) {
        const macro = macroFromMatch(match, document);
        gTestMacros.push(macro);
    }
    return gTestMacros;
}

function macroFromMatch(match: RegExpExecArray, document: vscode.TextDocument) {
    const matchPosition = document.positionAt(match.index);
    let macro: GTestMacro = {
        type: gTestMacroTypeByMacroName.get(match[1])!,
        fixture: match[2],
        id: match[3],
        lineNo: matchPosition.line + 1
    };
    logDebug(`Macro name ${match[1]} fixture ${macro.fixture} id ${macro.id}`);
    return macro;
}