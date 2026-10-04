"""Travel time between caregivers and clients.

Uses the Google Maps Routes API (route matrix, driving, traffic-unaware so results are repeatable),
called with the service's own Google Cloud identity. Results are cached; if Maps is unavailable the
score falls back to straight-line distance and says so.
"""

from __future__ import annotations

import logging
import threading

import requests
from pydantic import BaseModel

from models.domain import Location

log = logging.getLogger("kaigo.travel")
ROUTES_URL = "https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix"
MAX_ORIGINS = 25  # one destination per call, so well under the 625-element limit


class TravelEstimate(BaseModel):
    minutes: float | None
    km: float
    source: str  # "google_maps" | "straight_line"


def _key(a: Location, b: Location) -> tuple:
    return (round(a.lat, 4), round(a.lng, 4), round(b.lat, 4), round(b.lng, 4))


class TravelService:
    def __init__(self, backend: str = "straight_line", project: str | None = None) -> None:
        self.backend = backend
        self.project = project
        self._cache: dict[tuple, TravelEstimate] = {}
        self._lock = threading.Lock()
        self._credentials = None

    def estimates(self, origins: dict[str, Location], destination: Location) -> dict[str, TravelEstimate]:
        """Travel from each origin (keyed by id) to one destination."""
        from rules.scoring import straight_line_km

        result: dict[str, TravelEstimate] = {}
        missing: dict[str, Location] = {}
        with self._lock:
            for oid, loc in origins.items():
                hit = self._cache.get(_key(loc, destination))
                if hit:
                    result[oid] = hit
                else:
                    missing[oid] = loc
        if missing and self.backend == "google_maps":
            try:
                result.update(self._fetch(missing, destination))
            except Exception as exc:  # network, quota, auth: fall back, never fail the workflow
                log.warning("Routes API unavailable, using straight-line distance: %s", exc)
        for oid, loc in missing.items():
            if oid not in result:
                result[oid] = TravelEstimate(minutes=None, km=round(straight_line_km(loc, destination), 1),
                                             source="straight_line")
        return result

    def _token(self) -> str:
        import google.auth
        import google.auth.transport.requests

        if self._credentials is None:
            self._credentials, _ = google.auth.default(scopes=["https://www.googleapis.com/auth/cloud-platform"])
        if not self._credentials.valid:
            self._credentials.refresh(google.auth.transport.requests.Request())
        return self._credentials.token

    def _fetch(self, origins: dict[str, Location], destination: Location) -> dict[str, TravelEstimate]:
        out: dict[str, TravelEstimate] = {}
        ids = list(origins)
        for start in range(0, len(ids), MAX_ORIGINS):
            batch = ids[start:start + MAX_ORIGINS]
            body = {
                "origins": [{"waypoint": {"location": {"latLng": {"latitude": origins[i].lat, "longitude": origins[i].lng}}}}
                            for i in batch],
                "destinations": [{"waypoint": {"location": {"latLng": {"latitude": destination.lat,
                                                                       "longitude": destination.lng}}}}],
                "travelMode": "DRIVE",
                "routingPreference": "TRAFFIC_UNAWARE",
            }
            headers = {"Authorization": f"Bearer {self._token()}",
                       "X-Goog-FieldMask": "originIndex,duration,distanceMeters,condition"}
            if self.project:
                headers["X-Goog-User-Project"] = self.project
            response = requests.post(ROUTES_URL, json=body, headers=headers, timeout=10)
            response.raise_for_status()
            for row in response.json():
                if row.get("condition") != "ROUTE_EXISTS":
                    continue
                oid = batch[row["originIndex"]]
                estimate = TravelEstimate(minutes=round(int(row["duration"].rstrip("s")) / 60, 1),
                                          km=round(row.get("distanceMeters", 0) / 1000, 1), source="google_maps")
                out[oid] = estimate
                with self._lock:
                    self._cache[_key(origins[oid], destination)] = estimate
        return out


_service = TravelService()


def configure(service: TravelService) -> None:
    global _service
    _service = service


def get_service() -> TravelService:
    return _service
