# Simple Notes

A small full-stack example: vanilla HTML/CSS/JavaScript, Express on Node.js, and PostgreSQL. Three runtime dependencies, no frontend build step, and one backend process serving both the UI and API.

```text
Browser → Node.js → PostgreSQL
             ↓
       AWS Secrets Manager
       (credentials at startup)
```

## Run locally without AWS

Install Node.js 22+ and Docker Desktop, and start Docker Desktop. In PowerShell:

```powershell
cd E:\Practises\project-instance
Copy-Item .env.local.example .env
docker compose up -d --wait
npm install
npm run check
npm test
npm start
```

If `.env` already contains your AWS setup, save it before copying the local example. Docker Compose and Node both read `.env`; `LOCAL_DB_PASSWORD` supplies the same password to both. An existing `LOCAL_DB_PASSWORD` shell variable overrides the file, so ensure it matches or remove that variable first.

Open **http://127.0.0.1:3000**. Add a note, then reload the page. Check **http://127.0.0.1:3000/api/health** for `{"status":"ok","database":"connected"}`. Stop Node with Ctrl+C and PostgreSQL with `docker compose stop db`.

For Git Bash, use `cd /e/Practises/project-instance` and `cp .env.local.example .env`; the remaining commands are identical.

The included password is for local development only. If the database volume already exists, use its original password in `.env`; the container does not reset existing passwords.

When deploying, use `.env.example` as your template with `SECRETS_MODE=aws`, configure the AWS secret described below, and restart the app. Omitting `SECRETS_MODE` also defaults to AWS; AWS failures never fall back to local credentials.

## Requirements for AWS mode

- Node.js 22 or newer with npm
- PostgreSQL (existing local/RDS database, or Docker Compose for the included local database)
- AWS account and credentials with access to a Secrets Manager secret
- AWS CLI for local authentication, or an IAM role when running on AWS

## 1. Prepare the database

For the included local PostgreSQL container, choose a password and run in PowerShell:

```powershell
cd E:\Practises\project-instance
$env:LOCAL_DB_PASSWORD = Read-Host 'Local PostgreSQL password'
docker compose up -d --wait
```

In Bash:

```bash
cd /e/Practises/project-instance
read -rs -p 'Local PostgreSQL password: ' LOCAL_DB_PASSWORD
echo
export LOCAL_DB_PASSWORD
docker compose up -d --wait
```

PostgreSQL persists data in the `notes_data` Docker volume. The password initializes a new volume only; changing the variable later does not change an existing database password. For an existing PostgreSQL server, create a database and user instead; the app needs permission to connect and create/use the `notes` table in the default schema.

## 2. Create your AWS secret

In AWS Secrets Manager, create an **Other type of secret** in your chosen region, named `project-instance/database`. Use these key/value pairs (or the equivalent JSON). Replace the password with the database password you actually chose:

```json
{
  "host": "127.0.0.1",
  "port": 5432,
  "username": "notes_app",
  "password": "REPLACE_WITH_YOUR_DATABASE_PASSWORD",
  "dbname": "notes"
}
```

For RDS, use the RDS hostname and matching credentials/database. `host` must be reachable from the backend. Secrets Manager stores credentials; it does not create the database or configure networking. Creating a secret may incur AWS charges.

The backend uses the AWS SDK default credential chain. For local development, configure your AWS CLI profile (for example `aws configure sso`, followed by `aws sso login --profile your-profile`) and set `AWS_PROFILE=your-profile` in `.env`. On EC2/ECS, attach an appropriate IAM role instead of embedding access keys.

The application's AWS identity needs this policy, with the actual secret ARN substituted:

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": "secretsmanager:GetSecretValue",
    "Resource": "arn:aws:secretsmanager:ap-south-1:123456789012:secret:project-instance/database-ABC123"
  }]
}
```

For a customer-managed KMS encryption key, also grant `kms:Decrypt` on that key and ensure its key policy permits access.

## 3. Configure and run

PowerShell:

```powershell
Copy-Item .env.example .env
# Edit .env: set AWS_REGION, DB_SECRET_ID and optionally AWS_PROFILE.
npm install
npm run check
npm test
npm start
```

Bash:

```bash
cp .env.example .env
# Edit .env: set AWS_REGION, DB_SECRET_ID and optionally AWS_PROFILE.
bash sample.sh
```

Open **http://127.0.0.1:3000**. Write a note, save it, and refresh to verify persistence. Startup fetches the secret, connects to PostgreSQL, and creates the table before accepting requests. There is no fallback to hardcoded database credentials.

For RDS with TLS, set `DB_SSL=true`. If needed, set `DB_SSL_CA_FILE` to your trusted RDS CA bundle path. Certificate verification remains enabled. The included local database uses `DB_SSL=false`.

## API

| Method | Path | Behavior |
| --- | --- | --- |
| GET | `/api/health` | Checks the database connection |
| GET | `/api/notes` | Returns the latest 100 notes |
| POST | `/api/notes` | Saves JSON such as `{"body":"Hello"}` (1–500 characters) |

Queries use SQL parameters, notes render as text, and credentials stay in backend memory. The secret is fetched once at startup; restart the app after credential rotation. This is a local learning project with shared notes and no user authentication. It binds to loopback by default; add authentication and deployment protections before exposing it publicly.

## Checks and troubleshooting

`npm run check` checks JavaScript syntax. `npm test` checks secret-field mapping and validation without AWS access. Full integration requires real AWS access and a running PostgreSQL database.

- Startup failure: check the region, secret ID, AWS login/role, IAM permissions, secret fields, and database connectivity. Errors intentionally omit secret values.
- RDS timeout: check VPC routing and security groups from the backend host.
- Database authentication failure: the secret must match the actual PostgreSQL password.
- Port in use: change `PORT` in `.env`.
- Stop the app with Ctrl+C. Stop the local database with `docker compose stop db`.

AWS reference: [GetSecretValue with JavaScript SDK v3](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/javascript_secrets-manager_code_examples.html) and [default credential chain](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/setting-credentials-node.html).
