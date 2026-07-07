const tests = [];
export function test(name, fn) { tests.push({ name, fn }); }

export async function run() {
  let passed = 0, failed = 0;
  for (const { name, fn } of tests) {
    try { await fn(); console.log(`  ok   ${name}`); passed++; }
    catch (e) { console.error(`  FAIL ${name}\n       ${e.stack}`); failed++; }
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) {process.exit(1);}
}
