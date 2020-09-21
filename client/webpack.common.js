const path = require('path');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const Dotenv = require('dotenv-webpack');

module.exports = {
  entry: {
    app: './client/src/index.js'
  },
  module: {
    rules: [
      {
        test: /\.css$/i,
        use: [MiniCssExtractPlugin.loader, 'css-loader']
      }
    ]
  },
  plugins: [
    new MiniCssExtractPlugin(),
    new CleanWebpackPlugin({
      cleanOnceBeforeBuildPatterns: ['**/*', '!models', '!models/*.*']
    }),
    new HtmlWebpackPlugin({
      title: 'Void',
      template: './client/src/index.html'
    }),
    new Dotenv()
  ],
  resolve: {
    extensions: ['.js'],
  },
  output: {
    filename: '[name].bundle.js',
    path: path.resolve(__dirname, 'public')
  }
};
