import { FlatCompat } from "@eslint/eslintrc";

// eslint-config-next expose encore sa configuration au format eslintrc
// (`extends`/`plugins`), pas un tableau flat-config natif — FlatCompat est
// le pont documenté par Next.js pour la consommer depuis ESLint 9.
const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

export default [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [".next/**", "node_modules/**", "prisma/migrations/**"],
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
];
