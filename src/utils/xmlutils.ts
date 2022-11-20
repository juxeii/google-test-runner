import * as vscode from 'vscode'
import { logDebug } from './logger'
var fs = require("fs")
var parseString = require('xml2js').parseString

export const convertXMLToJSON = (xmlFile: vscode.Uri) => {
    const jsonResultRaw = fs.readFileSync(xmlFile.fsPath, { encoding: 'utf8', flag: 'r' })
    const jsonResult = jsonResultRaw.toString()
    /* logDebug(`XML contents`)
    logDebug(`${jsonResult}`) */

    parseString(jsonResult, function (err: any, result: any) {
        logDebug(`Start parsing`)
        const root = {
            tests: Number(result.testsuites.$.tests),
            failures: Number(result.testsuites.$.failures),
            disabled: Number(result.testsuites.$.disabled),
            errors: Number(result.testsuites.$.errors),
            timestamp: result.testsuites.$.timestamp,
            time: result.testsuites.$.time,
            name: result.testsuites.$.name,
            testsuites: getSuites(result)
        }
        let data = JSON.stringify(root, null, 2)
        fs.writeFileSync(xmlFile.fsPath, data)
    })

    /* const jsonResultRawConv = fs.readFileSync(xmlFile.fsPath, { encoding: 'utf8', flag: 'r' })
    const jsonResultConv = jsonResultRawConv.toString()
    logDebug(`JSON contents`)
    logDebug(`${jsonResultConv}`) */
}


const getTestCase = (testcase: any) => {
    const struct = {
        name: testcase.$.name,
        file: '',
        line: 0,
        status: (testcase.$.status).toUpperCase(),
        result: '',
        timestamp: '',
        time: testcase.$.time,
        classname: testcase.$.classname
    }
    return struct
}

const getTestCaseWithFailures = (testcase: any) => {
    const struct = {
        name: testcase.$.name,
        file: '',
        line: 0,
        status: (testcase.$.status).toUpperCase(),
        result: '',
        timestamp: '',
        time: testcase.$.time,
        classname: testcase.$.classname,
        failures: getFailures(testcase.failure)
    }
    return struct
}

const getTestCases = (testcases: any) =>
    testcases.map((testcase: any) => {
        if (testcase.failure) {
            return getTestCaseWithFailures(testcase)
        }
        return getTestCase(testcase)
    })

const getTestSuite = (testsuite: any) => {
    const struct = {
        name: testsuite.$.name,
        tests: Number(testsuite.$.tests),
        failures: Number(testsuite.$.failures),
        disabled: Number(testsuite.$.disabled),
        errors: Number(testsuite.$.errors),
        timestamp: '',
        time: testsuite.$.time,
        testsuite: getTestCases(testsuite.testcase)
    }
    return struct
}

const getSuites = (result: any) => result.testsuites.testsuite.map(getTestSuite)

const getFailure = (failure: any) => {
    const struct = {
        failure: failure.$.message,
        type: ''
    }
    return struct
}

const getFailures = (failures: any) => failures.map(getFailure)