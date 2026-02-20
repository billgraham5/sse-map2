#!/usr/bin/env node

function normalizeHeading(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function parseIssueFormBody(body) {
  const result = {};
  if (!body || typeof body !== 'string') return result;

  const lines = body.replace(/\r\n/g, '\n').split('\n');
  let currentKey = null;
  let buffer = [];

  const flush = () => {
    if (!currentKey) return;
    const raw = buffer.join('\n').trim();
    const clean = raw
      .replace(/^_No response_$/i, '')
      .replace(/^- \[(?:x|X)\]\s*/gm, '')
      .trim();

    result[currentKey] = {
      raw,
      value: clean,
      checked: /- \[(?:x|X)\]/.test(raw),
    };
  };

  for (const line of lines) {
    if (line.startsWith('### ')) {
      flush();
      currentKey = normalizeHeading(line.slice(4));
      buffer = [];
      continue;
    }

    if (line.trim() === '---') {
      continue;
    }

    if (currentKey) {
      buffer.push(line);
    }
  }

  flush();
  return result;
}

module.exports = {
  parseIssueFormBody,
};

if (require.main === module) {
  const body = process.argv.slice(2).join(' ');
  process.stdout.write(`${JSON.stringify(parseIssueFormBody(body), null, 2)}\n`);
}
