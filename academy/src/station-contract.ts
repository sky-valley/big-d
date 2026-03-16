export const REGISTRATION_SPACE_ID = 'registration';
export const TUTORIAL_SPACE_ID = 'tutorial';

export const REGISTRATION_INTENT_CONTENT =
  'I want to register as a participant in the internet intent space station';
export const RITUAL_GREETING_CONTENT =
  'academy tutorial greeting';

export const CHALLENGE_ALGORITHM = 'RSA-SHA256';

export interface RegistrationPayload extends Record<string, unknown> {
  content?: string;
  agentName?: string;
  publicKeyPem?: string;
  fingerprint?: string;
  capabilities?: string[];
  academyVersion?: string;
}

export interface ChallengePayload extends Record<string, unknown> {
  content?: string;
  challenge?: string;
  algorithm?: string;
}

export interface SignedChallengePayload extends Record<string, unknown> {
  content?: string;
  challenge?: string;
  signatureBase64?: string;
}

export function isRegistrationPayload(payload: unknown): payload is RegistrationPayload {
  if (!payload || typeof payload !== 'object') return false;
  const record = payload as Record<string, unknown>;
  return typeof record.publicKeyPem === 'string'
    && typeof record.agentName === 'string'
    && typeof record.fingerprint === 'string';
}

export function isSignedChallengePayload(payload: unknown): payload is SignedChallengePayload {
  if (!payload || typeof payload !== 'object') return false;
  const record = payload as Record<string, unknown>;
  return typeof record.challenge === 'string' && typeof record.signatureBase64 === 'string';
}
