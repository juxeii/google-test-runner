import * as vscode from 'vscode';
import * as cp from "child_process";

export async function spawnShell(cmd: string, onDone: (code: number) => any, logFn: (line: string) => any) {
    const ls = cp.spawn(cmd, { shell: true });
    ls.stdout.setEncoding('utf8');
    ls.unref();
    ls.stdout.on('data', logFn);
    ls.stderr.on('data', logFn);
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

export function runInTerminal(cmd: string) {
    const terminalName = "GoogleTestRunner";
    const existingTerminal = vscode.window.terminals.find(terminal => terminal.name === terminalName);
    const terminal = existingTerminal ? existingTerminal : vscode.window.createTerminal(terminalName);
    terminal.show();
    terminal.sendText(`${cmd}`);
    terminal.state
}