import { classifyRun } from '../src/harness.ts';
import type { MessageEcho } from '../../intent-space/src/types.ts';

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

function main(): void {
  test('classifyRun returns pre-dojo when no visitor messages exist');
  {
    const result = classifyRun([
      msg({ type: 'INTENT', senderId: 'intent-space', parentId: 'root', payload: { content: 'persist' }, seq: 1 }),
    ]);
    assert(result.failureStage === 'pre-dojo', `expected pre-dojo, got ${result.failureStage}`);
    assert(result.cleanliness === 'single-pass', `expected single-pass, got ${result.cleanliness}`);
  }

  test('classifyRun returns signup when the agent never reaches tutorial');
  {
    const result = classifyRun([
      msg({ type: 'INTENT', senderId: 'visitor-agent', parentId: 'root', payload: { content: 'observed root' }, seq: 1 }),
    ]);
    assert(result.failureStage === 'signup', `expected signup, got ${result.failureStage}`);
  }

  test('classifyRun returns completed for a full ritual transcript');
  {
    const transcript: MessageEcho[] = [
      msg({ type: 'INTENT', senderId: 'visitor-agent', parentId: 'tutorial', intentId: 'greeting-1', payload: { content: 'academy tutorial greeting' }, seq: 1 }),
      msg({ type: 'DECLINE', senderId: 'differ-tutor', parentId: 'greeting-1', intentId: 'wrong-1', payload: { content: 'retry' }, seq: 2 }),
      msg({ type: 'PROMISE', senderId: 'differ-tutor', parentId: 'greeting-1', promiseId: 'promise-1', payload: { content: 'promise' }, seq: 3 }),
      msg({ type: 'ACCEPT', senderId: 'visitor-agent', parentId: 'greeting-1', promiseId: 'promise-1', payload: {}, seq: 4 }),
      msg({ type: 'COMPLETE', senderId: 'differ-tutor', parentId: 'greeting-1', promiseId: 'promise-1', payload: { content: 'complete' }, seq: 5 }),
      msg({ type: 'ASSESS', senderId: 'visitor-agent', parentId: 'greeting-1', promiseId: 'promise-1', payload: { assessment: 'FULFILLED' }, seq: 6 }),
    ];
    const result = classifyRun(transcript, ['dojo_client.py']);
    assert(result.failureStage === 'completed', `expected completed, got ${result.failureStage}`);
    assert(result.agentId === 'visitor-agent', `expected visitor-agent, got ${result.agentId}`);
    assert(result.helperMode === 'generated-executed', `expected generated-executed, got ${result.helperMode}`);
  }

  test('classifyRun returns decline-recovery when the agent never earns a promise');
  {
    const transcript: MessageEcho[] = [
      msg({ type: 'INTENT', senderId: 'visitor-agent', parentId: 'tutorial', intentId: 'greeting-1', payload: { content: 'academy tutorial greeting' }, seq: 1 }),
      msg({ type: 'DECLINE', senderId: 'differ-tutor', parentId: 'greeting-1', intentId: 'wrong-1', payload: { content: 'retry' }, seq: 2 }),
    ];
    const result = classifyRun(transcript);
    assert(result.failureStage === 'decline-recovery', `expected decline-recovery, got ${result.failureStage}`);
  }

  console.log(`\n================================`);
  console.log(`  ${pass} passed, ${fail} failed (of ${step})`);
  console.log(`================================`);
  if (fail > 0) process.exit(1);
}

main();
