import { Injectable, UnauthorizedException } from "@nestjs/common";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth, type DecodedIdToken } from "firebase-admin/auth";

type FirebaseConfig = {
  projectId: string;
  clientEmail: string;
  privateKey: string;
};

@Injectable()
export class FirebaseAdminService {
  private readonly auth = this.initFirebaseAuth();

  async verifyIdToken(idToken: string): Promise<DecodedIdToken> {
    try {
      return await this.auth.verifyIdToken(idToken, true);
    } catch {
      throw new UnauthorizedException("Invalid Firebase ID token");
    }
  }

  private initFirebaseAuth() {
    if (getApps().length === 0) {
      const config = this.readConfigFromEnv();
      initializeApp({
        credential: cert({
          projectId: config.projectId,
          clientEmail: config.clientEmail,
          privateKey: config.privateKey
        })
      });
    }
    return getAuth();
  }

  private readConfigFromEnv(): FirebaseConfig {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

    if (!projectId || !clientEmail || !privateKey) {
      throw new Error("Missing Firebase Admin env vars");
    }

    return { projectId, clientEmail, privateKey };
  }
}

