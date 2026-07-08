type TestFn = () => void | Promise<void>;
const tests: { name: string; fn: TestFn }[] = [];

export function test(name: string, fn: TestFn): void {
  tests.push({ name, fn });
}

export async function run(): Promise<void> {
  let passed = 0,
    failed = 0;
  for (const { name, fn } of tests) {
    try {
      await fn();
      console.log(`  ok   ${name}`);
      passed++;
    } catch (e) {
      console.error(`  FAIL ${name}\n       ${(e as Error).stack}`);
      failed++;
    }
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) {
    process.exit(1);
  }
}
