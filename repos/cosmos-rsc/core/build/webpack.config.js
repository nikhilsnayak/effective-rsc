const path = require('path');
const ReactServerWebpackPlugin = require('react-server-dom-webpack/plugin');
const { reactCompilerLoader } = require('react-compiler-webpack');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const tailwindcss = require('@tailwindcss/postcss');
const isProduction = process.env.NODE_ENV === 'production';

module.exports = {
  mode: isProduction ? 'production' : 'development',
  entry: [
    path.resolve(__dirname, '../client/index.js'),
    path.resolve(__dirname, '../../app/globals.css'),
  ],
  output: {
    path: path.resolve(__dirname, '../../.cosmos-rsc'),
    filename: 'client.js',
  },
  devtool: isProduction ? false : 'source-map',
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: [
          {
            loader: 'babel-loader',
            options: {
              presets: [
                [
                  '@babel/preset-react',
                  {
                    runtime: 'automatic',
                  },
                ],
              ],
            },
          },
          {
            loader: reactCompilerLoader,
          },
        ],
      },
      {
        test: /\.css$/i,
        use: [
          MiniCssExtractPlugin.loader,
          'css-loader',
          {
            loader: 'postcss-loader',
            options: {
              postcssOptions: {
                plugins: [tailwindcss],
              },
            },
          },
        ],
      },
    ],
  },
  plugins: [
    new ReactServerWebpackPlugin({
      isServer: false,
      clientReferences: [
        {
          directory: './app',
          recursive: true,
          include: /\.js$/,
        },
        {
          directory: './core/client',
          recursive: true,
          include: /\.js$/,
        },
      ],
    }),
    new MiniCssExtractPlugin({
      filename: 'style.css',
    }),
  ],
};
