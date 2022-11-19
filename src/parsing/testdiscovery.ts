import { logDebug } from '../utils/logger';
import { pipe } from 'fp-ts/lib/function';
import { GTestMacro, GTestMacroType } from './macrodiscovery';

export type TestCase = {
    fixture: string;
    name: string;
    id: string;
    lineNo: number;
}
export interface MacroByTypes {
    testCases: GTestMacro[];
    parameterSuites: GTestMacro[];
    typedParameterSuites: GTestMacro[];
}

export function discoverTestCasesFromMacros(gTestMacros: GTestMacro[]) {
    return pipe(
        gTestMacros,
        getMacroByTypes,
        getTestCases,
        testCases => { printTestCases(testCases); return testCases; }
    )
}

function printTestCases(testCases: TestCase[]) {
    testCases.forEach(tc => {
        logDebug(`Discovered testcase ${tc.name} fixture ${tc.fixture} id ${tc.id} lineNo ${tc.lineNo}`);
    });
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
    const id = createTestCaseId(macro, macroByTypes);
    return {
        fixture: macro.fixture,
        name: macro.id,
        id: id,
        lineNo: macro.lineNo
    }
}

const getMacroByTypes = (gTestMacros: GTestMacro[]): MacroByTypes => {
    return gTestMacros.reduce((macroByTypes: MacroByTypes, macro: GTestMacro) => {
        if (macro.type === GTestMacroType.INSTANTIATE_TEST_SUITE_P) {
            macroByTypes.parameterSuites.push(macro);
        }
        else if (macro.type === GTestMacroType.INSTANTIATE_TYPED_TEST_SUITE_P) {
            macroByTypes.typedParameterSuites.push(macro);
        }
        else {
            macroByTypes.testCases.push(macro);
        }
        return macroByTypes;
    }, { testCases: [], parameterSuites: [], typedParameterSuites: [] });
}

function createTestCaseId(macro: GTestMacro, macroByTypes: MacroByTypes) {
    const fixtureName = macro.fixture;
    const testCaseName = macro.id;
    if (macro.type === GTestMacroType.TEST_P) {
        return idForTEST_P(testCaseName, fixtureName, macroByTypes);
    }
    if (macro.type === GTestMacroType.TYPED_TEST) {
        return idForTYPED_TEST(testCaseName, fixtureName);
    }
    if (macro.type === GTestMacroType.TYPED_TEST_P) {
        return idForTYPED_TEST_P(testCaseName, fixtureName, macroByTypes);
    }
    return idForTEST(testCaseName, fixtureName);
}

function idForTEST_P(testCaseName: string, fixtureName: string, macroByTypes: MacroByTypes) {
    const paramSuite = macroByTypes.parameterSuites.find(ps => {
        return ps.id === fixtureName;
    })!;
    return paramSuite.fixture + '/' + fixtureName + '.' + testCaseName + '/*';
}

function idForTYPED_TEST(testCaseName: string, fixtureName: string,) {
    return fixtureName + '/*.' + testCaseName;
}

function idForTYPED_TEST_P(testCaseName: string, fixtureName: string, macroByTypes: MacroByTypes) {
    const paramTypeSuite = macroByTypes.typedParameterSuites.find(tps => {
        return tps.id === fixtureName;
    })!;
    return paramTypeSuite.fixture + '/' + fixtureName + '/*.' + testCaseName;
}

function idForTEST(testCaseName: string, fixtureName: string,) {
    return fixtureName + '.' + testCaseName;
}