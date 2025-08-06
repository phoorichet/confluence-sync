import { FlatCompat } from '@eslint/eslintrc';
import nyxb from '@nyxb/eslint-config';

const compat = new FlatCompat();

export default nyxb({
  // stylistic: true,
  // // Or customize the stylistic rules
  stylistic: {
    indent: 2,
    quotes: 'single',
    semi: true,
  },
  ignores: ['node_modules', 'dist'],
}, ...compat.config({
  extends: [],
  rules: {
    'no-console': 'off', // Allow console statements
  },
}));
