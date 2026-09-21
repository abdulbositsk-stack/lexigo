"""Build the Kids 2 Word Bank from the teacher's supplied lesson folders.

Source files are read-only. The generated JSON is written to public/word-bank.
"""

from __future__ import annotations

import json
import re
import sys
from collections import Counter
from pathlib import Path

import pdfplumber
from docx import Document
from nltk.corpus import wordnet as wn


ROOT = Path(r"D:\10-12 KIDS")
OUTPUT = Path("public/word-bank/kids-2-lessons-1-192.json")

# Lesson 1 does not contain a separate vocabulary list. These words come from
# its alphabet and greeting materials, as requested by the teacher.
LESSON_ONE_FALLBACK = [
    ("hello", "salom", "👋"),
    ("goodbye", "xayr", "👋"),
    ("name", "ism", "🏷️"),
    ("teacher", "o‘qituvchi", "🧑‍🏫"),
    ("student", "o‘quvchi", "🧑‍🎓"),
    ("class", "sinf", "🏫"),
    ("alphabet", "alifbo", "🔤"),
    ("letter", "harf", "🔠"),
    ("listen", "tinglamoq", "👂"),
    ("repeat", "takrorlamoq", "🔁"),
    ("cousin", "amakivachcha / tog‘avachcha", "🧒"),
    ("sorry", "kechirasiz", "🙏"),
]

# These three units have no usable unique vocabulary table. Their word sets are
# selected from the lesson's own topic/material, not borrowed from another unit.
MATERIAL_FALLBACKS = {
    11: [
        ("in", "ichida", "📦"), ("on", "ustida", "⬆️"),
        ("under", "ostida", "⬇️"), ("behind", "orqasida", "🔙"),
        ("in front of", "oldida", "🔜"), ("next to", "yonida", "🤝"),
        ("between", "orasida", "↔️"), ("near", "yaqinida", "📍"),
        ("opposite", "ro‘parasida", "↔️"), ("above", "yuqorisida", "⬆️"),
        ("below", "pastida", "⬇️"), ("around", "atrofida", "🔄"),
    ],
    83: [
        ("purpose", "maqsad", "🎯"), ("plan", "reja", "📝"),
        ("decide", "qaror qilmoq", "🤔"), ("want", "xohlamoq", "⭐"),
        ("need", "kerak bo‘lmoq", "✅"), ("learn", "o‘rganmoq", "📚"),
        ("practise", "mashq qilmoq", "💪"), ("visit", "tashrif buyurmoq", "🚶"),
        ("buy", "sotib olmoq", "🛍️"), ("use", "foydalanmoq", "🛠️"),
        ("help", "yordam bermoq", "🤝"), ("choose", "tanlamoq", "✅"),
    ],
    146: [
        ("improve", "yaxshilamoq", "📈"), ("explain", "tushuntirmoq", "💬"),
        ("compare", "taqqoslamoq", "⚖️"), ("describe", "tasvirlamoq", "🖊️"),
        ("experience", "tajriba", "🌟"), ("opinion", "fikr", "💭"),
        ("reason", "sabab", "❓"), ("example", "misol", "💡"),
        ("solution", "yechim", "🧩"), ("challenge", "qiyinchilik", "🏆"),
        ("success", "muvaffaqiyat", "🎉"), ("progress", "rivojlanish", "📊"),
    ],
}

EMOJI_BY_KEYWORD = {
    "apple": "🍎", "banana": "🍌", "bread": "🍞", "breakfast": "🥣",
    "cake": "🍰", "chicken": "🍗", "coffee": "☕", "dinner": "🍽️",
    "egg": "🥚", "fish": "🐟", "food": "🍲", "fruit": "🍇",
    "ice cream": "🍦", "juice": "🧃", "lunch": "🥪", "meal": "🍽️",
    "milk": "🥛", "orange": "🍊", "pizza": "🍕", "rice": "🍚",
    "salad": "🥗", "salt": "🧂", "sandwich": "🥪", "soup": "🍲",
    "sugar": "🍬", "tea": "🍵", "water": "💧", "animal": "🐾",
    "bird": "🐦", "cat": "🐱", "cow": "🐄", "dog": "🐶", "elephant": "🐘",
    "fish": "🐟", "horse": "🐴", "lion": "🦁", "monkey": "🐒", "mouse": "🐭",
    "rabbit": "🐰", "tiger": "🐯", "bear": "🐻", "family": "👨‍👩‍👧‍👦",
    "mother": "👩", "father": "👨", "sister": "👧", "brother": "👦",
    "grandmother": "👵", "grandfather": "👴", "baby": "👶", "friend": "🤝",
    "shirt": "👕", "dress": "👗", "shoe": "👟", "sock": "🧦", "hat": "🧢",
    "jacket": "🧥", "trousers": "👖", "skirt": "👗", "car": "🚗", "bus": "🚌",
    "train": "🚆", "plane": "✈️", "bike": "🚲", "boat": "⛵", "school": "🏫",
    "teacher": "🧑‍🏫", "student": "🧑‍🎓", "book": "📘", "pen": "🖊️",
    "pencil": "✏️", "bag": "🎒", "house": "🏠", "home": "🏠", "room": "🚪",
    "kitchen": "🍳", "bed": "🛏️", "table": "🪑", "chair": "🪑", "door": "🚪",
    "window": "🪟", "garden": "🌳", "tree": "🌳", "flower": "🌸", "sun": "☀️",
    "rain": "🌧️", "snow": "❄️", "wind": "💨", "weather": "🌤️", "happy": "😊",
    "sad": "😢", "angry": "😠", "tired": "😴", "love": "❤️", "run": "🏃",
    "walk": "🚶", "jump": "🦘", "swim": "🏊", "dance": "💃", "sing": "🎤",
    "play": "🎮", "read": "📖", "write": "✍️", "draw": "🎨", "cook": "👩‍🍳",
    "bake": "🥧", "boil": "♨️", "fry": "🍳", "slice": "🔪", "chop": "🔪",
    "pour": "🫗", "clean": "🧼", "wash": "🧽", "buy": "🛍️", "money": "💵",
    "doctor": "🩺", "hospital": "🏥", "police": "👮", "job": "💼", "work": "💼",
    "computer": "💻", "phone": "📱", "music": "🎵", "movie": "🎬", "game": "🎲",
    "birthday": "🎂", "holiday": "🏖️", "country": "🗺️", "city": "🏙️", "world": "🌍",
}

SYNONYM_OVERRIDES = {
    "hello": ["hi", "greetings"], "goodbye": ["bye", "farewell"],
    "teacher": ["educator", "instructor"], "student": ["pupil", "learner"],
    "class": ["lesson", "course"], "name": ["title", "label"],
    "listen": ["hear", "pay attention"], "repeat": ["say again", "restate"],
    "sorry": ["excuse me", "forgive me"], "happy": ["glad", "cheerful"],
    "sad": ["unhappy", "upset"], "big": ["large", "huge"], "small": ["little", "tiny"],
    "good": ["nice", "great"], "bad": ["poor", "awful"], "beautiful": ["pretty", "lovely"],
    "quick": ["fast", "rapid"], "slow": ["unhurried", "gradual"],
    "buy": ["purchase", "get"], "help": ["assist", "support"],
    "begin": ["start", "commence"], "finish": ["end", "complete"],
    "child": ["kid", "youngster"], "friend": ["pal", "companion"],
    "house": ["home", "residence"], "job": ["work", "occupation"],
}


def normalize_space(value: str) -> str:
    return re.sub(r"\s+", " ", value.replace("\xa0", " ")).strip()


def clean_word(value: str) -> str:
    value = normalize_space(value)
    value = re.sub(r"\[[^\]]*\]", "", value)
    value = re.sub(r"^\s*(?:\d+[.)-]?|[•●▪])\s*", "", value)
    value = normalize_space(value)
    return value.strip(" -–—:;")


def clean_uzbek(value: str) -> str:
    value = normalize_space(value).replace("�", "")
    value = re.sub(r"^\s*(?:\d+[.)-]?|[•●▪])\s*", "", value)
    return value.strip(" -–—:;")


def valid_pair(word: str, uzbek: str) -> bool:
    if not word or not uzbek or len(word) > 80 or len(uzbek) > 160:
        return False
    if word.lower() in {"word", "words", "english", "vocabulary", "unit"}:
        return False
    return bool(re.search(r"[A-Za-z]", word))


def parse_docx(path: Path) -> list[tuple[str, str]]:
    document = Document(path)
    pairs: list[tuple[str, str]] = []
    for table in document.tables:
        for row in table.rows:
            cells = [normalize_space(cell.text) for cell in row.cells]
            if len(cells) < 2:
                continue
            word, uzbek = clean_word(cells[0]), clean_uzbek(cells[-1])
            if valid_pair(word, uzbek):
                pairs.append((word, uzbek))
    return dedupe_pairs(pairs)


def parse_pdf(path: Path) -> list[tuple[str, str]]:
    pairs: list[tuple[str, str]] = []
    with pdfplumber.open(path) as pdf:
        for page in pdf.pages:
            for table in page.extract_tables() or []:
                for row in table:
                    cells = [normalize_space(cell or "") for cell in row]
                    if len(cells) < 2:
                        continue
                    word, uzbek = clean_word(cells[0]), clean_uzbek(cells[-1])
                    if valid_pair(word, uzbek):
                        pairs.append((word, uzbek))
            # The early lessons use a visual two-column list instead of an
            # actual PDF table, so read its printed vocabulary lines as well.
            for line in (page.extract_text() or "").splitlines():
                line = normalize_space(line)
                if not line or line.lower().startswith(("unit ", "lesson ")):
                    continue
                match = re.match(r"^(.*?)\s*-?\s*\[[^\]]*\]\s*(.+)$", line)
                if not match:
                    match = re.match(r"^(.*?)\s*-?\s*\[[^\s]+\s+(.+)$", line)
                if not match:
                    continue
                word, uzbek = clean_word(match.group(1)), clean_uzbek(match.group(2))
                if valid_pair(word, uzbek):
                    pairs.append((word, uzbek))
    return dedupe_pairs(pairs)


def dedupe_pairs(pairs: list[tuple[str, str]]) -> list[tuple[str, str]]:
    result: list[tuple[str, str]] = []
    seen: set[str] = set()
    for word, uzbek in pairs:
        key = re.sub(r"[^a-z0-9]", "", word.lower())
        if key and key not in seen:
            seen.add(key)
            result.append((word, uzbek))
    return result


def lesson_directory(lesson: int) -> Path:
    return ROOT / (f"L-{lesson}" if lesson <= 11 else f"LESSON {lesson}")


def find_vocab_file(lesson: int) -> Path | None:
    directory = lesson_directory(lesson)
    candidates = [path for path in directory.rglob("*") if path.is_file() and "vocab" in path.name.lower()]
    matching = [path for path in candidates if re.search(rf"(?<!\d){lesson}(?!\d)", path.name)]
    candidates = matching or candidates
    if not candidates:
        return None
    docx = next((path for path in candidates if path.suffix.lower() == ".docx"), None)
    return docx or next((path for path in candidates if path.suffix.lower() == ".pdf"), None)


def emoji_for(word: str) -> str:
    lowered = word.lower()
    for key, emoji in EMOJI_BY_KEYWORD.items():
        if key in lowered:
            return emoji
    return "📖"


def wordnet_synonyms(word: str) -> list[str]:
    key = word.lower().replace(" ", "_")
    if key in SYNONYM_OVERRIDES:
        return SYNONYM_OVERRIDES[key]
    synonyms: list[str] = []
    try:
        # WordNet's later senses can be unrelated to the meaning taught in a
        # beginner vocabulary unit (for example, a person's name). Restricting
        # this to the most common sense keeps only direct, safe alternatives.
        for synset in wn.synsets(key)[:1]:
            for lemma in synset.lemma_names():
                candidate = lemma.replace("_", " ").lower()
                if candidate != word.lower() and candidate not in synonyms and candidate.isascii():
                    synonyms.append(candidate)
                if len(synonyms) == 2:
                    return synonyms
    except LookupError:
        pass
    # A synonym button is intentionally omitted unless two genuine alternatives
    # are available; learners should never be shown a guessed related word.
    return []


def word_kind(word: str, uzbek: str) -> str:
    if uzbek.lower().endswith("moq"):
        return "verb"
    try:
        synsets = wn.synsets(word.lower().replace(" ", "_"))
        if synsets:
            return {"v": "verb", "a": "adjective", "s": "adjective", "r": "adverb"}.get(synsets[0].pos(), "noun")
    except LookupError:
        pass
    return "noun"


def article(word: str) -> str:
    return "an" if word[:1].lower() in "aeiou" else "a"


def examples_for(word: str, uzbek: str) -> dict[str, str]:
    kind = word_kind(word, uzbek)
    if kind == "verb":
        return {
            "easy": f"I can {word}.",
            "normal": f"We {word} together in class.",
            "hard": f"Please {word} carefully when you practise at home.",
        }
    if kind == "adjective":
        return {
            "easy": f"It is {word}.",
            "normal": f"This is a {word} thing.",
            "hard": f"The teacher explained why it is {word} in this lesson.",
        }
    if kind == "adverb":
        return {
            "easy": f"Do it {word}.",
            "normal": f"Please speak {word} in class.",
            "hard": f"Try to use this word {word} when you speak English.",
        }
    return {
        "easy": f"This is {article(word)} {word}.",
        "normal": f"I can see the {word} in the picture.",
        "hard": f"The {word} is an important word in this lesson.",
    }


def make_item(word: str, uzbek: str, emoji: str | None = None) -> dict:
    return {
        "word": word,
        "uzb": uzbek,
        "emoji": emoji or emoji_for(word),
        "examples": examples_for(word, uzbek),
        "synonyms": wordnet_synonyms(word),
    }


def build() -> dict:
    units = []
    seen_vocabularies: set[tuple[str, ...]] = set()
    missing: list[int] = []
    duplicates: list[int] = []
    for lesson in range(1, 193):
        source = find_vocab_file(lesson)
        if source is None:
            pairs: list[tuple[str, str]] = []
        elif source.suffix.lower() == ".docx":
            pairs = parse_docx(source)
        else:
            pairs = parse_pdf(source)
        fingerprint = tuple(re.sub(r"[^a-z0-9]", "", word.lower()) for word, _ in pairs)
        is_duplicate = bool(fingerprint) and fingerprint in seen_vocabularies
        fallback = lesson == 1 or len(pairs) < 6 or is_duplicate
        if fallback:
            if lesson == 1:
                words = [make_item(word, uzbek, emoji) for word, uzbek, emoji in LESSON_ONE_FALLBACK]
            elif lesson in MATERIAL_FALLBACKS:
                words = [make_item(word, uzbek, emoji) for word, uzbek, emoji in MATERIAL_FALLBACKS[lesson]]
            else:
                missing.append(lesson)
                words = []
        else:
            seen_vocabularies.add(fingerprint)
            words = [make_item(word, uzbek) for word, uzbek in pairs]
        if is_duplicate:
            duplicates.append(lesson)
        units.append({
            "id": f"kids-2-lesson-{lesson}",
            "lesson": lesson,
            "name": f"Lesson {lesson}",
            "words": words,
            "source": source.name if source else "lesson material",
        })
    return {"level": "Kids 2", "units": units, "review": {"missing": missing, "duplicates": duplicates}}


if __name__ == "__main__":
    data = build()
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    populated = [unit for unit in data["units"] if unit["words"]]
    counts = Counter(len(unit["words"]) for unit in populated)
    print(f"Wrote {len(populated)}/192 populated lessons to {OUTPUT}")
    print(f"Vocabulary-size distribution: {dict(sorted(counts.items()))}")
    print(f"Needs manual material-derived vocabulary: {data['review']['missing']}")
    print(f"Duplicate vocabulary units: {data['review']['duplicates']}")
