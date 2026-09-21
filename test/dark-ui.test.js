import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../theme.js', import.meta.url), 'utf8');
function loadTheme(mode) {
  const styles = [];
  const document = { documentElement: { dataset: {} }, createElement: () => ({}), head: { appendChild: el => styles.push(el) } };
  vm.runInNewContext(source, { document, localStorage: { getItem: () => mode }, window: { addEventListener() {} } });
  return { document, css: styles.find(style => style.id === 'dark-ui-contrast').textContent };
}
function contrast(a, b) {
  const luminance = hex => hex.match(/[\da-f]{2}/gi).map(part => parseInt(part, 16) / 255)
    .map(c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
    .reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

test('다크 UI 보정은 화면과 다크모드에만 적용한다', () => {
  const { css, document } = loadTheme('dark');
  assert.equal(document.documentElement.dataset.theme, 'dark');
  assert.equal(loadTheme('light').document.documentElement.dataset.theme, 'light');
  assert.match(css, /^@media screen/);
  const selectors = [...css.matchAll(/([^{}]+)\{[^{}]*\}/g)].map(match => match[1]);
  for (const group of selectors) {
    for (const selector of group.split(',')) assert.match(selector.trim(), /^html\[data-theme="dark"\]/);
  }
  assert.doesNotMatch(css, /\.sheet|\.slot|\.seat-card|\.layout-area|--theme-/);
});

test('보정된 버튼과 안내 상자는 일반 글자 대비 4.5:1 이상이다', () => {
  const { css } = loadTheme('dark');
  let checked = 0;
  for (const match of css.matchAll(/\{([^{}]+)\}/g)) {
    const background = match[1].match(/(?:^|;)\s*background:(#[\da-f]{6})!important/i);
    const foreground = match[1].match(/(?:^|;)\s*color:(#[\da-f]{6}|#fff)!important/i);
    if (!background || !foreground) continue;
    const color = foreground[1] === '#fff' ? '#FFFFFF' : foreground[1];
    assert.ok(contrast(background[1], color) >= 4.5, `${background[1]} / ${color}`);
    checked++;
  }
  assert.ok(checked >= 10);
  for (const foreground of ['#FFACB5', '#A9CEFF', '#B8C6DF', '#9BAAC2']) {
    assert.ok(contrast('#1A2233', foreground) >= 4.5);
  }
});

test('특수 설정 안내와 선택·미리보기 상태를 따로 표시한다', () => {
  const page = readFileSync(new URL('../seating.html', import.meta.url), 'utf8');
  assert.equal((page.match(/class="special-hint"/g) || []).length, 3);
  const { css } = loadTheme('dark');
  assert.match(css, /#specialModal \.zone-cell\.on/);
  assert.match(css, /#specialModal \.zone-cell\.preview/);
  assert.match(css, /#specialModal \.spec-tab\.active/);
  assert.match(css, /button:focus-visible/);
  assert.match(page, /b\.classList\.remove\('active'\)/);
  assert.match(page, /btn\.classList\.add\('active'\)/);
});
