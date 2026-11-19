import re

BACKTICK = re.compile(r"`([^`]+)`")
PLACEHOLDERS = {
    "NAME", "PATH", "FILE", "VALUE", "TODO", "EXAMPLE",
    "PLACEHOLDER", "OPTION", "ARGUMENT"
}

def extract_claims(text, file_path):
    claims, seen = [], set()
    in_fence = False
    section_function = None
    in_heading_context = False

    for line_no, raw in enumerate(text.splitlines(), 1):
        line = raw.strip()
        if line.startswith("```") or line.startswith("~~~"):
            in_fence = not in_fence
            continue
        if not line or in_fence:
            continue

        heading = re.match(r"^#{1,6}\s+(.+)$", raw.strip())
        if heading:
            section_function = None
            title = heading.group(1)
            fn_heading = re.search(r"\b([A-Za-z_]\w*)\s*(?:\([^)]*\))?", title)
            if fn_heading and "`" not in title:
                section_function = fn_heading.group(1)
            for back in BACKTICK.findall(title):
                call = re.fullmatch(r"([A-Za-z_][\w.]*)\s*\([^)]*\)", back)
                if call:
                    section_function = call.group(1).split(".")[-1]
            continue

        # Explicit function default: connect(timeout=10)
        for match in re.finditer(r"\b([A-Za-z_][\w.]*)\s*\(\s*([A-Za-z_]\w*)\s*=\s*([^,\s)]+)\s*\)", line):
            add(claims, seen, {
                "type": "default_value", "name": match.group(2),
                "function_name": match.group(1).split(".")[-1],
                "documented_value": match.group(3).strip("`'\""),
                "text": match.group(0), "file": str(file_path), "line": line_no
            })

        patterns = [
            (r"\b([A-Za-z_]\w*)\s+defaults?\s+to\s+(`?[A-Za-z0-9_.+\-]+`?)", "default_value"),
            (r"\bdefault\s+([A-Za-z_]\w*)\s+is\s+(`?[A-Za-z0-9_.+\-]+`?)", "default_value"),
            (r"`([A-Za-z_]\w*)`\s*\(\s*default\s*:\s*([^)]*)\)", "default_value"),
            (r"`([A-Za-z_]\w*)\s*=\s*([^`,;)\s]+)`", "default_value"),
        ]
        for pattern, kind in patterns:
            for match in re.finditer(pattern, line, re.I):
                name, value = match.group(1), match.group(2).strip().strip("`'\"")
                value = value.rstrip(".,;:")
                add(claims, seen, {
                    "type": kind, "name": name,
                    "function_name": section_function,
                    "documented_value": value,
                    "text": match.group(0), "file": str(file_path), "line": line_no
                })

        # Only explicitly formatted callable references are function claims.
        for match in BACKTICK.finditer(line):
            token = match.group(1).strip()
            call = re.fullmatch(r"([A-Za-z_][\w.]*)\s*\(\s*\)", token)
            if call:
                add(claims, seen, {
                    "type": "function_existence",
                    "name": call.group(1).split(".")[-1],
                    "qualified_name": call.group(1),
                    "text": match.group(0), "file": str(file_path), "line": line_no
                })

        # Explicit settings only. Fenced lines are already excluded.
        for match in re.finditer(r"(?:`([A-Z][A-Z0-9_]{2,})`|(?<!`)\b([A-Z][A-Z0-9_]{2,}))\s*=\s*([^\s,;]+)", line):
            name = match.group(1) or match.group(2)
            if name in PLACEHOLDERS:
                continue
            context = line.lower()
            if not any(word in context for word in ("setting", "configuration", "config", "environment", "option", "default")) and "`" + name + "`" not in line:
                continue
            add(claims, seen, {
                "type": "config_flag", "name": name,
                "documented_value": match.group(3).strip("`'\""),
                "text": match.group(0), "file": str(file_path), "line": line_no
            })
    return claims

def add(items, seen, item):
    key = (item["type"], item["name"], item.get("documented_value"), item["file"], item["line"])
    if key not in seen:
        seen.add(key)
        items.append(item)
