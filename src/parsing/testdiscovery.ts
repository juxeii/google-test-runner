import { logDebug } from '../utils/logger';
import { pipe } from 'fp-ts/lib/function';
import { TestCase, GTestType, GTestMacro, GTestMacroType } from '../types';

const gTestTypeByMacroName = new Map<GTestMacroType, GTestType>([
    [GTestMacroType.TEST, GTestType.TEST],
    [GTestMacroType.TEST_F, GTestType.TEST_F],
    [GTestMacroType.TEST_P, GTestType.TEST_P],
    [GTestMacroType.TYPED_TEST, GTestType.TYPED_TEST],
    [GTestMacroType.TYPED_TEST_P, GTestType.TYPED_TEST_P]
]);

export interface MacroByTypes {
    testCases: GTestMacro[];
    parameterSuites: GTestMacro[];
    typedParameterSuites: GTestMacro[];
}

export function discoverTestCasesFromMacros(gTestMacros: GTestMacro[]) {
    logDebug(`Discovering testcases from gtest macros.`);
    return pipe(gTestMacros,
        getMacroByTypes,
        getTestCases,
        printTestCases
    )
}

function printTestCases(testCases: TestCase[]) {
    testCases.forEach(tc => {
        logDebug(`Discovered testcase ${tc.name} fixture ${tc.fixture} id ${tc.id} lineNo ${tc.lineNo} `);
    });
    return testCases;
}

function getTestCases(macroByTypes: MacroByTypes) {
    return macroByTypes.testCases.filter(macro => {
        if (macro.type === GTestMacroType.TEST_P) {
            return macroByTypes.parameterSuites.find(ps => ps.id === macro.fixture);
        }
        if (macro.type === GTestMacroType.TYPED_TEST_P) {
            return macroByTypes.typedParameterSuites.find(ps => ps.id === macro.fixture);
        }
        return true;
    }).map(macro => createTestCase(macro, macroByTypes));
}

function createTestCase(macro: GTestMacro, macroByTypes: MacroByTypes): TestCase {
    const { id, regExpForId } = createTestCaseId(macro, macroByTypes);
    return {
        fixture: macro.fixture,
        name: macro.id,
        id: id,
        regExpForId: regExpForId,
        lineNo: macro.lineNo,
        gTestType: gTestTypeByMacroName.get(macro.type)!
    }
}

function getMacroByTypes(gTestMacros: GTestMacro[]) {
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
    return macroByTypes;
}

function createTestCaseId(macro: GTestMacro, macroByTypes: MacroByTypes) {
    if (macro.type === GTestMacroType.TEST_P) {
        return idForTEST_P(macro, macroByTypes);
    }
    if (macro.type === GTestMacroType.TYPED_TEST) {
        return idForTYPED_TEST(macro);
    }
    if (macro.type === GTestMacroType.TYPED_TEST_P) {
        return idForTYPED_TEST_P(macro, macroByTypes);
    }
    return idForTest(macro);
}

function idForTEST_P(macro: GTestMacro, macroByTypes: MacroByTypes) {
    const fixtureName = macro.fixture;
    const testCaseName = macro.id;
    const paramSuite = macroByTypes.parameterSuites.find(ps => {
        return ps.id === macro.fixture;
    })!;
    const id = paramSuite.fixture + '/' + fixtureName + '.' + testCaseName + '/*';
    const regExpForId = new RegExp(`${paramSuite.fixture}\/${fixtureName}\.${testCaseName}\/\d+`);
    return { id, regExpForId }
}

function idForTYPED_TEST(macro: GTestMacro) {
    const fixtureName = macro.fixture;
    const testCaseName = macro.id;
    const id = fixtureName + '/*.' + testCaseName;
    const regExpForId = new RegExp(`${fixtureName}\/\d+\.${testCaseName}`);
    return { id, regExpForId }
}

function idForTYPED_TEST_P(macro: GTestMacro, macroByTypes: MacroByTypes) {
    const fixtureName = macro.fixture;
    const testCaseName = macro.id;
    const paramTypeSuite = macroByTypes.typedParameterSuites.find(tps => {
        return tps.id === macro.fixture;
    })!;
    const id = paramTypeSuite.fixture + '/' + fixtureName + '/*.' + testCaseName;
    const regExpForId = new RegExp(`${paramTypeSuite.fixture}\/${fixtureName}\/\d+\.${testCaseName}`);
    return { id, regExpForId }
}

function idForTest(macro: GTestMacro) {
    const fixtureName = macro.fixture;
    const testCaseName = macro.id;
    const id = fixtureName + '.' + testCaseName;
    const regExpForId = new RegExp(`${fixtureName}\.${testCaseName}`);
    return { id, regExpForId };
}