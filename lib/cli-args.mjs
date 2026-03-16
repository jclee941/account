export function parseCliArgs(argv = process.argv.slice(2)) {
  const help = argv.includes('--help') || argv.includes('-h');
  const headed = argv.includes('--headed');
  const batch = argv.includes('--batch');
  const positional = argv.filter((arg) => !arg.startsWith('--'));
  const first = positional[0] || '';
  const emails = batch
    ? first.split(',').map((email) => email.trim()).filter(Boolean)
    : (first ? [first] : []);
  const password = positional[1] || '';

  return { help, headed, batch, positional, emails, password };
}

export function printUsageBase(scriptName, extraLines = []) {
  console.log(`Usage: node ${scriptName} <email> <password> [--headed]`);
  console.log(`       node ${scriptName} --batch <email1,email2,...> <password> [--headed]`);
  console.log(`       node ${scriptName} --help`);
  if (extraLines.length > 0) {
    console.log('');
    for (const line of extraLines) {
      console.log(line);
    }
  }
}
