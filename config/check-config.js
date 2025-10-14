#!/usr/bin/env node

const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const applyUseAutumnKey = require('../api/utils/applyUseAutumnKey');

const yesNo = (value) => (value ? 'yes' : 'no');

const summarizeUseAutumn = () => {
  const status = applyUseAutumnKey();
  const mode = status.isProduction ? 'production' : 'sandbox';
  const source = status.active ? status.source || 'unknown' : 'missing';

  console.log('UseAutumn configuration');
  console.table([
    {
      mode,
      'sandbox key provided': yesNo(status.sandboxKeyPresent),
      'production key provided': yesNo(status.productionKeyPresent),
      'effective USEAUTUMN_KEY available': yesNo(status.active),
      'derived during this check': yesNo(status.derived),
      'USEAUTUMN_KEY source': source,
    },
  ]);

  if (!status.active) {
    console.warn(
      '\n⚠️  USEAUTUMN_KEY is not available. Confirm that the expected key is provided in your environment.',
    );
  } else if (status.derived) {
    console.log(
      `\n✅  USEAUTUMN_KEY resolved from the ${source} credentials while running this check.`,
    );
  } else if (source === 'explicit') {
    console.log('\nℹ️  Using the USEAUTUMN_KEY value that was already present in the environment.');
  } else {
    console.log(
      `\nℹ️  USEAUTUMN_KEY already matched the ${source} credential value before this check ran.`,
    );
  }
};

const summarizeUseAutumnEnv = () => {
  const variables = [
    'USEAUTUMN_API_BASE',
    'USEAUTUMN_PRODUCT_ID',
    'USEAUTUMN_TOKEN_CREDITS',
  ];

  const statuses = variables.map((variable) => {
    const value = process.env[variable];
    const hasValue = !(value == null || String(value).trim() === '');
    return {
      variable,
      hasValue,
    };
  });

  console.log('\nUseAutumn environment variables');
  console.table(
    statuses.map(({ variable, hasValue }) => ({
      variable,
      set: yesNo(hasValue),
    })),
  );

  const missing = statuses.filter(({ hasValue }) => !hasValue).map(({ variable }) => variable);

  if (missing.length > 0) {
    console.warn(
      `\n⚠️  The following UseAutumn environment variables are not set: ${missing.join(', ')}`,
    );
  } else {
    console.log('\n✅  All UseAutumn environment variables are set.');
  }
};

summarizeUseAutumn();
summarizeUseAutumnEnv();
