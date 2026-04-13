"""
FastAPI application entry point.

Starts the Lyzr Policy Enforcement Layer API server.
Initialises the PostgreSQL schema on startup.
"""

from __future__ import annotations

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from lyzr_policy.store import init_db
from api.routes.agents import router as agents_router
from api.routes.policies import router as policies_router
from api.routes.audit import router as audit_router

app = FastAPI(
    title="Lyzr User/Org Policy Gateway",
    description=(
        "POC control-plane that evaluates user/org policies for governed tool "
        "calls and governed retrieval before Lyzr inference."
    ),
    version="0.1.0",
)

# CORS — allow Next.js dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        os.getenv("NEXT_PUBLIC_API_URL", "http://localhost:3000"),
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup():
    init_db()


@app.get("/health")
def health():
    return {"status": "ok", "service": "lyzr-policy-gateway"}


app.include_router(agents_router)
app.include_router(policies_router)
app.include_router(audit_router)
