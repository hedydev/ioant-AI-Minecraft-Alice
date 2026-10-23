"""Bounded read-only Bedrock level.dat experiment flags. Never writes a world DB."""
from pathlib import Path
import struct

MAX_FILE = 8 * 1024 * 1024
MAX_TAGS = 50000
MAX_DEPTH = 32
MAX_ELEMENTS = 1000000


class InvalidNBT(ValueError):
    pass


class Reader:
    def __init__(self, payload):
        self.buf = memoryview(payload)
        self.pos = 0
        self.tags = 0
        self.gametest = None

    def take(self, length):
        if not isinstance(length, int) or length < 0 or length > len(self.buf) - self.pos:
            raise InvalidNBT("truncated_or_oversized")
        start = self.pos
        self.pos += length
        return self.buf[start:self.pos]

    def u8(self):
        return self.take(1)[0]

    def i32(self):
        return struct.unpack("<i", self.take(4))[0]

    def name(self):
        n = struct.unpack("<H", self.take(2))[0]
        return self.take(n).tobytes().decode("utf-8")

    def value(self, tag, path, depth):
        if depth > MAX_DEPTH:
            raise InvalidNBT("excessive_depth")
        self.tags += 1
        if self.tags > MAX_TAGS:
            raise InvalidNBT("excessive_tags")
        if tag in (1, 2, 3, 4, 5, 6):
            widths = {1: 1, 2: 2, 3: 4, 4: 8, 5: 4, 6: 8}
            data = self.take(widths[tag])
            if path == ("experiments", "gametest"):
                if tag != 1:
                    raise InvalidNBT("invalid_experiment_tag")
                self.gametest = int(data[0]) != 0
        elif tag == 7:
            n = self.i32()
            if not 0 <= n <= MAX_ELEMENTS:
                raise InvalidNBT("array_length")
            self.take(n)
        elif tag == 8:
            self.name()
        elif tag == 9:
            child = self.u8()
            n = self.i32()
            if n < 0 or n > MAX_ELEMENTS or (child == 0 and n):
                raise InvalidNBT("list_length")
            for _ in range(n):
                self.value(child, (), depth + 1)
        elif tag == 10:
            while True:
                child = self.u8()
                if child == 0:
                    break
                field = self.name()
                subpath = path + (field,) if len(path) < 2 else ()
                self.value(child, subpath, depth + 1)
        elif tag in (11, 12):
            n = self.i32()
            if n < 0 or n > MAX_ELEMENTS:
                raise InvalidNBT("array_length")
            self.take(n * (4 if tag == 11 else 8))
        else:
            raise InvalidNBT("unknown_tag")


def beta_api_experiment(path):
    """Return enabled/disabled/not_declared/unverified from a bounded level.dat."""
    path = Path(path)
    try:
        if path.is_symlink() or not path.is_file() or not 8 <= path.stat().st_size <= MAX_FILE:
            return "unverified"
        raw = path.read_bytes()
        if len(raw) < 11:
            return "unverified"
        version, nbt_len = struct.unpack_from("<II", raw, 0)
        if version < 3 or version > 128 or nbt_len != len(raw) - 8:
            return "unverified"
        r = Reader(raw[8:])
        if r.u8() != 10 or r.name() != "":
            return "unverified"
        r.value(10, (), 0)
        if r.pos != nbt_len:
            return "unverified"
        if r.gametest is True:
            return "enabled_in_level_dat"
        if r.gametest is False:
            return "disabled_in_level_dat"
        return "not_declared_in_level_dat"
    except (OSError, ValueError, UnicodeError, struct.error, OverflowError, RecursionError):
        return "unverified"
