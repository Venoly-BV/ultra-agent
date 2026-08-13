---
name: docwork
description: Work with documents at any scale — extract from PDFs, spreadsheets, docx, notebooks; synthesize across corpora; convert formats; every fact cited to its source. Use when the material is documents rather than code.
argument-hint: [files or directory, and the question]
---

Document task: $ARGUMENTS

Product: answers with citations (`report.pdf p.12`, `budget.xlsx Q3!C14`) — never paraphrase floating free of a source.

## Single document

Use the tool ladder, cheapest first — `ultra-doc <file>` if on PATH runs this triage automatically:

- **PDF**: `pdftotext -layout`; empty/garbled output means scanned or image-based — Read the PDF directly (visual, `pages` selectively). Never fill an extraction gap with plausible content; a failed extraction is a *finding*.
- **xlsx/csv**: Python (`openpyxl`/`csv`). `wb.sheetnames` before any conclusion — workbooks hide sheets. Numbers are computed by code shown in the report, never eyeballed. Watch: dates-as-strings, display-rounded floats, formula cached values.
- **docx**: `python-docx`, else unzip → `word/document.xml`, tags stripped.
- **ipynb**: JSON — `jq`/Python; separate code/markdown/outputs; flag stale outputs (execution counts out of order).
- **Unknown**: `file`, then try zip, then text with encoding fallback (utf-8 → latin-1).

## Corpus (many documents)

Never read sequentially:

1. **Inventory** — count, formats, sizes, dates; report the shape first.
2. **Triage** — filenames + first page/KB each → relevant / maybe / no; show the classification for veto.
3. **Extract** — deep-read the relevant set only, into a structured intermediate (table/JSON) with per-fact source refs. For large corpora, delegate the extraction fan-out to `ultra:archivist`.
4. **Synthesize** — answer from the intermediate, citing per fact. Contradictions between documents are findings: report both values, both sources.

## Conversions

Name what the target format cannot carry (tables, footnotes, formulas, images) *before* converting; confirm loss is acceptable or pick a richer target. After converting, spot-check the artifact — open it, don't trust the exit code.
