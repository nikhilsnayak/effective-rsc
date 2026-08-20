const { getAppStore } = require('./app-store');
const logger = require('./logger');

module.exports = function () {
  const { cookies, metadata } = getAppStore();

  return {
    get: function (name) {
      return (
        cookies.incoming.get(name)?.value ??
        cookies.outgoing.get(name)?.value ??
        null
      );
    },
    set: function (name, value, options) {
      if (metadata.renderPhase === 'RSC') {
        logger.error(
          `Cannot set cookie "${name}" after the response has been sent to the client`
        );
        return;
      }
      const cookie = {
        value,
        ...options,
      };

      cookies.outgoing.set(name, cookie);
      cookies.incoming.delete(name);
    },
    remove: function (name) {
      cookies.outgoing.delete(name);
      cookies.incoming.delete(name);
    },
  };
};
