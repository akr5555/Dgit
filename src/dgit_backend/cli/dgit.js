#!/usr/bin/env node

const { Actor, HttpAgent } = require('@dfinity/agent');
const { Ed25519KeyIdentity } = require('@dfinity/identity');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

const CANISTER_ID = 'uxrrr-q7777-77774-qaaaq-cai';
const HOST = 'http://127.0.0.1:8000';

const idlFactory = ({ IDL }) => {
  const Blob = IDL.Record({
    content: IDL.Text,
    contentType: IDL.Text,
  });
  const FilePath = IDL.Text;
  const Tree = IDL.Record({
    files: IDL.Vec(IDL.Tuple(FilePath, Blob)),
  });
  const CommitId = IDL.Text;
  const Commit = IDL.Record({
    id: CommitId,
    tree: Tree,
    parent: IDL.Opt(CommitId),
    message: IDL.Text,
    author: IDL.Principal,
    timestamp: IDL.Int,
  });
  const BranchName = IDL.Text;
  const Branch = IDL.Record({
    name: BranchName,
    head: CommitId,
  });
  const RepoId = IDL.Nat;
  const Repo = IDL.Record({
    id: RepoId,
    name: IDL.Text,
    owner: IDL.Principal,
    collaborators: IDL.Vec(IDL.Principal),
    isPublic: IDL.Bool,
  });
  const Result = IDL.Variant({ ok: IDL.Null, err: IDL.Text });
  const Result_1 = IDL.Variant({ ok: RepoId, err: IDL.Text });
  const Result_2 = IDL.Variant({ ok: CommitId, err: IDL.Text });
  const Result_4 = IDL.Variant({ ok: Commit, err: IDL.Text });

  return IDL.Service({
    createRepo: IDL.Func([IDL.Text, IDL.Bool], [Result_1], []),
    commitCode: IDL.Func([RepoId, BranchName, IDL.Vec(IDL.Tuple(FilePath, Blob)), IDL.Text], [Result_2], []),
    createBranch: IDL.Func([RepoId, BranchName, BranchName], [Result], []),
    mergeBranch: IDL.Func([RepoId, BranchName, BranchName], [Result], []),
    forkRepo: IDL.Func([RepoId, IDL.Text], [Result_1], []),
    addCollaborator: IDL.Func([RepoId, IDL.Principal], [Result], []),
    getRepo: IDL.Func([RepoId], [Repo], ['query']),
    getCommit: IDL.Func([RepoId, CommitId], [Result_4], ['query']),
  });
};

async function initActor() {
  const identity = Ed25519KeyIdentity.generate();
  const agent = new HttpAgent({ host: HOST, identity });
  await agent.fetchRootKey();
  return Actor.createActor(idlFactory, { agent, canisterId: CANISTER_ID });
}

const commands = {
  init: async (repoName, isPublicArg = 'true') => {
    if (!repoName) {
      console.error("Error: Repository name is required. Usage: dgit init <name> [true|false]");
      return;
    }
    const actor = await initActor();
    const isPublic = isPublicArg.toLowerCase() === 'true';
    const result = await actor.createRepo(repoName, isPublic);
    if ('ok' in result) {
      console.log(`Repository created with ID: ${result.ok}`);
      await fs.writeFile(
        path.join(process.cwd(), '.dgit'),
        JSON.stringify({ repoId: result.ok.toString() }, null, 2)
      );
    } else {
      console.error(`Error: ${result.err}`);
    }
  },

  commit: async (message) => {
    const config = JSON.parse(await fs.readFile(path.join(process.cwd(), '.dgit'), 'utf8'));
    const repoId = BigInt(config.repoId);
    const files = await readLocalFiles();
    const actor = await initActor();
    const result = await actor.commitCode(
      repoId,
      'main',
      files.map(f => [f.path, { content: f.content, contentType: f.contentType }]),
      message
    );
    if ('ok' in result) {
      console.log(`Commit created with ID: ${result.ok}`);
    } else {
      console.error(`Error: ${result.err}`);
    }
  },

  push: async (message = "Default commit message") => {
    const config = JSON.parse(await fs.readFile(path.join(process.cwd(), '.dgit'), 'utf8'));
    const repoId = BigInt(config.repoId);
    const files = await readLocalFiles();
    const actor = await initActor();
    const result = await actor.commitCode(
      repoId,
      'main',
      files.map(f => [f.path, { content: f.content, contentType: f.contentType }]),
      message
    );
    if ('ok' in result) {
      console.log(`✅ Push successful! Commit ID: ${result.ok}`);
    } else {
      console.error(`❌ Push failed: ${result.err}`);
    }
  },

  clone: async () => {
    const config = JSON.parse(await fs.readFile(path.join(process.cwd(), '.dgit'), 'utf8'));
    const repoId = BigInt(config.repoId);
    const actor = await initActor();
    const repo = await actor.getRepo(repoId);
    if (!repo) {
      console.error("❌ Failed to fetch repository metadata.");
      return;
    }
    const branchName = 'main';
    const branch = repo.branches?.find?.(([name]) => name === branchName);
    const latestCommitId = branch?.[1]?.head;
    if (!latestCommitId) {
      console.error("❌ No commit found in 'main' branch.");
      return;
    }
    const commitResult = await actor.getCommit(repoId, latestCommitId);
    if (!('ok' in commitResult)) {
      console.error(`❌ Failed to fetch commit: ${commitResult.err}`);
      return;
    }
    const commit = commitResult.ok;
    const files = commit.tree.files;
    for (const [filename, blob] of files) {
      await fs.writeFile(filename, blob.content, 'utf8');
      console.log(`✅ Cloned file: ${filename}`);
    }
    console.log(`✅ Clone complete. Latest commit: ${latestCommitId}`);
  },

  status: async () => {
    const config = JSON.parse(await fs.readFile(path.join(process.cwd(), '.dgit'), 'utf8'));
    const repoId = BigInt(config.repoId);
    const actor = await initActor();
    const result = await actor.getRepo(repoId);
    console.log(`Repository: ${result.name}`);
    console.log(`Public: ${result.isPublic}`);
    console.log(`Owner: ${result.owner.toText ? result.owner.toText() : result.owner}`);
    console.log(`Collaborators: ${result.collaborators.map(p => p.toText ? p.toText() : p).join(', ')}`);
  },
};

async function readLocalFiles() {
  const files = [];
  const dir = await fs.readdir(process.cwd());
  for (const file of dir) {
    if (file.endsWith('.mo') || file.endsWith('.rs') || file.endsWith('.did')) {
      const content = await fs.readFile(file, 'utf8');
      files.push({
        path: file,
        content,
        contentType: path.extname(file),
      });
    }
  }
  return files;
}

const args = process.argv.slice(2);
const command = args[0];
if (commands[command]) {
  commands[command](...args.slice(1)).catch(console.error);
} else {
  console.error('Unknown command. Available commands: init, commit, status, push, clone');
}
