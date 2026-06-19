# drugtargets — pipeline orchestration. Run locally or in GitHub Actions, never on Vercel.
.PHONY: all download crosswalk build validate clean venv web-dev web-build help

PY := .venv/bin/python
PIP := .venv/bin/pip

help:
	@echo "Targets: venv download crosswalk build validate all | web-dev web-build | clean"

venv:
	python3 -m venv .venv
	$(PIP) install --upgrade pip
	$(PIP) install -r requirements.txt

download:
	$(PY) pipeline/download.py

crosswalk:
	$(PY) pipeline/crosswalk.py

build:
	$(PY) pipeline/build.py

validate:
	$(PY) pipeline/validate.py

all: download crosswalk build validate
	@echo "Pipeline complete -> web/public/data/v2026Q2/"

test:
	$(PY) -m pytest pipeline/tests -q

web-dev:
	cd web && npm run dev

web-build:
	cd web && npm run build

clean:
	rm -rf pipeline/raw pipeline/cache
