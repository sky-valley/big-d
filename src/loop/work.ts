/**
 * doWork() — The black box.
 *
 * How the agent actually edits code. Uses the Claude Agent SDK
 * for full-power agentic coding (Read, Edit, Bash, Glob, Grep, etc.).
 * The loop framework doesn't depend on how work gets done — only on the result.
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import { execFileSync } from 'child_process';

export interface WorkResult {
  summary: string;
  filesChanged: string[];
}

function log(msg: string): void {
  console.log(`[work] ${msg}`);
}

/** Track files changed during a work session */
function getChangedFiles(cwd: string): string[] {
  try {
    const output = execFileSync('git', ['diff', '--name-only'], { cwd, encoding: 'utf-8' });
    const untracked = execFileSync('git', ['ls-files', '--others', '--exclude-standard'], { cwd, encoding: 'utf-8' });
    return [...output.trim().split('\n'), ...untracked.trim().split('\n')].filter(Boolean);
  } catch {
    return [];
  }
}

export async function doWork(intentContent: string, plan: string, cwd: string): Promise<WorkResult> {
  log('Starting Claude Agent SDK session...');

  const prompt = `## Intent\n${intentContent}\n\n## Plan\n${plan}\n\nPlease implement this. Start by reading relevant files, then make the necessary changes.`;

  let resultText = '';
  let costUsd = 0;
  let turns = 0;

  for await (const message of query({
    prompt,
    options: {
      cwd,
      systemPrompt: `You are a self-modifying coding agent working on a TypeScript project.

Rules:
- Read existing files before modifying them to understand context
- Follow existing code style and conventions
- Use .ts extension on imports
- Keep changes minimal and focused on the intent
- Do not modify files outside the project root`,
      permissionMode: 'bypassPermissions',
      allowDangerouslySkipPermissions: true,
      maxTurns: 20,
    },
  })) {
    if (message.type === 'assistant') {
      turns++;
      const textBlocks = message.message.content.filter(
        (b: { type: string }) => b.type === 'text',
      );
      const toolBlocks = message.message.content.filter(
        (b: { type: string }) => b.type === 'tool_use',
      );

      for (const block of textBlocks) {
        if (block.type === 'text') {
          const preview = block.text.length > 200 ? block.text.slice(0, 200) + '...' : block.text;
          for (const line of preview.split('\n')) {
            log(`  💬 ${line}`);
          }
        }
      }

      for (const block of toolBlocks) {
        if (block.type === 'tool_use') {
          const inputStr = JSON.stringify(block.input);
          log(`  🔧 ${block.name}(${inputStr.length > 120 ? inputStr.slice(0, 120) + '...' : inputStr})`);
        }
      }

      if (textBlocks.length > 0 || toolBlocks.length > 0) {
        log(`  Turn ${turns} — ${toolBlocks.length} tool calls`);
      }
    }

    if (message.type === 'result') {
      costUsd = message.total_cost_usd;
      log(`Session complete: ${message.num_turns} turns, $${costUsd.toFixed(4)}`);
      if (message.subtype === 'success') {
        resultText = message.result;
      } else {
        log(`  ⚠️  ended with: ${message.subtype}`);
      }
    }
  }

  const filesChanged = getChangedFiles(cwd);
  log(`Files changed: ${filesChanged.join(', ') || 'none'}`);

  return {
    summary: resultText || 'Work completed.',
    filesChanged,
  };
}
