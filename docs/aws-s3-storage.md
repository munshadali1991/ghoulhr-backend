# AWS S3 storage — production checklist

GhoulHR stores uploaded files in a **private** S3 bucket using category-based keys under `organizations/{organizationId}/`.

## Bucket configuration

1. **Block all public access** — ON for the bucket and account.
2. **Default encryption** — enable SSE-S3 (`AES256`) or SSE-KMS on the bucket.
3. **No public ACLs** — objects are never world-readable; downloads use authenticated API + short-lived signed URLs.
4. **Optional lifecycle rule** — delete `organizations/*/staging/` objects after 7 days to clean orphaned wizard uploads.
5. **Optional versioning** — enable if you need overwrite recovery (increases storage cost).

## IAM policy (minimum)

Scope the application IAM user/role to the tenant prefix only:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject", "s3:CopyObject"],
      "Resource": "arn:aws:s3:::YOUR_BUCKET_NAME/organizations/*"
    }
  ]
}
```

Prefer **IAM roles** (EC2/ECS/Lambda) over long-lived access keys in production.

## Application environment

```env
AWS_REGION=ap-southeast-2
AWS_BUCKET_NAME=your-bucket
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_S3_SSE=AES256
AWS_S3_SIGNED_URL_TTL_SECONDS=900
STORAGE_MAX_FILE_BYTES=5242880
```

**Rotate access keys** if they were ever committed to git or shared in chat.

### Local PM2 development

After changing `.env` (including AWS variables), rebuild and reload PM2 so every Nest app receives updated env:

```bash
npm run build
npm run pm2:sync:orgs
```

`pm2:sync:orgs` runs `startOrReload ... --update-env`. A plain `pm2 restart` without `--update-env` may leave stale AWS settings and cause **"File storage is not configured"** on upload.

On startup, check logs for `AWS S3 configured: bucket=...` (success) or `Missing: AWS_BUCKET_NAME, ...` (fix `.env` and reload again).

See also [`.env.example`](../.env.example) for the full variable list.

## Key layout

```
organizations/{orgId}/employee-documents/onboarding/{employeeId}/{documentType}/{uuid}_{file}
organizations/{orgId}/employee-documents/leave/{employeeId}/{leaveRequestId}/{uuid}_{file}
organizations/{orgId}/employee-documents/profile-photos/{employeeId}/{uuid}.{ext}
organizations/{orgId}/organization-files/branding/logo/{uuid}_{file}
organizations/{orgId}/staging/{uploadBatchId}/{uuid}_{file}
```

All modules must use `S3StorageService.buildObjectKey()` — do not construct paths manually in controllers.

## Bulk purge (organization-scoped)

- **`GET /storage/assets/summary`** — count objects under `organizations/{orgId}/` (requires `settings.organization:write`).
- **`DELETE /storage/assets`** — body `{ "confirm": "DELETE ALL ASSETS" }` deletes every S3 object for the tenant and clears DB storage references (document `storageKey`, profile photos, org logo). Does **not** delete legacy `inline_base64` blobs in PostgreSQL.

UI: Organization Settings → Profile tab → **Delete all cloud assets** (danger zone).

## Legacy inline documents

Rows with `storageDriver = inline_base64` and `payloadEnc` remain readable via the download API decrypt path. New uploads use `storageDriver = s3` and `storageKey` only.
