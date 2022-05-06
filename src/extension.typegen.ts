// This file was automatically generated. Edits will be overwritten

export interface Typegen0 {
  "@@xstate/typegen": true;
  eventsCausingActions: {
    onStart: "xstate.init";
    initBuildFolderObserver: "xstate.init";
    initDocumentActor: "xstate.init";
    onInvalidBuildFolder: "INVALID_BUILD_FOLDER";
    sendInvalidBuildFolderToBuildNinjaObserver: "INVALID_BUILD_FOLDER";
    sendDocumentResync:
      | "INVALID_BUILD_FOLDER"
      | "BUILD_NINJA_DELETED"
      | "BUILD_NINJA_CREATED"
      | "BUILD_NINJA_CHANGED";
    onValidBuildFolder: "VALID_BUILD_FOLDER";
    initBuildNinjaObserver: "VALID_BUILD_FOLDER";
    onBuildAbsent: "BUILD_NINJA_DELETED";
    onBuildPresent: "BUILD_NINJA_CREATED" | "BUILD_NINJA_CHANGED";
  };
  internalEvents: {
    "xstate.init": { type: "xstate.init" };
  };
  invokeSrcNameMap: {};
  missingImplementations: {
    actions: never;
    services: never;
    guards: never;
    delays: never;
  };
  eventsCausingServices: {};
  eventsCausingGuards: {};
  eventsCausingDelays: {};
  matchesStates:
    | "start"
    | "nobuildfolder"
    | "validbuildfolder"
    | "buildAbsent"
    | "buildPresent";
  tags: never;
}
