import { Actor, HttpAgent } from '@dfinity/agent';
import { Ed25519KeyIdentity } from '@dfinity/identity';
import { IDL } from '@dfinity/candid';

// Canister ID (replace with your deployed canister ID)
const CANISTER_ID = 'uxrrr-q7777-77774-qaaaq-cai'; // Update with dfx canister id repo_canister
const HOST = 'http://127.0.0.1:8000'; // Local replica

// IDL
const idlFactory: IDL.InterfaceFactory = ({ IDL }) => {
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
  const Result_3 = IDL.Variant({ 
    ok: IDL.Record({ id: RepoId, name: IDL.Text, owner: IDL.Principal, collaborators: IDL.Vec(IDL.Principal), isPublic: IDL.Bool }), 
    err: IDL.Text 
  });
  const Result_4 = IDL.Variant({ ok: Commit, err: IDL.Text });

  return IDL.Service({
    createRepo: IDL.Func([IDL.Text, IDL.Bool], [Result_1], []),
    commitCode: IDL.Func([RepoId, BranchName, IDL.Vec(IDL.Tuple(FilePath, Blob)), IDL.Text], [Result_2], []),
    createBranch: IDL.Func([RepoId, BranchName, BranchName], [Result], []),
    mergeBranch: IDL.Func([RepoId, BranchName, BranchName], [Result], []),
    forkRepo: IDL.Func([RepoId, IDL.Text], [Result_1], []),
    addCollaborator: IDL.Func([RepoId, IDL.Principal], [Result], []),
    getRepo: IDL.Func([RepoId], [Result_3], ['query']),
    getCommit: IDL.Func([RepoId, CommitId], [Result_4], ['query']),
  });
};

// Initialize actor
export async function initActor() {
  const identity = Ed25519KeyIdentity.generate(); // Replace with Internet Identity in production
  const agent = new HttpAgent({ host: HOST, identity });
  const actor = Actor.createActor(idlFactory, { agent, canisterId: CANISTER_ID });
  return actor;
}