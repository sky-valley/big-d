/**
 * doWork() — The black box.
 *
 * How the agent actually edits code. Phase 1: Claude API with file tools.
 * The loop framework doesn't depend on how work gets done — only on the result.
 */

import Anthropic from '@anthropic-ai/sdk';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, relative } from 'path';
import { execFileSync } from 'child_process';

export interface WorkResult {
  summary: string;
  filesChanged: string[];
}

interface FileReadInput { path: string }
interface FileWriteInput { path: string; content: string }
interface ListFilesInput { directory: string }
interface ShellInput { command: string; args: string[] }

type ToolInput = FileReadInput | FileWriteInput | ListFilesInput | ShellInput;

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'read_file',
    description: 'Read the contents of a file at the given path (relative to project root).',
    input_schema: {
      type: 'object' as const,
      properties: { path: { type: 'string', description: 'File path relative to project root' } },
      required: ['path'],
    },
  },
  {
    name: 'write_file',
    description: 'Write content to a file at the given path (relative to project root). Creates directories as needed.',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: { type: 'string', description: 'File path relative to project root' },
        content: { type: 'string', description: 'File content to write' },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'list_files',
    description: 'List files in a directory (relative to project root). Returns one path per line.',
    input_schema: {
      type: 'object' as const,
      properties: { directory: { type: 'string', description: 'Directory path relative to project root' } },
      required: ['directory'],
    },
  },
  {
    name: 'shell',
    description: 'Run a shell command. Use for build, test, or inspection tasks. First argument is the command, rest are args.',
    input_schema: {
      type: 'object' as const,
      properties: {
        command: { type: 'string', description: 'Command to run' },
        args: { type: 'array', items: { type: 'string' }, description: 'Command arguments' },
      },
      required: ['command', 'args'],
    },
  },
];

/** Execute a tool call from the LLM */
function executeTool(name: string, input: ToolInput, cwd: string): string {
  try {
    switch (name) {
      case 'read_file': {
        const { path } = input as FileReadInput;
        const fullPath = join(cwd, path);
        if (!existsSync(fullPath)) return `Error: file not found: ${path}`;
        return readFileSync(fullPath, 'utf-8');
      }
      case 'write_file': {
        const { path, content } = input as FileWriteInput;
        const fullPath = join(cwd, path);
        const { mkdirSync } = require('fs');
        mkdirSync(join(fullPath, '..'), { recursive: true });
        writeFileSync(fullPath, content);
        return `Wrote ${content.length} bytes to ${path}`;
      }
      case 'list_files': {
        const { directory } = input as ListFilesInput;
        const fullPath = join(cwd, directory);
        if (!existsSync(fullPath)) return `Error: directory not found: ${directory}`;
        const output = execFileSync('find', [fullPath, '-maxdepth', '2', '-type', 'f'], { encoding: 'utf-8' });
        return output.split('\n').map(p => relative(cwd, p)).filter(Boolean).join('\n');
      }
      case 'shell': {
        const { command, args } = input as ShellInput;
        return execFileSync(command, args, { cwd, encoding: 'utf-8', timeout: 30000 });
      }
      default:
        return `Unknown tool: ${name}`;
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return `Error: ${message}`;
  }
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
  const client = new Anthropic();

  const systemPrompt = `You are a coding agent working on a TypeScript project. Your job is to implement changes to the codebase based on the given intent and plan.

Project root: ${cwd}

Rules:
- Read existing files before modifying them to understand context
- Write complete file contents (not patches)
- Follow existing code style and conventions
- Use .ts extension on imports
- Keep changes minimal and focused on the intent`;

  const messages: Anthropic.MessageParam[] = [
    {
      role: 'user',
      content: `## Intent\n${intentContent}\n\n## Plan\n${plan}\n\nPlease implement this. Start by reading relevant files, then make the necessary changes.`,
    },
  ];

  let filesChanged: string[] = [];

  // Agentic loop — up to 20 turns
  for (let turn = 0; turn < 20; turn++) {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8192,
      system: systemPrompt,
      tools: TOOLS,
      messages,
    });

    // Collect text and tool results
    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    let summaryText = '';

    for (const block of response.content) {
      if (block.type === 'text') {
        summaryText += block.text;
      } else if (block.type === 'tool_use') {
        const result = executeTool(block.name, block.input as ToolInput, cwd);
        toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result });
      }
    }

    if (response.stop_reason === 'end_turn' || toolResults.length === 0) {
      filesChanged = getChangedFiles(cwd);
      return {
        summary: summaryText || 'Work completed.',
        filesChanged,
      };
    }

    // Continue the conversation with tool results
    messages.push({ role: 'assistant', content: response.content });
    messages.push({ role: 'user', content: toolResults });
  }

  filesChanged = getChangedFiles(cwd);
  return {
    summary: 'Work completed (reached max turns).',
    filesChanged,
  };
}
