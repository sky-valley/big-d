import { describe, expect, it } from 'vitest';
import {
  FrameParseError,
  frameToItpMessage,
  frameToScanRequest,
  parseSingleFramedMessage,
} from '../src/framing.ts';

const encoder = new TextEncoder();

function framed(text: string): Uint8Array {
  return encoder.encode(text);
}

describe('spacebase1 framing aligns with ITP envelope requirements', () => {
  it('rejects ACCEPT without promise header', () => {
    const frame = parseSingleFramedMessage(framed([
      'ACCEPT',
      'sender: agent-1',
      'parent: root',
      'timestamp: 1712016001000',
      'body-length: 2',
      '',
      '{}',
    ].join('\n')));

    expect(() => frameToItpMessage(frame)).toThrowError(
      new FrameParseError('Missing promise header on ACCEPT'),
    );
  });

  it('rejects ACCEPT with promise-id instead of promise', () => {
    const frame = parseSingleFramedMessage(framed([
      'ACCEPT',
      'sender: agent-1',
      'parent: root',
      'promise-id: promise-123',
      'timestamp: 1712016001000',
      'body-length: 2',
      '',
      '{}',
    ].join('\n')));

    expect(() => frameToItpMessage(frame)).toThrowError(
      new FrameParseError('Missing promise header on ACCEPT'),
    );
  });

  it('rejects SCAN without since header', () => {
    const frame = parseSingleFramedMessage(framed([
      'SCAN',
      'space: root',
      'body-length: 0',
      '',
      '',
    ].join('\n')));

    expect(() => frameToScanRequest(frame)).toThrowError(
      new FrameParseError('Missing since header on SCAN'),
    );
  });

  it('rejects negative timestamps', () => {
    const frame = parseSingleFramedMessage(framed([
      'INTENT',
      'sender: agent-1',
      'parent: root',
      'intent: test-intent',
      'timestamp: -1',
      'body-length: 2',
      '',
      '{}',
    ].join('\n')));

    expect(() => frameToItpMessage(frame)).toThrowError(
      new FrameParseError('timestamp must be a non-negative integer'),
    );
  });

  it('rejects headers without colon-space separator', () => {
    expect(() => parseSingleFramedMessage(framed([
      'SCAN',
      'space:root',
      'since: 0',
      'body-length: 0',
      '',
      '',
    ].join('\n')))).toThrowError(
      new FrameParseError('Malformed header line: space:root'),
    );
  });
});
