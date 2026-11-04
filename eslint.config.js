import js from '@eslint/js';
import ts from '@typescript-eslint/eslint-plugin';
import parser from '@typescript-eslint/parser';
import hooks from 'eslint-plugin-react-hooks';
import refresh from 'eslint-plugin-react-refresh';
import globals from 'globals';

export default [
  { ignores: ['dist/**', 'dist-electron/**', 'release/**'] },
  ...ts.configs['flat/recommended'].map(config => ({ ...config, files: ['**/*.{ts,tsx}'] })),
  { files: ['**/*.cjs'], languageOptions: { globals: globals.node }, rules: js.configs.recommended.rules },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { parser, globals: { ...globals.browser, ...globals.node } },
    plugins: { 'react-hooks': hooks, 'react-refresh': refresh },
    rules: {
      ...js.configs.recommended.rules,
      ...ts.configs.recommended.rules,
      'no-undef': 'off',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
  {
    files: ['src/services/**/*.{ts,tsx}', 'src/contexts/**/*.{ts,tsx}', 'src/components/JobQueue.tsx'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
];
