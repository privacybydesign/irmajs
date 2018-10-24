const path = require('path');

module.exports = {
  entry: './src/browser.js',
  output: {
    filename: 'bundle.js',
    path: path.resolve(__dirname, 'dist')
  },
  module: {
    rules: [
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
  }
};
