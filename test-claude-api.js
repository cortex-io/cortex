#!/usr/bin/env node

/**
 * Claude API Connection Test
 * Tests API key from n8n workflow configuration
 */

const https = require('https');

// API Key extracted from workflow
const API_KEY = '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';

// Test configuration
const TEST_MODEL = 'claude-3-haiku-20240307';
const MAX_TOKENS = 1024;

console.log('='.repeat(80));
console.log('CLAUDE API CONNECTION TEST');
console.log('='.repeat(80));
console.log(`Model: ${TEST_MODEL}`);
console.log(`API Key: ${API_KEY.substring(0, 20)}...${API_KEY.substring(API_KEY.length - 10)}`);
console.log(`Max Tokens: ${MAX_TOKENS}`);
console.log('='.repeat(80));
console.log();

// Test 1: Basic API Call
async function testBasicAPICall() {
  console.log('Test 1: Basic API Call');
  console.log('-'.repeat(80));

  const requestData = JSON.stringify({
    model: TEST_MODEL,
    max_tokens: MAX_TOKENS,
    messages: [
      {
        role: 'user',
        content: 'Hello! Please respond with a brief greeting to confirm the API is working.'
      }
    ]
  });

  const options = {
    hostname: 'api.anthropic.com',
    port: 443,
    path: '/v1/messages',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(requestData),
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01'
    }
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const response = JSON.parse(data);

          if (res.statusCode === 200) {
            console.log(`✅ SUCCESS - Status: ${res.statusCode}`);
            console.log(`Response ID: ${response.id}`);
            console.log(`Model: ${response.model}`);
            console.log(`Stop Reason: ${response.stop_reason}`);
            console.log(`Input Tokens: ${response.usage.input_tokens}`);
            console.log(`Output Tokens: ${response.usage.output_tokens}`);
            console.log(`\nClaude's Response:`);
            console.log(response.content[0].text);
            resolve({
              success: true,
              statusCode: res.statusCode,
              response: response,
              headers: res.headers
            });
          } else {
            console.log(`❌ FAILED - Status: ${res.statusCode}`);
            console.log(`Error Type: ${response.error?.type}`);
            console.log(`Error Message: ${response.error?.message}`);
            resolve({
              success: false,
              statusCode: res.statusCode,
              error: response.error,
              headers: res.headers
            });
          }
        } catch (error) {
          console.log(`❌ FAILED - Parse Error: ${error.message}`);
          console.log(`Raw Response: ${data}`);
          reject(error);
        }
      });
    });

    req.on('error', (error) => {
      console.log(`❌ REQUEST FAILED: ${error.message}`);
      reject(error);
    });

    req.write(requestData);
    req.end();
  });
}

// Test 2: Rate Limit Check
async function testRateLimits(previousResponse) {
  console.log();
  console.log('Test 2: Rate Limit & Quota Analysis');
  console.log('-'.repeat(80));

  if (!previousResponse || !previousResponse.headers) {
    console.log('⚠️  No headers available from previous request');
    return;
  }

  const headers = previousResponse.headers;

  console.log('Rate Limit Information:');
  console.log(`  Request Limit: ${headers['anthropic-ratelimit-requests-limit'] || 'Not available'}`);
  console.log(`  Requests Remaining: ${headers['anthropic-ratelimit-requests-remaining'] || 'Not available'}`);
  console.log(`  Requests Reset: ${headers['anthropic-ratelimit-requests-reset'] || 'Not available'}`);
  console.log();
  console.log(`  Token Limit: ${headers['anthropic-ratelimit-tokens-limit'] || 'Not available'}`);
  console.log(`  Tokens Remaining: ${headers['anthropic-ratelimit-tokens-remaining'] || 'Not available'}`);
  console.log(`  Tokens Reset: ${headers['anthropic-ratelimit-tokens-reset'] || 'Not available'}`);
  console.log();
  console.log(`  Retry After: ${headers['retry-after'] || 'Not applicable'}`);

  return {
    rateLimit: {
      requestsLimit: headers['anthropic-ratelimit-requests-limit'],
      requestsRemaining: headers['anthropic-ratelimit-requests-remaining'],
      requestsReset: headers['anthropic-ratelimit-requests-reset'],
      tokensLimit: headers['anthropic-ratelimit-tokens-limit'],
      tokensRemaining: headers['anthropic-ratelimit-tokens-remaining'],
      tokensReset: headers['anthropic-ratelimit-tokens-reset']
    }
  };
}

// Test 3: MaxTokens Parameter Test
async function testMaxTokensParameter() {
  console.log();
  console.log('Test 3: MaxTokens Parameter Test');
  console.log('-'.repeat(80));

  const testTokenLimits = [100, 512, 1024];
  const results = [];

  for (const maxTokens of testTokenLimits) {
    console.log(`\nTesting with maxTokens=${maxTokens}...`);

    const requestData = JSON.stringify({
      model: TEST_MODEL,
      max_tokens: maxTokens,
      messages: [
        {
          role: 'user',
          content: 'Count from 1 to 50, comma separated.'
        }
      ]
    });

    const options = {
      hostname: 'api.anthropic.com',
      port: 443,
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(requestData),
        'x-api-key': API_KEY,
        'anthropic-version': '2023-06-01'
      }
    };

    try {
      const result = await new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
          let data = '';

          res.on('data', (chunk) => {
            data += chunk;
          });

          res.on('end', () => {
            try {
              const response = JSON.parse(data);

              if (res.statusCode === 200) {
                console.log(`  ✅ Success - Output tokens: ${response.usage.output_tokens}, Stop reason: ${response.stop_reason}`);
                resolve({
                  maxTokens: maxTokens,
                  outputTokens: response.usage.output_tokens,
                  stopReason: response.stop_reason,
                  success: true
                });
              } else {
                console.log(`  ❌ Failed - ${response.error?.message}`);
                resolve({
                  maxTokens: maxTokens,
                  error: response.error,
                  success: false
                });
              }
            } catch (error) {
              reject(error);
            }
          });
        });

        req.on('error', reject);
        req.write(requestData);
        req.end();
      });

      results.push(result);

      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      console.log(`  ❌ Error: ${error.message}`);
      results.push({
        maxTokens: maxTokens,
        error: error.message,
        success: false
      });
    }
  }

  return results;
}

// Test 4: Model Validation
async function testModelValidation() {
  console.log();
  console.log('Test 4: Model Validation');
  console.log('-'.repeat(80));

  console.log(`Testing model: ${TEST_MODEL}`);
  console.log('Expected: claude-3-haiku-20240307 (Claude 3 Haiku)');

  const requestData = JSON.stringify({
    model: TEST_MODEL,
    max_tokens: 100,
    messages: [
      {
        role: 'user',
        content: 'What model are you? Please respond with just your model name and version.'
      }
    ]
  });

  const options = {
    hostname: 'api.anthropic.com',
    port: 443,
    path: '/v1/messages',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(requestData),
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01'
    }
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const response = JSON.parse(data);

          if (res.statusCode === 200) {
            console.log(`✅ Model confirmed: ${response.model}`);
            console.log(`Model response: ${response.content[0].text}`);
            resolve({
              success: true,
              model: response.model,
              response: response.content[0].text
            });
          } else {
            console.log(`❌ Failed: ${response.error?.message}`);
            resolve({
              success: false,
              error: response.error
            });
          }
        } catch (error) {
          reject(error);
        }
      });
    });

    req.on('error', reject);
    req.write(requestData);
    req.end();
  });
}

// Main test execution
async function runAllTests() {
  const results = {
    timestamp: new Date().toISOString(),
    apiKey: {
      prefix: API_KEY.substring(0, 20),
      suffix: API_KEY.substring(API_KEY.length - 10),
      length: API_KEY.length
    },
    model: TEST_MODEL,
    tests: {}
  };

  try {
    // Test 1: Basic API Call
    const test1Result = await testBasicAPICall();
    results.tests.basicAPICall = test1Result;

    if (!test1Result.success) {
      console.log();
      console.log('='.repeat(80));
      console.log('⚠️  STOPPING TESTS - Basic API call failed');
      console.log('='.repeat(80));
      console.log();
      console.log('FINAL RESULTS:');
      console.log(JSON.stringify(results, null, 2));
      return results;
    }

    // Test 2: Rate Limits
    const test2Result = await testRateLimits(test1Result);
    results.tests.rateLimits = test2Result;

    // Test 3: MaxTokens Parameter
    const test3Result = await testMaxTokensParameter();
    results.tests.maxTokensParameter = test3Result;

    // Test 4: Model Validation
    const test4Result = await testModelValidation();
    results.tests.modelValidation = test4Result;

    // Final Summary
    console.log();
    console.log('='.repeat(80));
    console.log('TEST SUMMARY');
    console.log('='.repeat(80));
    console.log();
    console.log(`✅ Basic API Call: ${results.tests.basicAPICall.success ? 'PASSED' : 'FAILED'}`);
    console.log(`✅ Rate Limits: ${results.tests.rateLimits ? 'CHECKED' : 'SKIPPED'}`);
    console.log(`✅ MaxTokens Parameter: ${results.tests.maxTokensParameter.every(r => r.success) ? 'PASSED' : 'PARTIAL'}`);
    console.log(`✅ Model Validation: ${results.tests.modelValidation.success ? 'PASSED' : 'FAILED'}`);
    console.log();
    console.log('Overall Status: ✅ API KEY VALID AND WORKING');
    console.log();
    console.log('='.repeat(80));

  } catch (error) {
    console.error();
    console.error('='.repeat(80));
    console.error('❌ TEST SUITE FAILED');
    console.error('='.repeat(80));
    console.error(`Error: ${error.message}`);
    console.error(error.stack);
    results.error = {
      message: error.message,
      stack: error.stack
    };
  }

  // Save results to file
  const fs = require('fs');
  const resultsPath = '/Users/ryandahlberg/Projects/cortex/claude-api-test-results.json';
  fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
  console.log(`\nDetailed results saved to: ${resultsPath}`);

  return results;
}

// Run tests
runAllTests().catch(console.error);
