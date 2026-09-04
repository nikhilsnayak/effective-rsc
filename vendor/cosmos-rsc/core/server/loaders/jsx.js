import babel from '@babel/core';

export async function load(url, context, defaultLoad) {
  const result = await defaultLoad(url, context, defaultLoad);
  if (result.format === 'module') {
    const newResult = await babel.transformAsync(result.source, {
      filename: url,
      ignore: [/\/(.cosmos-rsc|node_modules)\//],
      presets: [['@babel/preset-react', { runtime: 'automatic' }]],
    });
    if (!newResult) {
      if (typeof result.source === 'string') {
        return result;
      }
      return {
        source: Buffer.from(result.source).toString('utf8'),
        format: 'module',
      };
    }
    return { source: newResult.code, format: 'module' };
  }
  return defaultLoad(url, context, defaultLoad);
}
