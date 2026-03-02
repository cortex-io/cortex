/**
 * Test script to verify issue detection patterns
 */

// Sample response based on logs
const testResponse = `Your k3s cluster is looking **pretty healthy overall**! Here's the summary:

## **Cluster Overview**
- **7 nodes** total (3 masters + 4 workers) - all **Ready**
- Running **k3s v1.33.6+k3s1** on Ubuntu

## **Issues to Address:**

1. **CrashLoopBackOff**:
   - \`cortex-queue-worker-6764dc75cf-lxj9b\` (cortex-queue) - 377 restarts, currently crashing
   - Another queue worker has 378 restarts but is running

2. **ContainerCreating** (stuck):
   - \`sandfly-server-0\` (sandfly) - stuck for 5 minutes
   - Need to investigate PVC or image pull issues

## **Everything Else Looks Good:**
- Most deployments running smoothly
- Monitoring stack healthy
- Network policies in place`;

// Test regex patterns
console.log('Testing issue detection patterns...\n');

// Pattern 1: ContainerCreating with backticks and namespace
const pattern1 = /^\s*[\d\.•\-\*]*\s*`([a-z0-9\-]+)`\s*\(([a-z\-]+)\)\s*\-.*(?:stuck|ContainerCreating)/gim;
console.log('Pattern 1 (backtick format with namespace):');
let match;
while ((match = pattern1.exec(testResponse)) !== null) {
  console.log('  MATCH:', match[1], 'in namespace', match[2]);
}

// Pattern 2: CrashLoopBackOff with backticks
const pattern2 = /^\s*[\d\.•\-\*]*\s*`([a-z0-9\-]+)`\s*\(([a-z\-]+)\)\s*\-.*(?:CrashLoopBackOff|crashing)/gim;
console.log('\nPattern 2 (CrashLoopBackOff with namespace):');
while ((match = pattern2.exec(testResponse)) !== null) {
  console.log('  MATCH:', match[1], 'in namespace', match[2]);
}

// Pattern 3: Extract from bullet points under "Issues" section
const issuesSection = testResponse.match(/Issues to Address:[\s\S]*?(?=\n\n##|$)/)?.[0] || '';
console.log('\nExtracted Issues section:');
console.log(issuesSection);

// Pattern 4: More flexible - find pod names in backticks within issues section
const pattern4 = /`([a-z0-9\-]+)`\s*\(([a-z\-]+)\)/gi;
console.log('\nPattern 4 (flexible backtick extraction):');
while ((match = pattern4.exec(issuesSection)) !== null) {
  console.log('  MATCH:', match[1], 'in namespace', match[2]);
}

console.log('\n--- Testing line-by-line matching ---\n');

// Split into lines and match
const lines = issuesSection.split('\n');
for (const line of lines) {
  if (line.includes('ContainerCreating') || line.includes('stuck') || line.includes('CrashLoopBackOff') || line.includes('crashing')) {
    console.log('Issue line:', line.trim());

    // Extract pod and namespace from backticks
    const podMatch = /`([a-z0-9\-]+)`\s*\(([a-z\-]+)\)/.exec(line);
    if (podMatch) {
      console.log('  -> Pod:', podMatch[1], 'Namespace:', podMatch[2]);
    }
  }
}
