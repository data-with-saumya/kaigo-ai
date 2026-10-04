"""Generate the fictional credential documents used in the demo and the evaluation suite.

Every document is invented: fictional people, a fictional council ("Demo State Nursing Council"),
no seals, no signatures, and a visible SYNTHETIC watermark. The manifest records the ground truth
that scripts/evaluate.py scores Gemini's extraction against.

Run locally (macOS fonts):  backend/.venv/bin/python scripts/generate_synthetic_documents.py
"""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

OUT = Path(__file__).resolve().parents[1] / "data" / "synthetic" / "documents"
FONTS = Path("/System/Library/Fonts/Supplemental")
W, H = 1600, 1130
INK, MUTED, RULE = (40, 34, 24), (95, 84, 66), (150, 128, 92)


def font(name: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(FONTS / name), size)


def watermark(img: Image.Image) -> Image.Image:
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    d.text((W / 2, H / 2), "SYNTHETIC · DEMO ONLY", font=font("Arial Bold.ttf", 110), fill=(147, 54, 58, 34),
           anchor="mm")
    return Image.alpha_composite(img, layer.rotate(18, resample=Image.BICUBIC, center=(W / 2, H / 2)))


def frame(d: ImageDraw.ImageDraw) -> None:
    d.rectangle([28, 28, W - 28, H - 28], outline=RULE, width=4)
    d.rectangle([44, 44, W - 44, H - 44], outline=RULE, width=1)


def registration(spec: dict) -> Image.Image:
    img = Image.new("RGBA", (W, H), (253, 251, 246, 255))
    d = ImageDraw.Draw(img)
    frame(d)
    d.text((W / 2, 120), spec["authority"].upper(), font=font("Georgia Bold.ttf", 44), fill=INK, anchor="mm")
    d.text((W / 2, 172), "Fictional council · created for software demonstration · not a real document",
           font=font("Georgia Italic.ttf", 24), fill=MUTED, anchor="mm")
    d.line([(300, 214), (W - 300, 214)], fill=RULE, width=2)
    d.text((W / 2, 290), "Certificate of Registration", font=font("Georgia Bold.ttf", 64), fill=INK, anchor="mm")
    body = font("Georgia.ttf", 34)
    d.text((W / 2, 400), "This is to certify that", font=body, fill=MUTED, anchor="mm")
    d.text((W / 2, 470), spec["name"].upper(), font=font("Georgia Bold.ttf", 56), fill=INK, anchor="mm")
    d.text((W / 2, 545), "is registered with this Council as a", font=body, fill=MUTED, anchor="mm")
    d.text((W / 2, 610), spec["credential_type"], font=font("Georgia Bold.ttf", 42), fill=INK, anchor="mm")

    label, value = font("Arial.ttf", 26), font("Arial Bold.ttf", 32)
    rows = [("Registration No.", spec["number"]), ("Date of Registration", spec["issued"]),
            ("Valid Until", spec["valid_until"]), ("Register", spec.get("register", "Part A"))]
    x0, y0 = 260, 720
    for i, (k, v) in enumerate(rows):
        x = x0 + (i % 2) * 560
        y = y0 + (i // 2) * 110
        d.text((x, y), k.upper(), font=label, fill=MUTED)
        d.text((x, y + 36), v, font=value, fill=INK)
    d.text((W - 260, H - 120), "Registrar (synthetic)", font=font("Georgia Italic.ttf", 26), fill=MUTED, anchor="rm")
    d.text((260, H - 120), f"Doc ref {spec['doc_ref']}", font=font("Arial.ttf", 22), fill=MUTED)

    if spec.get("smudge_valid_until"):
        # An ink blot over the expiry date: the extraction must say "unreadable", not guess.
        blot = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        bd = ImageDraw.Draw(blot)
        bd.ellipse([x0 - 20, y0 + 110 + 28, x0 + 340, y0 + 110 + 84], fill=(52, 45, 34, 255))
        img = Image.alpha_composite(img, blot.filter(ImageFilter.GaussianBlur(2)))
    return watermark(img)


def training(spec: dict) -> Image.Image:
    img = Image.new("RGBA", (W, H), (252, 252, 250, 255))
    d = ImageDraw.Draw(img)
    frame(d)
    d.text((W / 2, 130), spec["provider"].upper(), font=font("Arial Bold.ttf", 40), fill=INK, anchor="mm")
    d.text((W / 2, 178), "Fictional training provider · demonstration only", font=font("Arial.ttf", 24),
           fill=MUTED, anchor="mm")
    d.text((W / 2, 300), "Certificate of Completion", font=font("Georgia Bold.ttf", 62), fill=INK, anchor="mm")
    d.text((W / 2, 410), "awarded to", font=font("Georgia.ttf", 34), fill=MUTED, anchor="mm")
    d.text((W / 2, 480), spec["name"], font=font("Georgia Bold.ttf", 56), fill=INK, anchor="mm")
    d.text((W / 2, 570), "for successfully completing", font=font("Georgia.ttf", 34), fill=MUTED, anchor="mm")
    d.text((W / 2, 640), spec["course"], font=font("Georgia Bold.ttf", 44), fill=INK, anchor="mm")
    d.text((W / 2, 740), f"{spec['hours']} contact hours · completed {spec['completed']}", font=font("Arial.ttf", 30),
           fill=MUTED, anchor="mm")
    d.text((W / 2, 800), f"Skills certified: {', '.join(spec['skills'])}", font=font("Arial Bold.ttf", 30),
           fill=INK, anchor="mm")
    return watermark(img)


def handover_note() -> Image.Image:
    img = Image.new("RGBA", (W, H), (255, 255, 252, 255))
    d = ImageDraw.Draw(img)
    d.text((120, 120), "Shift handover note (synthetic)", font=font("Arial Bold.ttf", 48), fill=INK)
    lines = ["Evening visit completed 21:30.", "Family asked for the same nurse tomorrow if possible.",
             "Supplies: gauze running low, reorder on Monday.", "Next visit: 18:00 tomorrow."]
    for i, line in enumerate(lines):
        d.text((120, 240 + i * 70), line, font=font("Courier New.ttf", 36), fill=INK)
    return watermark(img)


DOCS = [
    {"file": "priya-nair-registration.png", "kind": "registration", "caregiver_id": "CG-0107",
     "label": "Priya Nair: registration (valid)", "demo": True,
     "spec": {"authority": "Demo State Nursing Council", "name": "Priya Nair",
              "credential_type": "Registered Nurse & Registered Midwife", "number": "DSNC-RNRM-2019-04417",
              "issued": "12-06-2019", "valid_until": "11-06-2027", "doc_ref": "SYN-0107"},
     "expected": {"caregiver_name": "Priya Nair", "credential_type": "RN-RM", "registration_number": "DSNC-RNRM-2019-04417",
                  "issuing_authority": "Demo State Nursing Council", "issue_date": "2019-06-12",
                  "valid_until": "2027-06-11"},
     "expected_status": "needs_review"},
    {"file": "priya-nair-wound-care-training.png", "kind": "training", "caregiver_id": "CG-0107",
     "label": "Priya Nair: wound-care training", "demo": False,
     "spec": {"provider": "Bengaluru Demo Institute of Nursing Skills", "name": "Priya Nair",
              "course": "Advanced Wound Care Management", "hours": 24, "completed": "18-02-2024",
              "skills": ["wound care", "dressing techniques"]},
     "expected": {"caregiver_name": "Priya Nair", "skills": ["wound care"]}, "expected_status": None},
    {"file": "rahul-menon-registration.png", "kind": "registration", "caregiver_id": "CG-0104",
     "label": "Rahul Menon: registration (expired)", "demo": True,
     "spec": {"authority": "Demo State Nursing Council", "name": "Rahul Menon", "credential_type": "Registered Nurse",
              "number": "DSNC-RN-2016-03390", "issued": "15-08-2016", "valid_until": "14-08-2026", "doc_ref": "SYN-0104"},
     "expected": {"caregiver_name": "Rahul Menon", "credential_type": "RN", "registration_number": "DSNC-RN-2016-03390",
                  "issuing_authority": "Demo State Nursing Council", "issue_date": "2016-08-15",
                  "valid_until": "2026-08-14"},
     "expected_status": "blocked"},
    {"file": "fatima-khan-registration.png", "kind": "registration", "caregiver_id": "CG-0108",
     "label": "Fatima Khan: registration (expiry unreadable)", "demo": True,
     "spec": {"authority": "Demo State Nursing Council", "name": "Fatima Khan", "credential_type": "Registered Nurse",
              "number": "DSNC-RN-2022-08802", "issued": "24-01-2022", "valid_until": "23-01-2027",
              "doc_ref": "SYN-0108", "smudge_valid_until": True},
     "expected": {"caregiver_name": "Fatima Khan", "credential_type": "RN", "registration_number": "DSNC-RN-2022-08802",
                  "issuing_authority": "Demo State Nursing Council", "issue_date": "2022-01-24", "valid_until": None},
     "expected_status": "needs_review"},
    {"file": "anjali-rao-registration.png", "kind": "registration", "caregiver_id": "CG-0101",
     "label": "Anjali Rao: registration (valid)", "demo": False,
     "spec": {"authority": "Demo State Nursing Council", "name": "Anjali Rao", "credential_type": "Registered Nurse",
              "number": "DSNC-RN-2017-02281", "issued": "02-03-2017", "valid_until": "01-03-2029", "doc_ref": "SYN-0101"},
     "expected": {"caregiver_name": "Anjali Rao", "credential_type": "RN", "registration_number": "DSNC-RN-2017-02281",
                  "issuing_authority": "Demo State Nursing Council", "issue_date": "2017-03-02",
                  "valid_until": "2029-03-01"},
     "expected_status": "ready"},
    {"file": "unknown-council-registration.png", "kind": "registration", "caregiver_id": None,
     "label": "Unknown council (not in reference list)", "demo": False,
     "spec": {"authority": "Coastal Nursing Registry", "name": "Arjun Varma", "credential_type": "Registered Nurse",
              "number": "CNR/88213", "issued": "05-05-2020", "valid_until": "04-05-2028", "doc_ref": "SYN-9001"},
     "expected": {"caregiver_name": "Arjun Varma", "credential_type": "RN", "registration_number": "CNR/88213",
                  "issuing_authority": "Coastal Nursing Registry", "issue_date": "2020-05-05",
                  "valid_until": "2028-05-04"},
     "expected_status": "needs_review"},
    {"file": "handover-note.png", "kind": "other", "caregiver_id": None,
     "label": "Not a credential (handover note)", "demo": False, "spec": {},
     "expected": {"is_credential_document": False}, "expected_status": "needs_review"},
]


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    manifest = []
    for doc in DOCS:
        if doc["kind"] == "registration":
            image = registration(doc["spec"])
        elif doc["kind"] == "training":
            image = training(doc["spec"])
        else:
            image = handover_note()
        image.convert("RGB").save(OUT / doc["file"], optimize=True)
        manifest.append({k: doc[k] for k in ("file", "kind", "caregiver_id", "label", "demo", "expected",
                                              "expected_status")})
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2))
    print(f"Wrote {len(manifest)} documents to {OUT}")


if __name__ == "__main__":
    main()
