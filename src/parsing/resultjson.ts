import * as vscode from 'vscode'
import { logDebug } from '../utils/logger'
import fs = require('fs')
import { Observable } from 'observable-fns'

export type TestFailure =
    {
        message: string
        lineNo: number
        param: string | undefined
    }

export type TestReport =
    {
        name: string
        fixture: string
        id: string
        line: number
        timestamp: string
        file: string
        hasPassed: boolean
        failures: TestFailure[]
    }

export const createTestReportById = (resultJSONUri: vscode.Uri) =>
    Observable.from(parse(resultJSONUri).testsuites)
        .flatMap((testSuiteJSON: any) => Observable.from(testSuiteJSON.testsuite))
        .map(createTestReport)
        .reduce((testReportById: Map<string, TestReport[]>, testReport: TestReport) => {
            processTestReport(testReport, testReportById)
            return testReportById
        }, new Map<string, TestReport[]>())
        .map((testReportById: Map<string, TestReport[]>) => {
            printTestReportById(testReportById)
            return testReportById
        })

const printTestReportById = (testReportById: Map<string, TestReport[]>) =>
    testReportById.forEach((reports, id) => logDebug(`Testreport with id ${id} passed ${reports[0].hasPassed}`))

const parse = (resultJSONUri: vscode.Uri) => {
    const jsonResultRaw = fs.readFileSync(resultJSONUri.fsPath, { encoding: 'utf8', flag: 'r' })
    return JSON.parse(jsonResultRaw.toString())
}

const processTestReport = (testReport: TestReport, testReportById: Map<string, TestReport[]>) => {
    let currentTestReports = testReportById.get(testReport.id)
    if (!currentTestReports) {
        currentTestReports = []
    }
    currentTestReports.push(testReport)
    testReportById.set(testReport.id, currentTestReports)
}

const createTestReport = (testCaseJSON: any): TestReport => {
    const parameter = parameterOfTestCaseJSON(testCaseJSON)
    const failures = failuresOfTestCaseJSON(testCaseJSON, parameter)
    return {
        name: testCaseJSON.name,
        fixture: testCaseJSON.fixture,
        id: testCaseId(testCaseJSON),
        line: testCaseJSON.line,
        timestamp: testCaseJSON.timestamp,
        file: testCaseJSON.file,
        hasPassed: failures.length === 0,
        failures: failuresOfTestCaseJSON(testCaseJSON, parameter)
    }
}

const parameterOfTestCaseJSON = (testCaseJSON: any) => {
    if (testCaseJSON.value_param) {
        return testCaseJSON.value_param
    }
    else if (testCaseJSON.type_param) {
        return testCaseJSON.type_param
    }
    return undefined
}

const failuresOfTestCaseJSON = (testCaseJSON: any, parameter: any) => {
    if (testCaseJSON.failures) {
        return fillFailures(testCaseJSON.failures, parameter)
    }
    return []
}

const fillFailures = (failuresJSON: Array<any>, paramName: string): TestFailure[] =>
    failuresJSON
        .filter(failureJSON => {
            const lineNoMatch = LINENO_REGEXP.exec(failureJSON.failure)!
            return lineNoMatch ? true : false
        })
        .map(failureJSON => {
            return {
                message: failureJSON.failure,
                lineNo: lineNumberFromFailureMessage(failureJSON.failure),
                param: paramName
            }
        })

const testCaseId = (testcase: any) => {
    const testCaseName: string = testcase.name
    const fixtureName: string = testcase.classname

    if (testcase.type_param) {
        const fixtureNameWildCard = fixtureName.match(/\w+\/(\w+\/)?/)![0]
        return fixtureNameWildCard + "*." + testCaseName
    }
    if (testcase.value_param) {
        const fixtureNameWildCard = fixtureName.match(/\w+\/\w+/)
        const testCaseNameWildCard = testCaseName.match(/\w+\//)
        return fixtureNameWildCard + "." + testCaseNameWildCard + '*'
    }
    return fixtureName + "." + testCaseName
}

const lineNumberFromFailureMessage = (failureMessage: string) => {
    const lineNoMatch = LINENO_REGEXP.exec(failureMessage)!
    return Number(lineNoMatch[1]) - 1
}

const LINENO_REGEXP = /^.+\:(\d+)/