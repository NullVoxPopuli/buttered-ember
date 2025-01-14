import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import url from 'node:url';

import { execa } from 'execa';
import yn from 'yn';

import type { expect } from 'vitest';

const __dirname = url.fileURLToPath(new URL('.', import.meta.url));

export const fixturesFolder = path.join(__dirname, 'fixtures');
export const testPackagesFolder = path.join(__dirname, '../test-packages');

const binPath = path.join(__dirname, '../src/bin.js');

interface DirOrFixture {
  cwd?: string;
  onFixture?: string;
  args?: string[];
  onTestPackage?: string;
  cmd?: 'test' | 'serve' | 'try:one' | 'try:each';
  prepare?: (tmpDir: string) => void | Promise<void>;
}

const VERBOSE = yn(process.env['VERBOSE']);

export function expectNoErrorWithin(_expect: typeof expect, output: string) {
  if (!output) return;

  _expect(output).not.toContain('ERROR Summary:');
  _expect(output).not.toContain('has the following unmet peerDependencies');
  _expect(output).not.toContain('Command failed with exit code 1');
}

export const logOutput = (stdout: string, stderr: string) => {
  if (stderr) {
    console.debug('---------------------------------------------');
    console.debug('------------------- stdout --------------------------');
    console.debug(stdout);
    console.debug('------------------- stderr --------------------------');
    console.debug(stderr);
    console.debug('---------------------------------------------');
  }
};

export async function overrideFile(overridePath: string, targetPath: string) {
  let sourceFile = path.join(__dirname, 'override-files', overridePath);
  let targetFile = path.join(targetPath, overridePath);

  await fs.cp(sourceFile, targetFile, { recursive: true });
}

export async function run(
  cmd: NonNullable<DirOrFixture['cmd']>,
  { cwd, prepare, onFixture, onTestPackage, args }: DirOrFixture
) {
  if (onTestPackage) {
    let originDirectory = path.join(testPackagesFolder, onTestPackage);
    let workingDirectory = await copyToNewTmp(originDirectory);

    if (VERBOSE) {
      console.debug(
        `Running on test package: \n\n` +
          `\tnode ${binPath} ${cmd}\n\n` +
          `In ${workingDirectory}\n` +
          `Copied from ${originDirectory}`
      );
    }

    if (prepare) {
      await prepare(workingDirectory);
    }

    return execa('node', [binPath, cmd, ...(args || [])], {
      cwd: path.join(testPackagesFolder, onTestPackage),
      reject: false,
    });
  }

  if (onFixture) {
    if (VERBOSE) {
      console.debug(
        `Running on fixture: \n\n` +
          `\tnode ${binPath} ${cmd}\n\n` +
          `In ${path.join(fixturesFolder, onFixture)}`
      );
    }

    return execa('node', [binPath, cmd, ...(args || [])], {
      cwd: path.join(fixturesFolder, onFixture),
      reject: false,
    });
  }

  if (cwd) {
    if (VERBOSE) {
      console.debug(`Running in directory: \n\n` + `\tnode ${binPath} ${cmd}\n\n` + `In ${cwd}`);
    }

    return execa('node', [binPath, cmd], { cwd, stdio: 'inherit' });
  }

  return { exitCode: 1, stderr: 'no fixture, nor cwd', stdout: 'nothing ran' };
}

export async function copyToNewTmp(src: string): Promise<string> {
  let base = path.basename(src);
  let tmpDir = path.join(os.tmpdir(), `${base}-${new Date().getTime()}`);

  await fs.rm(tmpDir, { recursive: true, force: true });
  await fs.mkdir(tmpDir);
  await fs.cp(src, tmpDir, { recursive: true });

  return tmpDir;
}

export async function findFixtures(): Promise<string[]> {
  return (await fs.readdir(fixturesFolder, { withFileTypes: true }))
    .filter((stat) => stat.isDirectory())
    .map((stat) => stat.name);
}

export async function findEmberTry(): Promise<string[]> {
  return (await fs.readdir(testPackagesFolder, { withFileTypes: true }))
    .filter((stat) => stat.isDirectory())
    .map((stat) => stat.name)
    .filter((name) => name.includes('ember-try'));
}
