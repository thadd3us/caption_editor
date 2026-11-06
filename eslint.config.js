import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import vue from "eslint-plugin-vue";
import vueParser from "vue-eslint-parser";

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,

  // Vue SFCs. Without eslint-plugin-vue and vue-eslint-parser, flat config never
  // matches a .vue file at all — ESLint was linting 103 .ts files and zero .vue,
  // which left CaptionTable.vue (1400 lines), MediaPlayer.vue and App.vue, i.e.
  // most of the app's logic, unlinted.
  //
  // `flat/essential` rather than `flat/recommended` on purpose. The difference between
  // the two tiers is almost entirely formatting — `max-attributes-per-line`,
  // `html-self-closing`, `singleline-html-element-content-newline` and friends accounted
  // for 131 of the 134 findings `recommended` produced here. This repo already has
  // prettier for formatting, and 131 permanently-warning lines would bury the findings
  // that matter. `essential` is the error-prevention tier: mutating a prop, `v-for`
  // without a key, an invalid `v-model` target, a component used but not registered.
  //
  // It currently reports nothing, which is a statement about the code rather than about
  // the config — the value is that it now fails the build the first time one of those
  // mistakes is written.
  ...vue.configs["flat/essential"],
  {
    files: ["**/*.vue"],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        // The <script> block is TypeScript; vue-eslint-parser hands it to this.
        parser: tseslint.parser,
        ecmaVersion: "latest",
        sourceType: "module",
      },
    },
    rules: {
      // Off for the same reason typescript-eslint turns it off for .ts: TypeScript
      // already resolves identifiers, and it knows the DOM lib. Leaving it on reported
      // 325 "errors" that were all `console`, `window`, `document` and DOM types.
      "no-undef": "off",

      // Correctness rules from the higher tiers, minus their formatting. Each one is a
      // bug class rather than a style preference.
      "vue/no-v-html": "error", // XSS; nothing uses it today, keep it that way
      "vue/require-default-prop": "error",
      "vue/require-explicit-emits": "error",
      "vue/no-template-shadow": "error",
      "vue/no-unused-refs": "error",
      "vue/no-useless-v-bind": "error",
      "vue/prefer-separate-static-class": "error",
    },
  },

  {
    ignores: [
      "dist/**",
      "dist-electron/**",
      "node_modules/**",
      "*.cjs",
      "bug-reports/**",
      "prototypes/**",
      "hack/**",
      "transcribe_rs/**/target/**",
      "**/.venv/**",
      "playwright-report/**",
      "test-results/**",
    ],
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
    },
  }
);
