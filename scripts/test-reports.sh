#!/bin/bash
#
# Test Cortex Reports Locally
#
# This script tests all Quarto reports to ensure they can be generated
# without errors before pushing to GitHub Actions.
#

set -e  # Exit on error

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
REPORTS_DIR="$PROJECT_ROOT/reports"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored messages
print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if Quarto is installed
check_quarto() {
    if ! command -v quarto &> /dev/null; then
        print_error "Quarto is not installed!"
        echo ""
        echo "Install Quarto from: https://quarto.org/docs/get-started/"
        echo ""
        echo "macOS: brew install quarto"
        echo "Linux: Download from https://quarto.org/docs/download/"
        exit 1
    fi
    print_success "Quarto is installed: $(quarto --version)"
}

# Check if Python dependencies are installed
check_python_deps() {
    print_info "Checking Python dependencies..."

    local missing_deps=()

    for dep in polars anthropic plotly pandas; do
        if ! python3 -c "import $dep" 2>/dev/null; then
            missing_deps+=("$dep")
        fi
    done

    if [ ${#missing_deps[@]} -gt 0 ]; then
        print_warning "Missing Python dependencies: ${missing_deps[*]}"
        print_info "Installing missing dependencies..."
        pip install "${missing_deps[@]}"
    else
        print_success "All Python dependencies are installed"
    fi
}

# Check for ANTHROPIC_API_KEY
check_api_key() {
    if [ -z "$ANTHROPIC_API_KEY" ]; then
        print_warning "ANTHROPIC_API_KEY is not set"
        print_info "AI-powered insights will be disabled"
        print_info "Set the key with: export ANTHROPIC_API_KEY='your-key-here'"
        echo ""
    else
        print_success "ANTHROPIC_API_KEY is set"
    fi
}

# Test rendering a report
test_report() {
    local report_name=$1
    local report_file="$REPORTS_DIR/$report_name.qmd"

    if [ ! -f "$report_file" ]; then
        print_error "Report file not found: $report_file"
        return 1
    fi

    print_info "Testing $report_name..."

    cd "$REPORTS_DIR"

    if quarto render "$report_name.qmd" --quiet 2>&1 | tee /tmp/quarto_output.log; then
        print_success "$report_name rendered successfully"

        # Check if HTML was generated
        if [ -f "_site/$report_name.html" ]; then
            print_success "HTML output: _site/$report_name.html"
        fi

        return 0
    else
        print_error "$report_name failed to render"
        echo ""
        echo "Error output:"
        cat /tmp/quarto_output.log
        return 1
    fi
}

# Main execution
main() {
    echo ""
    echo "=========================================="
    echo "  Cortex Reports Testing Suite"
    echo "=========================================="
    echo ""

    # Pre-flight checks
    check_quarto
    check_python_deps
    check_api_key

    echo ""
    echo "=========================================="
    echo "  Testing Report Generation"
    echo "=========================================="
    echo ""

    # Track successes and failures
    local reports=("weekly-summary" "security-audit" "cost-report")
    local passed=0
    local failed=0
    local failed_reports=()

    for report in "${reports[@]}"; do
        if test_report "$report"; then
            ((passed++))
        else
            ((failed++))
            failed_reports+=("$report")
        fi
        echo ""
    done

    # Summary
    echo "=========================================="
    echo "  Test Summary"
    echo "=========================================="
    echo ""
    print_info "Total reports tested: ${#reports[@]}"
    print_success "Passed: $passed"

    if [ $failed -gt 0 ]; then
        print_error "Failed: $failed"
        print_error "Failed reports: ${failed_reports[*]}"
        echo ""
        exit 1
    else
        print_success "All reports generated successfully!"
        echo ""
        print_info "View reports at:"
        echo "  - file://$REPORTS_DIR/_site/index.html"
        echo "  - file://$REPORTS_DIR/_site/weekly-summary.html"
        echo "  - file://$REPORTS_DIR/_site/security-audit.html"
        echo "  - file://$REPORTS_DIR/_site/cost-report.html"
        echo ""

        # Offer to open reports
        if command -v open &> /dev/null; then
            read -p "Open reports in browser? (y/n) " -n 1 -r
            echo
            if [[ $REPLY =~ ^[Yy]$ ]]; then
                open "$REPORTS_DIR/_site/index.html"
            fi
        fi
    fi
}

# Run main function
main "$@"
