import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import type {
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
} from "@simplewebauthn/server";

import { RP_ID, ORIGIN } from "../config";

const RP_NAME = "Ernest";

export async function generateRegOptions(opts: { userName: string; userID: Uint8Array }) {
  return generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: RP_ID,
    userName: opts.userName,
    userID: Uint8Array.from(opts.userID),
    attestationType: "none",
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred",
    },
  });
}

export async function verifyRegResponse(opts: {
  response: RegistrationResponseJSON;
  expectedChallenge: string;
}) {
  return verifyRegistrationResponse({
    response: opts.response,
    expectedChallenge: opts.expectedChallenge,
    expectedOrigin: ORIGIN,
    expectedRPID: RP_ID,
  });
}

export async function generateAuthOptions(opts: {
  allowCredentials?: {
    id: string;
    transports?: AuthenticatorTransportFuture[];
  }[];
}) {
  return generateAuthenticationOptions({
    rpID: RP_ID,
    allowCredentials: opts.allowCredentials,
    userVerification: "preferred",
  });
}

export async function verifyAuthResponse(opts: {
  response: AuthenticationResponseJSON;
  expectedChallenge: string;
  credential: {
    id: string;
    publicKey: Uint8Array;
    counter: number;
    transports?: AuthenticatorTransportFuture[];
  };
}) {
  return verifyAuthenticationResponse({
    response: opts.response,
    expectedChallenge: opts.expectedChallenge,
    expectedOrigin: ORIGIN,
    expectedRPID: RP_ID,
    credential: {
      ...opts.credential,
      publicKey: Uint8Array.from(opts.credential.publicKey),
    },
  });
}
