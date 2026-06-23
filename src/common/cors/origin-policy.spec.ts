import { buildWebSocketCorsOptions, createOriginChecker, parseOriginList } from './origin-policy';

describe('origin-policy', () => {
  it('parses comma-separated origins and trims blanks', () => {
    expect(parseOriginList(' https://a.example , ,https://b.example ')).toEqual([
      'https://a.example',
      'https://b.example',
    ]);
  });

  it('allows only listed origins', () => {
    const checker = createOriginChecker(['https://pwa.example']);
    const callback = jest.fn();

    checker('https://pwa.example', callback);
    checker('https://evil.example', callback);

    expect(callback).toHaveBeenNthCalledWith(1, null, true);
    expect(callback).toHaveBeenNthCalledWith(2, null, false);
  });

  it('fails closed in production when the allowlist is empty', () => {
    expect(() => buildWebSocketCorsOptions('', 'production')).toThrow(
      /ALLOWED_ORIGINS must list at least one origin/i,
    );
  });

  it('allows same-origin requests without an Origin header', () => {
    const checker = createOriginChecker([]);
    const callback = jest.fn();

    checker(undefined, callback);

    expect(callback).toHaveBeenCalledWith(null, true);
  });
});
