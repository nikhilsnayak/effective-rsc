//https://x.com/colinhacks/status/1865002498332795032/photo/1
function lazy(getter) {
  return {
    get value() {
      const value = getter();
      Object.defineProperty(this, 'value', { value });
      return value;
    },
  };
}

function getCookieString(cookiesEntries) {
  return cookiesEntries
    .map(([key, cookie]) => {
      const { value, ...options } = cookie;
      const optionsString = Object.entries(options)
        .map(([optionKey, optionValue]) => {
          if (optionKey === 'httpOnly') {
            return optionValue ? 'HttpOnly' : '';
          }
          if (optionKey === 'secure') {
            return optionValue ? 'Secure' : '';
          }
          if (optionKey === 'expires' && optionValue instanceof Date) {
            return `Expires=${optionValue.toUTCString()}`;
          }
          if (optionKey === 'maxAge') {
            return `Max-Age=${optionValue}`;
          }
          if (optionKey === 'domain') {
            return `Domain=${optionValue}`;
          }
          if (optionKey === 'path') {
            return `Path=${optionValue}`;
          }
          if (optionKey === 'sameSite') {
            return `SameSite=${optionValue}`;
          }
          return '';
        })
        .filter(Boolean)
        .join('; ');

      return `${key}=${value}${optionsString ? `; ${optionsString}` : ''}`;
    })
    .join('; ');
}

module.exports = { lazy, getCookieString };
