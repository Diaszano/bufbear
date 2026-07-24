import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

const javascriptFiles = ["**/*.{cjs,js,mjs}"];
const toolingTypeScriptFiles = ["esbuild.ts", "eslint.config.ts"];
const typescriptFiles = ["src/**/*.ts", ...toolingTypeScriptFiles];

const typeAwareConfigs = [
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
].map((config) => ({
  ...config,
  files: typescriptFiles,
}));

export default tseslint.config(
  {
    name: "bufbear/ignores",
    ignores: [
      "coverage/**",
      "dist/**",
      "node_modules/**",
      "out/**",
      ".vscode-test/**",
      ".vscode-test-web/**",
      "*.vsix",
    ],
    linterOptions: {
      reportUnusedDisableDirectives: "error",
      reportUnusedInlineConfigs: "error",
    },
  },
  {
    ...eslint.configs.recommended,
    name: "bufbear/recommended",
    files: [...javascriptFiles, ...typescriptFiles],
  },
  {
    name: "bufbear/javascript",
    files: javascriptFiles,
    languageOptions: {
      ecmaVersion: "latest",
      globals: {
        console: "readonly",
        process: "readonly",
      },
      sourceType: "module",
    },
  },
  ...typeAwareConfigs,
  {
    name: "bufbear/typescript",
    files: typescriptFiles,
    languageOptions: {
      parserOptions: {
        project: ["./tsconfig.json", "./tsconfig.tools.json"],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/consistent-type-exports": "error",
      "@typescript-eslint/consistent-type-imports": [
        "error",
        {
          fixStyle: "inline-type-imports",
          prefer: "type-imports",
        },
      ],
      "@typescript-eslint/no-confusing-void-expression": "off",
      "@typescript-eslint/no-misused-promises": [
        "error",
        {
          checksVoidReturn: {
            arguments: false,
          },
        },
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
          ignoreRestSiblings: true,
          varsIgnorePattern: "^_",
        },
      ],
      "no-console": "error",
    },
  },
  {
    name: "bufbear/tooling",
    files: toolingTypeScriptFiles,
    rules: {
      "no-console": "off",
    },
  },
  {
    name: "bufbear/tests",
    files: ["src/test/**/*.ts"],
    rules: {
      "no-console": "off",
    },
  },
);
