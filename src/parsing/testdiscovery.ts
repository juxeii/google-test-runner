import { logDebug } from '../utils/logger';
import { pipe } from 'fp-ts/lib/function';
import { GTestMacro } from './macrodiscovery';

export type TestCase = {
    fixture: string;
    name: string;
    id: string;
    lineNo: number;
}
export interface MacroByTypes {
    testCases: GTestMacro[];
    instantiateTestSuiteP: GTestMacro[];
    instantiateTypedTestSuite: GTestMacro[];
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
        if (macro.name === 'TEST_P') {
            return macroByTypes.instantiateTestSuiteP.find(ps => ps.id === macro.fixture);
        }
        if (macro.name === 'TYPED_TEST_P') {
            return macroByTypes.instantiateTypedTestSuite.find(ps => ps.id === macro.fixture);
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
        if (macro.name === 'INSTANTIATE_TEST_SUITE_P') {
            macroByTypes.instantiateTestSuiteP.push(macro);
        }
        else if (macro.name === 'INSTANTIATE_TYPED_TEST_SUITE_P') {
            macroByTypes.instantiateTypedTestSuite.push(macro);
        }
        else {
            macroByTypes.testCases.push(macro);
        }
        return macroByTypes;
    }, { testCases: [], instantiateTestSuiteP: [], instantiateTypedTestSuite: [] });
}

function createTestCaseId(macro: GTestMacro, macroByTypes: MacroByTypes) {
    const fixtureName = macro.fixture;
    const testCaseName = macro.id;
    if (macro.name === 'TEST_P') {
        return idForTEST_P(testCaseName, fixtureName, macroByTypes);
    }
    if (macro.name === 'TYPED_TEST') {
        return idForTYPED_TEST(testCaseName, fixtureName);
    }
    if (macro.name === 'TYPED_TEST_P') {
        return idForTYPED_TEST_P(testCaseName, fixtureName, macroByTypes);
    }
    return idForTEST(testCaseName, fixtureName);
}

function idForTEST_P(testCaseName: string, fixtureName: string, macroByTypes: MacroByTypes) {
    const paramSuite = macroByTypes.instantiateTestSuiteP.find(ps => {
        return ps.id === fixtureName;
    })!;
    return paramSuite.fixture + '/' + fixtureName + '.' + testCaseName + '/*';
}

function idForTYPED_TEST(testCaseName: string, fixtureName: string) {
    return fixtureName + '/*.' + testCaseName;
}

function idForTYPED_TEST_P(testCaseName: string, fixtureName: string, macroByTypes: MacroByTypes) {
    const paramTypeSuite = macroByTypes.instantiateTypedTestSuite.find(tps => {
        return tps.id === fixtureName;
    })!;
    return paramTypeSuite.fixture + '/' + fixtureName + '/*.' + testCaseName;
}

function idForTEST(testCaseName: string, fixtureName: string,) {
    return fixtureName + '.' + testCaseName;
}