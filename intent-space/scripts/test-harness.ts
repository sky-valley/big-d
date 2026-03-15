import { classifyRun } from '../src/harness.ts';
import type { MessageEcho } from '../src/types.ts';

let pass = 0;
let fail = 0;
let step = 0;

function test(name: string) {
  step += 1;
  process.stdout.write(`\n=== Test ${step}: ${name} ===\n`);
}

function assert(cond: boolean, msg: string) {
  if (cond) {
    pass += 1;
    console.log('  OK');
  } else {
    fail += 1;
    console.log(`  FAIL: ${msg}`);
  }
}

function msg(input: Partial<MessageEcho> & Pick<MessageEcho, 'type' | 'senderId' | 'parentId' | 'payload' | 'seq'>): MessageEcho {
  return {
    intentId: input.intentId,
    promiseId: input.promiseId,
    parentId: input.parentId,
    senderId: input.senderId,
    payload: input.payload,
    seq: input.seq,
    timestamp: input.timestamp ?? Date.now(),
    type: input.type,
  };
}

test('classifyRun returns pre-dojo when no visitor messages exist');
{
  const result = classifyRun([
    msg({ type: 'INTENT', senderId: 'intent-space', parentId: 'root', payload: { content: 'persist' }, seq: 1 }),
  ]);
  assert(result.failureStage === 'pre-dojo', `expected pre-dojo, got ${result.failureStage}`);
  assert(result.cleanliness === 'single-pass', `expected single-pass, got ${result.cleanliness}`);
  assert(result.helperMode === 'none', `expected helper mode none, got ${result.helperMode}`);
}

test('classifyRun returns completed for a full ritual transcript');
{
  const transcript: MessageEcho[] = [
    msg({ type: 'INTENT', senderId: 'visitor-agent', parentId: 'registration', intentId: 'reg-1', payload: { content: 'register' }, seq: 1 }),
    msg({ type: 'INTENT', senderId: 'differ-tutor', parentId: 'reg-1', intentId: 'challenge-1', payload: { challenge: 'abc' }, seq: 2 }),
    msg({ type: 'INTENT', senderId: 'visitor-agent', parentId: 'reg-1', intentId: 'signed-1', payload: { challenge: 'abc', signatureBase64: 'sig' }, seq: 3 }),
    msg({ type: 'INTENT', senderId: 'differ-tutor', parentId: 'reg-1', intentId: 'ack-1', payload: { ritualGreeting: 'academy tutorial greeting' }, seq: 4 }),
    msg({ type: 'INTENT', senderId: 'visitor-agent', parentId: 'tutorial', intentId: 'greeting-1', payload: { content: 'academy tutorial greeting' }, seq: 5 }),
    msg({ type: 'DECLINE', senderId: 'differ-tutor', parentId: 'greeting-1', intentId: 'wrong-1', payload: { content: 'retry' }, seq: 6 }),
    msg({ type: 'PROMISE', senderId: 'differ-tutor', parentId: 'greeting-1', promiseId: 'promise-1', payload: { content: 'promise' }, seq: 7 }),
    msg({ type: 'ACCEPT', senderId: 'visitor-agent', parentId: 'greeting-1', promiseId: 'promise-1', payload: { content: 'accept' }, seq: 8 }),
    msg({ type: 'COMPLETE', senderId: 'differ-tutor', parentId: 'greeting-1', promiseId: 'promise-1', payload: { content: 'complete' }, seq: 9 }),
    msg({ type: 'ASSESS', senderId: 'visitor-agent', parentId: 'greeting-1', promiseId: 'promise-1', payload: { assessment: 'FULFILLED' }, seq: 10 }),
  ];
  const result = classifyRun(transcript, ['dojo_client.py']);
  assert(result.failureStage === 'completed', `expected completed, got ${result.failureStage}`);
  assert(result.agentId === 'visitor-agent', `expected visitor-agent, got ${result.agentId}`);
  assert(result.cleanliness === 'single-pass', `expected single-pass, got ${result.cleanliness}`);
  assert(result.helperMode === 'generated-executed', `expected generated-executed, got ${result.helperMode}`);
  assert(result.helperLanguage === 'python', `expected python, got ${result.helperLanguage}`);
}

test('classifyRun returns decline-recovery when the agent never earns a promise');
{
  const transcript: MessageEcho[] = [
    msg({ type: 'INTENT', senderId: 'visitor-agent', parentId: 'registration', intentId: 'reg-1', payload: { content: 'register' }, seq: 1 }),
    msg({ type: 'INTENT', senderId: 'differ-tutor', parentId: 'reg-1', intentId: 'challenge-1', payload: { challenge: 'abc' }, seq: 2 }),
    msg({ type: 'INTENT', senderId: 'visitor-agent', parentId: 'reg-1', intentId: 'signed-1', payload: { challenge: 'abc', signatureBase64: 'sig' }, seq: 3 }),
    msg({ type: 'INTENT', senderId: 'differ-tutor', parentId: 'reg-1', intentId: 'ack-1', payload: { ritualGreeting: 'academy tutorial greeting' }, seq: 4 }),
    msg({ type: 'INTENT', senderId: 'visitor-agent', parentId: 'tutorial', intentId: 'greeting-1', payload: { content: 'academy tutorial greeting' }, seq: 5 }),
    msg({ type: 'DECLINE', senderId: 'differ-tutor', parentId: 'greeting-1', intentId: 'wrong-1', payload: { content: 'retry' }, seq: 6 }),
  ];
  const result = classifyRun(transcript);
  assert(result.failureStage === 'decline-recovery', `expected decline-recovery, got ${result.failureStage}`);
}

test('classifyRun ignores a stale one-off sender when a later dominant agent completes the ritual');
{
  const transcript: MessageEcho[] = [
    msg({ type: 'ASSESS', senderId: 'stale-agent', parentId: 'old-greeting', promiseId: 'old-promise', payload: { assessment: 'FULFILLED' }, seq: 1, timestamp: 1000 }),
    msg({ type: 'INTENT', senderId: 'fresh-agent', parentId: 'registration', intentId: 'reg-1', payload: { content: 'register' }, seq: 2, timestamp: 2000 }),
    msg({ type: 'INTENT', senderId: 'differ-tutor', parentId: 'reg-1', intentId: 'challenge-1', payload: { challenge: 'abc' }, seq: 3, timestamp: 2001 }),
    msg({ type: 'INTENT', senderId: 'fresh-agent', parentId: 'reg-1', intentId: 'signed-1', payload: { challenge: 'abc', signatureBase64: 'sig' }, seq: 4, timestamp: 2002 }),
    msg({ type: 'INTENT', senderId: 'differ-tutor', parentId: 'reg-1', intentId: 'ack-1', payload: { ritualGreeting: 'academy tutorial greeting' }, seq: 5, timestamp: 2003 }),
    msg({ type: 'INTENT', senderId: 'fresh-agent', parentId: 'tutorial', intentId: 'greeting-1', payload: { content: 'academy tutorial greeting' }, seq: 6, timestamp: 2004 }),
    msg({ type: 'DECLINE', senderId: 'differ-tutor', parentId: 'greeting-1', intentId: 'wrong-1', payload: { content: 'retry' }, seq: 7, timestamp: 2005 }),
    msg({ type: 'PROMISE', senderId: 'differ-tutor', parentId: 'greeting-1', promiseId: 'promise-1', payload: { content: 'promise' }, seq: 8, timestamp: 2006 }),
    msg({ type: 'ACCEPT', senderId: 'fresh-agent', parentId: 'greeting-1', promiseId: 'promise-1', payload: {}, seq: 9, timestamp: 2007 }),
    msg({ type: 'ASSESS', senderId: 'fresh-agent', parentId: 'greeting-1', promiseId: 'promise-1', payload: { assessment: 'FULFILLED' }, seq: 10, timestamp: 2008 }),
  ];
  const result = classifyRun(transcript);
  assert(result.failureStage === 'completed', `expected completed, got ${result.failureStage}`);
  assert(result.agentId === 'fresh-agent', `expected fresh-agent, got ${result.agentId}`);
}

test('classifyRun marks multi-identity multi-helper success as self-repaired');
{
  const transcript: MessageEcho[] = [
    msg({ type: 'INTENT', senderId: 'agent-a', parentId: 'registration', intentId: 'reg-a', payload: { content: 'register' }, seq: 1 }),
    msg({ type: 'INTENT', senderId: 'differ-tutor', parentId: 'reg-a', intentId: 'challenge-a', payload: { challenge: 'abc' }, seq: 2 }),
    msg({ type: 'INTENT', senderId: 'agent-a', parentId: 'reg-a', intentId: 'signed-a', payload: { challenge: 'abc', signatureBase64: 'sig' }, seq: 3 }),
    msg({ type: 'INTENT', senderId: 'agent-b', parentId: 'registration', intentId: 'reg-b', payload: { content: 'register' }, seq: 4 }),
    msg({ type: 'INTENT', senderId: 'differ-tutor', parentId: 'reg-b', intentId: 'challenge-b', payload: { challenge: 'xyz' }, seq: 5 }),
    msg({ type: 'INTENT', senderId: 'agent-b', parentId: 'reg-b', intentId: 'signed-b', payload: { challenge: 'xyz', signatureBase64: 'sig' }, seq: 6 }),
    msg({ type: 'INTENT', senderId: 'differ-tutor', parentId: 'reg-b', intentId: 'ack-b', payload: { ritualGreeting: 'academy tutorial greeting' }, seq: 7 }),
    msg({ type: 'INTENT', senderId: 'agent-b', parentId: 'tutorial', intentId: 'greeting-b', payload: { content: 'academy tutorial greeting' }, seq: 8 }),
    msg({ type: 'DECLINE', senderId: 'differ-tutor', parentId: 'greeting-b', intentId: 'wrong-b', payload: { content: 'retry' }, seq: 9 }),
    msg({ type: 'PROMISE', senderId: 'differ-tutor', parentId: 'greeting-b', promiseId: 'promise-b', payload: { content: 'promise' }, seq: 10 }),
    msg({ type: 'ACCEPT', senderId: 'agent-b', parentId: 'greeting-b', promiseId: 'promise-b', payload: {}, seq: 11 }),
    msg({ type: 'ASSESS', senderId: 'agent-b', parentId: 'greeting-b', promiseId: 'promise-b', payload: { assessment: 'FULFILLED' }, seq: 12 }),
  ];
  const result = classifyRun(transcript, ['client.js', 'client2.js']);
  assert(result.failureStage === 'completed', `expected completed, got ${result.failureStage}`);
  assert(result.cleanliness === 'self-repaired', `expected self-repaired, got ${result.cleanliness}`);
  assert(result.repairSignals.includes('multiple-agent-identities'), 'expected multiple-agent-identities signal');
  assert(result.repairSignals.includes('multiple-helper-files'), 'expected multiple-helper-files signal');
  assert(result.helperLanguage === 'javascript', `expected javascript, got ${result.helperLanguage}`);
}

test('classifyRun detects generated-but-not-executed helper');
{
  const result = classifyRun([], ['dojo_client.py']);
  assert(result.helperMode === 'generated-not-executed', `expected generated-not-executed, got ${result.helperMode}`);
}

console.log(`\n================================`);
console.log(`  ${pass} passed, ${fail} failed (of ${step})`);
console.log(`================================`);

if (fail > 0) process.exit(1);
