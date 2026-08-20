const util = require('util');

module.exports = {
  info: (message, data = '') => {
    console.log('\x1b[36m%s\x1b[0m', '📢 ' + message, data);
  },
  error: (message, error) => {
    console.error('\x1b[31m%s\x1b[0m', '❌ ' + message);
    if (error) {
      console.error(
        util.inspect(error, {
          colors: true,
          depth: null,
          breakLength: 80,
        })
      );
    }
  },
  success: (message) => {
    console.log('\x1b[32m%s\x1b[0m', '✅ ' + message);
  },
};
