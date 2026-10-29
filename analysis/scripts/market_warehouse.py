"""Incremental, auditable SQLite ingestion for the existing BCB market payload."""
import argparse
from datetime import date, datetime, timezone
import hashlib
import json
from pathlib import Path
import sqlite3
from urllib.request import urlopen


def ingest(payload, database):
    raw = json.loads(payload)
    clean = {}
    invalid = duplicates = received = 0
    for currency in ('USD', 'EUR', 'GBP'):
        points = raw.get('currencies', {}).get(currency, {}).get('points')
        if not isinstance(points, list):
            raise ValueError(f'Missing currency: {currency}')
        for point in points:
            received += 1
            try:
                day, price = point['date'], point['value']
                if date.fromisoformat(day).isoformat() != day or isinstance(price, bool) or not isinstance(price, (int, float)) or not 0 < price < float('inf'):
                    raise ValueError('Invalid quote')
            except (KeyError, TypeError, ValueError):
                invalid += 1
                continue
            key = (currency, day)
            if key in clean:
                duplicates += 1
                continue
            clean[key] = price
    if not clean:
        raise ValueError('No valid quotes')
    digest = hashlib.sha256(payload).hexdigest()
    with sqlite3.connect(database) as db:
        db.executescript('''
        CREATE TABLE IF NOT EXISTS quotes(currency TEXT NOT NULL, date TEXT NOT NULL,
          price REAL NOT NULL CHECK(price>0), PRIMARY KEY(currency,date));
        CREATE TABLE IF NOT EXISTS ingestion_runs(id INTEGER PRIMARY KEY, executed_at TEXT,
          source_checked_at TEXT, payload_sha256 TEXT, received INTEGER, invalid INTEGER,
          duplicates INTEGER, accepted INTEGER, changed INTEGER);
        ''')
        before = db.total_changes
        db.executemany('''INSERT INTO quotes VALUES(?,?,?) ON CONFLICT(currency,date)
          DO UPDATE SET price=excluded.price WHERE quotes.price<>excluded.price''',
          [(c, d, p) for (c, d), p in clean.items()])
        changed = db.total_changes - before
        db.execute('INSERT INTO ingestion_runs VALUES(NULL,?,?,?,?,?,?,?,?)',
          (datetime.now(timezone.utc).isoformat(), raw.get('checkedAt'), digest, received,
           invalid, duplicates, len(clean), changed))
    return dict(received=received, invalid=invalid, duplicates=duplicates, accepted=len(clean), changed=changed, sha256=digest)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument('--input', type=Path)
    source.add_argument('--url', help='Existing RiskLab /api/market URL')
    parser.add_argument('--database', type=Path, required=True)
    args = parser.parse_args()
    if args.url:
        if not args.url.startswith('https://'):
            parser.error('Only HTTPS sources are accepted')
        with urlopen(args.url, timeout=30) as response:
            payload = response.read(10_000_001)
        if len(payload) > 10_000_000:
            parser.error('Payload exceeds 10 MB')
    else:
        payload = args.input.read_bytes()
    args.database.parent.mkdir(parents=True, exist_ok=True)
    print(json.dumps(ingest(payload, args.database), ensure_ascii=False))


if __name__ == '__main__':
    main()
