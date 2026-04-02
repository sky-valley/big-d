import type {
  AuthRequest,
  AuthResult,
  AuthenticatedITPMessage,
  ClientMessage,
  ScanRequest,
  ScanResult,
  ServerMessage,
  SpaceError,
  StoredMessage,
} from './types.ts';

const HEADER_TERMINATOR = Buffer.from('\n\n', 'utf8');

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

export function parseFramedMessages(buffer: Buffer): ParseResult {
  const messages: FramedMessage[] = [];
  let offset = 0;

  while (offset < buffer.length) {
    const headerEnd = buffer.indexOf(HEADER_TERMINATOR, offset);
    if (headerEnd === -1) {
      break;
    }

    const headerBytes = buffer.subarray(offset, headerEnd);
    const headerText = headerBytes.toString('utf8');
    const lines = headerText.split('\n');
    const verb = lines.shift()?.trim();
    if (!verb) {
      throw new FrameParseError('Missing verb line');
    }

    const headers: Record<string, string> = {};
    for (const rawLine of lines) {
      if (!rawLine) {
        throw new FrameParseError('Unexpected empty header line');
      }
      const separator = rawLine.indexOf(':');
      if (separator <= 0) {
        throw new FrameParseError(`Malformed header line: ${rawLine}`);
      }
      const name = rawLine.slice(0, separator).trim();
      const value = rawLine.slice(separator + 1).trim();
      if (!/^[a-z0-9-]+$/.test(name)) {
        throw new FrameParseError(`Invalid header name: ${name}`);
      }
      if (Object.prototype.hasOwnProperty.call(headers, name)) {
        throw new FrameParseError(`Duplicate header: ${name}`);
      }
      headers[name] = value;
    }

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
    if (bodyEnd > buffer.length) {
      break;
    }

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

export function serializeFramedMessage(message: FramedMessage): Buffer {
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

export function clientMessageToFrame(message: ClientMessage): FramedMessage {
  switch (message.type) {
    case 'AUTH':
      return {
        verb: 'AUTH',
        headers: {
          'station-token': message.stationToken,
          proof: message.proof,
        },
        body: Buffer.alloc(0),
      };
    case 'SCAN':
      return {
        verb: 'SCAN',
        headers: withOptional({
          space: message.spaceId,
          since: String(message.since ?? 0),
          proof: message.proof,
        }),
        body: Buffer.alloc(0),
      };
    default:
      return itpMessageToFrame(message);
  }
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
  if (message.type === 'AUTH_RESULT') {
    return {
      verb: 'AUTH_RESULT',
      headers: withOptional({
        sender: message.senderId,
        principal: message.principalId,
        space: message.spaceId,
        'tutorial-space': message.tutorialSpaceId,
        'ritual-greeting': message.ritualGreeting,
      }),
      body: Buffer.alloc(0),
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

export function frameToClientMessage(frame: FramedMessage): ClientMessage {
  switch (frame.verb) {
    case 'AUTH':
      return {
        type: 'AUTH',
        stationToken: requireHeader(frame, 'station-token'),
        proof: requireHeader(frame, 'proof'),
      };
    case 'SCAN':
      return {
        type: 'SCAN',
        spaceId: requireHeader(frame, 'space'),
        since: parseIntegerHeader(frame, 'since'),
        proof: optionalHeader(frame, 'proof'),
      };
    default:
      return frameToItpMessage(frame);
  }
}

export function frameToServerMessage(frame: FramedMessage): ServerMessage {
  switch (frame.verb) {
    case 'SCAN_RESULT':
      return {
        type: 'SCAN_RESULT',
        spaceId: requireHeader(frame, 'space'),
        latestSeq: parseIntegerHeader(frame, 'latest-seq'),
        messages: decodeJson<StoredMessage[]>(frame),
      };
    case 'AUTH_RESULT':
      return {
        type: 'AUTH_RESULT',
        senderId: requireHeader(frame, 'sender'),
        principalId: requireHeader(frame, 'principal'),
        spaceId: optionalHeader(frame, 'space'),
        tutorialSpaceId: optionalHeader(frame, 'tutorial-space'),
        ritualGreeting: optionalHeader(frame, 'ritual-greeting'),
      };
    case 'ERROR':
      return {
        type: 'ERROR',
        message: frame.body.toString('utf8'),
      };
    default:
      return frameToMessageEcho(frame);
  }
}

function itpMessageToFrame(message: AuthenticatedITPMessage): FramedMessage {
  return {
    verb: message.type,
    headers: withOptional({
      sender: message.senderId,
      parent: message.parentId,
      intent: message.intentId,
      promise: message.promiseId,
      timestamp: String(message.timestamp),
      proof: message.proof,
      seq: 'seq' in message && typeof message.seq === 'number' ? String(message.seq) : undefined,
      'payload-hint': 'application/json',
    }),
    body: encodeJson(message.payload),
  };
}

function frameToItpMessage(frame: FramedMessage): AuthenticatedITPMessage {
  const payload = decodeJson<Record<string, unknown>>(frame);
  const message: AuthenticatedITPMessage = {
    type: frame.verb as AuthenticatedITPMessage['type'],
    senderId: requireHeader(frame, 'sender'),
    timestamp: parseIntegerHeader(frame, 'timestamp'),
    payload,
  };
  const parentId = optionalHeader(frame, 'parent');
  const intentId = optionalHeader(frame, 'intent');
  const promiseId = optionalHeader(frame, 'promise');
  const proof = optionalHeader(frame, 'proof');
  if (parentId != null) message.parentId = parentId;
  if (intentId != null) message.intentId = intentId;
  if (promiseId != null) message.promiseId = promiseId;
  if (proof != null) message.proof = proof;
  const seq = optionalHeader(frame, 'seq');
  if (seq != null) {
    (message as AuthenticatedITPMessage & { seq: number }).seq = Number.parseInt(seq, 10);
  }
  return message;
}

function frameToMessageEcho(frame: FramedMessage): ServerMessage {
  const message = frameToItpMessage(frame) as AuthenticatedITPMessage & { seq?: number };
  if (typeof message.seq !== 'number') {
    throw new FrameParseError(`${frame.verb} echo is missing seq header`);
  }
  return message as ServerMessage;
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

function parseIntegerHeader(frame: FramedMessage, name: string): number {
  const raw = requireHeader(frame, name);
  if (!/^-?\d+$/.test(raw)) {
    throw new FrameParseError(`${name} must be an integer`);
  }
  return Number.parseInt(raw, 10);
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
