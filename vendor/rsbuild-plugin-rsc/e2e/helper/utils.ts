import fs from 'node:fs';
import path, { join } from 'node:path';
import { URL } from 'node:url';
import { inspect } from 'node:util';
import { originalPositionFor, TraceMap } from '@jridgewell/trace-mapping';
import { logger, type RsbuildPlugin } from '@rsbuild/core';
import { getRandomPort, toPosixPath, waitFor } from '@rstackjs/test-utils';
import type { Page } from 'playwright';

export {
  findFile,
  getDistFiles,
  getFileContent,
  normalizeEol as normalizeNewlines,
  readDirContents,
} from '@rstackjs/test-utils';
export { getRandomPort, toPosixPath, waitFor };

/**
 * Build an URL based on the entry name and port
 */
export const buildEntryUrl = (entryName: string, port: number) => {
  const htmlRoot = new URL(`http://localhost:${port}`);
  const homeUrl = new URL(`${entryName}.html`, htmlRoot);
  return homeUrl.href;
};

/**
 * Build the entry URL and navigate to it
 */
export const gotoPage = async (
  page: Page,
  rsbuild: { port: number },
  path = 'index',
  { hash = '' } = {},
) => {
  const url = `${buildEntryUrl(path, rsbuild.port)}${hash ? `#${hash}` : ''}`;
  return page.goto(url);
};

export const noop = async () => {};

export const recordPluginHooks = () => {
  const hooks: string[] = [];

  const plugin: RsbuildPlugin = {
    name: 'record-hooks-plugin',
    setup(api) {
      api.modifyRspackConfig(() => {
        hooks.push('ModifyBundlerConfig');
      });
      api.modifyRsbuildConfig(() => {
        hooks.push('ModifyRsbuildConfig');
      });
      api.modifyEnvironmentConfig(() => {
        hooks.push('ModifyEnvironmentConfig');
      });
      api.modifyBundlerChain(() => {
        hooks.push('ModifyBundlerChain');
      });
      api.modifyHTML((html) => {
        hooks.push('ModifyHTML');
        return html;
      });
      api.modifyHTMLTags((tags) => {
        hooks.push('ModifyHTMLTags');
        return tags;
      });
      api.onBeforeStartDevServer(() => {
        hooks.push('BeforeStartDevServer');
      });
      api.onAfterStartDevServer(() => {
        hooks.push('AfterStartDevServer');
      });
      api.onBeforeCreateCompiler(() => {
        hooks.push('BeforeCreateCompiler');
      });
      api.onAfterCreateCompiler(() => {
        hooks.push('AfterCreateCompiler');
      });
      api.onBeforeBuild(() => {
        hooks.push('BeforeBuild');
      });
      api.onBeforeDevCompile(() => {
        hooks.push('BeforeDevCompile');
      });
      api.onAfterBuild(() => {
        hooks.push('AfterBuild');
      });
      api.onBeforeEnvironmentCompile(() => {
        hooks.push('BeforeEnvironmentCompile');
      });
      api.onAfterEnvironmentCompile(() => {
        hooks.push('AfterEnvironmentCompile');
      });
      api.onBeforeStartPreviewServer(() => {
        hooks.push('BeforeStartPreviewServer');
      });
      api.onCloseDevServer(() => {
        hooks.push('CloseDevServer');
      });
      api.onAfterStartPreviewServer(() => {
        hooks.push('AfterStartPreviewServer');
      });
      api.onAfterDevCompile(() => {
        hooks.push('AfterDevCompile');
      });
      api.onDevCompileDone(() => {
        hooks.push('DevCompileDone');
      });
      api.onCloseBuild(() => {
        hooks.push('CloseBuild');
      });
    },
  };

  return { plugin, hooks };
};

export async function mapSourceMapPositions(
  rawSourceMap: string,
  generatedPositions: {
    line: number;
    column: number;
  }[],
) {
  const tracer = new TraceMap(rawSourceMap);
  const originalPositions = generatedPositions.map((generatedPosition) =>
    originalPositionFor(tracer, {
      line: generatedPosition.line,
      column: generatedPosition.column,
    }),
  );

  return originalPositions;
}

export const enableDebugMode = () => {
  process.env.DEBUG = 'rsbuild';
  const { level } = logger;
  logger.level = 'verbose';
  return () => {
    delete process.env.DEBUG;
    logger.level = level;
  };
};

// This goes straight to Node’s stdout, avoiding Rslib's verbose output:
export const debugPrint = (...args: unknown[]) => {
  const prettyArgs = args
    .map((arg) =>
      typeof arg === 'string'
        ? arg
        : inspect(arg, { colors: process.stdout.isTTY }),
    )
    .join(' ');

  const timestamp = new Date().toISOString().split('T')[1];

  return process.stdout.write(`[${timestamp}] ${prettyArgs}\n`);
};

export async function retry<T>(
  fn: () => T | Promise<T>,
  duration: number = 3000,
  interval: number = 500,
  description?: string,
): Promise<T> {
  if (duration % interval !== 0) {
    throw new Error(
      `invalid duration ${duration} and interval ${interval} mix, duration must be evenly divisible by interval`,
    );
  }

  for (let i = duration; i >= 0; i -= interval) {
    try {
      return await fn();
    } catch (err) {
      if (i === 0) {
        console.error(
          `Failed to retry${
            description ? ` ${description}` : ''
          } within ${duration}ms`,
        );
        throw err;
      }
      debugPrint(
        `Retrying${description ? ` ${description}` : ''} in ${interval}ms`,
      );
      await waitFor(interval);
    }
  }

  throw new Error('Duration cannot be less than 0.');
}

export async function patchFile(
  outputPath: string,
  content: string | ((content: string | undefined) => string),
  runWithTempContent?: (context: { newFile: boolean }) => Promise<void>,
): Promise<{ newFile: boolean }> {
  const newFile = !fs.existsSync(outputPath);
  await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });
  const previousContent = newFile
    ? undefined
    : await fs.promises.readFile(outputPath, 'utf-8');

  await fs.promises.writeFile(
    outputPath,
    typeof content === 'function' ? content(previousContent) : content,
    {
      flush: true,
    },
  );

  if (runWithTempContent) {
    try {
      await runWithTempContent({ newFile });
    } finally {
      if (previousContent === undefined) {
        await fs.promises.rm(outputPath);
      } else {
        await fs.promises.writeFile(outputPath, previousContent, {
          flush: true,
        });
      }
    }
  }

  return { newFile };
}
