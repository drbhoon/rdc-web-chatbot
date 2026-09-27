import json
import re
import sys
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")


TEXT_NS = {
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
    "p": "http://schemas.openxmlformats.org/presentationml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
}


def clean_text(value: str) -> str:
    return re.sub(r"\s+", " ", value or "").strip()


def extract_pdf(path: Path):
    units = []
    warnings = []
    try:
        from pypdf import PdfReader
    except Exception as exc:
        return [], [f"pypdf unavailable: {exc}"]

    try:
        reader = PdfReader(str(path))
        for index, page in enumerate(reader.pages, start=1):
            try:
                text = clean_text(page.extract_text() or "")
            except Exception as exc:
                warnings.append(f"page {index} extraction failed: {exc}")
                text = ""
            if text:
                units.append({"unitType": "page", "unitName": f"page {index}", "page": index, "text": text})
    except Exception as exc:
        warnings.append(f"PDF read failed: {exc}")

    return units, warnings


def extract_xlsx(path: Path):
    units = []
    warnings = []
    try:
        import openpyxl
    except Exception as exc:
        return [], [f"openpyxl unavailable: {exc}"]

    try:
        workbook = openpyxl.load_workbook(path, read_only=True, data_only=True)
        for sheet in workbook.worksheets:
            rows = []
            for row in sheet.iter_rows(values_only=True):
                values = [clean_text(str(cell)) for cell in row if cell is not None and clean_text(str(cell))]
                if values:
                    rows.append(" | ".join(values))
            text = clean_text("\n".join(rows))
            if text:
                units.append({"unitType": "sheet", "unitName": sheet.title, "text": text})
    except Exception as exc:
        warnings.append(f"XLSX read failed: {exc}")

    return units, warnings


def slide_sort_key(name: str):
    match = re.search(r"slide(\d+)\.xml$", name)
    return int(match.group(1)) if match else 0


def extract_pptx(path: Path):
    units = []
    warnings = []
    try:
        with zipfile.ZipFile(path) as archive:
            slide_names = sorted(
                [
                    name
                    for name in archive.namelist()
                    if name.startswith("ppt/slides/slide") and name.endswith(".xml")
                ],
                key=slide_sort_key,
            )
            for index, name in enumerate(slide_names, start=1):
                try:
                    root = ET.fromstring(archive.read(name))
                    texts = [node.text or "" for node in root.findall(".//a:t", TEXT_NS)]
                    text = clean_text(" ".join(texts))
                    if text:
                        units.append(
                            {
                                "unitType": "slide",
                                "unitName": f"slide {index}",
                                "page": index,
                                "text": text,
                            }
                        )
                except Exception as exc:
                    warnings.append(f"slide {index} extraction failed: {exc}")
    except Exception as exc:
        warnings.append(f"PPTX/PPTM read failed: {exc}")

    return units, warnings


def extract_docx(path: Path):
    units = []
    warnings = []
    try:
        with zipfile.ZipFile(path) as archive:
            try:
                root = ET.fromstring(archive.read("word/document.xml"))
                texts = [node.text or "" for node in root.findall(".//{http://schemas.openxmlformats.org/wordprocessingml/2006/main}t")]
                text = clean_text(" ".join(texts))
                if text:
                    units.append({"unitType": "section", "unitName": "document", "text": text})
            except Exception as exc:
                warnings.append(f"DOCX body extraction failed: {exc}")
    except Exception as exc:
        warnings.append(f"DOCX read failed: {exc}")

    return units, warnings


def main() -> int:
    if len(sys.argv) != 2:
        print(json.dumps({"error": "Usage: extractPublicKnowledgeText.py <file-path>"}))
        return 2

    source_path = Path(sys.argv[1])
    extension = source_path.suffix.lower()
    if extension == ".pdf":
        units, warnings = extract_pdf(source_path)
    elif extension in {".xlsx", ".xlsm"}:
        units, warnings = extract_xlsx(source_path)
    elif extension in {".pptx", ".pptm"}:
        units, warnings = extract_pptx(source_path)
    elif extension == ".docx":
        units, warnings = extract_docx(source_path)
    else:
        units, warnings = [], [f"unsupported extension: {extension}"]

    result = {
        "path": str(source_path),
        "sourceName": source_path.name,
        "units": units,
        "textChars": sum(len(unit["text"]) for unit in units),
        "warnings": warnings,
    }
    print(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
