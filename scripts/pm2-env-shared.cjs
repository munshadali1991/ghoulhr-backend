const STORAGE_ENV_KEYS = [
  'AWS_REGION',
  'AWS_BUCKET_NAME',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_S3_SSE',
  'AWS_S3_SIGNED_URL_TTL_SECONDS',
  'STORAGE_MAX_FILE_BYTES',
];

const EMAIL_ENV_KEYS = [
  'AWS_SES_SMTP_ENDPOINT',
  'AWS_SES_SMTP_PORT',
  'AWS_SES_SMTP_USERNAME',
  'AWS_SES_SMTP_PASSWORD',
  'AWS_SES_FROM_EMAIL',
  'AWS_SES_FROM_NAME',
];

function pickStorageEnv() {
  return Object.fromEntries(
    STORAGE_ENV_KEYS.filter((key) => process.env[key]).map((key) => [key, process.env[key]]),
  );
}

function pickEmailEnv() {
  return Object.fromEntries(
    EMAIL_ENV_KEYS.filter((key) => process.env[key]).map((key) => [key, process.env[key]]),
  );
}

module.exports = {
  STORAGE_ENV_KEYS,
  EMAIL_ENV_KEYS,
  pickStorageEnv,
  pickEmailEnv,
};
