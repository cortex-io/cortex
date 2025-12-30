/**
 * Context Analyzer Test
 * Manual test to verify suggestion generation
 */

import { contextAnalyzer } from './context-analyzer';

// Test 1: Network query
console.log('=== Test 1: Network Query ===');
const networkQuery = 'Show me the status of all UniFi access points';
const networkResponse = 'Here are the UniFi access points: AP-Office (online), AP-Bedroom (online)';
const networkSuggestions = contextAnalyzer.analyzeSuggestions(networkQuery, networkResponse);
console.log(`Generated ${networkSuggestions.length} suggestions for network query`);
console.log(JSON.stringify(networkSuggestions[0], null, 2));

// Test 2: Cluster query
console.log('\n=== Test 2: Cluster Query ===');
const clusterQuery = 'What pods are running in the cortex namespace?';
const clusterResponse = 'There are 5 pods running in cortex namespace';
const clusterSuggestions = contextAnalyzer.analyzeSuggestions(clusterQuery, clusterResponse);
console.log(`Generated ${clusterSuggestions.length} suggestions for cluster query`);
console.log(JSON.stringify(clusterSuggestions[0], null, 2));

// Test 3: Security query
console.log('\n=== Test 3: Security Query ===');
const securityQuery = 'Show me Sandfly alerts';
const securityResponse = 'There are 3 active Sandfly alerts';
const securitySuggestions = contextAnalyzer.analyzeSuggestions(securityQuery, securityResponse);
console.log(`Generated ${securitySuggestions.length} suggestions for security query`);
console.log(JSON.stringify(securitySuggestions[0], null, 2));

// Test 4: Multiple pattern match
console.log('\n=== Test 4: Multiple Patterns ===');
const multiQuery = 'Check the k3s cluster and UniFi network for any performance issues';
const multiResponse = 'Cluster is healthy, network looks good';
const multiSuggestions = contextAnalyzer.analyzeSuggestions(multiQuery, multiResponse);
console.log(`Generated ${multiSuggestions.length} suggestions for multi-pattern query`);
multiSuggestions.forEach((s, i) => {
  console.log(`\nSuggestion ${i + 1}: ${s.title}`);
  console.log(`  Type: ${s.type}`);
  console.log(`  Actions: ${s.actions.length}`);
});

// Test 5: No match
console.log('\n=== Test 5: No Pattern Match ===');
const noMatchQuery = 'What time is it?';
const noMatchResponse = 'I cannot tell time';
const noMatchSuggestions = contextAnalyzer.analyzeSuggestions(noMatchQuery, noMatchResponse);
console.log(`Generated ${noMatchSuggestions.length} suggestions for non-matching query`);

console.log('\n=== All Tests Complete ===');
