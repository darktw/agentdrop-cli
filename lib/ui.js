// Terminal formatting — zero dependencies

const GOLD = '\x1b[33m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';
const CYAN = '\x1b[36m';

export function gold(s) { return GOLD + s + RESET; }
export function red(s) { return RED + s + RESET; }
export function green(s) { return GREEN + s + RESET; }
export function dim(s) { return DIM + s + RESET; }
export function bold(s) { return BOLD + s + RESET; }
export function cyan(s) { return CYAN + s + RESET; }

export function logo() {
  return bold('Agent') + gold('Drop');
}

export function error(msg) {
  console.error(red('error') + ' ' + msg);
}

export function success(msg) {
  console.log(green('✓') + ' ' + msg);
}

export function info(msg) {
  console.log(dim('→') + ' ' + msg);
}

export function table(rows, headers) {
  if (rows.length === 0) return;

  // Calculate column widths
  const cols = headers.length;
  const widths = headers.map((h, i) => {
    const max = Math.max(h.length, ...rows.map(r => String(r[i] || '').length));
    return Math.min(max, 40);
  });

  // Header
  const headerLine = headers.map((h, i) => h.padEnd(widths[i])).join('  ');
  console.log(bold(headerLine));
  console.log(dim('─'.repeat(headerLine.length)));

  // Rows
  for (const row of rows) {
    const line = row.map((cell, i) => String(cell || '').padEnd(widths[i])).join('  ');
    console.log(line);
  }
}

export function bar(value, max, width = 20) {
  const filled = Math.round((value / max) * width);
  return gold('█'.repeat(filled)) + dim('░'.repeat(width - filled));
}

// Read a line from stdin
export function prompt(question) {
  return new Promise((resolve) => {
    process.stdout.write(question);
    let data = '';
    process.stdin.setEncoding('utf-8');
    process.stdin.resume();
    process.stdin.once('data', (chunk) => {
      process.stdin.pause();
      resolve(chunk.trim());
    });
  });
}

// Read password (hidden input)
export function promptSecret(question) {
  return new Promise((resolve) => {
    process.stdout.write(question);
    const stdin = process.stdin;
    stdin.setEncoding('utf-8');
    stdin.setRawMode(true);
    stdin.resume();
    let input = '';
    stdin.on('data', function handler(ch) {
      const c = ch.toString();
      if (c === '\n' || c === '\r') {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.removeListener('data', handler);
        process.stdout.write('\n');
        resolve(input);
      } else if (c === '\x7f' || c === '\b') {
        if (input.length > 0) {
          input = input.slice(0, -1);
          process.stdout.write('\b \b');
        }
      } else if (c === '\x03') {
        process.exit(0);
      } else {
        input += c;
        process.stdout.write('*');
      }
    });
  });
}
