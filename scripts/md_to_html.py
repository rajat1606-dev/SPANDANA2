# -*- coding: utf-8 -*-
"""Render a Markdown file to print-ready HTML, for turning into a PDF.

Used to produce the committed PROJECT_EXPLAINED.pdf. Kept in the repo so
the PDF can be regenerated whenever the Markdown changes, rather than
being a one-off artefact nobody can reproduce.

Needs `markdown` (pip install markdown) and a Chrome/Edge binary:

    python scripts/md_to_html.py PROJECT_EXPLAINED.md out.html
    chrome --headless --disable-gpu --no-pdf-header-footer            --print-to-pdf=PROJECT_EXPLAINED.pdf file:///absolute/path/out.html

On Windows chrome.exe is usually at
C:/Program Files/Google/Chrome/Application/chrome.exe
"""
import io
import sys

import markdown

SRC, DST = sys.argv[1], sys.argv[2]

text = io.open(SRC, encoding="utf-8").read()

body = markdown.markdown(
    text,
    extensions=["tables", "fenced_code", "toc", "sane_lists"],
)

CSS = """
@page { size: A4; margin: 18mm 16mm 20mm 16mm; }
* { box-sizing: border-box; }
body {
  font-family: "Segoe UI", -apple-system, "Helvetica Neue", Arial, sans-serif;
  font-size: 10.5pt; line-height: 1.55; color: #1c1917;
  margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact;
}
h1 { font-size: 23pt; margin: 0 0 4pt; letter-spacing: -0.4pt; color: #0b1728; }
h2 {
  font-size: 15pt; margin: 22pt 0 7pt; padding-bottom: 4pt;
  border-bottom: 1px solid #e3ded6; color: #0b1728;
  page-break-after: avoid; break-after: avoid;
}
h3 { font-size: 12pt; margin: 14pt 0 5pt; color: #27476b;
     page-break-after: avoid; break-after: avoid; }
h2 + p, h3 + p { margin-top: 0; }
p, li { orphans: 3; widows: 3; }
ul, ol { padding-left: 17pt; margin: 6pt 0; }
li { margin: 2.5pt 0; }
strong { color: #0b1728; }
hr { border: 0; border-top: 1px solid #e8e3db; margin: 16pt 0; }
code {
  font-family: "Cascadia Mono", Consolas, "SF Mono", monospace;
  font-size: 8.8pt; background: #f4f1ec; padding: 1px 4px;
  border-radius: 3px; color: #7a3e1d;
}
pre {
  background: #f8f6f2; border: 1px solid #e8e3db; border-radius: 5px;
  padding: 9pt 11pt; overflow-x: auto; font-size: 8.6pt; line-height: 1.45;
  page-break-inside: avoid; break-inside: avoid;
}
pre code { background: none; padding: 0; color: #1c1917; }
table {
  border-collapse: collapse; width: 100%; margin: 9pt 0; font-size: 9.2pt;
  page-break-inside: avoid; break-inside: avoid;
}
th, td {
  border: 1px solid #e3ded6; padding: 4.5pt 7pt;
  text-align: left; vertical-align: top;
}
th { background: #f4f1ec; font-weight: 600; color: #0b1728; }
tr:nth-child(even) td { background: #fbfaf8; }
blockquote {
  margin: 9pt 0; padding: 7pt 12pt; border-left: 3px solid #c9b896;
  background: #fbf8f1; color: #4a4038;
}
blockquote p { margin: 3pt 0; }
a { color: #1d6fbe; text-decoration: none; }
"""

html = (
    "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\">"
    "<title>SPANDANA, explained simply</title>"
    "<style>" + CSS + "</style></head><body>" + body + "</body></html>"
)

io.open(DST, "w", encoding="utf-8", newline="\n").write(html)
print("wrote %s (%d bytes)" % (DST, len(html)))
