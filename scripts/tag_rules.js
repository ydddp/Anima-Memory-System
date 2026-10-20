// The editor compiles to the existing storage format; viewing never migrates rules.
const escapeLiteral = text => text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')
  .replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t');

function splitExpression(value) {
  const text = String(value || '').trim();
  const match = text.match(/^\/(.+)\/([a-z]*)$/);
  return match ? { pattern: match[1], flags: match[2] } : { pattern: text, flags: 'g' };
}

function decodeLiteral(pattern) {
  let text = '';
  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i];
    if (char === '\\') {
      const next = pattern[++i];
      if (next && '.*+?^${}()|[]\\/<>-'.includes(next)) text += next;
      else if (next === 'n') text += '\n';
      else if (next === 'r') text += '\r';
      else if (next === 't') text += '\t';
      else return null;
    } else {
      if ('.*+?^${}()|[]'.includes(char)) return null;
      text += char;
    }
  }
  return text.trim() ? text : null;
}

export function describeTagRule(rule) {
  const { pattern, flags } = splitExpression(rule.regex);
  if (/[^gs]/.test(flags) || new Set(flags).size !== flags.length) return null;
  const type = rule.type === 'exclude' ? 'exclude' : 'extract';
  if (type === 'exclude') {
    const shapes = [
      ['before', '^[\\s\\S]*?', ''],
      ['after', '', '[\\s\\S]*$'],
    ];
    for (const [operation, prefix, suffix] of shapes) {
      if (!pattern.startsWith(prefix) || !pattern.endsWith(suffix)) continue;
      const tag = decodeLiteral(pattern.slice(prefix.length, suffix ? -suffix.length : undefined));
      if (tag && !/[\r\n]/.test(tag)) return { operation, tag, type, flags };
    }
  }
  const bodies = type === 'extract'
    ? ['([\\s\\S]*?)', ...(flags.includes('s') ? ['(.*?)'] : [])]
    : ['([\\s\\S]*?)', '[\\s\\S]*?', ...(flags.includes('s') ? ['(.*?)', '.*?'] : [])];
  for (const body of bodies) {
    const at = pattern.indexOf(body);
    if (at < 0) continue;
    const start = decodeLiteral(pattern.slice(0, at));
    const end = decodeLiteral(pattern.slice(at + body.length));
    // Single-line label inputs cannot faithfully display newline delimiters.
    if (start && end && !/[\r\n]/.test(start + end)) return { operation: type, start, end, type, body, flags };
  }
  return null;
}

export function compileTagRule({ start, end, tag, type, operation = type }, original) {
  const previous = original && describeTagRule(original);
  const flags = previous?.flags || 'g';
  if (operation === 'before' || operation === 'after') {
    if (!tag?.trim()) throw new Error('请填写标签');
    const literal = escapeLiteral(tag);
    const pattern = operation === 'before' ? `^[\\s\\S]*?${literal}` : `${literal}[\\s\\S]*$`;
    return { regex: `/${pattern}/${flags}`, type: 'exclude' };
  }
  if (!start?.trim() || !end?.trim()) throw new Error('请填写开始标签和结束标签');
  type = operation === 'exclude' ? 'exclude' : 'extract';
  const body = previous?.operation === operation ? previous.body
    : type === 'exclude' ? '[\\s\\S]*?' : '([\\s\\S]*?)';
  return { regex: `/${escapeLiteral(start)}${body}${escapeLiteral(end)}/${flags}`, type };
}

export function saveRuleForm(form, original) {
  if (form.mode === 'custom') {
    if (!form.regex?.trim()) throw new Error('正则不能为空');
    const { pattern, flags } = splitExpression(form.regex);
    try { new RegExp(pattern, flags); }
    catch { throw new Error('正则表达式无效，请检查表达式和标志'); }
    return { regex: form.regex, type: form.type };
  }
  const previous = original && describeTagRule(original);
  const operation = form.operation || form.type;
  const keys = operation === 'before' || operation === 'after' ? ['tag'] : ['start', 'end'];
  if (previous && previous.operation === operation && keys.every(key => previous[key] === form[key])) {
    return { regex: original.regex, type: original.type };
  }
  return compileTagRule(form, original);
}
