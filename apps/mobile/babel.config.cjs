module.exports = function (api) {
  api.cache(true);

  return {
    // Temporary until the Effect patch containing https://github.com/Effect-TS/effect/pull/7352.
    // Override Expo's loose object-spread transform because it can overwrite accessors used by
    // Effect runtime values.
    assumptions: {
      ignoreFunctionLength: false,
      objectRestNoSymbols: false,
      pureGetters: false,
      setSpreadProperties: false,
    },
    plugins: [['@babel/plugin-transform-object-rest-spread', { useBuiltIns: false }]],
    presets: ['babel-preset-expo'],
  };
};
