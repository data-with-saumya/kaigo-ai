"""Checks that AI-written explanations only use facts the application gave them."""

from __future__ import annotations

import itertools
import re

NUMBER = re.compile(r"\d+(?:\.\d+)?")


def numbers_in(text: str) -> set[str]:
    return {_canon(n) for n in NUMBER.findall(text)}


def _canon(n: str) -> str:
    return str(float(n)).rstrip("0").rstrip(".") if "." in n else str(int(n))


def unsupported_numbers(text: str, facts: str, totals: list[int] | None = None) -> set[str]:
    """Numbers in `text` that appear nowhere in `facts` (pairwise score differences are allowed)."""
    allowed = numbers_in(facts)
    for a, b in itertools.combinations(totals or [], 2):
        allowed.add(str(abs(a - b)))
    return numbers_in(text) - allowed
