import * as vscode from 'vscode';
import * as Transport from 'winston-transport';
import { createLogger, format } from "winston";
import winston = require('winston');
const { MESSAGE } = require("triple-beam");

let loggerImpl: winston.Logger | undefined;

export function logger() {
    if (loggerImpl) {
        return loggerImpl;
    }

    let outputChannel = vscode.window.createOutputChannel('GoogleTestRunner');
    loggerImpl = createLogger({
        levels: customizedLogLevels(),
        level: logLevelFromConfig(),
        transports: [new OutputChannelTransport(outputChannel)],
        format: format.combine(
            format.timestamp(),
            format.printf(({ timestamp, level, message }) => {
                return `[${timestamp}] ${level.toUpperCase()}: ${message}`;
            })
        ),
    });
    return loggerImpl;
}

function customizedLogLevels() {
    const customLevels = {
        levels: {
            'debug': 3,
            'info': 2,
            'warn': 1,
            'error': 0,
        }
    };
    return customLevels.levels;
}

export function logLevelFromConfig() {
    let config = vscode.workspace.getConfiguration('googletestrunner');
    return config.get<string>('logLevel')!;
}

export enum LogLevel {
    ERROR = 2,
    WARNING = 1,
    INFO = 0,
    DEBUG = -1,
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

