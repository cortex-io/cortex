#!/usr/bin/env python3
"""
PDF Processing Script for Cortex Review
Cleans PDFs, extracts content, and generates analysis markdown files
"""

import os
import sys
import re
from pathlib import Path

try:
    import fitz  # PyMuPDF
except ImportError:
    print("Installing PyMuPDF...")
    os.system("pip3 install --break-system-packages PyMuPDF pillow")
    import fitz

REVIEW_DIR = Path("/Users/ryandahlberg/Projects/cortex/review")

def is_content_page(page):
    """Determine if a page contains meaningful content"""
    text = page.get_text().strip().lower()

    # Skip if page is mostly empty
    if len(text) < 100:
        return False

    # Skip common non-content pages
    skip_patterns = [
        r'^table of contents',
        r'^contents\s*$',
        r'^references\s*$',
        r'^bibliography',
        r'^index\s*$',
        r'^about the author',
        r'^copyright',
        r'^dedication',
        r'^acknowledgment',
        r'^\s*\d+\s*$',  # Page with just a number
    ]

    for pattern in skip_patterns:
        if re.search(pattern, text[:200], re.IGNORECASE):
            return False

    # Keep pages with substantial text or images
    images = page.get_images()
    word_count = len(text.split())

    return word_count > 50 or len(images) > 0

def clean_pdf(input_path, output_path):
    """Remove unnecessary pages from PDF"""
    print(f"\n📄 Processing: {input_path.name}")

    try:
        doc = fitz.open(input_path)
        output_doc = fitz.open()

        total_pages = len(doc)
        kept_pages = 0

        for page_num in range(total_pages):
            page = doc[page_num]
            if is_content_page(page):
                output_doc.insert_pdf(doc, from_page=page_num, to_page=page_num)
                kept_pages += 1

        output_doc.save(output_path)
        output_doc.close()
        doc.close()

        print(f"   ✅ Kept {kept_pages}/{total_pages} pages")
        return True

    except Exception as e:
        print(f"   ❌ Error: {e}")
        return False

def extract_content(pdf_path):
    """Extract text and structure from cleaned PDF"""
    print(f"📝 Extracting content from: {pdf_path.name}")

    try:
        doc = fitz.open(pdf_path)
        content = {
            'title': pdf_path.stem.replace('-cleaned', ''),
            'pages': len(doc),
            'sections': [],
            'diagrams': []
        }

        full_text = []

        for page_num, page in enumerate(doc):
            text = page.get_text()
            full_text.append(text)

            # Track diagrams/images
            images = page.get_images()
            if images:
                content['diagrams'].append({
                    'page': page_num + 1,
                    'count': len(images),
                    'description': f"Page {page_num + 1} contains {len(images)} diagram(s)"
                })

        content['full_text'] = '\n\n'.join(full_text)
        doc.close()

        print(f"   ✅ Extracted {len(full_text)} pages, {len(content['diagrams'])} pages with diagrams")
        return content

    except Exception as e:
        print(f"   ❌ Error: {e}")
        return None

def generate_markdown(content, output_path):
    """Generate markdown analysis file"""
    print(f"📋 Generating markdown: {output_path.name}")

    md = f"""# Analysis: {content['title']}

## Document Overview
- **Source**: {content['title']}.pdf
- **Pages Analyzed**: {content['pages']}
- **Diagrams/Figures**: {len(content['diagrams'])} pages contain visual content

## Key Findings for Cortex

"""

    # Analyze content for Cortex relevance
    text_lower = content['full_text'].lower()

    # Architecture patterns
    if any(term in text_lower for term in ['architecture', 'microservices', 'distributed', 'system design']):
        md += "### Architecture Patterns\n"
        md += "- This document discusses architectural concepts relevant to distributed systems\n"
        md += "- Consider applying these patterns to Cortex's agent orchestration\n\n"

    # Observability
    if any(term in text_lower for term in ['observability', 'monitoring', 'telemetry', 'tracing']):
        md += "### Observability & Monitoring\n"
        md += "- Contains insights on system observability\n"
        md += "- Relevant for Cortex's monitoring and health tracking systems\n\n"

    # AI/ML
    if any(term in text_lower for term in ['ai', 'machine learning', 'artificial intelligence', 'neural', 'model']):
        md += "### AI/ML Techniques\n"
        md += "- Discusses AI/ML methodologies\n"
        md += "- Potential applications for Cortex's learning system\n\n"

    # Orchestration
    if any(term in text_lower for term in ['orchestration', 'workflow', 'automation', 'pipeline']):
        md += "### Orchestration & Automation\n"
        md += "- Covers workflow orchestration strategies\n"
        md += "- Applicable to Cortex's task coordination\n\n"

    # Data management
    if any(term in text_lower for term in ['data lake', 'data warehouse', 'etl', 'data pipeline']):
        md += "### Data Management\n"
        md += "- Addresses data architecture patterns\n"
        md += "- Could enhance Cortex's knowledge base and data handling\n\n"

    # Extract key excerpts (first 1000 chars of meaningful content)
    md += "## Content Summary\n\n"

    # Get a meaningful excerpt
    excerpt = content['full_text'][:2000].strip()
    if len(content['full_text']) > 2000:
        excerpt += "...\n\n*[Content continues]*"

    md += excerpt + "\n\n"

    # Diagrams
    if content['diagrams']:
        md += "## Visual Content\n\n"
        for diagram in content['diagrams']:
            md += f"- {diagram['description']}\n"
        md += "\n"

    # Implementation recommendations
    md += """## Recommendations for Cortex

### Potential Integrations
- [Specific integration opportunities based on content]

### Architecture Improvements
- [Architectural enhancements suggested by this document]

### Performance Optimizations
- [Performance improvements identified]

### Implementation Priority
- **High**: [Critical items]
- **Medium**: [Important but not urgent]
- **Low**: [Nice to have]

"""

    try:
        with open(output_path, 'w') as f:
            f.write(md)
        print(f"   ✅ Markdown created")
        return True
    except Exception as e:
        print(f"   ❌ Error: {e}")
        return False

def main():
    """Main processing pipeline"""
    print("=" * 60)
    print("📚 Cortex PDF Review Processor")
    print("=" * 60)

    # Find all PDFs in review directory
    pdfs = list(REVIEW_DIR.glob("*.pdf"))
    pdfs = [p for p in pdfs if not p.name.endswith('-cleaned.pdf')]

    print(f"\n🔍 Found {len(pdfs)} PDF files to process\n")

    cleaned_pdfs = []
    analysis_files = []

    # Phase 1: Clean PDFs
    print("\n" + "=" * 60)
    print("PHASE 1: Cleaning PDFs")
    print("=" * 60)

    for pdf_path in pdfs:
        cleaned_path = pdf_path.parent / f"{pdf_path.stem}-cleaned.pdf"

        if clean_pdf(pdf_path, cleaned_path):
            cleaned_pdfs.append(cleaned_path)
            # Delete original
            pdf_path.unlink()
            print(f"   🗑️  Deleted original: {pdf_path.name}")

    # Phase 2: Extract content and generate markdown
    print("\n" + "=" * 60)
    print("PHASE 2: Extracting Content & Generating Analysis")
    print("=" * 60)

    for cleaned_pdf in cleaned_pdfs:
        content = extract_content(cleaned_pdf)
        if content:
            md_path = cleaned_pdf.parent / f"{cleaned_pdf.stem.replace('-cleaned', '')}-analysis.md"
            if generate_markdown(content, md_path):
                analysis_files.append(md_path)

    # Summary
    print("\n" + "=" * 60)
    print("✅ PROCESSING COMPLETE")
    print("=" * 60)
    print(f"📄 Cleaned PDFs: {len(cleaned_pdfs)}")
    print(f"📋 Analysis files: {len(analysis_files)}")
    print(f"\nNext step: Review analysis files and create master strategy\n")

    return cleaned_pdfs, analysis_files

if __name__ == "__main__":
    main()
