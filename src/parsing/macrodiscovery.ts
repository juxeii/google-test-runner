import * as vscode from 'vscode';
import { logDebug } from '../utils/logger';
import { GTestMacro, GTestMacroType } from '../types';

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

export function discoverGTestMacros(document: vscode.TextDocument) {
    logDebug(`Discovering gtest macros in document ${document.uri}`);
    const documentText = document.getText();
    let gTestMacros: GTestMacro[] = [];

    [...documentText.matchAll(GTESTMACRO_REGEXP)].forEach(match => {
        const macro = macroFromMatch(match, document);
        gTestMacros.push(macro);
    });
    return gTestMacros;
}

function macroFromMatch(match: RegExpMatchArray, document: vscode.TextDocument) {
    const matchPosition = document.positionAt(match.index!);
    const macro: GTestMacro = {
        type: gTestMacroTypeByMacroName.get(match[1])!,
        fixture: match[2],
        id: match[3],
        lineNo: matchPosition.line + 1
    };
    logDebug(`Macro name ${match[1]} fixture ${macro.fixture} id ${macro.id}`);
    return macro;
}