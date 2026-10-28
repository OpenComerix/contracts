import assert from 'node:assert/strict';

export const pnpmJobs = Object.freeze([
  'validate:contract-architecture', 'validate:catalog-contracts', 'validate:identity-catalog-contracts',
  'validate:catalog-asyncapi', 'validate:inventory-contracts', 'validate:finance-contracts',
  'validate:sales-contracts', 'validate:sale-flow-integration',
]);
export const cacheWriter = 'validate:catalog-contracts';
export const ciTests = 'node --test --test-reporter=tap test/ci/*.test.mjs';
const lint = 'npx --yes @redocly/cli@2.53.3 lint ';
const noWarnings = 'node scripts/validate-redocly-no-warnings.mjs';
const lintGroups = [
  ['validate:openapi', [
    'openapi/identity-onboarding-v1.yaml', 'openapi/identity-onboarding-v2.yaml',
    'openapi/identity-internal-auth-v1.yaml', 'openapi/identity-gateway-delegation-v1.yaml',
    'openapi/identity-gateway-delegation-v2.yaml',
  ]],
  ['validate:catalog-contracts', [
    'identity/http/private/v1/identity-catalog-authority-v1.yaml catalog/http/public/v1/catalog-pricing-v1.yaml catalog/http/private/v1/catalog-pricing-internal-v1.yaml',
    'catalog/http/private/v1/catalog-history-protection-v1.yaml',
    'identity/http/private/v1/identity-catalog-recovery-authority-v1.yaml',
    'catalog/http/private/v1/catalog-history-recovery-v1.yaml',
    'identity/http/private/v2/identity-catalog-recovery-verification-v2.yaml',
  ]],
  ['validate:identity-catalog-contracts', [
    'identity/http/private/v1/identity-catalog-history-permissions-v1.yaml',
    'identity/http/private/v2/identity-catalog-recovery-renewal-v2.yaml',
  ]],
];
export const removedChecks = Object.freeze([
  ...lintGroups.flatMap(([job, groups]) => groups.map(group => {
    const coverage = group.split(' ').map(file => noWarnings +
      (file === 'openapi/identity-onboarding-v1.yaml' ? '' : ' ' + file));
    return { job, command: lint + group, following: coverage[0], coverageJob: job, coverage };
  })),
  { job: 'validate:catalog-asyncapi', command: 'node --test --test-reporter=tap test/catalog/asyncapi-v1.test.mjs',
    following: 'node scripts/catalog/validate-asyncapi-v1.mjs .ci-artifacts/catalog-asyncapi-v1',
    coverageJob: 'validate:catalog-contracts', coverage: ['node --test test/catalog/*.test.mjs'] },
  { job: 'validate:inventory-contracts', command: 'node --test --test-reporter=tap test/identity/inventory-authority-v1-1.test.mjs',
    following: 'node scripts/identity/run-inventory-authority-v1-1.mjs openapi',
    coverageJob: 'validate:identity-catalog-contracts', coverage: ['node --test test/identity/*.test.mjs'] },
]);
const oldInstall = '    - pnpm install --frozen-lockfile --ignore-scripts';
const newInstall = '    - pnpm config set store-dir .pnpm-store\n' + oldInstall + ' --prefer-offline';
const mkdir = '    - mkdir -p .npm-cache/_cacache .npm-cache/_npx\n';
const cacheBlocks = `.contracts:npm-cache:
  variables:
    CONTRACTS_CACHE_POLICY: pull
    NPM_CONFIG_CACHE: $CI_PROJECT_DIR/.npm-cache
  cache: &contracts-npm-cache
    key: node24.21.0-redocly2.53.3-bookworm-v1
    paths:
      - .npm-cache/_cacache/
      - .npm-cache/_npx/
    policy: $CONTRACTS_CACHE_POLICY

.contracts:pnpm-cache:
  extends: .contracts:npm-cache
  variables:
    COREPACK_HOME: $CI_PROJECT_DIR/.corepack-cache
  cache:
    - *contracts-npm-cache
    - key:
        prefix: node24.21.0-pnpm12.4.2-bookworm-v1
        files:
          - pnpm-lock.yaml
      paths:
        - .pnpm-store/
        - .corepack-cache/
      policy: $CONTRACTS_CACHE_POLICY

`;
const replaceOne = (text, from, to) => {
  assert.equal(text.split(from).length, 2, 'CI2_EXACT_ANCHOR:' + from.split('\n')[0]);
  return text.replace(from, to);
};
const jobBlock = (text, name, edit) => {
  const start = text.indexOf('\n' + name + ':\n');
  assert(start >= 0, 'CI2_JOB:' + name);
  const rest = text.slice(start + 1), next = rest.slice(name.length + 2).search(/^\S/m);
  const end = next < 0 ? text.length : start + 1 + name.length + 2 + next;
  return text.slice(0, start + 1) + edit(text.slice(start + 1, end)) + text.slice(end);
};

// Closed delivery delta: caches, CI regression tests and repeated checks whose
// stricter lint or identical test file remains in an existing job.
export function prepareToolingCI(text) {
  assert(!text.includes('.contracts:npm-cache:'), 'CI2_ALREADY_PREPARED');
  text = replaceOne(text, 'validate:contract-references:\n', cacheBlocks + 'validate:contract-references:\n');
  text = replaceOne(text, 'validate:openapi:\n', 'validate:openapi:\n  extends: .contracts:npm-cache\n');
  for (const job of pnpmJobs) text = jobBlock(text, job, block => {
    block = replaceOne(block, job + ':\n', job + ':\n  extends: .contracts:pnpm-cache\n');
    block = replaceOne(block, oldInstall, newInstall);
    if (job === cacheWriter) {
      block = replaceOne(block, '  variables:\n', '  variables:\n    CONTRACTS_CACHE_POLICY: pull-push\n');
      block = replaceOne(block, '    - corepack enable\n', mkdir + '    - corepack enable\n');
    }
    return block;
  });
  for (const check of removedChecks) text = jobBlock(text, check.job, block =>
    replaceOne(block, '    - ' + check.command + '\n    - ' + check.following,
      '    - ' + check.following));
  text = replaceOne(text, '    - pnpm test:architecture\n',
    '    - pnpm test:architecture\n    - ' + ciTests + '\n');
  return text;
}

// Exact inverse for the earlier capture proof, with a full round-trip check.
// Unknown edits still reach the immutable historical gate and are rejected.
export function withoutToolingCI(text) {
  const current = text;
  text = replaceOne(text, '    - pnpm test:architecture\n    - ' + ciTests + '\n',
    '    - pnpm test:architecture\n');
  for (const check of removedChecks) text = jobBlock(text, check.job, block =>
    replaceOne(block, '    - ' + check.following + '\n',
      '    - ' + check.command + '\n    - ' + check.following + '\n'));
  text = replaceOne(text, cacheBlocks, '');
  text = replaceOne(text, 'validate:openapi:\n  extends: .contracts:npm-cache\n', 'validate:openapi:\n');
  for (const job of pnpmJobs) text = jobBlock(text, job, block => {
    block = replaceOne(block, job + ':\n  extends: .contracts:pnpm-cache\n', job + ':\n');
    block = replaceOne(block, newInstall, oldInstall);
    if (job === cacheWriter) {
      block = replaceOne(block, '  variables:\n    CONTRACTS_CACHE_POLICY: pull-push\n', '  variables:\n');
      block = replaceOne(block, mkdir, '');
    }
    return block;
  });
  assert.equal(prepareToolingCI(text), current, 'CI2_ROUNDTRIP');
  return text;
}
