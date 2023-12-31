const webpack = require("webpack");
const path = require("path");
const fileSystem = require("fs-extra");
const env = require("./utils/env");
const CopyWebpackPlugin = require("copy-webpack-plugin");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const TerserPlugin = require("terser-webpack-plugin");
const { CleanWebpackPlugin } = require("clean-webpack-plugin");

const ASSET_PATH = process.env.ASSET_PATH || "/";

const alias = {
    "react-dom": "@hot-loader/react-dom",
};

const secretsPath = path.join(__dirname, "secrets." + env.NODE_ENV + ".js");

const fileExtensions = ["jpg", "jpeg", "png", "gif", "eot", "otf", "svg", "ttf", "woff", "woff2"];

if (fileSystem.existsSync(secretsPath)) {
    alias["secrets"] = secretsPath;
}

const options = {
    mode: process.env.NODE_ENV || "development",
    entry: {
        options: path.join(__dirname, "src", "pages", "Options", "index.jsx"),
        popup: path.join(__dirname, "src", "pages", "Popup", "index.jsx"),
        background: path.join(__dirname, "src", "pages", "Background", "index.js"),
        contentScript: path.join(__dirname, "src", "pages", "Content", "index.js"),
        main: path.join(__dirname, "src", "pages", "Main", "index.jsx"),
    },
    output: {
        filename: "[name].bundle.js",
        path: path.resolve(__dirname, "build"),
        clean: true,
        publicPath: ASSET_PATH,
    },
    module: {
        rules: [
            {
                test: /\.(css|scss)$/,

                use: [
                    {
                        loader: "style-loader",
                    },
                    {
                        loader: "css-loader",
                    },
                    {
                        loader: "sass-loader",
                        options: {
                            sourceMap: true,
                        },
                    },
                ],
            },
            {
                test: new RegExp(".(" + fileExtensions.join("|") + ")$"),
                type: "asset/resource",
                exclude: /node_modules/,
            },
            {
                test: /\.html$/,
                loader: "html-loader",
                exclude: /node_modules/,
            },
            { test: /\.(ts|tsx)$/, loader: "ts-loader", exclude: /node_modules/ },
            {
                test: /\.(js|jsx)$/,
                use: [
                    {
                        loader: "source-map-loader",
                    },
                    {
                        loader: "babel-loader",
                    },
                ],
                exclude: /node_modules/,
            },
        ],
    },
    resolve: {
        alias: alias,
        extensions: fileExtensions.map((extension) => "." + extension).concat([".js", ".jsx", ".ts", ".tsx", ".css"]),
    },
    plugins: [
        new CleanWebpackPlugin({ verbose: false }),
        new webpack.ProgressPlugin(),
        new webpack.EnvironmentPlugin(["NODE_ENV"]),
        new webpack.ProvidePlugin({
            process: "process/browser.js",
        }),
        new CopyWebpackPlugin({
            patterns: [
                {
                    from: "src/manifest.json",
                    to: path.join(__dirname, "build"),
                    force: true,
                    transform: function (content) {
                        return Buffer.from(
                            JSON.stringify({
                                description: process.env.npm_package_description,
                                version: process.env.npm_package_version,
                                ...JSON.parse(content.toString()),
                            }),
                        );
                    },
                },
            ],
        }),
        new CopyWebpackPlugin({
            patterns: [
                {
                    from: "src/pages/Content/content.styles.css",
                    to: path.join(__dirname, "build"),
                    force: true,
                },
            ],
        }),
        new CopyWebpackPlugin({
            patterns: [
                {
                    from: "src/assets/img/icon-128.png",
                    to: path.join(__dirname, "build"),
                    force: true,
                },
            ],
        }),
        new CopyWebpackPlugin({
            patterns: [
                {
                    from: "src/assets/img/icon-34.png",
                    to: path.join(__dirname, "build"),
                    force: true,
                },
            ],
        }),
        new HtmlWebpackPlugin({
            template: path.join(__dirname, "src", "pages", "Options", "index.html"),
            filename: "options.html",
            chunks: ["options"],
            cache: false,
        }),
        new HtmlWebpackPlugin({
            template: path.join(__dirname, "src", "pages", "Popup", "index.html"),
            filename: "popup.html",
            chunks: ["popup"],
            cache: false,
        }),

        new HtmlWebpackPlugin({
            template: path.join(__dirname, "src", "pages", "Main", "index.html"),
            filename: "main.html",
            chunks: ["main"],
            cache: false,
        }),
    ],
    infrastructureLogging: {
        level: "info",
    },
};

if (env.NODE_ENV === "development") {
    options.devtool = "cheap-module-source-map";
} else {
    options.optimization = {
        minimize: true,
        minimizer: [
            new TerserPlugin({
                extractComments: false,
            }),
        ],
    };
}

module.exports = options;
