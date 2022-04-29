import * as cp from "child_process";
import * as kill from 'tree-kill'
import { logDebug } from './logger';
import { Observable, multicast, SubscriptionObserver } from "observable-fns"

export function startProcess(cmd: string, logStdOut: boolean = false) {
    return multicast(new Observable<number>(observer => createSubscriber(cmd, observer, logStdOut)));
}

function createSubscriber(cmd: string, observer: SubscriptionObserver<any>, logStdOut: boolean) {
    logDebug(`Executing shell command: ${cmd}`);
    const childProcess = cp.spawn(cmd, { shell: true });
    let hasExited = { value: false };
    configureHandlers(childProcess, observer, hasExited, logStdOut);
    return () => onUnsubscribe(childProcess, hasExited)
}

function onUnsubscribe(childProcess: cp.ChildProcessWithoutNullStreams, hasExited: { value: boolean }) {
    if (hasExited) {
        return
    }
    if (!childProcess.killed) {
        kill(childProcess.pid, 'SIGINT');
        logDebug(`Killed process id ${childProcess.pid}`);
    }
}

function configureHandlers(childProcess: cp.ChildProcessWithoutNullStreams, observer: SubscriptionObserver<any>, hasExited: { value: boolean }, logStdOut: boolean) {
    childProcess.stdout.on('data', data => {
        if (logStdOut) {
            logDebug(`${data}`);
        }
    });
    childProcess.stderr.on('error', error => {
        hasExited.value = true;
        observer.error(error);
    });
    childProcess.on('exit', code => {
        if (code === 0) {
            hasExited.value = true;
            observer.next(0);
            observer.complete();
        }
        else {
            observer.error(1);
        }
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