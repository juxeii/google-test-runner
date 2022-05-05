import * as vscode from 'vscode';
import * as R from 'fp-ts/Reader';
import * as cfg from './utils/configuration';
import { logDebug, logError, logInfo } from './utils/logger';
import { TargetByInfo, createTargetByFileMapping, doesFolderExist } from './utils/utils';
import { pipe } from 'fp-ts/lib/function';
import { createTestController } from './testrun/testrun';
import { BuildNinjaUpdate, observeBuildFolderChange, observeBuildNinja } from './listener';
import { createDocumentActor } from './documentactor';
import { IO } from 'fp-ts/lib/IO';
import { ActorRef, AnyEventObject, assign, createMachine, interpret, Receiver, send, Sender, spawn } from 'xstate';

export let targetInfoByFile = new Map<string, TargetByInfo>();
export type ExtEnvironment = {
    context: vscode.ExtensionContext;
    testController: vscode.TestController;
    buildNinjaFileName: string;
    buildFolder: () => string;
}

const onStart = () => {
    logDebug(`FSM: Enter start.`);
}

const onInvalidBuildFolder = (context: GTestContext) => {
    logDebug(`FSM: Enter invalid build folder.`);
    resetExtension()(context.environment)
    showInvalidBuildFolderMessage();
}

const onValidBuildFolder = (context: GTestContext) => {
    logDebug(`FSM: Enter valid build folder.`);
    resetExtension()(context.environment);
}

const onBuildPresent = () => {
    logDebug(`FSM: Enter build present.`);
    processBuildManifest();
}

const onBuildAbsent = (context: GTestContext) => {
    logDebug(`FSM: Enter build absent.`);
    resetExtension()(context.environment);
    showBuildManifestMissingMessage()(context.environment);
}

interface GTestContext {
    environment: ExtEnvironment,
    buildFolderObserver: ActorRef<any, any> | undefined;
    buildNinjaObserver: ActorRef<any, any> | undefined;
    documentActor: ActorRef<any, any> | undefined;
}

const createGTestMachine = (environment: ExtEnvironment) => createMachine<GTestContext>({
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
    context: {
        environment: environment,
        buildFolderObserver: undefined,
        buildNinjaObserver: undefined,
        documentActor: undefined
    },
    states: {
        start: {
            entry: [onStart,
                assign({
                    buildFolderObserver: () => spawn(subscribeToBuildFolderUpdates)
                }), assign({
                    documentActor: () => spawn((_, receiver) => createDocumentActor(environment.testController, receiver), 'documentActor')
                })],
            on: {
                VALID_BUILD_FOLDER: "validbuildfolder",
                INVALID_BUILD_FOLDER: "nobuildfolder"
            },
        },
        nobuildfolder: {
            entry: [onInvalidBuildFolder,
                send({ type: 'INVALID_BUILD_FOLDER' }, { to: 'buildNinjaObserver' }),
                send({ type: 'RESYNC' }, { to: 'documentActor' })],
            on: {
                VALID_BUILD_FOLDER: "validbuildfolder"
            },
        },
        validbuildfolder: {
            entry: [onValidBuildFolder, assign({
                buildNinjaObserver: () => spawn((callback, receiver) => subscribeToBuildNinjaUpdates(callback, receiver)(environment), 'buildNinjaObserver')
            })],
            on: {
                INVALID_BUILD_FOLDER: "nobuildfolder",
                BUILD_NINJA_CREATED: "buildPresent",
                BUILD_NINJA_DELETED: "buildAbsent"
            }
        },
        buildAbsent: {
            entry: [onBuildAbsent, send({ type: 'RESYNC' }, { to: 'documentActor' })],
            on: {
                VALID_BUILD_FOLDER: "validbuildfolder",
                INVALID_BUILD_FOLDER: "nobuildfolder",
                BUILD_NINJA_CREATED: "buildPresent"
            }
        },
        buildPresent: {
            entry: [onBuildPresent, send({ type: 'RESYNC' }, { to: 'documentActor' })],
            on: {
                VALID_BUILD_FOLDER: "validbuildfolder",
                INVALID_BUILD_FOLDER: "nobuildfolder",
                BUILD_NINJA_DELETED: "buildAbsent",
                BUILD_NINJA_CHANGED: "buildPresent",
                BUILD_NINJA_CREATED: "buildPresent"
            },
        }
    }
});

export function activate(context: vscode.ExtensionContext) {
    logInfo(`${cfg.extensionName} activated.`);

    pipe(
        context,
        createExtEnvironment,
        createGTestMachine,
        interpret,
        gTestFsm => gTestFsm.start()
    )
}

const createExtEnvironment = (context: vscode.ExtensionContext): ExtEnvironment => {
    return {
        context: context,
        testController: initTestController(context),
        buildNinjaFileName: cfg.buildNinjaFileName,
        buildFolder: cfg.getBuildFolder
    }
}

const initTestController = (context: vscode.ExtensionContext): vscode.TestController => {
    const testController = createTestController();
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
    const subscription = observeBuildNinja(env.buildNinjaFileName).subscribe(update => fireEventOnBuildNinjaUpdate(update, callback));
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
    targetInfoByFile.clear();
}

const processBuildManifest = (): void => {
    logDebug(`Reading build manifest file.`);
    targetInfoByFile = createTargetByFileMapping();
}

const showInvalidBuildFolderMessage = () => {
    const misconfiguredMsg = `The provided build folder ${cfg.getBuildFolder()} does not exist. Please change to an existing build folder via settings menu.`;
    logError(misconfiguredMsg);
    showWarningMessage(misconfiguredMsg)();
}

const showBuildManifestMissingMessage = (): R.Reader<ExtEnvironment, void> => env => {
    const noBuildManifestMessage = `GoogleTestRunner needs the ${env.buildNinjaFileName} file to work. Please run cmake configure at least once with your configured build folder ${env.buildFolder()}.`;
    logInfo(noBuildManifestMessage);
    showWarningMessage(noBuildManifestMessage)();
}

const showWarningMessage = (message: string): IO<void> => () => vscode.window.showWarningMessage(message)

export function deactivate() { }