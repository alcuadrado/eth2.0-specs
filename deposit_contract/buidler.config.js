const { task, usePlugin, types } = require("@nomiclabs/buidler/config");
const { readArtifact } = require("@nomiclabs/buidler/plugins");
const path = require("path");
const fsExtra = require("fs-extra");

usePlugin("@nomiclabs/buidler-vyper");
usePlugin("@nomiclabs/buidler-truffle5");

// Set the paths to where the ABI and bytecode should be copied.
// If left blank, they won't be copied.
const ABI_PATH = "";
const BYTECODE_PATH = "";

const ARG_TO_CONSTANT = {
  minDepositAmount: "MIN_DEPOSIT_AMOUNT",
  depositContractTreeDepth: "DEPOSIT_CONTRACT_TREE_DEPTH",
  pubkeyLength: "PUBKEY_LENGTH",
  withdrawalCredentialsLength: "WITHDRAWAL_CREDENTIALS_LENGTH",
  signatureLength: "SIGNATURE_LENGTH",
  maxDepositCount: "MAX_DEPOSIT_COUNT",
  amountLength: "AMOUNT_LENGTH"
};

task("compile").setAction(async (_, { config }, runSuper) => {
  await runSuper();

  const artifact = await readArtifact(
    config.paths.artifacts,
    "validator_registration"
  );

  if (ABI_PATH) {
    await fsExtra.ensureDir(path.dirname(ABI_PATH));
    await fsExtra.writeJSON(ABI_PATH, artifact.abi);
  }

  if (BYTECODE_PATH) {
    await fsExtra.ensureDir(path.dirname(BYTECODE_PATH));
    await fsExtra.writeFile(BYTECODE_PATH, artifact.bytecode, "utf8");
  }
});

function addReplacementParameters(taskDefinition) {
  return taskDefinition
    .addParam(
      "minDepositAmount",
      "The value of the constant MIN_DEPOSIT_AMOUNT",
      "1000000000"
    )
    .addParam(
      "depositContractTreeDepth",
      "The value of the constant DEPOSIT_CONTRACT_TREE_DEPTH",
      "32"
    )
    .addParam("pubkeyLength", "The value of the constant PUBKEY_LENGTH", "48")
    .addParam(
      "withdrawalCredentialsLength",
      "The value of the constant WITHDRAWAL_CREDENTIALS_LENGTH",
      "32"
    )
    .addParam(
      "signatureLength",
      "The value of the constant SIGNATURE_LENGTH",
      "96"
    )
    .addParam(
      "maxDepositCount",
      "The value of the constant MAX_DEPOSIT_COUNT (default: 2**DEPOSIT_CONTRACT_TREE_DEPTH - 1)",
      undefined,
      types.string,
      true
    )
    .addParam("amountLength", "The value of the constant AMOUNT_LENGTH", "8");
}

function taskWithReplacementParameters(name, description) {
  return addReplacementParameters(task(name, description));
}

taskWithReplacementParameters(
  "replace-constants",
  "Replaces the constants of the validator_registration contract"
).setAction(async (args, { web3, config }) => {
  const BN = web3.utils.BN;
  if (args.maxDepositCount === undefined) {
    const maxDepositCount = new BN(2)
      .pow(new BN(args.depositContractTreeDepth))
      .sub(new BN(1));

    args.maxDepositCount = maxDepositCount.toString();
  }

  const contractPath = path.join(
    config.paths.sources,
    "validator_registration.v.py"
  );

  let sourceCode = await fsExtra.readFile(contractPath, "utf8");

  for (const [arg, constant] of Object.entries(ARG_TO_CONSTANT)) {
    sourceCode = replaceConstant(sourceCode, constant, args[arg]);
  }

  await fsExtra.writeFile(contractPath, sourceCode, "utf8");
});

taskWithReplacementParameters(
  "replace-and-compile",
  "Replaces the constants of the validator_registration and compiles the contracts"
).setAction(async (args, { run }) => {
  await run("replace-constants", args);
  await run("compile");
});

taskWithReplacementParameters(
  "deploy",
  "Replaces the constants of the validator_registration, compiles and deploys it"
).setAction(async (args, { run, artifacts }) => {
  await run("replace-and-compile", args);

  const ValidatorRegistration = artifacts.require("validator_registration");

  validatorRegistration = await ValidatorRegistration.new();
  console.log("Contract deployed to", validatorRegistration.address);
});

function replaceConstant(code, constant, value) {
  const regexp = new RegExp(
    "^(" + constant + ".*?=\\s*)(\\S+?)([#\\s].*)$",
    "m"
  );

  return code.replace(
    regexp,
    (_, biginning, __, ending) => biginning + value + ending
  );
}

module.exports = {};
