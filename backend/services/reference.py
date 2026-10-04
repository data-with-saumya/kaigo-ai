"""Approved reference corpus: public regulatory information plus clearly-marked synthetic entries."""

from __future__ import annotations

import difflib
import re
from functools import lru_cache
from pathlib import Path

import yaml
from pydantic import BaseModel

REFERENCE_DIR = Path(__file__).resolve().parents[2] / "data" / "reference"


class Authority(BaseModel):
    id: str
    name: str
    aliases: list[str] = []
    kind: str
    synthetic: bool = False
    registration_pattern: str | None = None
    source_url: str | None = None
    notes: str | None = None


class ReferenceDoc(BaseModel):
    id: str
    title: str
    publisher: str
    url: str
    used_for: str
    summary: str


class ReferenceCorpus(BaseModel):
    authorities: list[Authority]
    documents: list[ReferenceDoc]

    def find_authority(self, name: str | None) -> Authority | None:
        if not name:
            return None
        wanted = _norm(name)
        best, best_ratio = None, 0.0
        for authority in self.authorities:
            for candidate in [authority.name, *authority.aliases]:
                ratio = difflib.SequenceMatcher(None, wanted, _norm(candidate)).ratio()
                if ratio > best_ratio:
                    best, best_ratio = authority, ratio
        return best if best_ratio >= 0.88 else None

    def matches_pattern(self, authority: Authority, number: str | None) -> bool | None:
        if not authority.registration_pattern:
            return None
        return bool(number and re.fullmatch(authority.registration_pattern, number.strip()))


def _norm(text: str) -> str:
    return re.sub(r"[^a-z0-9 ]", "", text.lower()).strip()


@lru_cache
def load_reference() -> ReferenceCorpus:
    raw = yaml.safe_load((REFERENCE_DIR / "nursing_registration_india.yaml").read_text())
    return ReferenceCorpus(
        authorities=[Authority(**a) for a in raw["authorities"]],
        documents=[ReferenceDoc(**d) for d in raw["documents"]],
    )
