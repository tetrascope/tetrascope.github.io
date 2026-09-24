"""Loads ohara/data/definitions.json - the single source of truth for
constants, endmembers, planes and projections used by both the Python and
browser engines. Read through importlib.resources so it works from a source
checkout, an editable install and an installed wheel alike."""
import json
from importlib import resources

DEFS = json.loads(resources.files("ohara.data").joinpath("definitions.json")
                  .read_text(encoding="utf-8"))
