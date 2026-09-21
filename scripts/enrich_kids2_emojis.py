"""Replace generic book emojis in the Kids 2 Word Bank with word-aware hints.

The original extraction used 📖 as a placeholder whenever it did not know an
emoji. This post-processing step never changes the vocabulary, translations,
examples, or synonyms; it only replaces those placeholders. Exact classroom
words receive a specific emoji first, then WordNet's semantic category gives
abstract words a meaningful visual hint instead of a book icon.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

try:
    from nltk.corpus import wordnet as wn
except ImportError:  # The generated bank still gets safe non-book fallbacks.
    wn = None


PATH = Path("public/word-bank/kids-2-lessons-1-192.json")

# Long phrases are matched before shorter ones.
EXACT = {
    "how old": "🎂", "how many": "🔢", "how much": "💰", "what time": "⏰",
    "in front of": "⬆️", "next to": "↔️", "behind": "🔙", "between": "↔️",
    "living room": "🛋️", "dining room": "🍽️", "bedroom": "🛏️", "bathroom": "🛁",
    "playground": "🛝", "classroom": "🏫", "whiteboard": "🧑‍🏫", "blackboard": "🧑‍🏫",
    "ice cream": "🍦", "orange juice": "🧃", "hot dog": "🌭", "French fries": "🍟",
    "traffic light": "🚦", "police officer": "👮", "fire fighter": "🧑‍🚒",
    "washing machine": "🧺", "toothbrush": "🪥", "hairbrush": "🪮", "sunglasses": "🕶️",
    "birthday": "🎂", "holiday": "🏖️", "weekend": "🗓️", "yesterday": "⬅️",
    "tomorrow": "➡️", "morning": "🌅", "afternoon": "☀️", "evening": "🌆", "night": "🌙",
    "teacher": "🧑‍🏫", "student": "🧑‍🎓", "friend": "🤝", "family": "👨‍👩‍👧‍👦",
    "mother": "👩", "father": "👨", "sister": "👧", "brother": "👦", "baby": "👶",
    "woman": "👩", "man": "👨", "child": "🧒", "person": "🧑", "people": "👥",
    "face": "🙂", "forehead": "👤", "cheek": "😊", "chin": "👤", "nose": "👃",
    "nostril": "👃", "eye": "👁️", "eyelid": "👁️", "eyelash": "👁️", "ear": "👂",
    "mouth": "👄", "lip": "👄", "tooth": "🦷", "tongue": "👅", "hand": "✋",
    "finger": "☝️", "arm": "💪", "leg": "🦵", "foot": "🦶", "feet": "🦶",
    "head": "👤", "hair": "💇", "beard": "🧔", "moustache": "🧔", "body": "🧍",
    "cat": "🐱", "dog": "🐶", "horse": "🐴", "cow": "🐄", "sheep": "🐑",
    "goat": "🐐", "pig": "🐷", "rabbit": "🐰", "mouse": "🐭", "lion": "🦁",
    "tiger": "🐯", "elephant": "🐘", "monkey": "🐒", "snake": "🐍", "frog": "🐸",
    "fox": "🦊", "bee": "🐝", "bird": "🐦", "fish": "🐟", "animal": "🐾",
    "apple": "🍎", "banana": "🍌", "tomato": "🍅", "potato": "🥔", "carrot": "🥕",
    "onion": "🧅", "bread": "🍞", "cake": "🍰", "egg": "🥚", "chicken": "🍗",
    "meat": "🥩", "rice": "🍚", "soup": "🍲", "salad": "🥗", "sandwich": "🥪",
    "pizza": "🍕", "water": "💧", "milk": "🥛", "tea": "🍵", "coffee": "☕",
    "cup": "☕", "glass": "🥛", "plate": "🍽️", "spoon": "🥄", "fork": "🍴", "knife": "🔪",
    "book": "📘", "dictionary": "📕", "notebook": "📓", "pen": "🖊️", "pencil": "✏️",
    "eraser": "🧽", "ruler": "📏", "desk": "🪑", "table": "🪑", "chair": "🪑",
    "computer": "💻", "phone": "📱", "letter": "🔠", "alphabet": "🔤", "number": "🔢",
    "school": "🏫", "class": "🏫", "lesson": "🧑‍🏫", "homework": "📝", "exam": "✅",
    "house": "🏠", "home": "🏠", "door": "🚪", "window": "🪟", "floor": "⬇️",
    "wall": "🧱", "roof": "🏠", "garden": "🌳", "tree": "🌳", "flower": "🌸",
    "bed": "🛏️", "pillow": "🛏️", "cushion": "🛋️", "sofa": "🛋️", "mirror": "🪞",
    "car": "🚗", "bus": "🚌", "train": "🚆", "plane": "✈️", "bicycle": "🚲",
    "bike": "🚲", "boat": "⛵", "taxi": "🚕", "road": "🛣️", "street": "🛣️",
    "sun": "☀️", "moon": "🌙", "star": "⭐", "rain": "🌧️", "snow": "❄️",
    "wind": "💨", "cloud": "☁️", "weather": "🌦️", "sky": "🌤️", "sea": "🌊",
    "red": "🔴", "blue": "🔵", "green": "🟢", "yellow": "🟡", "orange": "🟠",
    "purple": "🟣", "pink": "🩷", "black": "⚫", "white": "⚪", "brown": "🟤",
    "grey": "🩶", "silver": "🥈", "gold": "🥇", "colour": "🎨", "color": "🎨",
    "shirt": "👕", "coat": "🧥", "jacket": "🧥", "dress": "👗", "skirt": "👗",
    "trousers": "👖", "jeans": "👖", "shoe": "👟", "sock": "🧦", "hat": "🧢",
    "cap": "🧢", "glove": "🧤", "scarf": "🧣", "umbrella": "☂️", "bag": "🎒",
    "run": "🏃", "walk": "🚶", "jump": "🦘", "swim": "🏊", "dance": "💃",
    "sing": "🎤", "read": "👀", "write": "✍️", "draw": "🎨", "paint": "🎨",
    "listen": "👂", "speak": "🗣️", "say": "💬", "tell": "💬", "ask": "❓",
    "answer": "💡", "look": "👀", "see": "👀", "watch": "⌚", "find": "🔎",
    "open": "📂", "close": "🔒", "give": "🎁", "take": "🤲", "make": "🛠️",
    "help": "🤝", "play": "🎮", "learn": "🧠", "teach": "🧑‍🏫", "think": "💭",
    "happy": "😊", "sad": "😢", "angry": "😠", "tired": "😴", "hungry": "🍽️",
    "thirsty": "🥤", "good": "👍", "bad": "👎", "beautiful": "🌟", "big": "🐘",
    "small": "🐭", "fast": "⚡", "slow": "🐢", "hot": "🔥", "cold": "🥶",
    "love": "❤️", "like": "👍", "want": "⭐", "need": "✅", "can": "💪",
    "because": "🔗", "and": "➕", "or": "↔️", "but": "↩️", "with": "🤝",
    "before": "⬅️", "after": "➡️", "always": "🔁", "never": "🚫", "again": "🔁",
}

LEXNAME_EMOJI = {
    "noun.person": "🧑", "noun.animal": "🐾", "noun.body": "👤", "noun.food": "🍽️",
    "noun.plant": "🌿", "noun.artifact": "📦", "noun.communication": "💬",
    "noun.cognition": "💭", "noun.attribute": "✨", "noun.state": "🔄",
    "noun.feeling": "❤️", "noun.act": "🎬", "noun.event": "🎉", "noun.location": "📍",
    "noun.time": "⏰", "noun.quantity": "🔢", "noun.shape": "🔺", "noun.substance": "💧",
    "noun.object": "🔘", "noun.possession": "🧳", "noun.group": "👥", "noun.relation": "🔗",
    "verb.motion": "🏃", "verb.communication": "💬", "verb.cognition": "💭",
    "verb.perception": "👀", "verb.contact": "🤝", "verb.change": "🔄",
    "verb.emotion": "❤️", "verb.consumption": "🍽️", "verb.creation": "🛠️",
    "verb.social": "🤝", "verb.possession": "🎁", "verb.weather": "🌦️",
    "adj.all": "✨", "adj.pert": "✨", "adv.all": "➡️",
}


def normalized(text: str) -> str:
    return re.sub(r"[^a-z ]", " ", str(text).lower()).strip()


def emoji_for(word: str) -> str:
    value = normalized(word)
    for key in sorted(EXACT, key=len, reverse=True):
        if re.search(r"(?<![a-z])" + re.escape(key.lower()) + r"(?![a-z])", value):
            return EXACT[key]
    if wn:
        try:
            synsets = wn.synsets(value.replace(" ", "_"))
            if synsets:
                return LEXNAME_EMOJI.get(synsets[0].lexname(), "💬")
        except LookupError:
            pass
    return "💬"


def main() -> None:
    data = json.loads(PATH.read_text(encoding="utf-8"))
    changed = 0
    for unit in data.get("units", []):
        for item in unit.get("words", []):
            old = str(item.get("emoji", ""))
            if old in {"📖", "📘", "📚", ""}:
                item["emoji"] = emoji_for(item.get("word", ""))
                changed += int(item["emoji"] != old)
    PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Updated {changed} generic Kids 2 emoji placeholders.")


if __name__ == "__main__":
    main()
