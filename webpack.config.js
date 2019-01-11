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
        plugins: ['@babel/plugin-proposal-object-rest-spread']
      }
    }
  },
];

const clientConfig = {
  target: 'web',
  entry: './src/index.js',
  output: {
    filename: 'bundle.js',
    library: 'irma',
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
    eventsource: 'EventSource',
    'qrcode-terminal': 'qrcode'
  }
};

const serverConfig = {
  target: 'node',
  entry: './src/index.js',
  output: {
    filename: 'bundle.node.js',
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
