"""All SPANDANA API routes."""
from __future__ import annotations

import json

from fastapi import APIRouter, HTTPException, Request as FastAPIRequest
from pydantic import ValidationError

from app.config import METRICS_JSON, VERSION
from app.schemas.models import (
    HealthResponse,
    MetricsResponse,
    MetricOut,
    ScreenRequest,
    ScreenResponse,
)
from app.services import model_status
from app.services.ecg_io import EcgDecodeError, decode_upload
from app.services.screening import (
    InvalidWaveformError,
    ModelsUnavailableError,
    screen,
)

router = APIRouter()


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    """Liveness + which models have artefacts on disk."""
    st = model_status.artifact_status()
    return HealthResponse(
        status="ok",
        models=[m for m, info in st["models"].items() if info["available"]],
        version=VERSION,
        metrics_available=st["metrics_available"],
    )


@router.post("/api/v1/screen", response_model=ScreenResponse)
async def screen_endpoint(request: FastAPIRequest) -> ScreenResponse:
    """Real LVH screening on a decoded waveform (JSON) or an uploaded
    ECG file (.csv/.txt or .dat + .hea). Never returns simulated values —
    when artefacts are missing the endpoint answers 503 with instructions."""
    content_type = request.headers.get("content-type", "")

    if content_type.startswith("multipart/form-data"):
        # ---- path A: uploaded file (+ optional .hea, sex) ----------------
        form = await request.form()
        upload = form.get("file")
        if upload is None or not hasattr(upload, "read"):
            raise HTTPException(422, "multipart field 'file' is required")
        data = await upload.read()  # type: ignore[union-attr]
        hea = form.get("hea")
        hea_data = (await hea.read()) if (hea is not None and hasattr(hea, "read")) else None
        sex = form.get("sex")
        try:
            leads, fs = decode_upload(data, upload.filename or "upload", hea_data)
        except EcgDecodeError as e:
            raise HTTPException(422, str(e)) from e
        sex_norm = sex.strip().lower() if isinstance(sex, str) else None
        patient_sex = sex_norm if sex_norm in ("male", "female", "unknown") else None
        patient_age_raw = form.get("age")
        try:
            patient_age = int(patient_age_raw) if patient_age_raw else None
        except (TypeError, ValueError):
            raise HTTPException(422, "age must be an integer")
        patient_code = form.get("code")

    elif content_type.startswith("application/json"):
        # ---- path B: waveform already decoded in the browser -------------
        try:
            payload = await request.json()
            body = ScreenRequest(**payload)
            wf = body.get_waveform()
        except json.JSONDecodeError as e:
            raise HTTPException(422, f"invalid JSON body: {e}") from e
        except ValidationError as e:
            raise HTTPException(422, str(e)) from e
        except ValueError as e:
            raise HTTPException(422, str(e)) from e
        total = sum(len(v) for v in wf.leads.values())
        if total < 12 * 50:
            raise HTTPException(
                422, f"waveform too short ({total} samples total) — a "
                     "10-second 12-lead recording at 100 Hz has 12000 samples")
        leads, fs = wf.leads, wf.sampleRate
        p = body.patient
        patient_sex = p.sex if p else None
        patient_age = p.age if p else None
        patient_code = p.code if p else None

    else:
        raise HTTPException(
            415, "send application/json {patient, waveform} or multipart "
                 "form-data with a 'file' field (.csv/.txt/.dat + .hea)")

    # ---- real inference ---------------------------------------------------
    try:
        result = screen(leads, fs, patient_sex)
    except ModelsUnavailableError as e:
        raise HTTPException(503, str(e)) from e
    except InvalidWaveformError as e:
        raise HTTPException(400, str(e)) from e

    if patient_age is not None:
        result["meta"]["age"] = patient_age
    if patient_code:
        result["meta"]["code"] = patient_code
    return ScreenResponse(**result)


@router.get("/api/v1/models/metrics", response_model=MetricsResponse)
def metrics() -> MetricsResponse:
    """Real evaluation metrics produced by training/evaluate_all.py."""
    if not METRICS_JSON.exists():
        raise HTTPException(
            503, "metrics.json not found — run `python training/evaluate_all.py` "
                 "after training the models")
    data = __import__("json").loads(METRICS_JSON.read_text(encoding="utf-8"))
    out = []
    for m in data.get("metrics", []):
        out.append(MetricOut(
            model=m["name"], family=m["family"],
            accuracy=m["accuracy"], precision=m["precision"],
            sensitivity=m["sensitivity"], specificity=m["specificity"],
            f1=m["f1"], rocAuc=m["roc_auc"], prAuc=m.get("pr_auc"),
            threshold=m.get("threshold")))
    return MetricsResponse(metrics=out, meta={
        k: data[k] for k in ("generated", "dataset", "test_split",
                             "validation_split", "label_policy") if k in data}
        | ({"roc_pr_curves": data["roc_pr_curves"]}
           if data.get("roc_pr_curves") else {}))


@router.get("/api/v1/models/status")
def status() -> dict:
    """Detailed artefact/status report (models, files, metrics version)."""
    return model_status.artifact_status()
