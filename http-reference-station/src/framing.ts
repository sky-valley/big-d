import type {
  MessageEcho,
  ScanRequest,
  ScanResult,
  ServerMessage,
  SpaceError,
  StoredMessage,
} from './types.ts';
import type { ITPMessage } from '@differ/itp/src/types.ts';

const HEADER_TERMINATOR = Buffer.from('\n\n', 'utf8');
export const ITP_SIGNATURE_HEADER = 'itp-sig';
export const ITP_SIGNATURE_VERSION = 'v1';

export interface FramedMessage {
  verb: string;
  headers: Record<string, string>;
  body: Buffer;
}

export interface ParseResult {
  messages: FramedMessage[];
  remainder: Buffer;
}

export class FrameParseError extends Error {}

export const ITP_VERBS = new Set(['INTENT', 'PROMISE', 'DECLINE', 'ACCEPT', 'COMPLETE', 'ASSESS']);

const REQUIRED_HEADERS: Record<string, string[]> = {
  INTENT: ['sender', 'parent', 'intent', 'timestamp', 'body-length'],
  PROMISE: ['sender', 'parent', 'intent', 'promise', 'timestamp', 'body-length'],
  DECLINE: ['sender', 'parent', 'intent', 'timestamp', 'body-length'],
  ACCEPT: ['sender', 'parent', 'promise', 'timestamp', 'body-length'],
  COMPLETE: ['sender', 'parent', 'promise', 'timestamp', 'body-length'],
  ASSESS: ['sender', 'parent', 'promise', 'timestamp', 'body-length'],
  SCAN: ['space', 'since', 'body-length'],
  SCAN_RESULT: ['space', 'latest-seq', 'body-length'],
  AUTH: ['station-token', 'itp-sig', 'proof', 'body-length'],
  AUTH_RESULT: ['sender', 'principal', 'body-length'],
  ERROR: ['body-length'],
};

export function parseFramedMessages(buffer: Buffer): ParseResult {
  const messages: FramedMessage[] = [];
  let offset = 0;

  while (offset < buffer.length) {
    const headerEnd = buffer.indexOf(HEADER_TERMINATOR, offset);
    if (headerEnd === -1) break;

    const headerBytes = buffer.subarray(offset, headerEnd);
    const headerText = headerBytes.toString('utf8');
    const lines = headerText.split('\n');
    const verb = lines.shift()?.trim();
    if (!verb) {
      throw new FrameParseError('Missing verb line');
    }
    validateVerb(verb);

    const headers: Record<string, string> = {};
    for (const rawLine of lines) {
      if (!rawLine) {
        throw new FrameParseError('Unexpected empty header line');
      }
      const separator = rawLine.indexOf(': ');
      if (separator <= 0) {
        throw new FrameParseError(`Malformed header line: ${rawLine}`);
      }
      const name = rawLine.slice(0, separator);
      const value = rawLine.slice(separator + 2);
      validateHeaderName(name);
      validateHeaderValue(name, value);
      if (Object.prototype.hasOwnProperty.call(headers, name)) {
        throw new FrameParseError(`Duplicate header: ${name}`);
      }
      headers[name] = value;
    }
    assertSignatureVersion(headers);

    const bodyLengthRaw = headers['body-length'];
    if (bodyLengthRaw == null) {
      throw new FrameParseError('Missing body-length header');
    }
    if (!/^\d+$/.test(bodyLengthRaw)) {
      throw new FrameParseError('body-length must be a decimal byte count');
    }
    const bodyLength = Number.parseInt(bodyLengthRaw, 10);
    const bodyStart = headerEnd + HEADER_TERMINATOR.length;
    const bodyEnd = bodyStart + bodyLength;
    if (bodyEnd > buffer.length) break;

    messages.push({
      verb,
      headers,
      body: buffer.subarray(bodyStart, bodyEnd),
    });
    offset = bodyEnd;
  }

  return {
    messages,
    remainder: Buffer.from(buffer.subarray(offset)),
  };
}

export function parseSingleFramedMessage(buffer: Buffer): FramedMessage {
  const parsed = parseFramedMessages(buffer);
  if (parsed.remainder.length > 0 || parsed.messages.length !== 1) {
    throw new FrameParseError('Expected exactly one framed message');
  }
  return parsed.messages[0];
}

export function serializeFramedMessage(message: FramedMessage): Buffer {
  validateVerb(message.verb);
  validateHeadersForSerialization(message.headers);
  const headers = {
    ...message.headers,
    'body-length': String(message.body.length),
  };
  const headerLines = [message.verb, ...Object.entries(headers).map(([name, value]) => `${name}: ${value}`), ''];
  return Buffer.concat([
    Buffer.from(`${headerLines.join('\n')}\n`, 'utf8'),
    message.body,
  ]);
}

export function canonicalProofBytes(message: FramedMessage): Buffer {
  validateVerb(message.verb);
  const headers = { ...message.headers };
  delete headers.proof;
  delete headers['body-length'];
  headers[ITP_SIGNATURE_HEADER] = ITP_SIGNATURE_VERSION;
  validateHeadersForSerialization(headers);

  const headerLines = [
    message.verb,
    ...Object.keys(headers).sort().map((name) => `${name}: ${headers[name]}`),
    `body-length: ${message.body.length}`,
    '',
  ];
  return Buffer.concat([
    Buffer.from(`${headerLines.join('\n')}\n`, 'utf8'),
    message.body,
  ]);
}

export function serverMessageToFrame(message: ServerMessage): FramedMessage {
  if (message.type === 'SCAN_RESULT') {
    return {
      verb: 'SCAN_RESULT',
      headers: {
        space: message.spaceId,
        'latest-seq': String(message.latestSeq),
        'payload-hint': 'application/json',
      },
      body: encodeJson(message.messages),
    };
  }
  if (message.type === 'ERROR') {
    return {
      verb: 'ERROR',
      headers: {
        'payload-hint': 'text/plain',
      },
      body: Buffer.from(message.message, 'utf8'),
    };
  }
  return itpMessageToFrame(message);
}

export function frameToScanRequest(frame: FramedMessage): ScanRequest {
  if (frame.verb !== 'SCAN') {
    throw new FrameParseError(`Expected SCAN frame, got ${frame.verb}`);
  }
  assertRequiredHeaders(frame);
  return {
    type: 'SCAN',
    spaceId: requireHeader(frame, 'space'),
    since: parseNonNegativeIntegerHeader(frame, 'since'),
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
    return {
      type: 'ERROR',
      message: frame.body.toString('utf8'),
    };
  }
  return frameToMessageEcho(frame);
}

export function itpMessageToFrame(message: ITPMessage & { proof?: string; seq?: number }): FramedMessage {
  return {
    verb: message.type,
    headers: withOptional({
      sender: message.senderId,
      parent: message.parentId,
      intent: message.intentId,
      promise: message.promiseId,
      timestamp: String(message.timestamp),
      [ITP_SIGNATURE_HEADER]: message.proof ? ITP_SIGNATURE_VERSION : undefined,
      proof: message.proof,
      seq: typeof message.seq === 'number' ? String(message.seq) : undefined,
      'payload-hint': 'application/json',
    }),
    body: encodeJson(message.payload),
  };
}

export function frameToItpMessage(frame: FramedMessage): ITPMessage {
  assertRequiredHeaders(frame);
  const payload = decodeJson<Record<string, unknown>>(frame);
  const message: ITPMessage = {
    type: frame.verb as ITPMessage['type'],
    senderId: requireHeader(frame, 'sender'),
    timestamp: parseNonNegativeIntegerHeader(frame, 'timestamp'),
    payload,
  };
  const parentId = optionalHeader(frame, 'parent');
  const intentId = optionalHeader(frame, 'intent');
  const promiseId = optionalHeader(frame, 'promise');
  if (parentId != null) message.parentId = parentId;
  if (intentId != null) message.intentId = intentId;
  if (promiseId != null) message.promiseId = promiseId;
  return message;
}

function frameToMessageEcho(frame: FramedMessage): ServerMessage {
  const message = frameToItpMessage(frame) as ITPMessage & { seq?: number };
  const seq = optionalHeader(frame, 'seq');
  if (seq == null) {
    throw new FrameParseError(`${frame.verb} echo is missing seq header`);
  }
  if (!/^\d+$/.test(seq)) {
    throw new FrameParseError(`seq must be a non-negative integer on ${frame.verb}`);
  }
  message.seq = Number.parseInt(seq, 10);
  return message as MessageEcho;
}

function encodeJson(value: unknown): Buffer {
  return Buffer.from(JSON.stringify(value), 'utf8');
}

function decodeJson<T>(frame: FramedMessage): T {
  if (frame.body.length === 0) {
    throw new FrameParseError(`${frame.verb} requires a JSON body`);
  }
  try {
    return JSON.parse(frame.body.toString('utf8')) as T;
  } catch {
    throw new FrameParseError(`${frame.verb} has invalid JSON body`);
  }
}

function parseNonNegativeIntegerHeader(frame: FramedMessage, name: string): number {
  const raw = requireHeader(frame, name);
  if (!/^\d+$/.test(raw)) {
    throw new FrameParseError(`${name} must be a non-negative integer`);
  }
  return Number.parseInt(raw, 10);
}

function assertRequiredHeaders(frame: FramedMessage): void {
  const required = REQUIRED_HEADERS[frame.verb] ?? [];
  for (const header of required) {
    requireHeader(frame, header);
  }
}

function requireHeader(frame: FramedMessage, name: string): string {
  const value = frame.headers[name];
  if (value == null || value.length === 0) {
    throw new FrameParseError(`Missing ${name} header on ${frame.verb}`);
  }
  return value;
}

function optionalHeader(frame: FramedMessage, name: string): string | undefined {
  return frame.headers[name];
}

function withOptional(headers: Record<string, string | undefined>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).filter(([, value]) => value != null),
  ) as Record<string, string>;
}

function validateVerb(verb: string): void {
  if (!/^[A-Z_]+$/.test(verb)) {
    throw new FrameParseError(`Invalid verb line: ${verb}`);
  }
}

function validateHeaderName(name: string): void {
  if (!/^[a-z-]+$/.test(name)) {
    throw new FrameParseError(`Invalid header name: ${name}`);
  }
}

function validateHeaderValue(name: string, value: string): void {
  if (/[\n\r\u0000]/.test(value)) {
    throw new FrameParseError(`Invalid header value for ${name}`);
  }
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
