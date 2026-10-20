const test = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

(async () => {
  const root = path.resolve(__dirname, '..');
  const { compileTagRule, describeTagRule, saveRuleForm } = await import(pathToFileURL(path.join(root, 'scripts/tag_rules.js')));
  const { applyRegexRules } = await import(pathToFileURL(path.join(root, 'scripts/utils.js')));
  const cases = [
    ['multiline and repeated bodies', '<body>', '</body>', 'before<body> one\ntwo </body>gap<body>three</body>after', 'one\ntwo\nthree'],
    ['literal regex metacharacters', '[a.+?]', '($end)', 'skip[a.+?]yes\nindeed($end)skip', 'yes\nindeed'],
    ['slashes and backslashes', 'c:\\start/', '/end\\', 'c:\\start/value/end\\', 'value'],
    ['unicode and whitespace', '【 开始 】', '【 结束 】', '【 开始 】正文【 结束 】', '正文'],
  ];
  for (const [name, start, end, input, expected] of cases) {
    test(name, () => {
      const rule = compileTagRule({ start, end, type: 'extract' });
      assert.equal(applyRegexRules(input, [rule]), expected);
      assert.equal(describeTagRule(rule).start, start);
      assert.equal(describeTagRule(rule).end, end);
    });
  }
  test('delete entire blocks and preserve surrounding text', () => {
    const rule = compileTagRule({ start: '<think>', end: '</think>', type: 'exclude' });
    assert.equal(applyRegexRules('a<think>hidden\ntext</think>b<think>more</think>c', [rule]), 'abc');
    assert.equal(describeTagRule(rule).type, 'exclude');
  });
  const legacy = [
    { type: 'exclude', regex: ' /^[\\s\\S]*?<mark>/g ' },
    { type: 'exclude', regex: '/<mark>[\\s\\S]*$/gs' },
    { regex: '/<content>([\\s\\S]*?)<\\/content>/g' },
    { type: 'extract', regex: ' /<content>(.*?)<\\/content>/gs ', enabled: false, extra: 7 },
    { type: 'extract', regex: '<content>([\\s\\S]*?)</content>' },
    { type: 'exclude', regex: '/<!--([\\s\\S]*?)-->/g' },
    { type: 'exclude', regex: '/<!--.*?-->/sg' },
  ];
  for (const rule of legacy) test(`legacy no-op is exact: ${rule.regex}`, () => {
    const snapshot = JSON.stringify(rule);
    const form = describeTagRule(rule);
    assert(form);
    assert.equal(JSON.stringify(rule), snapshot, 'recognition must not mutate stored data');
    assert.deepEqual(saveRuleForm({ ...form, mode: 'tags' }, rule), { regex: rule.regex, type: rule.type });
    const single = form.operation === 'before' || form.operation === 'after';
    const changed = saveRuleForm({ ...form, start: '<new>', ...(single ? { tag: '<new>' } : {}), mode: 'tags' }, rule);
    const input = form.operation === 'before' ? 'value<new>tail'
      : form.operation === 'after' ? 'head<new>value' : '<new>value' + form.end;
    const expected = form.operation === 'before' ? 'tail' : form.operation === 'after' ? 'head'
      : rule.type === 'exclude' ? '' : 'value';
    assert.equal(applyRegexRules(input, [changed]), expected);
  });
  const singleCases = [
    ['before', 'one\ntwo<mark>three<mark>four', 'three<mark>four'],
    ['after', 'one<mark>two\nthree<mark>four', 'one'],
    ['before', '<mark>tail', 'tail'],
    ['after', 'head<mark>', 'head'],
    ['before', 'head<mark>', ''],
    ['after', '<mark>tail', ''],
    ['before', 'missing label', 'missing label'],
    ['after', 'missing label', 'missing label'],
  ];
  for (const [operation, input, expected] of singleCases) test(`${operation}: ${input}`, () => {
    const rule = compileTagRule({ operation, tag: '<mark>' });
    assert.equal(rule.type, 'exclude');
    assert.equal(applyRegexRules(input, [rule]), expected);
    const form = describeTagRule(rule);
    assert.equal(form.operation, operation);
    assert.equal(form.tag, '<mark>');
    assert.deepEqual(saveRuleForm({ ...form, mode: 'tags' }, rule), rule);
  });
  test('single labels are literal and required, and switching operation updates semantics', () => {
    for (const operation of ['before', 'after']) {
      const tag = '[a.+?](/end\\)';
      const rule = compileTagRule({ operation, tag });
      assert.equal(applyRegexRules(`left${tag}right`, [rule]), operation === 'before' ? 'right' : 'left');
      assert.equal(describeTagRule(rule).tag, tag);
      assert.throws(() => compileTagRule({ operation, tag: '  ' }), /标签/);
      const reversed = saveRuleForm({ operation: operation === 'before' ? 'after' : 'before', tag, mode: 'tags' }, rule);
      assert.equal(applyRegexRules(`left${tag}right`, [reversed]), operation === 'before' ? 'left' : 'right');
    }
  });
  for (const regex of [
    '/<content>(.*?)<\\/content>/g', // dot does not match line breaks
    '/<content>([\\s\\S]*)<\\/content>/g', // greedy
    '/<content>([\\s\\S]+?)<\\/content>/g', // nonempty
    '/<content>([\\s\\S]*?)<\\/content>/gi', // case folding
    '/^(<content>)([\\s\\S]*?)<\\/content>$/g',
    '/<(body|content)>([\\s\\S]*?)<\\/\\1>/g',
    '/<content>[\\s\\S]*?<\\/content>/g', // extracts tags too
    '/broken[/g',
    '/^([\\s\\S]*?)<mark>/g', // existing extraction must never become a removal
    '/^[\\s\\S]*?<mark>([\\s\\S]*)$/g',
    '/\\n<content>([\\s\\S]*?)<\\/content>/g', // multiline delimiters need custom editing
  ]) test(`keep custom expression: ${regex}`, () => {
    const rule = { regex, type: 'extract' };
    assert.equal(describeTagRule(rule), null);
  });
  test('custom form preserves text and validates without executing it', () => {
    const regex = ' /(?<name>word)/i ';
    assert.deepEqual(saveRuleForm({ mode: 'custom', regex, type: 'exclude' }), { regex, type: 'exclude' });
    assert.throws(() => saveRuleForm({ mode: 'custom', regex: '/broken[/', type: 'extract' }), /正则/);
  });
  test('deletions run before extraction using the existing engine', () => {
    const extract = compileTagRule({ start: '<body>', end: '</body>', type: 'extract' });
    const exclude = compileTagRule({ start: '<hidden>', end: '</hidden>', type: 'exclude' });
    assert.equal(applyRegexRules('outside<body>a<hidden>secret</hidden>b</body>outside', [extract, exclude]), 'ab');
  });
  test('reject missing labels, allow identical nonempty delimiters', () => {
    for (const start of ['', '  ']) assert.throws(() => compileTagRule({ start, end: '</x>', type: 'extract' }), /标签/);
    assert.throws(() => compileTagRule({ start: '<x>', end: '', type: 'exclude' }), /标签/);
    const rule = compileTagRule({ start: '---', end: '---', type: 'extract' });
    assert.equal(applyRegexRules('---body---', [rule]), 'body');
  });
})();
