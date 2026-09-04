import next from "eslint-config-next";

export default [
  ...next,
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
