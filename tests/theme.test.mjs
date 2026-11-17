import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import postcss from 'postcss';

const css = postcss.parse(readFileSync('app/globals.css', 'utf8'));
function declaration(selector, property) {
  let value;
  css.walkRules(rule => {
    if (rule.selectors.includes(selector)) rule.walkDecls(property, decl => { value = decl.value; });
  });
  return value;
}
function resolve(value, dark) {
  assert.ok(value, 'Missing color declaration');
  return value.replace(/var\((--[\w-]+)\)/g, (_, token) => resolve((dark && declaration('.dark', token)) || declaration(':root', token), dark));
}
function luminance(color) {
  const hex = color.replace('#', '');
  const rgb = (hex.length === 3 ? [...hex].map(c => c + c).join('') : hex).match(/../g).map(c => parseInt(c, 16) / 255);
  return rgb.map(c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4).reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
}
function contrast(a, b) {
  const [lo, hi] = [luminance(a), luminance(b)].sort((x, y) => x - y);
  return (hi + 0.05) / (lo + 0.05);
}

for (const dark of [false, true]) {
  test(`${dark ? 'dark' : 'light'} theme gives inherited headings a readable foreground`, () => {
    // Without a shell foreground, headings inherit the already-computed light body color.
    const color = declaration('.app-shell', 'color');
    const actual = color ? resolve(color, dark) : resolve(declaration('body', 'color'), false);
    assert.ok(contrast(actual, resolve('var(--surface)', dark)) >= 4.5);
  });
  test(`${dark ? 'dark' : 'light'} theme keeps secondary text readable on panels`, () => {
    assert.ok(contrast(resolve('var(--muted)', dark), resolve('var(--surface)', dark)) >= 4.5);
  });
  test(`${dark ? 'dark' : 'light'} theme pairs speaking metric text with its own panel`, () => {
    assert.ok(contrast(resolve(declaration('.speaking-metrics strong', 'color'), dark), resolve(declaration('.speaking-metrics > div', 'background'), dark)) >= 4.5);
  });
  test(`${dark ? 'dark' : 'light'} theme keeps lesson rail controls visible`, () => {
    assert.ok(contrast(resolve(declaration('.rail-controls button', 'color'), dark), resolve(declaration('.rail-controls button', 'background'), dark)) >= 4.5);
  });
}
