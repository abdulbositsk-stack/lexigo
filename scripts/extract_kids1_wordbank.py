"""Build LexiGo Word Bank JSON from the Smart English Kids 1 source PDFs.

The PDF layout keeps the English word, pronunciation, Uzbek translation, and
emoji on the same visual row. This extractor reads those rows by coordinate.
It deliberately stops when a vocabulary page is not exactly its advertised
word count, so a malformed page can never silently enter the Word Bank.
"""

from __future__ import annotations

import json
import logging
import re
import sys
from pathlib import Path

import pdfplumber


BOOKS = [
    ("Smart English - 1. Beginner (Lessons 1-36).pdf", 1, 36),
    ("Smart English - 2. Elementary (Lessons 37-72).pdf", 37, 72),
    ("Smart English - 3. Pre-Intermediate (Lessons 73-108).pdf", 73, 108),
    ("Smart English - 4. Intermediate (Lessons 109-144).pdf", 109, 144),
    ("Smart English - 5. Advanced (Lessons 145-180).pdf", 145, 180),
]

DEFAULT_EMOJI = "📖"
COMMON_UNCOUNTABLE = {"grass", "homework", "water", "milk", "bread", "rice", "money", "music", "information", "weather", "advice", "fruit"}
COMMON_PLURALS = {"gloves", "trousers", "shorts", "jeans", "scissors", "clothes", "people", "children", "teeth", "feet"}
SPECIAL_EXAMPLES = {
    "hello": ("Hello, Tom.", "Hello, my name is Ali."),
    "goodbye": ("Goodbye, Mum.", "We say goodbye to our teacher."),
    "thank you": ("Thank you, Mum.", "Thank you for your help."),
    "how are you": ("How are you?", "Hello, how are you today?"),
    "my name is": ("My name is Ali.", "My name is Ali, and I am eight."),
}


def text_at(words: list[dict], left: float, right: float, y: float, tolerance: float = 5) -> str:
    selected = [w for w in words if left <= w["x0"] < right and abs(w["top"] - y) < tolerance]
    selected.sort(key=lambda word: word["x0"])
    return " ".join(word["text"] for word in selected)


def text_in_band(words: list[dict], left: float, right: float, y_from: float, y_to: float) -> str:
    selected = [w for w in words if left <= w["x0"] < right and y_from <= w["top"] <= y_to]
    selected.sort(key=lambda word: (word["top"], word["x0"]))
    return " ".join(word["text"] for word in selected)


def clean_uzbek(value: str) -> str:
    value = re.sub(r"\([^)]*\)", "", value)
    return re.sub(r"\s+", " ", value).strip(" -–—↻")


def lesson_title(page_text: str, number: int) -> str:
    lines = [line.strip() for line in page_text.splitlines() if line.strip()]
    ignored = ("SMART ENGLISH", "SCAN TO", "NEW WORDS", "KB1-", "Pupil's Book", "Activity Book")
    for line in lines:
        if line.upper() == line and any(char.isalpha() for char in line) and not any(token.lower() in line.lower() for token in ignored):
            return f"Lesson {number} - {line.title()}"
    return f"Lesson {number}"


def first_emoji(words: list[dict], y: float) -> str:
    candidates = [w["text"] for w in words if 20 <= w["x0"] < 65 and abs(w["top"] - y) < 6]
    for candidate in candidates:
        if not re.search(r"[A-Za-z0-9]", candidate):
            return candidate
    return DEFAULT_EMOJI


def examples_for(word: str, uzbek: str) -> dict[str, str]:
    lower = word.lower().strip()
    if lower in SPECIAL_EXAMPLES:
        easy, normal = SPECIAL_EXAMPLES[lower]
    elif uzbek.lower().endswith("moq"):
        easy, normal = f"Please {lower}.", f"The teacher asks us to {lower}."
    elif lower in COMMON_PLURALS or lower.endswith("s") and not lower.endswith("ss"):
        easy, normal = f"These are {lower}.", f"I can see {lower} in the picture."
    elif lower in COMMON_UNCOUNTABLE:
        easy, normal = f"This is {lower}.", f"We can see {lower} in the picture."
    elif " " in lower:
        easy, normal = f"I know {lower}.", f"We use the words {lower} in class."
    else:
        easy, normal = f"This is a {lower}.", f"I can see a {lower} in the picture."
    return {"easy": easy, "normal": normal}


def extract_page(page, lesson_number: int) -> dict:
    words = page.extract_words()
    page_text = page.extract_text() or ""
    # Every Smart English lesson page holds exactly 15 rows. Some pages label
    # them as "new words" plus "review", but the total shown in the book is
    # still 15, not the sum of two separate page lists.
    expected_count = 15
    anchors = [
        word for word in words
        if 60 <= word["x0"] < 175 and 130 < word["top"] < 700 and re.search(r"[A-Za-z]", word["text"])
    ]
    rows = []
    seen_words = set()
    consumed_until = -1
    for anchor in anchors:
        y = anchor["top"]
        if y <= consumed_until:
            continue
        english = text_at(words, 60, 175, y)
        uzbek = clean_uzbek(text_at(words, 270, 490, y))
        if not uzbek:
            # A long phrase may wrap after its first English line. Its Uzbek
            # translation sits between the two English lines; only in this
            # special case do we widen the vertical band.
            english = text_in_band(words, 60, 175, y - 3, y + 27)
            uzbek = clean_uzbek(text_in_band(words, 270, 490, y - 3, y + 27))
            consumed_until = y + 27
        else:
            consumed_until = y + 5
        if not english or not uzbek:
            continue
        key = english.lower()
        if key in seen_words:
            continue
        seen_words.add(key)
        rows.append({"y": y, "word": english, "uzb": uzbek, "emoji": first_emoji(words, y)})
    rows = rows[:expected_count]
    if len(rows) != expected_count:
        raise ValueError(f"Lesson {lesson_number}: expected {expected_count} words, extracted {len(rows)}")
    return {
        "id": f"kids-1-lesson-{lesson_number}",
        "name": lesson_title(page_text, lesson_number),
        "words": [
            {"word": row["word"], "uzb": row["uzb"], "emoji": row["emoji"], "examples": examples_for(row["word"], row["uzb"])}
            for row in rows
        ],
    }


def main() -> None:
    if len(sys.argv) != 4:
        raise SystemExit("Usage: extract_kids1_wordbank.py <pdf-folder> <output-json> <book-index 1-5>")
    pdf_folder = Path(sys.argv[1])
    output = Path(sys.argv[2])
    book_index = int(sys.argv[3]) - 1
    if not 0 <= book_index < len(BOOKS):
        raise SystemExit("book-index must be from 1 to 5")
    units = []
    filename, first_lesson, last_lesson = BOOKS[book_index]
    with pdfplumber.open(pdf_folder / filename) as pdf:
        for lesson in range(first_lesson, last_lesson + 1):
            # Each book has 3 pages per lesson after its two-page cover.
            page_index = 4 + ((lesson - first_lesson) * 3)
            units.append(extract_page(pdf.pages[page_index], lesson))
    payload = {"level": "Kids 1", "source": filename, "units": units}
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(units)} lessons and {sum(len(unit['words']) for unit in units)} words to {output}")


if __name__ == "__main__":
    logging.getLogger("pdfminer").setLevel(logging.ERROR)
    main()
