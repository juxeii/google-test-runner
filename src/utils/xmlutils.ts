import * as vscode from 'vscode';
import { logDebug } from './logger';
var fs = require("fs");
var parseString = require('xml2js').parseString;

export function convertXMLToJSON(xmlFile: vscode.Uri) {
    const jsonResultRaw = fs.readFileSync(xmlFile.fsPath, { encoding: 'utf8', flag: 'r' });
    const jsonResult = jsonResultRaw.toString();
    /* logDebug(`XML contents`);
    logDebug(`${jsonResult}`); */

    parseString(jsonResult, function (err: any, result: any) {
        logDebug(`Start parsing`);
        let root = {
            tests: Number(result.testsuites.$.tests),
            failures: Number(result.testsuites.$.failures),
            disabled: Number(result.testsuites.$.disabled),
            errors: Number(result.testsuites.$.errors),
            timestamp: result.testsuites.$.timestamp,
            time: result.testsuites.$.time,
            name: result.testsuites.$.name,
            testsuites: getSuites(result)
        }
        let data = JSON.stringify(root, null, 2);
        fs.writeFileSync(xmlFile.fsPath, data);
    });

    /* const jsonResultRawConv = fs.readFileSync(xmlFile.fsPath, { encoding: 'utf8', flag: 'r' });
    const jsonResultConv = jsonResultRawConv.toString();
    logDebug(`JSON contents`);
    logDebug(`${jsonResultConv}`); */
}


function getTestCase(testcase: any) {
    let struct = {
        name: testcase.$.name,
        file: '',
        line: 0,
        status: (testcase.$.status).toUpperCase(),
        result: '',
        timestamp: '',
        time: testcase.$.time,
        classname: testcase.$.classname
    }
    return struct;
}

function getTestCaseWithFailures(testcase: any) {
    let struct = {
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
    return struct;
}

function getTestCases(testcases: any) {
    var array: any = [];
    testcases.map((testcase: any) => {
        if (testcase.failure) {
            array.push(getTestCaseWithFailures(testcase))
        }
        else {
            array.push(getTestCase(testcase))
        }
    })
    return array;
}

function getTestSuite(testsuite: any) {
    let struct = {
        name: testsuite.$.name,
        tests: Number(testsuite.$.tests),
        failures: Number(testsuite.$.failures),
        disabled: Number(testsuite.$.disabled),
        errors: Number(testsuite.$.errors),
        timestamp: '',
        time: testsuite.$.time,
        testsuite: getTestCases(testsuite.testcase)
    }
    return struct;
}

function getSuites(result: any) {
    var array: any = [];
    result.testsuites.testsuite.map((testsuite: any) => {
        array.push(getTestSuite(testsuite))
    })
    return array;
}

function getFailure(failure: any) {
    let struct = {
        failure: failure.$.message,
        type: ''
    }
    return struct;
}

function getFailures(failures: any) {
    var array: any = [];
    failures.map((failure: any) => {
        array.push(getFailure(failure))
    })
    return array;
}