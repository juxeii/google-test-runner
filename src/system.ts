import * as cp from "child_process";
import { logDebug } from './logger';

export async function spawnShell(cmd: string, onDone: (code: number) => any, onError: (line: string) => any, logFn?: (line: string) => any) {
    logDebug(`Executing shell command: ${cmd}`);
    const ls = cp.spawn(cmd, { shell: true });
    ls.stdout.on('data', data => {
        if (logFn) {
            logFn(data);
        }
        logDebug(`${data}`);
    });
    ls.stderr.on('data', onError);
    ls.on('close', onDone);
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