import * as vscode from 'vscode';
import { logDebug } from '../utils/logger';

export const discoverGTestMacros = (document: vscode.TextDocument) => {
    logDebug(`Discovering gtest macros in document ${document.uri}`);
    return [...document.getText().matchAll(GTESTMACRO_REGEXP)]
        .map((match: RegExpMatchArray) => macroFromMatch(match, document));
}

export type GTestMacro = {
    type: GTestMacroType;
    fixture: string;
    id: string;
    lineNo: number;
}

export const enum GTestMacroType {
    TEST,
    TEST_F,
    TEST_P,
    TYPED_TEST,
    TYPED_TEST_P,
    INSTANTIATE_TEST_SUITE_P,
    INSTANTIATE_TYPED_TEST_SUITE_P
}

const gTestMacroTypeByMacroName = new Map([
    ["TEST", GTestMacroType.TEST],
    ["TEST_F", GTestMacroType.TEST_F],
    ["TEST_P", GTestMacroType.TEST_P],
    ["TYPED_TEST", GTestMacroType.TYPED_TEST],
    ["TYPED_TEST_P", GTestMacroType.TYPED_TEST_P],
    ["INSTANTIATE_TEST_SUITE_P", GTestMacroType.INSTANTIATE_TEST_SUITE_P],
    ["INSTANTIATE_TYPED_TEST_SUITE_P", GTestMacroType.INSTANTIATE_TYPED_TEST_SUITE_P]
]);

const macroFromMatch = (match: RegExpMatchArray, document: vscode.TextDocument) => {
    const macro: GTestMacro = {
        type: gTestMacroTypeByMacroName.get(match[1])!,
        fixture: match[2],
        id: match[3],
        lineNo: lineNoFromMatch(match, document)
    };
    logDebug(`Macro name ${match[1]} fixture ${macro.fixture} id ${macro.id}`);
    return macro;
}

const lineNoFromMatch = (match: RegExpMatchArray, document: vscode.TextDocument) => {
    return document.positionAt(match.index!).line + 1;
}

const GTESTMACRO_REGEXP = /^\b(TEST|TEST_F|TEST_P|TYPED_TEST|TYPED_TEST_P|INSTANTIATE_TEST_SUITE_P|INSTANTIATE_TYPED_TEST_SUITE_P)\(\s*(\w+),\s*(\w+)/gm