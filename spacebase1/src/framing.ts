import type { MessageEcho, ScanRequest, ScanResult, ServerMessage, StoredMessage } from './types.ts';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const HEADER_TERMINATOR = encoder.encode('\n\n');
export const ITP_SIGNATURE_HEADER = 'itp-sig';
export const ITP_SIGNATURE_VERSION = 'v1';
const ITP_VERBS = new Set(['INTENT', 'PROMISE', 'DECLINE', 'ACCEPT', 'COMPLETE', 'ASSESS']);
const REQUIRED_HEADERS: Record<string, string[]> = {
  INTENT: ['sender', 'parent', 'intent', 'timestamp', 'body-length'],
  PROMISE: ['sender', 'parent', 'intent', 'promise', 'timestamp', 'body-length'],
  DECLINE: ['sender', 'parent', 'intent', 'timestamp', 'body-length'],
  ACCEPT: ['sender', 'parent', 'promise', 'timestamp', 'body-length'],
  COMPLETE: ['sender', 'parent', 'promise', 'timestamp', 'body-length'],
  ASSESS: ['sender', 'parent', 'promise', 'timestamp', 'body-length'],
  SCAN: ['space', 'since', 'body-length'],
  SCAN_RESULT: ['space', 'latest-seq', 'body-length'],
  ERROR: ['body-length'],
};

export interface FramedMessage {
  verb: string;
  headers: Record<string, string>;
  body: Uint8Array;
}

export class FrameParseError extends Error {}

function indexOfBytes(buffer: Uint8Array, needle: Uint8Array, from = 0): number {
  outer: for (let index = from; index <= buffer.length - needle.length; index += 1) {
    for (let offset = 0; offset < needle.length; offset += 1) {
      if (buffer[index + offset] !== needle[offset]) continue outer;
    }
    return index;
  }
  return -1;
}

export function parseSingleFramedMessage(buffer: Uint8Array): FramedMessage {
  const headerEnd = indexOfBytes(buffer, HEADER_TERMINATOR);
  if (headerEnd === -1) throw new FrameParseError('Missing header terminator');
  const headerText = decoder.decode(buffer.slice(0, headerEnd));
  const lines = headerText.split('\n');
  const verb = lines.shift()?.trim();
  if (!verb) throw new FrameParseError('Missing verb line');
  validateVerb(verb);
  const headers: Record<string, string> = {};
  for (const rawLine of lines) {
    if (!rawLine) throw new FrameParseError('Unexpected empty header line');
    const separator = rawLine.indexOf(': ');
    if (separator <= 0) throw new FrameParseError(`Malformed header line: ${rawLine}`);
    const name = rawLine.slice(0, separator);
    const value = rawLine.slice(separator + 2);
    validateHeaderName(name);
    validateHeaderValue(name, value);
    if (headers[name] != null) throw new FrameParseError(`Duplicate header: ${name}`);
    headers[name] = value;
  }
  assertSignatureVersion(headers);
  const bodyLengthRaw = headers['body-length'];
  if (bodyLengthRaw == null || !/^\d+$/.test(bodyLengthRaw)) {
    throw new FrameParseError('body-length must be a decimal byte count');
  }
  const bodyStart = headerEnd + HEADER_TERMINATOR.length;
  const bodyEnd = bodyStart + Number.parseInt(bodyLengthRaw, 10);
  if (bodyEnd !== buffer.length) {
    throw new FrameParseError('Expected exactly one framed message');
  }
  return { verb, headers, body: buffer.slice(bodyStart, bodyEnd) };
}

export function serializeFramedMessage(message: FramedMessage): Uint8Array {
  validateVerb(message.verb);
  validateHeadersForSerialization(message.headers);
  const headers = { ...message.headers, 'body-length': String(message.body.length) };
  const headerText = `${[message.verb, ...Object.entries(headers).map(([name, value]) => `${name}: ${value}`), ''].join('\n')}\n`;
  const headerBytes = encoder.encode(headerText);
  const result = new Uint8Array(headerBytes.length + message.body.length);
  result.set(headerBytes, 0);
  result.set(message.body, headerBytes.length);
  return result;
}

export function canonicalProofBytes(message: FramedMessage): Uint8Array {
  validateVerb(message.verb);
  const headers = { ...message.headers };
  delete headers.proof;
  delete headers['body-length'];
  headers[ITP_SIGNATURE_HEADER] = ITP_SIGNATURE_VERSION;
  validateHeadersForSerialization(headers);

  const headerText = `${[
    message.verb,
    ...Object.keys(headers).sort().map((name) => `${name}: ${headers[name]}`),
    `body-length: ${message.body.length}`,
    '',
  ].join('\n')}\n`;
  const headerBytes = encoder.encode(headerText);
  const result = new Uint8Array(headerBytes.length + message.body.length);
  result.set(headerBytes, 0);
  result.set(message.body, headerBytes.length);
  return result;
}

export function frameToScanRequest(frame: FramedMessage): ScanRequest {
  if (frame.verb !== 'SCAN') throw new FrameParseError(`Expected SCAN frame, got ${frame.verb}`);
  assertRequiredHeaders(frame);
  return {
    type: 'SCAN',
    spaceId: requireHeader(frame, 'space'),
    since: parseNonNegativeIntegerHeader(frame, 'since'),
  };
}

export function frameToItpMessage(frame: FramedMessage): Omit<StoredMessage, 'seq'> {
  if (!ITP_VERBS.has(frame.verb)) {
    throw new FrameParseError(`Unsupported ITP verb: ${frame.verb}`);
  }
  assertRequiredHeaders(frame);
  const payload = decodeJson<Record<string, unknown>>(frame);
  return {
    type: frame.verb,
    senderId: requireHeader(frame, 'sender'),
    parentId: requireHeader(frame, 'parent'),
    intentId: frame.headers.intent,
    promiseId: frame.headers.promise,
    timestamp: parseNonNegativeIntegerHeader(frame, 'timestamp'),
    payload,
  };
}

export function serverMessageToFrame(message: ServerMessage): FramedMessage {
  if (message.type === 'SCAN_RESULT') {
    const result = message as ScanResult;
    return {
      verb: 'SCAN_RESULT',
      headers: {
        space: result.spaceId,
        'latest-seq': String(result.latestSeq),
        'payload-hint': 'application/json',
      },
      body: encodeJson(result.messages),
    };
  }
  if (message.type === 'ERROR') {
    const error = message as { type: 'ERROR'; message: string };
    return {
      verb: 'ERROR',
      headers: { 'payload-hint': 'text/plain' },
      body: encoder.encode(error.message),
    };
  }
  const echo = message as MessageEcho;
  return {
    verb: echo.type,
    headers: withOptional({
      sender: echo.senderId,
      parent: echo.parentId,
      intent: echo.intentId,
      promise: echo.promiseId,
      timestamp: String(echo.timestamp),
      seq: String(echo.seq),
      'payload-hint': 'application/json',
    }),
    body: encodeJson(echo.payload),
  };
}

export function frameToServerMessage(frame: FramedMessage): ServerMessage {
  if (frame.verb === 'SCAN_RESULT') {
    assertRequiredHeaders(frame);
    return {
      type: 'SCAN_RESULT',
      spaceId: requireHeader(frame, 'space'),
      latestSeq: parseNonNegativeIntegerHeader(frame, 'latest-seq'),
      messages: decodeJson<StoredMessage[]>(frame),
    };
  }
  if (frame.verb === 'ERROR') {
    assertRequiredHeaders(frame);
    return { type: 'ERROR', message: decoder.decode(frame.body) };
  }
  const message = frameToItpMessage(frame) as MessageEcho;
  message.seq = parseNonNegativeIntegerHeader(frame, 'seq');
  return message;
}

function parseNonNegativeIntegerHeader(frame: FramedMessage, name: string): number {
  const raw = requireHeader(frame, name);
  if (!/^\d+$/.test(raw)) throw new FrameParseError(`${name} must be a non-negative integer`);
  return Number.parseInt(raw, 10);
}

function requireHeader(frame: FramedMessage, name: string): string {
  const value = frame.headers[name];
  if (!value) throw new FrameParseError(`Missing ${name} header on ${frame.verb}`);
  return value;
}

function encodeJson(value: unknown): Uint8Array {
  return encoder.encode(JSON.stringify(value));
}

function decodeJson<T>(frame: FramedMessage): T {
  try {
    return JSON.parse(decoder.decode(frame.body)) as T;
  } catch {
    throw new FrameParseError(`${frame.verb} has invalid JSON body`);
  }
}

function withOptional(headers: Record<string, string | undefined>): Record<string, string> {
  return Object.fromEntries(Object.entries(headers).filter(([, value]) => value != null)) as Record<string, string>;
}

function assertRequiredHeaders(frame: FramedMessage): void {
  const required = REQUIRED_HEADERS[frame.verb] ?? [];
  for (const header of required) {
    requireHeader(frame, header);
  }
}

function validateVerb(verb: string): void {
  if (!/^[A-Z_]+$/.test(verb)) throw new FrameParseError(`Invalid verb line: ${verb}`);
}

function validateHeaderName(name: string): void {
  if (!/^[a-z-]+$/.test(name)) throw new FrameParseError(`Invalid header name: ${name}`);
}

function validateHeaderValue(name: string, value: string): void {
  if (/[\n\r\u0000]/.test(value)) throw new FrameParseError(`Invalid header value for ${name}`);
}

function assertSignatureVersion(headers: Record<string, string>): void {
  const version = headers[ITP_SIGNATURE_HEADER];
  if (version != null && version !== ITP_SIGNATURE_VERSION) {
    throw new FrameParseError(`Unsupported ${ITP_SIGNATURE_HEADER} value: ${version}`);
  }
  if (headers.proof != null && version !== ITP_SIGNATURE_VERSION) {
    throw new FrameParseError(`Signed frame requires ${ITP_SIGNATURE_HEADER}: ${ITP_SIGNATURE_VERSION}`);
  }
}

function validateHeadersForSerialization(headers: Record<string, string>): void {
  assertSignatureVersion(headers);
  for (const [name, value] of Object.entries(headers)) {
    validateHeaderName(name);
    validateHeaderValue(name, value);
  }
}
