const { AsyncLocalStorage } = require('async_hooks');

const appStore = new AsyncLocalStorage();

module.exports.getAppStore = appStore.getStore.bind(appStore);
module.exports.runWithAppStore = appStore.run.bind(appStore);
