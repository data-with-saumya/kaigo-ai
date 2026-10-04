# Setup and deployment

Kaigo runs entirely on Google Cloud:
- **Firebase Hosting** serves the coordinator UI
- **Firebase Authentication** gives every visitor an isolated demo workspace
- **Cloud Run** hosts the FastAPI API
- **Firestore** stores all state
- **Gemini** (via Google Cloud's Gemini Enterprise Agent Platform, formerly Vertex AI) does the AI work

The steps below assume macOS on Apple silicon.

## 1. Install the tools (one time)

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

When the installer finishes, run the two `eval`/`echo` lines it prints so `brew` is on your PATH. Then install the rest:

```bash
brew install node gh gitleaks && brew install --cask gcloud-cli && npm install -g firebase-tools
```

## 2. Create the Google Cloud and Firebase project (browser)

1. https://console.cloud.google.com → **New project** → name it `kaigo-ai`. Note the **project ID**.
2. **Billing** → link a billing account (new accounts may get free trial credits).
3. **Billing → Budgets & alerts** → create a budget with email alerts at 50% / 90% / 100%.
4. https://console.firebase.google.com → **Add project** → choose the existing `kaigo-ai` project (Analytics not needed).
5. Firebase → **Authentication → Get started → Sign-in method → Anonymous → Enable**.
6. Firebase → **Project settings → Your apps → Web (</>)** → register the app `kaigo-web`, then copy the config values into `frontend/.env.local` (see `frontend/.env.example`).

## 3. Sign in from the terminal (each opens a browser)

```bash
gcloud auth login && gcloud auth application-default login && firebase login && gh auth login
```

## 4. Configure the cloud project (run from the repo root)

```bash
export PROJECT_ID=<your-project-id> REGION=asia-south1
```

```bash
gcloud config set project $PROJECT_ID && gcloud services enable run.googleapis.com firestore.googleapis.com aiplatform.googleapis.com secretmanager.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com logging.googleapis.com
```

```bash
gcloud firestore databases create --location=$REGION
```

Create a least-privilege service account for the API:

```bash
gcloud iam service-accounts create kaigo-api --display-name="Kaigo API" && for ROLE in roles/datastore.user roles/aiplatform.user roles/logging.logWriter; do gcloud projects add-iam-policy-binding $PROJECT_ID --member="serviceAccount:kaigo-api@$PROJECT_ID.iam.gserviceaccount.com" --role=$ROLE; done
```

No API key is needed: Cloud Run calls Gemini with its service-account identity, so there is no Gemini secret to leak.

## 5. Run locally

Backend:

```bash
cd backend && python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt && uvicorn main:app --reload --port 8080
```

Frontend:

```bash
cd frontend && npm install && npm run dev
```

Without Gemini credentials the app still runs. Records, schedules, rules, matching and replanning work. AI features show a clear "unavailable" state and never make up a response.

## 6. Deploy

API to Cloud Run:

```bash
gcloud run deploy kaigo-api --source . --region $REGION --service-account kaigo-api@$PROJECT_ID.iam.gserviceaccount.com --set-env-vars GOOGLE_CLOUD_PROJECT=$PROJECT_ID,STORAGE_BACKEND=firestore,GEMINI_BACKEND=vertex,AUTH_MODE=firebase --min-instances 1 --allow-unauthenticated
```

`--allow-unauthenticated` only opens the network path. Every route that reads or changes workspace data still checks a Firebase ID token; only health, reference data and the synthetic sample documents are public.

UI to Firebase Hosting, plus the Firestore security rules. Hosting rewrites `/api/**` to the Cloud Run service, so the UI and API share one origin:

```bash
firebase use --add $PROJECT_ID
```

```bash
cd frontend && npm run build && cd .. && firebase deploy --only hosting,firestore:rules
```

## 7. Pre-submission checks

- Open the Hosting URL in an incognito window and run the full demo
- `gcloud logging read "resource.type=cloud_run_revision" --limit 20` shows clean requests
- `gitleaks detect` reports no secrets
