import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

export default [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "drizzle/**",
      "site/**",
      "next-env.d.ts",
      // A deployment that mounts the Claude Code CLI into the container puts
      // its HOME here, and that includes the CLI's own bundled JavaScript.
      // .gitignore already covers it, but ESLint does not read .gitignore, so
      // without this `npm run lint` fails on somebody else's `require()`.
      "claude-home/**",
    ],
  },
  ...coreWebVitals,
  ...typescript,
  {
    // Config files are *required* to default-export an anonymous object.
    files: ["*.config.mjs", "*.config.ts"],
    rules: { "import/no-anonymous-default-export": "off" },
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
];
