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
    }).flatMap(macro => createTestCases(macro, macroByTypes));
}

function createTestCases(macro: GTestMacro, macroByTypes: MacroByTypes): TestCase[] {
    const fixtureName = macro.fixture;
    const testCaseName = macro.id;
    if (macro.name === 'TEST_P') {
        return macroByTypes.instantiateTestSuiteP
            .filter(ps => ps.id === fixtureName)
            .map(paramSuite => {
                const id = paramSuite.fixture + '/' + fixtureName + '.' + testCaseName + '/*'
                return {
                    fixture: macro.fixture,
                    name: macro.id,
                    id: id,
                    lineNo: macro.lineNo
                }
            })
    }
    if (macro.name === 'TYPED_TEST_P') {
        return macroByTypes.instantiateTypedTestSuite
            .filter(ps => ps.id === fixtureName)
            .map(paramTypeSuite => {
                const id = paramTypeSuite.fixture + '/' + fixtureName + '/*.' + testCaseName
                return {
                    fixture: macro.fixture,
                    name: macro.id,
                    id: id,
                    lineNo: macro.lineNo
                }
            })
    }
    const id = createTestCaseId(macro);
    return [{
        fixture: macro.fixture,
        name: macro.id,
        id: id,
        lineNo: macro.lineNo
    }]
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

function createTestCaseId(macro: GTestMacro) {
    const fixtureName = macro.fixture;
    const testCaseName = macro.id;
    if (macro.name === 'TYPED_TEST') {
        return idForTYPED_TEST(testCaseName, fixtureName);
    }
    return idForTEST(testCaseName, fixtureName);
}

function idForTYPED_TEST(testCaseName: string, fixtureName: string) {
    return fixtureName + '/*.' + testCaseName;
}

function idForTEST(testCaseName: string, fixtureName: string,) {
    return fixtureName + '.' + testCaseName;
}