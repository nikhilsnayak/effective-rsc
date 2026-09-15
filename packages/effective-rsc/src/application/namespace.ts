export const FrameworkNamespace = '/_ersc';

export const FrameworkAssetNamespace = `${FrameworkNamespace}/assets`;

export const FrameworkAssetPrefix = `${FrameworkAssetNamespace}/` as const;

export const FrameworkQueryPath = `${FrameworkNamespace}/query` as const;

export const FrameworkDevChannelPath = '/_ersc/dev';

export const FrameworkDevSourceMapPath = `${FrameworkDevChannelPath}/source-map` as const;
