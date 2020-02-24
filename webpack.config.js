const path = require('path');

module.exports = {
  entry: './src/client/main.js',
  output: {
    path: path.join(__dirname, 'public/js'),
    filename: 'bundle.js'
  },
  mode: 'development'
};
