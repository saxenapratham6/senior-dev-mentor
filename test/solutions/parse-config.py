def parse_pairs(lines):
    out = {}
    for line in lines:
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = (part.strip() for part in line.split("=", 1))
        try:
            out[key] = int(value)
        except ValueError:
            out[key] = value
    return out
