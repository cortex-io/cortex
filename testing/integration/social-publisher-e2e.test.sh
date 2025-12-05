#!/bin/bash

##############################################################################
# Social Publisher End-to-End Integration Test
#
# Tests the complete publishing workflow:
# 1. Blog post detection
# 2. Content parsing
# 3. Tweet generation
# 4. Preview generation
# 5. (Optional) Publishing to Buffer
##############################################################################

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CORTEX_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Test configuration
TEST_DIR="$CORTEX_ROOT/coordination/social/test-e2e"
TEST_BLOG_POST="$TEST_DIR/2025-12-04-e2e-test-post.md"
PREVIEW_MODE=true # Set to false to test actual Buffer publishing

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

TESTS_PASSED=0
TESTS_FAILED=0

pass() {
    echo -e "${GREEN}✓${NC} $1"
    TESTS_PASSED=$((TESTS_PASSED + 1))
}

fail() {
    echo -e "${RED}✗${NC} $1"
    TESTS_FAILED=$((TESTS_FAILED + 1))
}

info() {
    echo -e "${YELLOW}ℹ${NC} $1"
}

# Setup test environment
setup() {
    echo "======================================"
    echo "Social Publisher E2E Integration Test"
    echo "======================================"
    echo ""

    info "Setting up test environment..."

    # Create test directory
    mkdir -p "$TEST_DIR"

    # Create realistic test blog post
    cat > "$TEST_BLOG_POST" <<'EOF'
---
title: "Building Autonomous AI Agents: A Production Journey"
date: 2025-12-04
author: Cortex Engineering Team
tags: [AI, Agents, DevOps, Automation]
category: Engineering
featured: true
---

# Building Autonomous AI Agents: A Production Journey

**December 4, 2025** | Cortex Engineering Team

---

## TL;DR

We built a production-grade autonomous AI agent system that handles repository management, security scanning, and continuous deployment. The system uses Claude Sonnet 4.5 with advanced reasoning patterns and governance controls.

**What we built:**
- Multi-agent orchestration platform
- Autonomous security scanning (24/7)
- AI-powered code review and refactoring
- Production deployment automation

**Key Stats:**
- 80x faster development cycles
- 95% reduction in manual tasks
- 100% automated security scanning
- 3ms average response time

---

## The Challenge

Modern software development requires constant vigilance: security updates, dependency management, code quality enforcement, and deployment coordination. Manual processes don't scale.

## Our Solution

We created Cortex, an autonomous agent orchestration platform that:

### 1. Intelligent Task Routing
- AI-powered complexity estimation
- Dynamic worker assignment
- Load balancing across agents

### 2. Security-First Design
- Continuous vulnerability scanning
- Automated CVE remediation
- Compliance monitoring
- Access control and audit logging

### 3. Production-Grade Reliability
- Comprehensive test coverage
- Health monitoring
- Graceful error handling
- Observable operations

## Results

After 6 months in production:

- **Development velocity**: 80x improvement
- **Security posture**: Zero critical vulnerabilities
- **Operational overhead**: 95% reduction
- **System uptime**: 99.9%

## Key Learnings

1. **Governance is essential**: AI agents need guardrails
2. **Start small, iterate**: Phased rollout prevents issues
3. **Observability matters**: You can't improve what you can't measure
4. **Human oversight**: Automation amplifies, doesn't replace

## What's Next

We're expanding Cortex to:
- Multi-repository management
- Advanced reasoning patterns (Chain-of-Thought, ReAct)
- Integration with CI/CD pipelines
- Team collaboration features

---

**Ready to learn more?** Check out our [documentation](https://github.com/cortex) or [join the discussion](https://discord.gg/cortex).

*Questions or feedback? Reach out to the team.*
EOF

    pass "Test environment created"
}

# Test 1: Blog post parsing
test_blog_parsing() {
    echo ""
    info "Test 1: Blog post parsing"

    local parser="$CORTEX_ROOT/lib/social/blog-parser.js"
    local result

    result=$(node "$parser" parse "$TEST_BLOG_POST" 2>&1)

    if [[ $? -eq 0 ]]; then
        pass "Blog post parsed successfully"
    else
        fail "Blog post parsing failed"
        echo "$result"
        return 1
    fi

    # Validate parsed data
    if echo "$result" | jq -e '.title' > /dev/null 2>&1; then
        pass "Title extracted"
    else
        fail "Title not extracted"
    fi

    if echo "$result" | jq -e '.tags | length > 0' > /dev/null 2>&1; then
        pass "Tags extracted"
    else
        fail "Tags not extracted"
    fi

    if echo "$result" | jq -e '.keyPoints | length > 0' > /dev/null 2>&1; then
        pass "Key points extracted"
    else
        fail "Key points not extracted"
    fi

    if echo "$result" | jq -e '.stats | length > 0' > /dev/null 2>&1; then
        pass "Stats extracted"
    else
        fail "Stats not extracted"
    fi
}

# Test 2: Tweet generation (requires ANTHROPIC_API_KEY)
test_tweet_generation() {
    echo ""
    info "Test 2: AI-powered tweet generation"

    if [[ -z "${ANTHROPIC_API_KEY:-}" ]]; then
        fail "ANTHROPIC_API_KEY not set, skipping tweet generation test"
        return 1
    fi

    local generator="$CORTEX_ROOT/lib/social/tweet-generator.js"
    local result

    info "Generating single tweet..."
    result=$(node "$generator" generate "$TEST_BLOG_POST" "single_tweet" 2>&1)

    if [[ $? -eq 0 ]]; then
        pass "Single tweet generated"

        # Check tweet length
        local tweet_text
        tweet_text=$(echo "$result" | sed -n '/=== GENERATED TWEETS ===/,/=== METADATA ===/p' | sed '1d;$d' | tr -d '\n')
        local length=${#tweet_text}

        if [[ $length -le 280 ]]; then
            pass "Tweet within character limit ($length/280)"
        else
            fail "Tweet exceeds character limit ($length/280)"
        fi
    else
        fail "Single tweet generation failed"
        echo "$result"
    fi

    info "Generating tweet thread..."
    result=$(node "$generator" generate "$TEST_BLOG_POST" "thread" 2>&1)

    if [[ $? -eq 0 ]]; then
        pass "Tweet thread generated"

        # Check thread count
        local tweet_count
        tweet_count=$(echo "$result" | grep -c "^---$" || echo "0")

        if [[ $tweet_count -gt 1 ]]; then
            pass "Thread contains multiple tweets ($tweet_count)"
        else
            fail "Thread should contain multiple tweets"
        fi
    else
        fail "Thread generation failed"
        echo "$result"
    fi
}

# Test 3: Preview generation
test_preview_generation() {
    echo ""
    info "Test 3: Preview generation"

    local publisher="$CORTEX_ROOT/scripts/social-publish.sh"
    local preview_file="$CORTEX_ROOT/coordination/social/preview.txt"

    # Remove old preview
    rm -f "$preview_file"

    # Generate preview
    "$publisher" --preview "$TEST_BLOG_POST" "thread" > /dev/null 2>&1

    if [[ $? -eq 0 ]]; then
        pass "Preview generation succeeded"
    else
        fail "Preview generation failed"
        return 1
    fi

    if [[ -f "$preview_file" ]]; then
        pass "Preview file created"

        # Check content
        if [[ -s "$preview_file" ]]; then
            pass "Preview file has content"
        else
            fail "Preview file is empty"
        fi
    else
        fail "Preview file not created"
    fi
}

# Test 4: Configuration validation
test_configuration() {
    echo ""
    info "Test 4: Configuration validation"

    local config="$CORTEX_ROOT/coordination/config/social-publisher-config.json"

    if jq empty "$config" 2>/dev/null; then
        pass "Configuration is valid JSON"
    else
        fail "Configuration has invalid JSON"
        return 1
    fi

    # Check required fields
    if jq -e '.buffer.api_base_url' "$config" > /dev/null 2>&1; then
        pass "Buffer API URL configured"
    else
        fail "Buffer API URL missing"
    fi

    if jq -e '.blog.directory' "$config" > /dev/null 2>&1; then
        pass "Blog directory configured"
    else
        fail "Blog directory missing"
    fi
}

# Test 5: Buffer connection (if credentials available)
test_buffer_connection() {
    echo ""
    info "Test 5: Buffer API connection"

    if [[ -z "${BUFFER_ACCESS_TOKEN:-}" ]]; then
        fail "BUFFER_ACCESS_TOKEN not set, skipping Buffer tests"
        return 1
    fi

    local client="$CORTEX_ROOT/lib/social/buffer-client.js"
    local validation

    validation=$(node "$client" validate 2>&1)

    if echo "$validation" | jq -e '.valid == true' > /dev/null 2>&1; then
        pass "Buffer credentials valid"

        local twitter_accounts
        twitter_accounts=$(echo "$validation" | jq -r '.twitter_accounts // 0')

        if [[ $twitter_accounts -gt 0 ]]; then
            pass "Twitter account connected ($twitter_accounts account(s))"
        else
            fail "No Twitter account connected to Buffer"
        fi
    else
        fail "Buffer credentials invalid or connection failed"
        echo "$validation"
    fi
}

# Test 6: Full workflow (preview mode)
test_full_workflow() {
    echo ""
    info "Test 6: Full publishing workflow (preview mode)"

    local publisher="$CORTEX_ROOT/scripts/social-publish.sh"

    # This test requires both API keys
    if [[ -z "${ANTHROPIC_API_KEY:-}" ]] || [[ -z "${BUFFER_ACCESS_TOKEN:-}" ]]; then
        fail "API keys not set, skipping full workflow test"
        info "Set ANTHROPIC_API_KEY and BUFFER_ACCESS_TOKEN to run full test"
        return 1
    fi

    # Run preview (doesn't publish)
    local output
    output=$("$publisher" --preview "$TEST_BLOG_POST" "thread" 2>&1)

    if [[ $? -eq 0 ]]; then
        pass "Full workflow executed successfully"
    else
        fail "Full workflow failed"
        echo "$output"
        return 1
    fi

    # Check output contains expected sections
    if echo "$output" | grep -q "BLOG POST:"; then
        pass "Output contains blog post info"
    else
        fail "Output missing blog post info"
    fi

    if echo "$output" | grep -q "GENERATED TWEETS"; then
        pass "Output contains generated tweets"
    else
        fail "Output missing generated tweets"
    fi
}

# Cleanup
cleanup() {
    echo ""
    info "Cleaning up test environment..."

    if [[ -d "$TEST_DIR" ]]; then
        rm -rf "$TEST_DIR"
    fi

    # Clean up preview file
    rm -f "$CORTEX_ROOT/coordination/social/preview.txt"

    pass "Cleanup complete"
}

# Main test execution
main() {
    setup

    test_blog_parsing
    test_tweet_generation
    test_preview_generation
    test_configuration
    test_buffer_connection
    test_full_workflow

    cleanup

    echo ""
    echo "======================================"
    echo "Test Results"
    echo "======================================"
    echo "Passed: $TESTS_PASSED"
    echo "Failed: $TESTS_FAILED"
    echo "Total:  $((TESTS_PASSED + TESTS_FAILED))"
    echo "======================================"

    if [[ $TESTS_FAILED -eq 0 ]]; then
        echo -e "${GREEN}✓ All E2E tests passed!${NC}"
        exit 0
    else
        echo -e "${RED}✗ Some E2E tests failed${NC}"
        exit 1
    fi
}

main "$@"
