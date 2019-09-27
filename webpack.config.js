const path = require('path');
const nodeExternals = require('webpack-node-externals');

const sharedRules = [
  {
    test: /\.js$/,
    exclude: /(node_modules|bower_components)/,
    use: {
      loader: 'babel-loader',
      options: {
        presets: ['@babel/preset-env'],
        plugins: ['@babel/plugin-proposal-object-rest-spread', '@babel/plugin-syntax-dynamic-import']
      }
    }
  },
];

const clientConfig = {
  target: 'web',
  entry: './src/index.js',
  output: {
    filename: 'irma.js',
    chunkFilename: '[name].js',
    library: 'irma',
    libraryTarget: 'umd',
    path: path.resolve(__dirname, 'dist')
  },
  module: {
    rules: sharedRules.concat([
      {
        test: /\.scss$/,
        use: ['style-loader', 'css-loader', 'sass-loader']
      },
      {
        test: /\.(png|svg|jpg|gif)$/,
        use: 'url-loader'
      },
      {
        test: /\.html$/,
        use: 'html-loader'
      }
    ])
  },
  externals: {
    eventsource: 'eventsource',
    'qrcode-terminal': 'qrcode'
  }
};

const serverConfig = {
  target: 'node',
  entry: './src/index.js',
  output: {
    filename: 'irma.node.js',
    libraryTarget: 'commonjs',
    path: path.resolve(__dirname, 'dist')
  },
  module: {
    rules: sharedRules.concat([
      {
        test: /\.scss$/,
        use: 'null-loader'
      },
      {
        test: /\.(png|svg|jpg|gif)$/,
        use: 'null-loader'
      },
      {
        test: /\.html$/,
        use: 'null-loader'
      }
    ])
  },
  externals: [nodeExternals()],
};

module.exports = [ clientConfig, serverConfig ];
