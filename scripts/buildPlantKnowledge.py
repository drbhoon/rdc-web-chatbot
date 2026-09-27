"""Turn RDC's commercial plant list into chatbot knowledge.

    python scripts/buildPlantKnowledge.py "<path to Plant Names and addresses.xlsx>"

Writes knowledge/public/commercial-plants.jsonl: one chunk per commercial plant
(its locality, the city or state it belongs to, and its full address), plus one
overview chunk that states the plant count of record and lists every
commercial plant by location. Load it into the database with
`npx tsx scripts/replacePlantKnowledge.ts`.

Only COMMERCIAL plants go in. RDC does not publish details of its dedicated
(project) plants, so they appear only as a count, taken from
knowledge/facts.json — the list itself never mentions them.

Wording: nothing here says "region". At RDC a region is an internal corporate
unit, so the bot must not use the word for geography (RDC, 2026-09-27). The
overview states the footprint of record (states, union territories, cities)
from knowledge/facts.json rather than counting the groups below, which are
customer-facing place names, not an official count.

The Excel is HR/BD's list, not ours: expected columns are S. No, ERP Name
(key), Display Name, and Full Address. Plants are grouped by the code that
starts every Display Name ("BG-Anjanapura" -> Bengaluru, locality Anjanapura).
The ERP names are not used for grouping: they spell the same city several
ways ("Bangalore", "Banglore") and sometimes name a state instead. A code not
in LOCATIONS stops the build, so a new one is named on purpose rather than
guessed.
"""
import collections
import hashlib
import json
import re
import sys
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "knowledge" / "public" / "commercial-plants.jsonl"
FACTS = json.loads((ROOT / "knowledge" / "facts.json").read_text(encoding="utf-8"))
SOURCE = "RDC Commercial Plants"
TAGS = ["plants", "public_knowledge", "rdc", "commercial_plants", "plant_addresses"]

# Display-name code -> the city or state name a customer would use.
LOCATIONS = {
    "AP": "Andhra Pradesh", "ASM": "Assam", "BG": "Bengaluru", "BHR": "Bihar", "CHA": "Chhattisgarh",
    "CHE": "Chennai", "GOA": "Goa", "GUJ": "Gujarat", "HYD": "Hyderabad", "JHA": "Jharkhand",
    "JK": "Jammu & Kashmir", "KAR": "Karnataka", "KER": "Kerala", "KOL": "Kolkata", "MH": "Maharashtra",
    "MP": "Madhya Pradesh", "MUM": "Mumbai", "NCR": "Delhi NCR", "ODI": "Odisha", "PB": "Punjab",
    "PUN": "Pune", "RAJ": "Rajasthan", "TN": "Tamil Nadu", "UP": "Uttar Pradesh", "UTR": "Uttarakhand",
}


def clean(value) -> str:
    text = re.sub(r"\s+", " ", str(value or "")).strip()
    return re.sub(r"\s*,\s*(,\s*)+", ", ", text).strip(" ,")


def location_and_locality(display: str) -> tuple[str, str]:
    code, _, rest = display.partition("-")
    code = code.strip().upper()
    if code not in LOCATIONS:
        raise SystemExit(f"Unknown location code {code!r} in {display!r}: add it to LOCATIONS in this script.")
    return LOCATIONS[code], clean(rest) or display


def chunk_id(text: str) -> str:
    return "plants-" + hashlib.sha256(text.encode("utf-8")).hexdigest()[:24]


def main(path: str) -> None:
    sheet = openpyxl.load_workbook(path, data_only=True, read_only=True).worksheets[0]
    plants = []
    for row in sheet.iter_rows(min_row=2, values_only=True):
        if not row or not any(row):
            continue
        erp, display, address = clean(row[1]), clean(row[2]), clean(row[3])
        if not (erp and display and address):
            raise SystemExit(f"Row {row[0]}: a plant needs an ERP name, a display name and an address.")
        pin = (re.findall(r"\b(\d{6})\b", address) or [""])[-1]
        location, locality = location_and_locality(display)
        plants.append({"erp": erp, "display": display, "address": address, "location": location,
                       "locality": locality, "pin": pin})

    expected = FACTS["plants"]["commercial"]
    if len(plants) != expected:
        raise SystemExit(f"The list has {len(plants)} plants but knowledge/facts.json says {expected} commercial. "
                         "Update facts.json (and the total) first, so the bot never states two different numbers.")

    tara, office = FACTS["tara"], FACTS["headOffice"]
    contact = (f"For orders, complaints or questions, message {tara['name']} on WhatsApp at {tara['whatsapp']} "
               f"({tara['link']}). To call, use the head office on {office['phone']}; local plant phone numbers "
               f"are listed on {FACTS['contactPage']}.")

    chunks = []
    for p in plants:
        text = (f"RDC commercial ready-mix concrete plant: {p['locality']}, {p['location']} "
                f"(plant name {p['display']}; ERP {p['erp']}). Address: {p['address']}."
                + (f" PIN code {p['pin']}." if p["pin"] else "") + f" {contact}")
        chunks.append({"id": chunk_id(text), "text": text,
                       "metadata": {"sourceName": SOURCE, "tags": TAGS, "location": p["location"], "pin": p["pin"]}})

    by_location = collections.defaultdict(list)
    for p in plants:
        by_location[p["location"]].append(p["locality"])
    lines = [f"- {place} ({len(names)}): " + ", ".join(sorted(names)) for place, names in sorted(by_location.items())]
    dedicated = FACTS["plants"]["total"] - expected
    reach = FACTS["footprint"]
    overview = (f"RDC Concrete (India) Limited serves customers in {reach['states']} states, "
                f"{reach['unionTerritories']} union territories and {reach['cities']} cities of India. "
                f"It operates {FACTS['plants']['total']} ready-mix concrete plants as on "
                f"{FACTS['asOf']}: {expected} commercial plants serving customers, and {dedicated} dedicated plants "
                f"set up for specific customer projects. Details of dedicated plants are not shared. "
                f"The commercial plants, by location:\n" + "\n".join(lines) + f"\n{contact}")
    chunks.insert(0, {"id": chunk_id(overview), "text": overview,
                      "metadata": {"sourceName": SOURCE, "tags": TAGS, "overview": True}})

    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open("w", encoding="utf-8", newline="\n") as f:
        for chunk in chunks:
            f.write(json.dumps(chunk, ensure_ascii=False) + "\n")
    print(f"Wrote {len(chunks)} chunks ({len(plants)} commercial plants + 1 overview) to {OUT}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    main(sys.argv[1])
