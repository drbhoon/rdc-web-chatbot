import json
import sys
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")


def main() -> int:
    if len(sys.argv) != 2:
        print(json.dumps({"error": "Usage: extractVisionPdfText.py <pdf-path>"}))
        return 2

    pdf_path = Path(sys.argv[1])
    result = {
        "path": str(pdf_path),
        "pages": [],
        "textChars": 0,
        "ocrAttempted": False,
        "ocrAvailable": False,
        "warnings": [],
    }

    try:
        from pypdf import PdfReader
    except Exception as exc:
        result["warnings"].append(f"pypdf unavailable: {exc}")
        print(json.dumps(result, ensure_ascii=False))
        return 0

    try:
        reader = PdfReader(str(pdf_path))
        for index, page in enumerate(reader.pages, start=1):
            try:
                text = page.extract_text() or ""
            except Exception as exc:
                result["warnings"].append(f"page {index} extraction failed: {exc}")
                text = ""
            result["pages"].append({"page": index, "text": text.strip()})
            result["textChars"] += len(text.strip())
    except Exception as exc:
        result["warnings"].append(f"PDF read failed: {exc}")

    if result["textChars"] == 0:
        result["ocrAttempted"] = True
        try:
            import pytesseract  # noqa: F401

            result["ocrAvailable"] = True
            result["warnings"].append(
                "OCR dependency is available, but PDF page rendering is not configured in this test extractor."
            )
        except Exception as exc:
            result["warnings"].append(
                f"OCR unavailable for scanned/image-only PDF: {exc}"
            )

    print(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
