
import * as kill from 'tree-kill'
import * as cp from "child_process";
import { logDebug } from './logger';
import { Observable, SubscriptionObserver } from "observable-fns"

export type ProcessError = {
    processCode: 'Error';
    error: Error;
}

export type ProcessExit = {
    processCode: 'Exit';
    code: number;
}

export type ProcessExitBySignal = {
    processCode: 'ExitBySignal';
    signal: string;
}

export type ProcessStdOut = {
    processCode: 'StdOut';
    signal: string;
}

export type ProcessStdErr = {
    processCode: 'StdErr';
    signal: string;
}

export type ProcessUpdate = ProcessExit | ProcessExitBySignal | ProcessStdOut | ProcessStdErr;

export function foldProcessUpdate<R>(
    onExit: (update: ProcessExit) => R,
    onExitBySignal: (update: ProcessExitBySignal) => R,
    onStdOut: (update: ProcessStdOut) => R,
    onStdErr: (update: ProcessStdErr) => R
) {
    return (update: ProcessUpdate): R => {
        switch (update.processCode) {
            case 'Exit':
                return onExit(update);
            case 'ExitBySignal':
                return onExitBySignal(update);
            case 'StdOut':
                return onStdOut(update);
            case 'StdErr':
                return onStdErr(update);
        }
    }
}

export function startProcess(cmd: string) {
    return new Observable<ProcessUpdate>(observer => createSubscriber(cmd, observer));
}

function createSubscriber(cmd: string, observer: SubscriptionObserver<any>) {
    logDebug(`Executing shell command: ${cmd} `);
    const childProcess = cp.spawn(cmd, { shell: true });
    let hasExited = { value: false };
    configureHandlers(childProcess, observer, hasExited);

    return () => onUnsubscribe(childProcess, hasExited);
}

function onUnsubscribe(childProcess: cp.ChildProcessWithoutNullStreams, hasExited: { value: boolean }) {
    if (hasExited) {
        return;
    }
    kill(childProcess.pid, 'SIGINT');
    logDebug(`Killed process pid ${childProcess.pid} `);
}

function configureHandlers(childProcess: cp.ChildProcessWithoutNullStreams, observer: SubscriptionObserver<ProcessUpdate>, hasExited: { value: boolean }) {
    childProcess.stdout.on('data', (data: string) => {
        const stdOutMsg: ProcessStdOut = { processCode: 'StdOut', signal: data };
        observer.next(stdOutMsg);
    });
    childProcess.stderr.on('error', error => {
        const stdErrMsg: ProcessStdErr = { processCode: 'StdErr', signal: error.message };
        observer.next(stdErrMsg);
    });
    childProcess.on('error', error => {
        hasExited.value = true;
        const errorMsg: ProcessError = { processCode: 'Error', error: error };
        observer.error(errorMsg);
    });
    childProcess.on('exit', (code, signal) => {
        hasExited.value = true;
        if (code != null) {
            const exitMsg: ProcessExit = { processCode: 'Exit', code: code };
            observer.next(exitMsg);
        }
        else if (signal != null) {
            const exitMsg: ProcessExitBySignal = { processCode: 'ExitBySignal', signal: signal };
            observer.next(exitMsg);
        }
        observer.complete();
    });
}

export function execShell(cmd: string) {
    return new Promise<string>((resolve, reject) => {
        cp.exec(cmd, (err, out) => {
            if (err) {
                return reject(err);
            }
            return resolve(out);
        });
    });
}