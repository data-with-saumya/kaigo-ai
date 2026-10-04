"""Private storage for uploaded credential documents (Cloud Storage).

Objects live under {root}/{workspace}/credentials/{credential_id}/{filename} in a bucket with public
access prevention and a lifecycle rule that deletes demo uploads after 30 days. Files are only served
back through the API, after the caller's workspace is checked.
"""

from __future__ import annotations

import logging
import re

log = logging.getLogger("kaigo.documents")


class DocumentStore:
    def __init__(self, bucket: str | None, root: str = "workspaces") -> None:
        self.bucket_name = bucket
        self.root = root
        self._bucket = None

    @property
    def enabled(self) -> bool:
        return bool(self.bucket_name)

    def _get_bucket(self):
        if self._bucket is None:
            from google.cloud import storage

            self._bucket = storage.Client().bucket(self.bucket_name)
        return self._bucket

    def save(self, workspace: str, credential_id: str, filename: str, data: bytes, mime_type: str) -> str | None:
        if not self.enabled:
            return None
        safe = re.sub(r"[^A-Za-z0-9._-]", "_", filename)[:120] or "document"
        path = f"{self.root}/{workspace}/credentials/{credential_id}/{safe}"
        try:
            blob = self._get_bucket().blob(path)
            blob.upload_from_string(data, content_type=mime_type)
            return path
        except Exception as exc:  # storage problems must not lose the verification itself
            log.warning("Couldn't store document %s: %s", path, exc)
            return None

    def load(self, path: str) -> bytes:
        return self._get_bucket().blob(path).download_as_bytes()

    def belongs_to(self, path: str, workspace: str) -> bool:
        return path.startswith(f"{self.root}/{workspace}/")
