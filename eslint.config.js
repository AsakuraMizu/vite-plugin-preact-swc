// @ts-check

import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import gitignore from 'eslint-config-flat-gitignore';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  gitignore(),
);
