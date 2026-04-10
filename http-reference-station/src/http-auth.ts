import { createPublicKey, createVerify, type JsonWebKey as CryptoJsonWebKey } from 'crypto';
import type { IncomingMessage } from 'http';
import type { HttpRequestAuth } from './types.ts';
import {
  PROOF_MAX_AGE_SECONDS,
  jwkThumbprint,
  parseJwt,
  sha256b64url,
  verifyRs256Jwt,
  verifyStationToken,
} from './welcome-mat.ts';

function assertRecent(iat: number | undefined, nowSeconds: number, maxAgeSeconds: number): void {
  if (typeof iat !== 'number') {
    throw new Error('DPoP proof missing iat');
  }
  if (Math.abs(nowSeconds - iat) > maxAgeSeconds) {
    throw new Error(`DPoP proof iat outside allowed window of ${maxAgeSeconds} seconds`);
  }
}

function requireAuthorizationToken(req: IncomingMessage): string {
  const authorization = req.headers.authorization;
  if (typeof authorization !== 'string' || authorization.length === 0) {
    throw new Error('Missing Authorization header');
  }
  const [scheme, token] = authorization.split(/\s+/, 2);
  if (scheme !== 'DPoP' || !token) {
    throw new Error('Authorization header must use DPoP scheme');
  }
  return token;
}

function requireDpopHeader(req: IncomingMessage): string {
  const proof = req.headers.dpop;
  if (typeof proof !== 'string' || proof.length === 0) {
    throw new Error('Missing DPoP header');
  }
  return proof;
}

export function authenticateHttpRequest(
  req: IncomingMessage,
  absoluteUrl: string,
  authSecret: string,
  audience: string,
  isCurrentCredential: (principalId: string, audience: string, tokenId: string) => boolean,
): HttpRequestAuth {
  const stationTokenRaw = requireAuthorizationToken(req);
  const stationToken = verifyStationToken(stationTokenRaw, authSecret, audience);
  const principalId = stationToken.payload.principal_id as string;
  const tokenId = stationToken.payload.jti;
  if (typeof tokenId !== 'string' || !isCurrentCredential(principalId, audience, tokenId)) {
    throw new Error('Station token is no longer current');
  }
  const proofRaw = requireDpopHeader(req);
  const proof = parseJwt(proofRaw);
  const jwk = verifyRs256Jwt(proof, 'dpop+jwt');
  const nowSeconds = Math.floor(Date.now() / 1000);

  assertRecent(proof.payload.iat, nowSeconds, PROOF_MAX_AGE_SECONDS);
  if (proof.payload.htm !== (req.method ?? 'GET').toUpperCase()) {
    throw new Error('DPoP htm mismatch');
  }
  if (proof.payload.htu !== absoluteUrl) {
    throw new Error('DPoP htu mismatch');
  }
  if (proof.payload.ath !== sha256b64url(stationTokenRaw)) {
    throw new Error('DPoP ath mismatch');
  }
  if (jwkThumbprint(jwk) !== stationToken.payload.cnf?.jkt) {
    throw new Error('DPoP key does not match station token binding');
  }

  const publicKey = createPublicKey({ format: 'jwk', key: jwk as CryptoJsonWebKey });
  const verify = createVerify('RSA-SHA256');
  verify.update(proof.signingInput);
  verify.end();
  if (!verify.verify(publicKey, proof.signature)) {
    throw new Error('DPoP proof signature verification failed');
  }

  return {
    senderId: stationToken.payload.sub as string,
    principalId,
    stationToken: stationTokenRaw,
    jkt: stationToken.payload.cnf!.jkt as string,
    audience,
  };
}
