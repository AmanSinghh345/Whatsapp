"use client";

import { GoogleAuthProvider, signInWithPopup, type FirebaseError } from "firebase/auth";
import { getFirebaseAuth } from "./firebase-client";

function getFirebaseAuthErrorMessage(error: unknown): string {
  const firebaseError = error as Partial<FirebaseError>;
  if (firebaseError.code && firebaseError.message) {
    return `${firebaseError.code}: ${firebaseError.message}`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Google login failed. Please try again.";
}

export async function loginWithGoogle(): Promise<void> {
  const auth = getFirebaseAuth();
  const provider = new GoogleAuthProvider();
  await signInWithPopup(auth, provider);
}

export function getGoogleLoginErrorMessage(error: unknown): string {
  return getFirebaseAuthErrorMessage(error);
}

export async function startPhoneOtpScaffold(phoneE164: string): Promise<void> {
  if (!phoneE164.trim()) {
    throw new Error("Enter a phone number in E.164 format.");
  }

  // Scaffold only for now:
  // In the next auth section we can add RecaptchaVerifier and signInWithPhoneNumber wiring.
  throw new Error("Phone OTP scaffold ready. Verify flow wiring is the next step.");
}

