import * as vscode from 'vscode';
import winston = require('winston');
import * as Transport from 'winston-transport';
import { createLogger, format } from "winston";
import { logLevel } from './configuration';
const { MESSAGE } = require("triple-beam");

export function logInfo(message: string) {
    loggerImpl.info(message);
}

export function logDebug(message: string) {
    loggerImpl.debug(message);
}

export function logError(message: string) {
    loggerImpl.error(message);
}
class OutputChannelTransport extends Transport {
    outputChannel: vscode.OutputChannel;

    constructor(outputChannel: vscode.OutputChannel) {
        super();
        this.outputChannel = outputChannel;
    }

    log(info: any, cb: () => void) {
        setImmediate(() => {
            this.emit('logged', info);
        });
        this.outputChannel.appendLine(info[MESSAGE]);
        if (cb) {
            cb();
        }
    }

    close() {
        if (this.outputChannel === undefined) {
            return;
        }

        this.outputChannel.dispose();
    }
};

let outputChannel = vscode.window.createOutputChannel('GoogleTestRunner');

let loggerImpl: winston.Logger = createLogger({
    levels: customizedLogLevels(),
    level: logLevel(),
    transports: [new OutputChannelTransport(outputChannel)],
    format: format.combine(
        format.timestamp({ format: ()=>  new Date().toLocaleString('en-US', { hour12: false })}),
        format.printf(({ timestamp, level, message }) => `[${timestamp}] ${level.toUpperCase()}: ${message}`)
    ),
});

function customizedLogLevels() {
    return {
        levels: {
            'debug': 2,
            'info': 1,
            'error': 0,
        }
    }.levels;
}