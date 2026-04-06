# RADAR System Overview

## Purpose

RADAR is a hybrid assessment platform for earthquake resilience workflows. It currently has:

- a mobile app for field inspectors
- a backend API for authentication and assessment sync
- a web portal for DRRMO and engineering views

The present codebase is a working prototype with a mix of real backend functionality and mock-driven frontend features.

## High-Level Architecture

```text
Mobile App (Expo) ----\
                       > FastAPI Backend ----> PostgreSQL / SQLite
Web Portal (Vite) ----/            |
                                   -> Local upload storage
```

## Main Components

### 1. Mobile App

Location: `mobile/`

The mobile app is built with Expo and Expo Router. Its main responsibilities are:

- user login
- assessment data entry
- sync queue display
- sending authenticated sync requests to the backend

Current mobile screens include:

- login
- home/dashboard tabs
- assessment wizard
- sync screen
- profile screen

Important note:

- the login flow is real and connected to the backend
- the assessment wizard and sync queue are still partly mock-based

## 2. Backend API

Location: `backend/`

The backend is built with FastAPI and SQLAlchemy. It currently handles:

- JWT authentication
- assessment sync
- assessment listing
- database access
- upload storage for assessment images

Current API endpoints:

- `POST /api/auth/login`
- `POST /api/assessments/sync`
- `GET /api/assessments`

The backend can use:

- SQLite by default for local development
- PostgreSQL through `DATABASE_URL`

## 3. Web Portal

Location: `web/`

The web portal is a Vite + React app intended for engineers and DRRMO users. It includes pages for:

- dashboard
- assessments
- heatmap
- reports
- users

At the moment, the web portal is still driven by mock data and is not yet fully connected to the backend API.

## Authentication Flow

The system now uses JWT authentication between the mobile app and backend.

### Login sequence

1. The user enters their username and password in the mobile login screen.
2. The mobile app sends a request to `POST /api/auth/login`.
3. The backend validates the credentials against in-memory demo LGU users.
4. If valid, the backend generates a signed JWT.
5. The mobile app stores the token:
   - `expo-secure-store` on iOS/Android
   - `localStorage` on web
6. The app uses that token for protected API requests.

### Current demo accounts

- `inspector@lgu.gov.ph`
- `drrmo@lgu.gov.ph`

These are currently hard-coded test users in the backend security layer.

## Assessment and Sync Flow

### Mobile assessment flow

The assessment wizard currently has four steps:

1. Building information
2. Photo capture
3. Structural data
4. Review

### Current status of the wizard

- building input is collected in the UI
- photo capture is simulated, not a full real camera persistence workflow
- submit currently behaves like a queued save in the UI
- the queue itself is still mock-seeded

### Sync flow

1. The sync screen reads queued items.
2. For each queued item, the app retrieves the stored JWT.
3. The app sends a `multipart/form-data` request to `POST /api/assessments/sync`.
4. The backend validates the JWT using `Authorization: Bearer <token>`.
5. The backend validates the assessment payload.
6. The backend saves:
   - the assessment record
   - uploaded image metadata
   - uploaded files on disk
7. A background placeholder ML task is triggered.

## Data and Storage

### Backend storage

The backend currently stores:

- assessment records
- image metadata
- structural data as JSON

Image files are stored locally under the backend uploads folder.

### Mobile storage

The mobile app currently persists:

- auth token only

There is not yet a full persistent offline local database for:

- completed assessments
- queued sync items
- cached backend records

### Web storage

The web portal currently uses in-memory mock data imported from local files.

## Security Model

Current implemented security features:

- JWT bearer authentication
- protected sync endpoint
- environment-based secret key configuration
- environment-based database configuration
- secure token storage on native devices
- password hashing via `passlib`

Current limitations:

- users are not yet stored in the database
- there is no refresh token flow
- there is no token revocation or logout invalidation
- route guards and session restoration are still minimal
- only selected endpoints are protected today

## Current Limitations

This prototype is functional but not yet fully production-ready.

Known gaps include:

- mobile sync queue is still mock-backed
- mobile wizard data is not fully persisted locally
- several sync payload fields still use placeholder values
- web portal is still mock-based
- ML processing is currently a stub
- some frontend route warnings still need cleanup

## Recommended Next Steps

To move this system closer to production:

1. Replace in-memory demo users with database-backed users.
2. Add role-based authorization for inspector, engineer, and DRRMO access.
3. Add a real offline local data store in mobile.
4. Connect the web portal to backend APIs.
5. Replace placeholder sync payload mapping with real wizard data.
6. Move image storage to cloud object storage if needed.
7. Add audit logs, refresh tokens, and token expiry handling.
8. Implement the real ML classification and action-plan pipeline.

## Summary

RADAR currently works as a prototype with:

- real FastAPI authentication
- real JWT-secured sync endpoint
- real database-backed assessment persistence in the backend
- partially integrated mobile sync
- mock-driven web and parts of the mobile workflow

It is a strong foundation, but some pieces are still prototype-level and should be completed before deployment.
