#!/usr/bin/env python3
"""
Intent Space SDK

Thin wire-mechanics SDK for agents participating in intent space.

This module helps with:
- Welcome Mat discovery and signup
- local RSA identity generation and signing
- station token storage
- TCP connection management
- station AUTH plus per-message proof generation
- compact NDJSON send/receive
- SCAN requests and cursor persistence
- ITP atom construction
- transcript persistence

It still does not implement the dojo sequence.
That reasoning stays with the agent.
"""

from __future__ import annotations

import base64
import hashlib
import json
import socket
import subprocess
import time
import uuid
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional
from urllib.parse import urljoin, urlparse
from urllib.request import Request, urlopen

JsonDict = Dict[str, Any]
PROOF_TYP = "itp-pop+jwt"
STATION_TOKEN_TYP = "itp+jwt"


def compact_json(payload: JsonDict) -> str:
    return json.dumps(payload, separators=(",", ":"), ensure_ascii=True)


def stable_json(value: Any) -> str:
    if isinstance(value, dict):
        items = [f"{json.dumps(key)}:{stable_json(value[key])}" for key in sorted(value.keys())]
        return "{" + ",".join(items) + "}"
    if isinstance(value, list):
        return "[" + ",".join(stable_json(item) for item in value) + "]"
    return json.dumps(value, ensure_ascii=True, separators=(",", ":"))


def canonical_request(value: Any) -> str:
    if not isinstance(value, dict):
        return stable_json(value)
    if value.get("type") == "AUTH":
        return "AUTH"
    if value.get("type") == "SCAN":
        return f"SCAN|{value.get('spaceId', '')}|{value.get('since', 0)}"
    return "|".join(
        [
            str(value.get("type", "")),
            str(value.get("senderId", "")),
            str(value.get("parentId", "")),
            str(value.get("intentId", "")),
            str(value.get("promiseId", "")),
            str(value.get("timestamp", "")),
            stable_json(value.get("payload", {})),
        ]
    )


def now_ms() -> int:
    return int(time.time() * 1000)


def now_s() -> int:
    return int(time.time())


def make_id(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4()}"


def parse_tcp_endpoint(endpoint: str) -> tuple[str, int]:
    parsed = urlparse(endpoint)
    if parsed.scheme != "tcp":
        raise ValueError("intent_space_sdk.py currently supports tcp://host:port endpoints only")
    if not parsed.hostname or not parsed.port:
        raise ValueError("Endpoint must include host and port, e.g. tcp://127.0.0.1:4000")
    return parsed.hostname, parsed.port


def run(cmd: List[str], stdin: Optional[bytes] = None) -> bytes:
    result = subprocess.run(cmd, input=stdin, capture_output=True, check=True)
    return result.stdout


def b64url_encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("ascii").rstrip("=")


def b64url_decode(value: str) -> bytes:
    padding = "=" * ((4 - len(value) % 4) % 4)
    return base64.urlsafe_b64decode((value + padding).encode("ascii"))


def sha256_b64url(value: str | bytes) -> str:
    if isinstance(value, str):
        value = value.encode("utf-8")
    return b64url_encode(hashlib.sha256(value).digest())


def fetch_text(url: str, headers: Optional[Dict[str, str]] = None) -> str:
    request = Request(url, headers=headers or {})
    with urlopen(request) as response:
        return response.read().decode("utf-8")


def fetch_json(
    url: str,
    *,
    method: str = "GET",
    headers: Optional[Dict[str, str]] = None,
    body: Optional[JsonDict] = None,
) -> JsonDict:
    encoded = None if body is None else json.dumps(body).encode("utf-8")
    request_headers = {"content-type": "application/json", **(headers or {})}
    request = Request(url, data=encoded, headers=request_headers, method=method)
    with urlopen(request) as response:
        return json.loads(response.read().decode("utf-8"))


def parse_jwt(token: str) -> tuple[JsonDict, JsonDict, bytes, bytes]:
    parts = token.split(".")
    if len(parts) != 3:
        raise ValueError("JWT must have exactly three parts")
    header_raw, payload_raw, signature_raw = parts
    return (
        json.loads(b64url_decode(header_raw)),
        json.loads(b64url_decode(payload_raw)),
        f"{header_raw}.{payload_raw}".encode("utf-8"),
        b64url_decode(signature_raw),
    )


class LocalState:
    def __init__(self, root: Path) -> None:
        self.root = root
        self.identity_dir = root / ".intent-space" / "identity"
        self.state_dir = root / ".intent-space" / "state"
        self.config_dir = root / ".intent-space" / "config"
        self.private_key = self.identity_dir / "station-private-key.pem"
        self.public_key = self.identity_dir / "station-public-key.pem"
        self.fingerprint = self.identity_dir / "station-fingerprint.txt"
        self.config = self.config_dir / "station.json"
        self.cursors = self.state_dir / "cursors.json"
        self.transcript = self.state_dir / "tutorial-transcript.ndjson"
        self.welcome = self.state_dir / "welcome-mat.json"
        self.enrollment = self.state_dir / "station-enrollment.json"
        self.known_stations = self.state_dir / "known-stations.json"

    def ensure_dirs(self) -> None:
        self.identity_dir.mkdir(parents=True, exist_ok=True)
        self.state_dir.mkdir(parents=True, exist_ok=True)
        self.config_dir.mkdir(parents=True, exist_ok=True)

    def load_cursors(self) -> Dict[str, int]:
        if not self.cursors.exists():
            return {}
        return json.loads(self.cursors.read_text())

    def save_cursors(self, cursors: Dict[str, int]) -> None:
        self.cursors.write_text(json.dumps(cursors, indent=2) + "\n")

    def load_known_stations(self) -> List[JsonDict]:
        if not self.known_stations.exists():
            return []
        return json.loads(self.known_stations.read_text())

    def save_known_stations(self, stations: List[JsonDict]) -> None:
        self.known_stations.write_text(json.dumps(stations, indent=2) + "\n")

    def remember_station(
        self,
        *,
        endpoint: str,
        audience: Optional[str] = None,
        station_token: Optional[str] = None,
        handle: Optional[str] = None,
        principal_id: Optional[str] = None,
        source: str,
        space_id: Optional[str] = None,
    ) -> JsonDict:
        self.ensure_dirs()
        stations = self.load_known_stations()
        entry: JsonDict = {
            "endpoint": endpoint,
            "source": source,
            "lastSeenAt": now_ms(),
        }
        if audience is not None:
            entry["audience"] = audience
        if station_token is not None:
            entry["stationToken"] = station_token
        if handle is not None:
            entry["handle"] = handle
        if principal_id is not None:
            entry["principalId"] = principal_id
        if space_id is not None:
            entry["spaceId"] = space_id

        updated = False
        for index, existing in enumerate(stations):
            if existing.get("endpoint") == endpoint:
                merged = dict(existing)
                merged.update(entry)
                stations[index] = merged
                entry = merged
                updated = True
                break
        if not updated:
            stations.append(entry)
        self.save_known_stations(stations)
        return entry

    def append_transcript(self, direction: str, message: JsonDict) -> None:
        with self.transcript.open("a", encoding="utf-8") as handle:
            handle.write(compact_json({"direction": direction, "message": message}) + "\n")

    def save_json_artifact(self, filename: str, payload: JsonDict) -> None:
        self.ensure_dirs()
        (self.state_dir / filename).write_text(json.dumps(payload, indent=2) + "\n")

    def ensure_identity(self, endpoint: str, agent_name: str) -> tuple[str, str]:
        self.ensure_dirs()
        if not self.private_key.exists():
            run(["openssl", "genrsa", "-out", str(self.private_key), "4096"])
        if not self.public_key.exists():
            public_key_pem = run(
                ["openssl", "rsa", "-in", str(self.private_key), "-pubout"]
            ).decode("utf-8")
            self.public_key.write_text(public_key_pem)

        public_key_pem = self.public_key.read_text()
        fingerprint = "SHA256:" + base64.b64encode(
            hashlib.sha256(public_key_pem.encode("utf-8")).digest()
        ).decode("ascii")
        self.fingerprint.write_text(fingerprint + "\n")

        self.config.write_text(
            json.dumps(
                {
                    "endpoint": endpoint,
                    "publicKey": str(self.public_key.relative_to(self.root)),
                    "privateKey": str(self.private_key.relative_to(self.root)),
                    "fingerprint": fingerprint,
                    "agentName": agent_name,
                },
                indent=2,
            )
            + "\n"
        )
        return public_key_pem, fingerprint

    def public_jwk(self) -> JsonDict:
        text = run(["openssl", "rsa", "-pubin", "-in", str(self.public_key), "-text", "-noout"]).decode("utf-8")
        lines = text.splitlines()
        modulus_lines: List[str] = []
        exponent = 65537
        capture_modulus = False
        for line in lines:
            stripped = line.strip()
            if stripped.startswith("Modulus:"):
                capture_modulus = True
                continue
            if capture_modulus:
                if stripped.startswith("Exponent:"):
                    capture_modulus = False
                    exponent = int(stripped.split()[1])
                    continue
                modulus_lines.append(stripped.replace(":", ""))
        modulus_hex = "".join(modulus_lines)
        modulus_hex = modulus_hex[2:] if modulus_hex.startswith("00") else modulus_hex
        modulus_bytes = bytes.fromhex(modulus_hex)
        exponent_bytes = exponent.to_bytes((exponent.bit_length() + 7) // 8, "big")
        return {
            "kty": "RSA",
            "n": b64url_encode(modulus_bytes),
            "e": b64url_encode(exponent_bytes),
        }

    def jwk_thumbprint(self) -> str:
        jwk = self.public_jwk()
        canonical = json.dumps({"e": jwk["e"], "kty": "RSA", "n": jwk["n"]}, separators=(",", ":"))
        return sha256_b64url(canonical)

    def sign_rs256(self, raw_bytes: bytes) -> bytes:
        return run(
            ["openssl", "dgst", "-sha256", "-sign", str(self.private_key)],
            stdin=raw_bytes,
        )

    def sign_challenge(self, challenge: str) -> str:
        return base64.b64encode(self.sign_rs256(challenge.encode("utf-8"))).decode("ascii")

    def sign_detached_b64url(self, raw_text: str) -> str:
        return b64url_encode(self.sign_rs256(raw_text.encode("utf-8")))

    def sign_jwt(self, header: JsonDict, payload: JsonDict) -> str:
        header_b64 = b64url_encode(json.dumps(header, separators=(",", ":")).encode("utf-8"))
        payload_b64 = b64url_encode(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
        signing_input = f"{header_b64}.{payload_b64}".encode("utf-8")
        signature = self.sign_rs256(signing_input)
        return f"{header_b64}.{payload_b64}.{b64url_encode(signature)}"

    def save_welcome(self, payload: JsonDict) -> None:
        self.ensure_dirs()
        self.welcome.write_text(json.dumps(payload, indent=2) + "\n")

    def save_enrollment(self, payload: JsonDict) -> None:
        self.ensure_dirs()
        self.enrollment.write_text(json.dumps(payload, indent=2) + "\n")

    def load_enrollment(self) -> Optional[JsonDict]:
        if not self.enrollment.exists():
            return None
        return json.loads(self.enrollment.read_text())


def parse_welcome_mat(markdown: str) -> JsonDict:
    endpoints: Dict[str, str] = {}
    for raw_line in markdown.splitlines():
        line = raw_line.strip()
        if line.startswith("- terms:"):
            endpoints["terms"] = line.split(": ", 1)[1].replace("GET ", "")
        elif line.startswith("- signup:"):
            endpoints["signup"] = line.split(": ", 1)[1].replace("POST ", "")
        elif line.startswith("- station:"):
            endpoints["station"] = line.split(": ", 1)[1]
    return {"markdown": markdown, "endpoints": endpoints}


class StationClient:
    def __init__(self, endpoint: str, local_state: LocalState) -> None:
        host, port = parse_tcp_endpoint(endpoint)
        self.endpoint = endpoint
        self.host = host
        self.port = port
        self.local_state = local_state
        self.sock: Optional[socket.socket] = None
        self.buffer = b""
        self.cursors = local_state.load_cursors()
        self.auth: Optional[Dict[str, Any]] = None

    def connect(self) -> None:
        self.sock = socket.create_connection((self.host, self.port), timeout=5)
        self.sock.settimeout(0.5)

    def close(self) -> None:
        if self.sock is not None:
            self.sock.close()
            self.sock = None

    def send(self, message: JsonDict) -> None:
        if self.sock is None:
            raise RuntimeError("client is not connected")
        self.sock.sendall((compact_json(message) + "\n").encode("utf-8"))
        self.local_state.append_transcript("out", message)

    def read_available(self, total_timeout: float = 0.5) -> List[JsonDict]:
        if self.sock is None:
            raise RuntimeError("client is not connected")
        deadline = time.time() + total_timeout
        messages: List[JsonDict] = []
        while time.time() < deadline:
            try:
                chunk = self.sock.recv(65536)
            except socket.timeout:
                time.sleep(0.05)
                continue
            if not chunk:
                break
            self.buffer += chunk
            while b"\n" in self.buffer:
                raw, self.buffer = self.buffer.split(b"\n", 1)
                raw = raw.strip()
                if not raw:
                    continue
                message = json.loads(raw.decode("utf-8"))
                self.local_state.append_transcript("in", message)
                if message.get("type") == "SCAN_RESULT":
                    latest_seq = message.get("latestSeq")
                    space_id = message.get("spaceId")
                    if isinstance(space_id, str) and isinstance(latest_seq, int):
                        self.cursors[space_id] = latest_seq
                        self.local_state.save_cursors(self.cursors)
                messages.append(message)
        return messages

    def authenticate(self, *, sender_id: str, station_token: str, audience: str, local_state: LocalState) -> JsonDict:
        self.auth = {
            "senderId": sender_id,
            "stationToken": station_token,
            "audience": audience,
            "localState": local_state,
        }
        request = {"type": "AUTH"}
        self.send(
            {
                "type": "AUTH",
                "stationToken": station_token,
                "proof": build_station_proof(
                    local_state,
                    sender_id=sender_id,
                    station_token=station_token,
                    audience=audience,
                    action="AUTH",
                    request=request,
                ),
            }
        )
        deadline = time.time() + 5.0
        while time.time() < deadline:
            for message in self.read_available(0.8):
                if message.get("type") == "AUTH_RESULT":
                    return message
                if message.get("type") == "ERROR":
                    raise RuntimeError(str(message.get("message")))
        raise TimeoutError("timed out waiting for AUTH_RESULT")

    def send_station(self, message: JsonDict) -> None:
        if not self.auth:
            self.send(message)
            return
        request = dict(message)
        request["proof"] = build_station_proof(
            self.auth["localState"],
            sender_id=self.auth["senderId"],
            station_token=self.auth["stationToken"],
            audience=self.auth["audience"],
            action="SCAN" if request.get("type") == "SCAN" else str(request.get("type")),
            request={k: v for k, v in request.items() if k != "proof"},
        )
        self.send(request)

    def scan(self, space_id: str) -> JsonDict:
        since = self.cursors.get(space_id, 0)
        self.send_station({"type": "SCAN", "spaceId": space_id, "since": since})
        deadline = time.time() + 4.0
        while time.time() < deadline:
            for message in self.read_available(0.8):
                if message.get("type") == "SCAN_RESULT" and message.get("spaceId") == space_id:
                    return message
                if message.get("type") == "ERROR":
                    raise RuntimeError(str(message.get("message")))
        raise TimeoutError(f"timed out waiting for SCAN_RESULT for {space_id}")

    def post(self, message: JsonDict) -> None:
        self.send_station(message)

    def wait_for(self, predicate: Callable[[JsonDict], bool], timeout: float = 10.0) -> JsonDict:
        deadline = time.time() + timeout
        while time.time() < deadline:
            for message in self.read_available(0.8):
                if predicate(message):
                    return message
        raise TimeoutError("timed out waiting for matching message")


def build_welcome_mat_access_token(
    local_state: LocalState,
    *,
    service_origin: str,
    tos_text: str,
) -> str:
    return local_state.sign_jwt(
        {"typ": "wm+jwt", "alg": "RS256"},
        {
            "jti": make_id("wm"),
            "tos_hash": sha256_b64url(tos_text),
            "aud": service_origin,
            "cnf": {"jkt": local_state.jwk_thumbprint()},
            "iat": now_s(),
        },
    )


def build_dpop_signup_proof(local_state: LocalState, *, signup_url: str) -> str:
    return local_state.sign_jwt(
        {"typ": "dpop+jwt", "alg": "RS256", "jwk": local_state.public_jwk()},
        {
            "jti": make_id("dpop"),
            "htm": "POST",
            "htu": signup_url,
            "iat": now_s(),
        },
    )


def build_station_proof(
    local_state: LocalState,
    *,
    sender_id: str,
    station_token: str,
    audience: str,
    action: str,
    request: JsonDict,
) -> str:
    return local_state.sign_jwt(
        {"typ": PROOF_TYP, "alg": "RS256", "jwk": local_state.public_jwk()},
        {
            "jti": make_id("itp-proof"),
            "sub": sender_id,
            "aud": audience,
            "iat": now_s(),
            "ath": sha256_b64url(station_token),
            "action": action,
            "req_hash": sha256_b64url(canonical_request(request)),
        },
    )


def signup_station(
    local_state: LocalState,
    *,
    academy_url: str,
    handle: str,
) -> JsonDict:
    local_state.ensure_dirs()
    welcome_url = urljoin(academy_url.rstrip("/") + "/", ".well-known/welcome.md")
    welcome_markdown = fetch_text(welcome_url)
    welcome = parse_welcome_mat(welcome_markdown)
    local_state.save_welcome(welcome)

    endpoints = welcome["endpoints"]
    terms_url = endpoints["terms"]
    signup_url = endpoints["signup"]
    station_endpoint = endpoints["station"]
    if not isinstance(terms_url, str) or not isinstance(signup_url, str) or not isinstance(station_endpoint, str):
        raise RuntimeError("welcome.md did not expose terms, signup, and station endpoints")

    tos_text = fetch_text(terms_url)
    access_token = build_welcome_mat_access_token(
        local_state,
        service_origin=f"{urlparse(academy_url).scheme}://{urlparse(academy_url).netloc}",
        tos_text=tos_text,
    )
    signup_response = fetch_json(
        signup_url,
        method="POST",
        headers={"DPoP": build_dpop_signup_proof(local_state, signup_url=signup_url)},
        body={
            "tos_signature": local_state.sign_detached_b64url(tos_text),
            "access_token": access_token,
            "handle": handle,
        },
    )
    signup_response["station_endpoint"] = signup_response.get("station_endpoint", station_endpoint)
    local_state.save_enrollment(signup_response)
    local_state.remember_station(
        endpoint=str(signup_response["station_endpoint"]),
        audience=signup_response.get("station_audience") if isinstance(signup_response.get("station_audience"), str) else None,
        station_token=signup_response.get("station_token") if isinstance(signup_response.get("station_token"), str) else None,
        handle=signup_response.get("handle") if isinstance(signup_response.get("handle"), str) else handle,
        principal_id=signup_response.get("principal_id") if isinstance(signup_response.get("principal_id"), str) else None,
        source="signup",
        space_id=signup_response.get("commons_space_id") if isinstance(signup_response.get("commons_space_id"), str) else None,
    )
    return signup_response


def intent(
    sender_id: str,
    content: str,
    *,
    intent_id: Optional[str] = None,
    parent_id: str = "root",
    payload: Optional[JsonDict] = None,
) -> JsonDict:
    body = {"content": content, **(payload or {})}
    return {
        "type": "INTENT",
        "intentId": intent_id or make_id("intent"),
        "parentId": parent_id,
        "senderId": sender_id,
        "timestamp": now_ms(),
        "payload": body,
    }


def accept(sender_id: str, promise_id: str, *, parent_id: str) -> JsonDict:
    return {
        "type": "ACCEPT",
        "parentId": parent_id,
        "senderId": sender_id,
        "timestamp": now_ms(),
        "promiseId": promise_id,
        "payload": {},
    }


def assess(sender_id: str, promise_id: str, assessment_value: str, *, parent_id: str) -> JsonDict:
    return {
        "type": "ASSESS",
        "parentId": parent_id,
        "senderId": sender_id,
        "timestamp": now_ms(),
        "promiseId": promise_id,
        "payload": {
            "assessment": assessment_value,
        },
    }
