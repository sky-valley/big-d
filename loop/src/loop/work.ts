/**
 * doWork() — The black box.
 *
 * How the agent actually edits code. Uses the Claude Agent SDK
 * for full-power agentic coding (Read, Edit, Bash, Glob, Grep, etc.).
 * The loop framework doesn't depend on how work gets done — only on the result.
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import { execFileSync } from 'child_process';
import type { ProjectContext } from '@differ/itp/src/types.ts';

export interface WorkResult {
  summary: string;
  filesChanged: string[];
}

function log(msg: string): void {
  console.log(`[work] ${msg}`);
}

/** Track files changed during a work session */
function getChangedFiles(targetDir: string): string[] {
  try {
    const output = execFileSync('git', ['diff', '--name-only'], { cwd: targetDir, encoding: 'utf-8' });
    const untracked = execFileSync('git', ['ls-files', '--others', '--exclude-standard'], { cwd: targetDir, encoding: 'utf-8' });
    return [...output.trim().split('\n'), ...untracked.trim().split('\n')].filter(Boolean);
  } catch {
    return [];
  }
}

/** Generate a system prompt from project context */
function generateSystemPrompt(ctx: ProjectContext): string {
  const lines = [
    `You are a coding agent working on ${ctx.name}, a ${ctx.language} project.`,
  ];

  if (ctx.description) {
    lines.push(`\nProject description: ${ctx.description}`);
  }

  lines.push('\nRules:');
  lines.push('- Read existing files before modifying them to understand context');
  lines.push('- Follow existing code style and conventions');
  lines.push('- Keep changes minimal and focused on the intent');
  lines.push('- Do not modify files outside the project root');

  for (const c of ctx.constraints) {
    lines.push(`- ${c}`);
  }

  if (ctx.frameworks.length > 0) {
    lines.push(`\nFrameworks: ${ctx.frameworks.join(', ')}`);
  }

  return lines.join('\n');
}

export async function doWork(
  intentContent: string,
  plan: string,
  targetDir: string,
  projectContext: ProjectContext,
): Promise<WorkResult> {
  log('Starting Claude Agent SDK session...');

  const prompt = `## Intent\n${intentContent}\n\n## Plan\n${plan}\n\nPlease implement this. Start by reading relevant files, then make the necessary changes.`;

  let resultText = '';
  let costUsd = 0;
  let turns = 0;

  for await (const message of query({
    prompt,
    options: {
      cwd: targetDir,
      systemPrompt: generateSystemPrompt(projectContext),
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

  const filesChanged = getChangedFiles(targetDir);
  log(`Files changed: ${filesChanged.join(', ') || 'none'}`);

  return {
    summary: resultText || 'Work completed.',
    filesChanged,
  };
}
