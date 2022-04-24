import * as vscode from 'vscode';
import * as path from 'path';
import { TestCase, GTestType, GTestMacro, GTestMacroType } from './types';
import { logger } from './logger';

const gTestTypeByMacroName = new Map<GTestMacroType, GTestType>([
    [GTestMacroType.TEST, GTestType.TEST],
    [GTestMacroType.TEST_F, GTestType.TEST_F],
    [GTestMacroType.TEST_P, GTestType.TEST_P],
    [GTestMacroType.TYPED_TEST, GTestType.TYPED_TEST],
    [GTestMacroType.TYPED_TEST_P, GTestType.TYPED_TEST_P]
]);

export type MacroByTypes = {
    testCases: GTestMacro[];
    parameterSuites: GTestMacro[];
    typedParameterSuites: GTestMacro[];
}

export function discoverTestCasesFromMacros(gTestMacros: GTestMacro[]): TestCase[] {
    logger().debug(`Discovering testcases from gtest macros.`);
    let macroByTypes: MacroByTypes = {
        testCases: [],
        parameterSuites: [],
        typedParameterSuites: [],
    };
    gTestMacros.forEach(item => {
        if (item.type === GTestMacroType.INSTANTIATE_TEST_SUITE_P) {
            logger().debug(`Pushing paramItem with suite name ${item.fixture}`);
            macroByTypes.parameterSuites.push(item);
        }
        else if (item.type === GTestMacroType.INSTANTIATE_TYPED_TEST_SUITE_P) {
            macroByTypes.typedParameterSuites.push(item);
        }
        else {
            macroByTypes.testCases.push(item);
        }
    });

    const testCases = macroByTypes.testCases.filter(macro => {
        if (macro.type === GTestMacroType.TEST_P) {
            return macroByTypes.parameterSuites.find(ps => ps.id === macro.fixture);
        }
        if (macro.type === GTestMacroType.TYPED_TEST_P) {
            return macroByTypes.typedParameterSuites.find(ps => ps.id === macro.fixture);
        }
        return true;
    }).map(macro => {
        return {
            fixture: macro.fixture,
            name: macro.id,
            id: createTestCaseId(macro, macroByTypes),
            lineNo: macro.lineNo,
            gTestType: gTestTypeByMacroName.get(macro.type)!
        }
    });
    testCases.forEach(tc => {
        logger().debug(`Discovered testcase name ${tc.name} fixture ${tc.fixture} id ${tc.id} lineNo ${tc.lineNo} `);
    });
    return testCases;
}

function createTestCaseId(macro: GTestMacro, macroByTypes: MacroByTypes) {
    const fixtureName = macro.fixture;
    const testCaseName = macro.id;
    if (macro.type === GTestMacroType.TEST_P) {
        const paramSuite = macroByTypes.parameterSuites.find(ps => {
            return ps.id === macro.fixture;
        })!;
        return paramSuite.fixture + '/' + fixtureName + '.' + testCaseName + '/*';
    }
    if (macro.type === GTestMacroType.TYPED_TEST) {
        return fixtureName + '/*.' + testCaseName;
    }
    if (macro.type === GTestMacroType.TYPED_TEST_P) {
        const paramTypeSuite = macroByTypes.typedParameterSuites.find(tps => {
            return tps.id === macro.fixture;
        })!;
        return paramTypeSuite.fixture + '/' + fixtureName + '/*.' + testCaseName;
    }
    return fixtureName + '.' + testCaseName;
}