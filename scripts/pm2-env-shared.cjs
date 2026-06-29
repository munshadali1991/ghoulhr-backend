const STORAGE_ENV_KEYS = [
  'AWS_REGION',
  'AWS_BUCKET_NAME',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_S3_SSE',
  'AWS_S3_SIGNED_URL_TTL_SECONDS',
  'STORAGE_MAX_FILE_BYTES',
];

function pickStorageEnv() {
  return Object.fromEntries(
    STORAGE_ENV_KEYS.filter((key) => process.env[key]).map((key) => [key, process.env[key]]),
  );
}

module.exports = {
  STORAGE_ENV_KEYS,
  pickStorageEnv,
};
