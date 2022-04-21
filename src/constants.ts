export const regexp = {
    TESTCASE_REGEXP: /^(TEST|TEST_F|TEST_P|INSTANTIATE_TEST_SUITE_P)\(\s*([a-zA-Z_][a-zA-Z0-9_]+),\s*([a-zA-Z_][a-zA-Z0-9_]+)/gm
} as const;