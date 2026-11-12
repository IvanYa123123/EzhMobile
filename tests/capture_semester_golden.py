# -*- coding: utf-8 -*-
"""Снимает golden-семестр для Kotlin-тестов планировщика.

Запускать из корня репозитория: `python tests/capture_semester_golden.py`.
Сеть не нужна: вместо сайта подставляются ответы из tests/fixtures/site.
Ожидаемые значения считает Flask-версия planner.py — она остаётся эталоном
до этапа 8.
"""
import gzip
import json
import os
import sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PYDIR = os.path.join(REPO, "EzhAndroid", "app", "src", "main", "python")
SITE = os.path.join(REPO, "tests", "fixtures", "site")
OUT = os.path.join(REPO, "tests", "fixtures", "golden")

sys.path.insert(0, PYDIR)
from planner import SevSUPlanner  # noqa: E402

FIXTURE_PREFIX = "schedule_pin-b-24-2-o_w"
GROUP = "ПИН/б-24-2-о"
MAX_WEEKS = 25


class FixturePlanner(SevSUPlanner):
    def get_schedule_for_week(self, group_name, week):
        path = os.path.join(SITE, "%s%02d.json.gz" % (FIXTURE_PREFIX, week))
        if not os.path.exists(path):
            return []
        with gzip.open(path, "rt", encoding="utf-8") as f:
            data = json.load(f)
        return data.get("schedule") or []


def main():
    planner = FixturePlanner()
    os.makedirs(OUT, exist_ok=True)
    for subgroup in ("0", "1"):
        schedule, exhausted = planner.get_semester_schedule(
            GROUP, target_subgroup=subgroup, max_weeks=MAX_WEEKS
        )
        payload = {
            "group": GROUP,
            "subgroup": subgroup,
            "max_weeks": MAX_WEEKS,
            "exhausted": exhausted,
            "schedule": schedule,
        }
        path = os.path.join(OUT, "semester_pin_sub%s.json" % subgroup)
        with open(path, "w", encoding="utf-8", newline="\n") as f:
            json.dump(payload, f, ensure_ascii=False, indent=1)
            f.write("\n")
        dates = sorted({item["date"] for item in schedule if "date" in item})
        print(
            "subgroup %s: %d items, exhausted=%s, dates %s..%s"
            % (subgroup, len(schedule), exhausted, dates[0], dates[-1])
        )


if __name__ == "__main__":
    main()
