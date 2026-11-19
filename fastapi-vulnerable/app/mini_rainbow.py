"""Small educational rainbow-chain lookup for synthetic unsalted MD5 hashes."""
import hashlib
import json
from pathlib import Path

PASSWORDS = tuple(f"cat{i:02d}" for i in range(100))
CHAIN_LENGTH = 6


def digest(word):
    return hashlib.md5(word.encode()).hexdigest()


def reduce_hash(value, column):
    return PASSWORDS[(int(value, 16) + column) % len(PASSWORDS)]


def build_table():
    chains = []
    for start in PASSWORDS:
        word = start
        for column in range(CHAIN_LENGTH):
            word = reduce_hash(digest(word), column)
        chains.append([start, word])
    return {"algorithm": "md5", "length": CHAIN_LENGTH, "chains": chains}


def lookup(target):
    table = json.loads(Path(__file__).with_name("rainbow-table.json").read_text())
    for position in range(CHAIN_LENGTH - 1, -1, -1):
        value = target
        for column in range(position, CHAIN_LENGTH):
            endpoint = reduce_hash(value, column)
            if column < CHAIN_LENGTH - 1:
                value = digest(endpoint)
        for start, end in table["chains"]:
            if end != endpoint:
                continue
            word = start
            for column in range(CHAIN_LENGTH):
                value = digest(word)
                if value == target:
                    return word
                word = reduce_hash(value, column)
    return None
