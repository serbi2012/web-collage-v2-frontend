module.exports = {
    root: true,
    parserOptions: {
        ecmaVersion: 2021,
        sourceType: "module",
        ecmaFeatures: {
            jsx: true,
        },
    },
    settings: {
        react: {
            version: "detect",
        },
        "import/resolver": {
            node: {
                paths: ["src"],
                extensions: [".js", ".jsx"],
            },
        },
    },
    env: {
        browser: true,
        es2021: true,
        amd: true,
        node: true,
    },
    extends: ["eslint:recommended", "plugin:react/recommended"],
    plugins: ["react"],
    rules: {
        "react/react-in-jsx-scope": "off",
        "react/prop-types": "off",
    },
};
