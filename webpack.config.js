const path = require('path');
const nodeExternals = require('webpack-node-externals');

const clientRules = {
    entry: [
        'core-js/modules/es.promise',
        'core-js/modules/es.array.iterator',
        'core-js/modules/es.array.includes',
        './index.js',
    ],

    output: {
        path: path.join(__dirname, 'dist'),
        filename: 'irma.js',
        chunkFilename: '[name].js',
        library: 'irma',
        libraryTarget: 'umd',
    },

    module: {
        rules: [
            {
                test: /\.css$/i,
                use: [
                    'style-loader',
                    'css-loader',
                ]
            }, {
                test: /\.js$/i,
                exclude: /(qrcode-terminal)/,
                use: {
                    loader: 'babel-loader',
                    options: {
                        'presets': [
                            [
                                '@babel/preset-env',
                                {
                                    'targets': '> 0.25%, not dead',
                                    'useBuiltIns': 'entry',
                                    'corejs': { 'version': 3, 'proposals': true },
                                },
                            ],
                        ],
                    },
                },
            },
        ],
    },
};

const serverRules = {
    target: 'node',

    entry: './index.js',

    output: {
        path: path.join(__dirname, 'dist'),
        filename: 'irma.node.js',
        libraryTarget: 'commonjs',
    },

    module: {
        rules: [
            {
                test: /\.css$/i,
                loader: 'null-loader'
            },
            {
                test: /irma-popup/,
                loader: 'null-loader'
            }
        ]
    },

    externals: [nodeExternals({
        whitelist: [/\.css$/i, /irma-popup/]
    })],
};

module.exports = [clientRules, serverRules];
