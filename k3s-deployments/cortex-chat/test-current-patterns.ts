/**
 * Test current patterns from issue-detector.ts
 */

const testResponse = `Your k3s cluster is looking **pretty healthy overall**! Here's the summary:

## **Issues to Address:**

1. **CrashLoopBackOff**:
   - \`cortex-queue-worker-6764dc75cf-lxj9b\` (cortex-queue) - 377 restarts, currently crashing
   - Another queue worker has 378 restarts but is running

2. **ContainerCreating** (stuck):
   - \`sandfly-server-0\` (sandfly) - stuck for 5 minutes
   - Need to investigate PVC or image pull issues`;

console.log('Testing CURRENT patterns from issue-detector.ts...\n');
console.log('Text length:', testResponse.length);
console.log('Contains ContainerCreating:', testResponse.includes('ContainerCreating'));
console.log('Contains CrashLoopBackOff:', testResponse.includes('CrashLoopBackOff'));

// Current Pattern 1: ContainerCreating
const currentPattern1 = /^\s*[\d\.•\-\*]*\s*([a-z0-9\-]+)\s+\(([a-z\-]+)\)\s+\-\s+ContainerCreating(?:\s+for\s+\S+)?/gim;
console.log('\n--- Current Pattern 1 (ContainerCreating) ---');
console.log('Pattern:', currentPattern1.source);
let match;
let matchCount = 0;
while ((match = currentPattern1.exec(testResponse)) !== null) {
  matchCount++;
  console.log('  MATCH', matchCount, ':', match[1], 'in namespace', match[2]);
}
console.log('Total matches:', matchCount);

// Current Pattern 2: CrashLoopBackOff
const currentPattern2 = /^\s*[\d\.•\-\*]*\s*([a-z0-9\-]+)\s+\-\s+CrashLoopBackOff/gim;
console.log('\n--- Current Pattern 2 (CrashLoopBackOff) ---');
console.log('Pattern:', currentPattern2.source);
matchCount = 0;
while ((match = currentPattern2.exec(testResponse)) !== null) {
  matchCount++;
  console.log('  MATCH', matchCount, ':', match[1]);
}
console.log('Total matches:', matchCount);

// Test line by line to understand structure
console.log('\n--- Analyzing lines ---\n');
const lines = testResponse.split('\n');
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (line.includes('ContainerCreating') || line.includes('CrashLoopBackOff') || line.includes('cortex-queue-worker') || line.includes('sandfly-server')) {
    console.log(`Line ${i}: "${line}"`);
    console.log(`  Starts with whitespace+bullet: ${/^\s*[\d\.•\-\*]/.test(line)}`);
    console.log(`  Has backticks: ${line.includes('\`')}`);
  }
}
