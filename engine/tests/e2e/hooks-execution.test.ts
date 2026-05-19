import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('Hook Execution E2E', () => {
  const hooksDir = path.join(os.homedir(), 'brain-stack/hooks');

  it('session-start.sh executes without error', () => {
    // session-start.sh redirects to log file and may take >10s for MCP tests
    execSync('bash session-start.sh', {
      cwd: hooksDir,
      encoding: 'utf-8',
      input: '{"session_id":"test","cwd":"/tmp","source":"test"}\n',
      timeout: 30000,
      env: { ...process.env, HOME: os.homedir() }
    });
    const logFile = path.join(os.homedir(), '.kimi/logs/hooks/session-start.log');
    expect(fs.existsSync(logFile)).toBe(true);
    const logContent = fs.readFileSync(logFile, 'utf-8');
    expect(logContent).toContain('SessionStart');
  });

  it('pre-tool-use.sh blocks .env writes', () => {
    let output = '';
    try {
      output = execSync('bash pre-tool-use.sh', {
        cwd: hooksDir,
        encoding: 'utf-8',
        input: '{"tool":"WriteFile","path":".env","content":"SECRET"}\n',
        timeout: 5000,
        env: { ...process.env, HOME: os.homedir() }
      });
    } catch (err: any) {
      // pre-tool-use.sh exits 2 on blocked operations (fail-secure)
      output = err.stdout || err.stderr || '';
    }
    expect(output).toContain('BLOCKED');
  });

  it('stop.sh writes to its log file', () => {
    // stop.sh redirects output to log file, so stdout is empty
    execSync('bash stop.sh', {
      cwd: hooksDir,
      encoding: 'utf-8',
      timeout: 10000,
      env: { ...process.env, HOME: os.homedir() }
    });
    const logFile = path.join(os.homedir(), '.kimi/logs/hooks/stop.log');
    expect(fs.existsSync(logFile)).toBe(true);
    const logContent = fs.readFileSync(logFile, 'utf-8');
    expect(logContent.length).toBeGreaterThan(0);
  });
});
