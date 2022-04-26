import * as cp from "child_process";
import * as kill from 'tree-kill'
import { logDebug } from './logger';


export interface ProcessHandler {
    onDone?: (code: number) => void;
    onData?: (data: string) => void;
    onError?: (code: number) => void;
    onAbort?: (error?: string) => void;
}
export interface RunTask {
    stop: () => void;
}

export function startProcess(cmd: string, processHandler?: ProcessHandler) {
    logDebug(`Executing shell command: ${cmd}`);
    let childProcess = cp.spawn(cmd, { shell: true, detached: true });
    configureHandlers(childProcess, processHandler);

    return { stop: () => onTaskStop(childProcess, processHandler) };
}

function onTaskStop(childProcess: cp.ChildProcessWithoutNullStreams, processHandler?: ProcessHandler) {
    if (!childProcess.killed) {

        const abortHandler = createAbortHandler(processHandler);
        kill(childProcess.pid, 'SIGINT', abortHandler);
        logDebug(`Killed process id ${childProcess.pid}`);
    }
}

function configureHandlers(childProcess: cp.ChildProcessWithoutNullStreams, processHandler?: ProcessHandler) {
    childOnData(childProcess, processHandler);
    childOnStdError(childProcess, processHandler);
    childOnClose(childProcess, processHandler);
}

function childOnData(childProcess: cp.ChildProcessWithoutNullStreams, processHandler?: ProcessHandler) {
    childProcess.stdout.on('data', data => {
        if (processHandler && processHandler.onData) {
            processHandler.onData(data);
        }
    });
}

function childOnStdError(childProcess: cp.ChildProcessWithoutNullStreams, processHandler?: ProcessHandler) {
    childProcess.stderr.on('data', error => {
        if (processHandler && processHandler.onError) {
            processHandler.onError(error.message);
        }
    });
}

function childOnClose(childProcess: cp.ChildProcessWithoutNullStreams, processHandler?: ProcessHandler) {
    childProcess.on('close', code => {
        //logDebug(`CLOSE with code ${code}`);
        if (code === 0) {
            if (processHandler && processHandler.onDone) {
                processHandler.onDone(0);
            }
        }
        else {
            if (processHandler && processHandler.onError) {
                processHandler.onError(1);
            }
        }
    });
}


function createAbortHandler(processHandler?: ProcessHandler) {
    return (error: Error | undefined) => {
        if (processHandler && processHandler.onAbort) {
            if (error) {
                processHandler.onAbort(error.message);
            }
            else {
                processHandler.onAbort();
            }
        }
    };
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