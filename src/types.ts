export const enum GTestType {
    TEST,
    TEST_F,
    TEST_P,
    TYPED_TEST,
    TYPED_TEST_P
}

export const enum GTestMacroType {
    TEST,
    TEST_F,
    TEST_P,
    TYPED_TEST,
    TYPED_TEST_P,
    INSTANTIATE_TEST_SUITE_P,
    INSTANTIATE_TYPED_TEST_SUITE_P
}

export type GTestMacro = {
    type: GTestMacroType;
    fixture: string;
    id: string;
    lineNo: number;
}

export type TestCase = {
    fixture: string;
    name: string;
    id: string;
    regExpForId: RegExp;
    lineNo: number;
    gTestType: GTestType;
}