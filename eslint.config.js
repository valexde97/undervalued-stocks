import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
   files: ["vite.config.ts", "scripts/**/*.{js,ts,tsx}", "devtools/**/*.{js,ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: "module",
      globals: globals.node,  
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
      rules: {
      "@typescript-eslint/ban-ts-comment": "off",       // разрешаем // @ts-ignore и др. в конфиге
      "@typescript-eslint/no-explicit-any": "off",       // разрешаем any
      "@typescript-eslint/no-misused-promises": "off",   // для middleware/async-обработчиков
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" }
      ],                                                // _req, _res не будут подсвечиваться
      "no-console": "off",
    },
  },
)
