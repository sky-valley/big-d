import { describe, expect, it } from 'vitest';
import {
  FrameParseError,
  ITP_SIGNATURE_HEADER,
  ITP_SIGNATURE_VERSION,
  canonicalProofBytes,
  frameToItpMessage,
  frameToScanRequest,
  parseSingleFramedMessage,
  serializeFramedMessage,
} from '../src/framing.ts';

const encoder = new TextEncoder();

function framed(text: string): Uint8Array {
  return encoder.encode(text);
}

describe('spacebase1 framing aligns with ITP envelope requirements', () => {
  it('canonical proof bytes are order-invariant and strip proof', () => {
    const body = framed('{}');
    const first = canonicalProofBytes({
      verb: 'INTENT',
      headers: {
        sender: 'agent-1',
        parent: 'root',
        intent: 'intent-1',
        timestamp: '1775701868218',
        proof: 'proof-to-strip',
        'payload-hint': 'application/json',
      },
      body,
    });
    const second = canonicalProofBytes({
      verb: 'INTENT',
      headers: {
        'payload-hint': 'application/json',
        timestamp: '1775701868218',
        proof: 'different-proof-to-strip',
        intent: 'intent-1',
        parent: 'root',
        sender: 'agent-1',
      },
      body,
    });

    const text = new TextDecoder().decode(first);
    expect(first).toEqual(second);
    expect(text).toContain(`${ITP_SIGNATURE_HEADER}: ${ITP_SIGNATURE_VERSION}`);
    expect(text).not.toContain('proof:');
    expect(text.split('\n').at(-3)).toBe('body-length: 2');
  });

  it('rejects signed frames without itp-sig marker', () => {
    expect(() => parseSingleFramedMessage(framed([
      'SCAN',
      'space: root',
      'since: 0',
      'proof: stale-proof',
      'body-length: 0',
      '',
      '',
    ].join('\n')))).toThrowError(
      new FrameParseError('Signed frame requires itp-sig: v1'),
    );
  });

  it('rejects unsupported itp-sig marker values', () => {
    expect(() => parseSingleFramedMessage(framed([
      'SCAN',
      'space: root',
      'since: 0',
      'itp-sig: v2',
      'proof: stale-proof',
      'body-length: 0',
      '',
      '',
    ].join('\n')))).toThrowError(
      new FrameParseError('Unsupported itp-sig value: v2'),
    );
  });

  it('refuses to serialize signed frames without itp-sig marker', () => {
    expect(() => serializeFramedMessage({
      verb: 'SCAN',
      headers: {
        space: 'root',
        since: '0',
        proof: 'stale-proof',
      },
      body: new Uint8Array(),
    })).toThrowError(
      new FrameParseError('Signed frame requires itp-sig: v1'),
    );
  });

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
