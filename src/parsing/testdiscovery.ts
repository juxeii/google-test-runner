import { logDebug } from '../utils/logger';
import { TestCase, GTestType, GTestMacro, GTestMacroType } from '../types';

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

export function discoverTestCasesFromMacros(gTestMacros: GTestMacro[]) {
    logDebug(`Discovering testcases from gtest macros.`);
    let macroByTypes: MacroByTypes = {
        testCases: [],
        parameterSuites: [],
        typedParameterSuites: [],
    };
    gTestMacros.forEach(item => {
        if (item.type === GTestMacroType.INSTANTIATE_TEST_SUITE_P) {
            logDebug(`Pushing paramItem with suite name ${item.fixture}`);
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
        const { id, regExpForId } = createTestCaseId(macro, macroByTypes);
        let testCase: TestCase = {
            fixture: macro.fixture,
            name: macro.id,
            id: id,
            regExpForId: regExpForId,
            lineNo: macro.lineNo,
            gTestType: gTestTypeByMacroName.get(macro.type)!
        }
        return testCase;
    });
    testCases.forEach(tc => {
        logDebug(`Discovered testcase name ${tc.name} fixture ${tc.fixture} id ${tc.id} lineNo ${tc.lineNo} `);
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
        const id = paramSuite.fixture + '/' + fixtureName + '.' + testCaseName + '/*';
        const regExpForId = new RegExp(`${paramSuite.fixture}\/${fixtureName}\.${testCaseName}\/\d+`);
        return { id, regExpForId }
    }
    if (macro.type === GTestMacroType.TYPED_TEST) {
        const id = fixtureName + '/*.' + testCaseName;
        const regExpForId = new RegExp(`${fixtureName}\/\d+\.${testCaseName}`);
        return { id, regExpForId }
    }
    if (macro.type === GTestMacroType.TYPED_TEST_P) {
        const paramTypeSuite = macroByTypes.typedParameterSuites.find(tps => {
            return tps.id === macro.fixture;
        })!;
        const id = paramTypeSuite.fixture + '/' + fixtureName + '/*.' + testCaseName;
        const regExpForId = new RegExp(`${paramTypeSuite.fixture}\/${fixtureName}\/\d+\.${testCaseName}`);
        return { id, regExpForId }
    }

    const id = fixtureName + '.' + testCaseName;
    const regExpForId = new RegExp(`${fixtureName}\.${testCaseName}`);
    return { id, regExpForId };
}