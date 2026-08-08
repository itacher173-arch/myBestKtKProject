"""Pydantic/словарная валидация JSON-сценариев."""

from __future__ import annotations

import re
from typing import Any, Optional

from pydantic import BaseModel, Field, field_validator


class ScenarioConstraints(BaseModel):
    maxResponseSec: Optional[float] = Field(default=None, ge=1)
    forbidActions: list[str] = Field(default_factory=list)
    requirePaz: Optional[bool] = None


class ScenarioDoc(BaseModel):
    id: str = Field(min_length=2, max_length=64)
    name: str = Field(min_length=1, max_length=200)
    version: str
    description: Optional[str] = None
    mode: Optional[str] = None
    initial: dict[str, Any]
    checklist: list[str] = Field(min_length=1)
    goldenSequence: Optional[list[str]] = None
    constraints: Optional[ScenarioConstraints] = None
    faultType: Optional[str] = None
    equipmentIds: Optional[list[str]] = None
    zoneIds: Optional[list[str]] = None

    @field_validator("version")
    @classmethod
    def semver(cls, v: str) -> str:
        if not re.match(r"^[0-9]+\.[0-9]+(\.[0-9]+)?$", v):
            raise ValueError("version: N.N или N.N.N")
        return v

    @field_validator("mode")
    @classmethod
    def mode_ok(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in ("train", "exam"):
            raise ValueError("mode: train|exam")
        return v


def validate_scenario_dict(raw: dict[str, Any]) -> dict[str, Any]:
    try:
        doc = ScenarioDoc.model_validate(raw)
        return {"ok": True, "errors": [], "value": doc.model_dump()}
    except Exception as exc:
        return {"ok": False, "errors": [str(exc)]}
