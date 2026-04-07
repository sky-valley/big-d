import type { MessageEcho, ScanRequest, ScanResult, ServerMessage, StoredMessage } from './types.ts';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const HEADER_TERMINATOR = encoder.encode('\n\n');
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
  const headers: Record<string, string> = {};
  for (const rawLine of lines) {
    if (!rawLine) throw new FrameParseError('Unexpected empty header line');
    const separator = rawLine.indexOf(': ');
    if (separator <= 0) throw new FrameParseError(`Malformed header line: ${rawLine}`);
    const name = rawLine.slice(0, separator).trim();
    const value = rawLine.slice(separator + 2).trim();
    if (!/^[a-z-]+$/.test(name)) throw new FrameParseError(`Invalid header name: ${name}`);
    if (headers[name] != null) throw new FrameParseError(`Duplicate header: ${name}`);
    headers[name] = value;
  }
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
  const headers = { ...message.headers, 'body-length': String(message.body.length) };
  const headerText = `${[message.verb, ...Object.entries(headers).map(([name, value]) => `${name}: ${value}`), ''].join('\n')}\n`;
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
