import * as vscode from 'vscode';
import * as R from 'fp-ts/Reader';
import * as cfg from './utils/configuration';
import { logDebug, logError, logInfo } from './utils/logger';
import { doesFolderExist } from './utils/utils';
import { TargetByInfo, createTargetByFileMapping } from './parsing/buildninja';
import { pipe } from 'fp-ts/lib/function';
import { initTestRun } from './testrun/testrun';
import { BuildNinjaUpdate, observeBuildFolderChange, observeBuildNinja } from './listener';
import { createDocumentActor } from './documentactor';
import { IO } from 'fp-ts/lib/IO';
import { ActorRef, AnyEventObject, assign, createMachine, interpret, Receiver, send, Sender, spawn } from 'xstate';

export type ExtEnvironment = {
    context: vscode.ExtensionContext;
    testController: vscode.TestController;
    targetInfoByFile: Map<string, TargetByInfo>;
}
interface GTestContext {
    environment: ExtEnvironment,
    buildFolderObserver?: ActorRef<any, any>;
    buildNinjaObserver?: ActorRef<any, any>;
    documentActor?: ActorRef<any, any>;
}

const getMachine = () => createMachine({
    //const createGTestMachine = (environment: ExtEnvironment) => createMachine({
    tsTypes: {} as import("./extension.typegen").Typegen0,
    schema: {
        context: {} as GTestContext,
        events: {} as
            | { type: 'VALID_BUILD_FOLDER' }
            | { type: 'INVALID_BUILD_FOLDER' }
            | { type: 'BUILD_NINJA_CREATED' }
            | { type: 'BUILD_NINJA_DELETED' }
            | { type: 'BUILD_NINJA_CHANGED' }
    },
    id: "gtestrunnerfsm",
    initial: "start",
    states: {
        start: {
            entry: ['onStart', 'initBuildFolderObserver', 'initDocumentActor'],
            on: {
                VALID_BUILD_FOLDER: "validbuildfolder",
                INVALID_BUILD_FOLDER: "nobuildfolder"
            },
        },
        nobuildfolder: {
            entry: ['onInvalidBuildFolder', 'sendInvalidBuildFolderToBuildNinjaObserver', 'sendDocumentResync'],
            on: {
                VALID_BUILD_FOLDER: "validbuildfolder"
            },
        },
        validbuildfolder: {
            entry: ['onValidBuildFolder', 'initBuildNinjaObserver'],
            on: {
                INVALID_BUILD_FOLDER: "nobuildfolder",
                BUILD_NINJA_CREATED: "buildPresent",
                BUILD_NINJA_DELETED: "buildAbsent"
            }
        },
        buildAbsent: {
            entry: ['onBuildAbsent', 'sendDocumentResync'],
            on: {
                VALID_BUILD_FOLDER: "validbuildfolder",
                INVALID_BUILD_FOLDER: "nobuildfolder",
                BUILD_NINJA_CREATED: "buildPresent"
            }
        },
        buildPresent: {
            entry: ['onBuildPresent', 'sendDocumentResync'],
            on: {
                VALID_BUILD_FOLDER: "validbuildfolder",
                INVALID_BUILD_FOLDER: "nobuildfolder",
                BUILD_NINJA_DELETED: "buildAbsent",
                BUILD_NINJA_CHANGED: "buildPresent",
                BUILD_NINJA_CREATED: "buildPresent"
            },
        }
    }
},
    {
        actions: {
            onStart: () => logDebug(`FSM: Enter start.`),
            onInvalidBuildFolder: (context) => {
                logDebug(`FSM: Enter valid build folder.`);
                resetExtension()(context.environment);
                showInvalidBuildFolderMessage();
            },
            onValidBuildFolder: (context) => {
                logDebug(`FSM: Enter invalid build folder.`);
                resetExtension()(context.environment);
            },
            onBuildAbsent: (context) => {
                logDebug(`FSM: Enter build absent.`);
                resetExtension()(context.environment);
                showBuildManifestMissingMessage();
            },
            onBuildPresent: (context) => {
                logDebug(`FSM: Enter build present.`);
                processBuildManifest()(context.environment);
            },
            initBuildFolderObserver: assign({
                buildFolderObserver: (_) => spawn(subscribeToBuildFolderUpdates)
            }),
            initDocumentActor: assign({
                documentActor: (context) => spawn((_, receiver) => createDocumentActor(context.environment, receiver))
            }),
            initBuildNinjaObserver: assign({
                buildNinjaObserver: (context) => spawn((callback, receiver) => subscribeToBuildNinjaUpdates(callback, receiver)(context.environment))
            }),
            sendDocumentResync: send({ type: 'RESYNC' }, { to: context => context.documentActor! }),
            sendInvalidBuildFolderToBuildNinjaObserver: send({ type: 'INVALID_BUILD_FOLDER' }, { to: context => context.buildNinjaObserver! })
        }
    }
);

export function activate(context: vscode.ExtensionContext) {
    logInfo(`${cfg.extensionName} activated.`);

    pipe(
        context,
        createExtEnvironment,
        env => getMachine().withContext({ environment: env }),
        interpret,
        service => service.start()
    )
}

const createExtEnvironment = (context: vscode.ExtensionContext): ExtEnvironment => {
    const env = {
        context: context,
        testController: initTestController(context),
        targetInfoByFile: new Map<string, TargetByInfo>()
    }
    initTestRun(env);
    return env;
}

const initTestController = (context: vscode.ExtensionContext): vscode.TestController => {
    const testController = vscode.tests.createTestController('GoogleTestController', 'GoogleTestController');
    context.subscriptions.push(testController);
    return testController;
}

const subscribeToBuildFolderUpdates = (callback: Sender<AnyEventObject>): () => void => {
    const subscription = observeBuildFolderChange().subscribe(folder => fireEventOnBuildFolderUpdate(folder, callback));
    return () => subscription.unsubscribe();
}

const fireEventOnBuildFolderUpdate = (folder: string, callback: Sender<AnyEventObject>): void => {
    if (doesFolderExist(folder)) {
        callback('VALID_BUILD_FOLDER');
    }
    else {
        callback('INVALID_BUILD_FOLDER');
    }
}

const subscribeToBuildNinjaUpdates = (callback: Sender<AnyEventObject>, receive: Receiver<AnyEventObject>): R.Reader<ExtEnvironment, () => void> => env => {
    const subscription = observeBuildNinja(cfg.buildNinjaFileName).subscribe(update => fireEventOnBuildNinjaUpdate(update, callback));
    receive(event => {
        if (event.type === 'INVALID_BUILD_FOLDER') {
            subscription.unsubscribe();
        }
    });
    return () => subscription.unsubscribe();
}

const fireEventOnBuildNinjaUpdate = (update: BuildNinjaUpdate, callback: Sender<AnyEventObject>): void => {
    if (update === BuildNinjaUpdate.DELETED) {
        callback({ type: 'BUILD_NINJA_DELETED' });
    }
    else if (update === BuildNinjaUpdate.CREATED) {
        callback({ type: 'BUILD_NINJA_CREATED' });
    }
    else {
        callback({ type: 'BUILD_NINJA_CHANGED' });
    }
}

const resetExtension = (): R.Reader<ExtEnvironment, void> => env => {
    logDebug(`Resetting extension`);
    env.targetInfoByFile.clear();
}

const processBuildManifest = (): R.Reader<ExtEnvironment, void> => env => {
    logDebug(`Reading build manifest file.`);
    env.targetInfoByFile.clear();
    for (const [file, targetInfo] of createTargetByFileMapping()) {
        env.targetInfoByFile.set(file, targetInfo);
    }
}

const showInvalidBuildFolderMessage = () => {
    const misconfiguredMsg = `The provided build folder ${cfg.getBuildFolder()} does not exist. Please change to an existing build folder via settings menu.`;
    logError(misconfiguredMsg);
    showWarningMessage(misconfiguredMsg)();
}

const showBuildManifestMissingMessage = (): void => {
    const noBuildManifestMessage = `GoogleTestRunner needs the ${cfg.buildNinjaFileName} file to work. Please run cmake configure at least once with your configured build folder ${cfg.getBuildFolder()}.`;
    logInfo(noBuildManifestMessage);
    showWarningMessage(noBuildManifestMessage)();
}

const showWarningMessage = (message: string): IO<void> => () => vscode.window.showWarningMessage(message)

export function deactivate() { }