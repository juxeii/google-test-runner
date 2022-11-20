
import * as kill from 'tree-kill'
import * as cp from "child_process"
import { logDebug } from './logger'
import { Observable, SubscriptionObserver } from "observable-fns"

export type ProcessError = {
    processCode: 'Error'
    error: Error
}

export type ProcessExit = {
    processCode: 'Exit'
    code: number
}

export type ProcessExitBySignal = {
    processCode: 'ExitBySignal'
    signal: string
}

export type ProcessStdOut = {
    processCode: 'StdOut'
    signal: string
}

export type ProcessStdErr = {
    processCode: 'StdErr'
    signal: string
}

export type ProcessUpdate = ProcessExit | ProcessExitBySignal | ProcessStdOut | ProcessStdErr

export function foldProcessUpdate<R>(
    onExit: (update: ProcessExit) => R,
    onExitBySignal: (update: ProcessExitBySignal) => R,
    onStdOut: (update: ProcessStdOut) => R,
    onStdErr: (update: ProcessStdErr) => R
) {
    return (update: ProcessUpdate): R => {
        switch (update.processCode) {
            case 'Exit':
                return onExit(update)
            case 'ExitBySignal':
                return onExitBySignal(update)
            case 'StdOut':
                return onStdOut(update)
            case 'StdErr':
                return onStdErr(update)
        }
    }
}

export const startProcess = (cmd: string) =>
    new Observable<ProcessUpdate>(observer => {
        const subscription = startParentProcess(cmd).subscribe({
            next(processUpdate) { handleParentUpdate(processUpdate, observer); observer.next(processUpdate) },
            error(processError: ProcessError) { observer.error(processError.error) },
            complete() { observer.complete() }
        })
        return () => subscription.unsubscribe()
    })

const startParentProcess = (cmd: string) => new Observable<ProcessUpdate>(observer => createSubscriber(cmd, observer))

const createSubscriber = (cmd: string, observer: SubscriptionObserver<any>) => {
    logDebug(`Executing shell command: ${cmd} `)
    const childProcess = cp.spawn(cmd, { shell: true })
    let hasExited = { value: false }
    configureHandlers(childProcess, observer, hasExited)

    return () => onUnsubscribe(childProcess, hasExited)
}

const onUnsubscribe = (childProcess: cp.ChildProcessWithoutNullStreams, hasExited: { value: boolean }) => {
    if (hasExited.value == true) {
        return
    }
    kill(childProcess.pid, 'SIGINT')
    logDebug(`Killed process pid ${childProcess.pid} `)
}

const configureHandlers = (childProcess: cp.ChildProcessWithoutNullStreams, observer: SubscriptionObserver<ProcessUpdate>, hasExited: { value: boolean }) => {
    childProcess.stdout.on('data', (data: string) => {
        const stdOutMsg: ProcessStdOut = { processCode: 'StdOut', signal: data }
        observer.next(stdOutMsg)
    })
    childProcess.stderr.on('error', error => {
        const stdErrMsg: ProcessStdErr = { processCode: 'StdErr', signal: error.message }
        observer.next(stdErrMsg)
    })
    childProcess.on('error', error => {
        hasExited.value = true
        const errorMsg: ProcessError = { processCode: 'Error', error: error }
        observer.error(errorMsg)
    })
    childProcess.on('exit', (code, signal) => {
        hasExited.value = true
        if (code != null) {
            const exitMsg: ProcessExit = { processCode: 'Exit', code: code }
            observer.next(exitMsg)
        }
        else if (signal != null) {
            const exitMsg: ProcessExitBySignal = { processCode: 'ExitBySignal', signal: signal }
            observer.next(exitMsg)
        }
        observer.complete()
    })
}

const handleParentUpdate = (parentUpate: ProcessUpdate, childObserver: SubscriptionObserver<ProcessUpdate>) => {
    const onParentUpdate = foldProcessUpdate(
        (processExit: ProcessExit) => {
            if (processExit.code != 0) {
                childObserver.error(new Error(`Child process failed with code ${processExit.code}`))
            }
        },
        (processExitBySignal: ProcessExitBySignal) => {
            childObserver.error(new Error(`Child process has been stopped by signal ${processExitBySignal.signal}`))
        },
        _ => { },
        _ => { }
    )
    onParentUpdate(parentUpate)
}


export const execShell = (cmd: string) =>
    new Promise<string>((resolve, reject) => {
        cp.exec(cmd, (err, out) => {
            if (err) {
                return reject(err)
            }
            return resolve(out)
        })
    })