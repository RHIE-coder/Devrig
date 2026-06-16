#!/usr/bin/env node

const args = process.argv.slice(2);
const command = args[0];

if (command === 'greet') {
  const name = args[1] || 'world';
  console.log(`Hello, ${name}!`);
} else if (command === 'version') {
  console.log('1.0.0');
} else {
  console.error('Usage: mycli <greet|version>');
  process.exit(1);
}
