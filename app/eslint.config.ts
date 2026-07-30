import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist/**', '.data/**'] },
  eslint.configs.recommended,
  tseslint.configs.recommended,
  {
    rules: {
      // An underscore prefix marks a parameter a signature requires but the
      // body does not, like the four-argument Express error handler.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
)
