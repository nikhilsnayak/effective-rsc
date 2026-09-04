// oxlint-disable effecttsgo/async-function -- Playwright owns this Promise-based application-test boundary.
import type { APIRequestContext } from '@playwright/test';

export const getText = async (
  request: APIRequestContext,
  pathname: string,
  headers?: Readonly<Record<string, string>>,
) => {
  const response = await request.get(pathname, headers === undefined ? {} : { headers });

  return {
    body: await response.text(),
    response,
  } as const;
};
