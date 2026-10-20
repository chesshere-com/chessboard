import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const css = readFileSync(new URL('../assets/piece-sets.css', import.meta.url), 'utf8');

test('every piece-set url is relative and points at a bundled file', () => {
  const urls = [...css.matchAll(/url\("([^"]+)"\)/g)].map(match => match[1]);
  assert.equal(urls.length, 12 * 12);
  for (const url of urls) {
    assert.match(url, /^\.\.\/pieces\//, url);
    assert.ok(existsSync(new URL(`../assets/${url}`, import.meta.url)), `${url} exists`);
  }
});
