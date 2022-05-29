import * as vscode from 'vscode';
import { logDebug } from '../utils/logger';

export const enum GTestMacroType {
    TEST,
    TEST_F,
    TEST_P,
    TYPED_TEST,
    TYPED_TEST_P,
    INSTANTIATE_TEST_SUITE_P,
    INSTANTIATE_TYPED_TEST_SUITE_P
}

export type GTestMacro = {
    type: GTestMacroType;
    fixture: string;
    id: string;
    lineNo: number;
}

const GTESTMACRO_REGEXP = /^\b(TEST|TEST_F|TEST_P|TYPED_TEST|TYPED_TEST_P|INSTANTIATE_TEST_SUITE_P|INSTANTIATE_TYPED_TEST_SUITE_P)\(\s*(\w+),\s*(\w+)/gm

const gTestMacroTypeByMacroName = new Map([
    ["TEST", GTestMacroType.TEST],
    ["TEST_F", GTestMacroType.TEST_F],
    ["TEST_P", GTestMacroType.TEST_P],
    ["TYPED_TEST", GTestMacroType.TYPED_TEST],
    ["TYPED_TEST_P", GTestMacroType.TYPED_TEST_P],
    ["INSTANTIATE_TEST_SUITE_P", GTestMacroType.INSTANTIATE_TEST_SUITE_P],
    ["INSTANTIATE_TYPED_TEST_SUITE_P", GTestMacroType.INSTANTIATE_TYPED_TEST_SUITE_P]
]);

export const discoverGTestMacros = (document: vscode.TextDocument): GTestMacro[] => {
    logDebug(`Discovering gtest macros in document ${document.uri}`);
    return [...document.getText().matchAll(GTESTMACRO_REGEXP)].reduce((macros: GTestMacro[], match: RegExpMatchArray) => {
        const macroLineNo = lineNoFromMatch(document, match);
        const macro = macroFromMatch(match, macroLineNo);
        macros.push(macro);
        return macros;
    }, []);
}

const lineNoFromMatch = (document: vscode.TextDocument, match: RegExpMatchArray): number => {
    return document.positionAt(match.index!).line + 1;
}

const macroFromMatch = (match: RegExpMatchArray, macroLineNo: number): GTestMacro => {
    const macro: GTestMacro = {
        type: gTestMacroTypeByMacroName.get(match[1])!,
        fixture: match[2],
        id: match[3],
        lineNo: macroLineNo
    };
    logDebug(`Macro name ${match[1]} fixture ${macro.fixture} id ${macro.id}`);
    return macro;
}