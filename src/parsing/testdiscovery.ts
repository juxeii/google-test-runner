import { logDebug } from '../utils/logger'
import { pipe } from 'fp-ts/lib/function'
import { GTestMacro } from './macrodiscovery'

export type TestCase = {
    fixture: string
    name: string
    id: string
    lineNo: number
}
export interface MacroByTypes {
    testCases: GTestMacro[]
    instantiateTestSuiteP: GTestMacro[]
    instantiateTypedTestSuite: GTestMacro[]
}

export const discoverTestCasesFromMacros = (gTestMacros: GTestMacro[]) =>
    pipe(
        gTestMacros,
        getMacroByTypes,
        getTestCases,
        testCases => { printTestCases(testCases); return testCases }
    )

const getMacroByTypes = (gTestMacros: GTestMacro[]): MacroByTypes =>
    gTestMacros.reduce((macroByTypes: MacroByTypes, macro: GTestMacro) => {
        if (macro.name === 'INSTANTIATE_TEST_SUITE_P') {
            macroByTypes.instantiateTestSuiteP.push(macro)
        }
        else if (macro.name === 'INSTANTIATE_TYPED_TEST_SUITE_P') {
            macroByTypes.instantiateTypedTestSuite.push(macro)
        }
        else {
            macroByTypes.testCases.push(macro)
        }
        return macroByTypes
    }, { testCases: [], instantiateTestSuiteP: [], instantiateTypedTestSuite: [] })

const getTestCases = (macroByTypes: MacroByTypes) =>
    macroByTypes.testCases.flatMap(macro => createTestCases(macro, macroByTypes))

const createTestCases = (macro: GTestMacro, macroByTypes: MacroByTypes) =>
    createTestCaseIds(macro, macroByTypes)
        .map(id => {
            return {
                fixture: macro.parameters[0],
                name: macro.parameters[1],
                id: id,
                lineNo: macro.lineNo
            }
        })

const createTestCaseIds = (macro: GTestMacro, macroByTypes: MacroByTypes) => {
    const fixtureName = macro.parameters[0]
    const testCaseName = macro.parameters[1]
    if (macro.name === 'TEST_P') {
        return macroByTypes.instantiateTestSuiteP
            .filter(ps => ps.parameters[1] === fixtureName)
            .map(paramSuite => paramSuite.parameters[0] + '/' + fixtureName + '.' + testCaseName + '/*')
    }
    if (macro.name === 'TYPED_TEST_P') {
        return macroByTypes.instantiateTypedTestSuite
            .filter(ps => ps.parameters[1] === fixtureName)
            .map(paramTypeSuite => paramTypeSuite.parameters[0] + '/' + fixtureName + '/*.' + testCaseName)
    }
    if (macro.name === 'TYPED_TEST') {
        return [fixtureName + '/*.' + testCaseName]
    }
    return [fixtureName + '.' + testCaseName]
}

const printTestCases = (testCases: TestCase[]) =>
    testCases.forEach(testCase => logDebug(`Discovered testcase ${testCase.name} fixture ${testCase.fixture} id ${testCase.id} lineNo ${testCase.lineNo}`))
