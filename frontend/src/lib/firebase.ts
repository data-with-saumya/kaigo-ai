// Firebase: anonymous sign-in gives each visitor an isolated demo workspace, and Firestore
// listeners push live updates when another action changes the care state.
import { initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, onAuthStateChanged, signInAnonymously, type Auth } from "firebase/auth";
import { collection, getFirestore, limit, onSnapshot, orderBy, query, type Firestore } from "firebase/firestore";

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const firebaseEnabled = Boolean(config.apiKey && config.projectId);
const ROOT = import.meta.env.VITE_FIRESTORE_ROOT || "workspaces";

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;
let ready: Promise<string | null> | null = null;

function init() {
  if (!firebaseEnabled || app) return;
  app = initializeApp(config);
  auth = getAuth(app);
  db = getFirestore(app);
}

export function signIn(): Promise<string | null> {
  if (!firebaseEnabled) return Promise.resolve(null);
  init();
  if (!ready) {
    ready = new Promise((resolve, reject) => {
      const stop = onAuthStateChanged(auth!, async (user) => {
        if (user) {
          stop();
          resolve(user.uid);
        } else {
          try {
            await signInAnonymously(auth!);
          } catch (err) {
            stop();
            ready = null; // let the next request try again instead of failing forever
            reject(err);
          }
        }
      });
    });
  }
  return ready;
}

export async function idToken(): Promise<string | null> {
  if (!firebaseEnabled) return null;
  await signIn();
  return auth!.currentUser ? auth!.currentUser.getIdToken() : null;
}

/** Calls `onChange` whenever a new audit entry or chat message lands in this visitor's workspace. */
export function watchWorkspace(onChange: () => void): () => void {
  if (!firebaseEnabled) return () => {};
  const stops: (() => void)[] = [];
  let cancelled = false;
  signIn().then((uid) => {
    if (!uid || cancelled) return;
    for (const name of ["audit_logs", "messages"]) {
      const latest = query(collection(db!, ROOT, uid, name), orderBy("at", "desc"), limit(1));
      let first = true;
      stops.push(onSnapshot(latest, () => {
        if (first) { first = false; return; }
        onChange();
      }, () => { /* listener errors fall back to manual refresh */ }));
    }
  }).catch(() => { /* sign-in errors are shown by the API layer */ });
  return () => { cancelled = true; stops.forEach((stop) => stop()); };
}
