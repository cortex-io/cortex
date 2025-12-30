/**
 * Test improved patterns that match actual Cortex response format
 */

const testResponse = `Your k3s cluster is looking **pretty healthy overall**! Here's the summary:

## **Issues to Address:**

1. **CrashLoopBackOff**:
   - \`cortex-queue-worker-6764dc75cf-lxj9b\` (cortex-queue) - 377 restarts, currently crashing
   - Another queue worker has 378 restarts but is running

2. **ContainerCreating** (stuck):
   - \`sandfly-server-0\` (sandfly) - stuck for 5 minutes
   - Need to investigate PVC or image pull issues

3. **ImagePullBackOff**:
   - \`test-pod-123\` (default) - can't pull image from registry`;

console.log('Testing IMPROVED patterns...\n');

// Improved approach: Extract multi-line issue blocks
function extractIssueBlocks(text: string): Array<{ type: string; lines: string[] }> {
  const blocks: Array<{ type: string; lines: string[] }> = [];
  const lines = text.split('\n');

  let currentBlock: { type: string; lines: string[] } | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check if this is an issue header
    const headerMatch = /^\s*\d+\.\s*\*\*([^*]+)\*\*/.exec(line);
    if (headerMatch) {
      // Save previous block if exists
      if (currentBlock) {
        blocks.push(currentBlock);
      }

      // Start new block
      const issueType = headerMatch[1].trim();
      currentBlock = { type: issueType, lines: [line] };
      continue;
    }

    // If we're in a block, add the line
    if (currentBlock) {
      // Stop block if we hit an empty line or next header
      if (!line.trim() || /^\s*\d+\.\s*\*\*/.test(line)) {
        blocks.push(currentBlock);
        currentBlock = null;
        continue;
      }
      currentBlock.lines.push(line);
    }
  }

  // Add final block
  if (currentBlock) {
    blocks.push(currentBlock);
  }

  return blocks;
}

const blocks = extractIssueBlocks(testResponse);
console.log('Extracted', blocks.length, 'issue blocks:\n');

// Pattern to extract pod details from bullet lines
const podPattern = /`([a-z0-9\-]+)`\s*\(([a-z\-]+)\)/;

for (const block of blocks) {
  console.log(`--- ${block.type} ---`);
  console.log('Lines:', block.lines.length);

  // Find pod references in this block
  for (const line of block.lines) {
    const match = podPattern.exec(line);
    if (match) {
      console.log(`  Found pod: ${match[1]} in namespace ${match[2]}`);
      console.log(`    Full line: ${line.trim()}`);

      // Check for restart count
      const restartMatch = /(\d+)\s+restarts?/i.exec(line);
      if (restartMatch) {
        console.log(`    Restart count: ${restartMatch[1]}`);
      }
    }
  }
  console.log();
}

console.log('\n--- Final Detection Results ---\n');

// Simulate what the improved detector would find
const issues = [];

for (const block of blocks) {
  for (const line of block.lines) {
    const podMatch = podPattern.exec(line);
    if (podMatch) {
      const podName = podMatch[1];
      const namespace = podMatch[2];

      // Map issue type
      let issueType = 'other';
      let severity: 'minor' | 'moderate' | 'critical' = 'minor';

      if (block.type.includes('ContainerCreating') || block.type.includes('stuck')) {
        issueType = 'pod_stuck';
        severity = 'minor';
      } else if (block.type.includes('CrashLoopBackOff') || block.type.includes('crash')) {
        issueType = 'crash_loop';
        severity = 'moderate';

        // Check restart count for severity
        const restartMatch = /(\d+)\s+restarts?/i.exec(line);
        if (restartMatch && parseInt(restartMatch[1]) >= 100) {
          severity = 'moderate';
        }
      } else if (block.type.includes('ImagePull')) {
        issueType = 'image_pull_error';
        severity = 'moderate';
      }

      issues.push({
        type: issueType,
        severity,
        podName,
        namespace,
        title: `${block.type}: ${podName}`,
        line: line.trim()
      });
    }
  }
}

console.log(`Detected ${issues.length} issues:`);
for (const issue of issues) {
  console.log(`  - [${issue.severity}] ${issue.type}: ${issue.podName} (${issue.namespace})`);
}
