import * as vscode from 'vscode';
import * as R from 'fp-ts/Reader';
import { Option, none, some } from 'fp-ts/lib/Option'
import * as cfg from './utils/configuration';
import { logDebug, logError, logInfo } from './utils/logger';
import { TargetByInfo, createTargetByFileMapping } from './utils/utils';
import { flow, pipe } from 'fp-ts/lib/function';
import { createTestController } from './testrun/testrun';
import { BuildNinjaUpdate, observeBuildFolderChange, observeBuildNinja } from './listener';
import { initDocumentControl } from './documentcontrol';
import { IO } from 'fp-ts/lib/IO';
import { Subscription } from 'observable-fns';
import { map } from 'fp-ts/lib/Option';
import { createMachine, interpret, InterpreterFrom } from 'xstate';

export let targetInfoByFile: Map<string, TargetByInfo>;
export type ExtEnvironment = {
    context: vscode.ExtensionContext;
    gTestFsm: ExtFsm | undefined;
    testController: vscode.TestController;
    buildNinjaFileName: string;
    buildFolder: () => string;
    buildNinjaSubscriber: Option<Subscription<BuildNinjaUpdate>>;
    documentControl: vscode.Disposable | undefined;
}

const onStart = (environment: ExtEnvironment) => {
    logDebug(`FSM: Enter start.`);
    subscribeToBuildFolderUpdates()(environment);
}

const onInvalidBuildFolder = (environment: ExtEnvironment) => {
    logDebug(`FSM: Enter invalid build folder.`);
    flow(
        resetExtension,
        R.chain(unsubscribeFromBuildNinjaUpdates)
    )()(environment)
}

const onValidBuildFolder = (environment: ExtEnvironment) => {
    logDebug(`FSM: Enter valid build folder.`);
    flow(
        resetExtension,
        R.chain(unsubscribeFromBuildNinjaUpdates),
        R.chain(subscribeToBuildNinjaUpdates)
    )()(environment)
}

const onBuildPresent = (environment: ExtEnvironment) => {
    logDebug(`FSM: Enter build present.`);
    processBuildManifest()(environment);
}

const onBuildAbsent = (environment: ExtEnvironment) => {
    logDebug(`FSM: Enter build absent.`);
    resetExtension()(environment);
    showBuildManifestMissingMessage()(environment);
}

const createGTestMachine = (environment: ExtEnvironment) => createMachine(
    {
        id: "gtestrunner",
        initial: "start",
        context: environment,
        states: {
            start: {
                onEntry: ["onStart"],
                on: {
                    VALID_BUILD_FOLDER: "validbuildfolder",
                    INVALID_BUILD_FOLDER: "nobuildfolder"
                },
            },
            nobuildfolder: {
                onEntry: ["onInvalidBuildFolder"],
                on: {
                    VALID_BUILD_FOLDER: "validbuildfolder"
                },
            },
            validbuildfolder: {
                onEntry: ["onValidBuildFolder"],
                on: {
                    INVALID_BUILD_FOLDER: "nobuildfolder",
                    BUILD_NINJA_CREATED: "buildPresent",
                    BUILD_NINJA_DELETED: "buildAbsent"
                }
            },
            buildAbsent: {
                onEntry: ["onBuildAbsent"],
                on: {
                    VALID_BUILD_FOLDER: "validbuildfolder",
                    INVALID_BUILD_FOLDER: "nobuildfolder",
                    BUILD_NINJA_CREATED: "buildPresent"
                }
            },
            buildPresent: {
                onEntry: ["onBuildPresent"],
                on: {
                    VALID_BUILD_FOLDER: "validbuildfolder",
                    INVALID_BUILD_FOLDER: "nobuildfolder",
                    BUILD_NINJA_DELETED: "buildAbsent",
                    BUILD_NINJA_CHANGED: "buildPresent"
                }
            }
        }
    },
    {
        actions: {
            onStart,
            onInvalidBuildFolder,
            onValidBuildFolder,
            onBuildPresent,
            onBuildAbsent
        }
    }
);
type ExtFsm = InterpreterFrom<typeof createGTestMachine>;

export function activate(context: vscode.ExtensionContext) {
    logInfo(`${cfg.extensionName} activated.`);

    const environment = createExtEnvironment(context);
    startFsm(environment);
}

const startFsm = (environment: ExtEnvironment): void => {
    const gTestMachine = createGTestMachine(environment);
    const gTestFsm = interpret(gTestMachine);
    environment.gTestFsm = gTestFsm;
    gTestFsm.start();
}

const createExtEnvironment = (context: vscode.ExtensionContext): ExtEnvironment => {
    return {
        context: context,
        gTestFsm: undefined,
        testController: initTestController(context),
        buildNinjaFileName: cfg.buildNinjaFileName,
        buildFolder: cfg.getBuildFolder,
        buildNinjaSubscriber: none,
        documentControl: undefined
    }
}

const initTestController = (context: vscode.ExtensionContext): vscode.TestController => {
    const testController = createTestController();
    context.subscriptions.push(testController);
    return testController;
}

const subscribeToBuildFolderUpdates = (): R.Reader<ExtEnvironment, void> => env => {
    observeBuildFolderChange().subscribe({
        next(folder) { onNewBuildFolder(folder)(env); },
        error(_) { logError(`Error occured while observing configuration!`) }
    });
}

const onNewBuildFolder = (folder: string): R.Reader<ExtEnvironment, void> => env => {
    if (cfg.doesFolderExist(folder)) {
        env.gTestFsm!.send({ type: 'VALID_BUILD_FOLDER' });
    }
    else {
        env.gTestFsm!.send({ type: 'INVALID_BUILD_FOLDER' });
        showInvalidBuildFolderMessage(env.buildFolder());
    }
}

const showInvalidBuildFolderMessage = (invalidFolder: string) => {
    const misconfiguredMsg = `The provided build folder ${invalidFolder} does not exist. Please change to an existing build folder via settings menu.`;
    logError(misconfiguredMsg);
    showWarningMessage(misconfiguredMsg)();
}

const resetExtension = (): R.Reader<ExtEnvironment, void> => env => {
    env.testController.items.replace([]);
    env.documentControl?.dispose();
}

const unsubscribeFromBuildNinjaUpdates = (): R.Reader<ExtEnvironment, void> => env => {
    pipe(
        env.buildNinjaSubscriber,
        map(subscriber => subscriber.unsubscribe())
    )
}

const subscribeToBuildNinjaUpdates = (): R.Reader<ExtEnvironment, void> => env => {
    const observer = observeBuildNinja(env.buildNinjaFileName).subscribe({
        next(update) { fireEventOnBuildNinjaUpdate(update)(env) },
        error(_) { logError(`Error occured while observing build ninja updates!`) }
    });
    env.buildNinjaSubscriber = some(observer);
}

const fireEventOnBuildNinjaUpdate = (update: BuildNinjaUpdate): R.Reader<ExtEnvironment, void> => env => {
    if (update === BuildNinjaUpdate.DELETED) {
        env.gTestFsm!.send({ type: 'BUILD_NINJA_DELETED' });
    }
    else if (update === BuildNinjaUpdate.CREATED) {
        env.gTestFsm!.send({ type: 'BUILD_NINJA_CREATED' });
    }
    else {
        env.gTestFsm!.send({ type: 'BUILD_NINJA_CHANGED' });
    }
}

const processBuildManifest = (): R.Reader<ExtEnvironment, void> => env => {
    logDebug(`Reading build manifest file.`);
    targetInfoByFile = createTargetByFileMapping();
    env.documentControl?.dispose();
    env.documentControl = initDocumentControl(env.testController);
}

const showBuildManifestMissingMessage = (): R.Reader<ExtEnvironment, void> => env => {
    const noBuildManifestMessage = `GoogleTestRunner needs the ${env.buildNinjaFileName} file to work. Please run cmake configure at least once with your configured build folder ${cfg.getBuildFolder()}.`;
    logInfo(noBuildManifestMessage);
    showWarningMessage(noBuildManifestMessage)();
}

const showWarningMessage = (message: string): IO<void> => () => vscode.window.showWarningMessage(message)

export function deactivate() { }