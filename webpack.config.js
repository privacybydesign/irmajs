const path = require('path');

const mod = {
  rules: [
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
    {
      test: /\.scss$/,
      use: ['style-loader', 'css-loader', 'sass-loader']
    },
    {
      test: /\.(png|svg|jpg|gif)$/,
      use: ['url-loader']
    },
    {
      test: /\.html$/,
      use: ['html-loader']
    }
  ],
};

const clientConfig = {
  target: 'web',
  entry: './src/index.js',
  output: {
    filename: 'bundle.js',
    library: 'IRMA',
    path: path.resolve(__dirname, 'dist')
  },
  module: mod,
  externals: {
    eventsource: 'EventSource'
  }
};

const serverConfig = {
  target: 'node',
  entry: './src/index.js',
  output: {
    filename: 'bundle.node.js',
    path: path.resolve(__dirname, 'dist')
  },
  module: mod,
  externals: {
    qrcode: 'QRCode',
    '@brillout/fetch': 'fetch',
    eventsource: 'EventSource'
  }
};

module.exports = [ clientConfig, serverConfig ];
