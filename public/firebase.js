import { initializeApp } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-analytics.js";

import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";

import {
  getFirestore,
  collection, doc, setDoc, addDoc,
  query, where, getDocs, onSnapshot,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyD0uCBut6d5J9c8SgWR8awnYVgpSdjuuc8",
  authDomain: "outreachops-90566.firebaseapp.com",
  projectId: "outreachops-90566",
  storageBucket: "outreachops-90566.firebasestorage.app",
  messagingSenderId: "500012573302",
  appId: "1:500012573302:web:67c89e972968c5e636b557",
  measurementId: "G-FNVLCJGCQ6"
};

export const app = initializeApp(firebaseConfig);

export const analytics = (() => {
  try { return getAnalytics(app); } catch { return null; }
})();

export const auth = getAuth(app);
export const db = getFirestore(app);

export async function ensureAnonAuth() {
  if (auth.currentUser) return auth.currentUser;
  const cred = await signInAnonymously(auth);
  return cred.user;
}

export const FS = {
  collection, doc, setDoc, addDoc,
  query, where, getDocs, onSnapshot,
  serverTimestamp
};
