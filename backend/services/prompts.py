from functools import lru_cache
from pathlib import Path

PROMPTS_DIR = Path(__file__).resolve().parents[1] / "prompts"


@lru_cache
def _raw(name: str) -> str:
    return (PROMPTS_DIR / f"{name}.md").read_text()


def prompt(name: str, **values: str) -> str:
    text = _raw(name)
    return text.format(**values) if values else text
