/* eslint-disable no-console */
/**
 * Send a real test email via AWS SES SMTP using .env and compiled templates.
 *
 * Usage:
 *   npm run build
 *   npm run test:email
 *   npm run test:email -- tempmail.10110@gmail.com
 *   npm run test:email -- you@example.com employee-created
 *   npm run test:email -- --to=you@example.com --template=leave-applied
 *   npm run test:email -- --list
 */
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const nodemailer = require('nodemailer');

const ROOT = path.resolve(__dirname, '..');
const DIST_TEMPLATES = path.join(
  ROOT,
  'dist',
  'src',
  'modules',
  'email',
  'templates',
);
const DEFAULT_TO = 'tempmail.10110@gmail.com';
const DEFAULT_TEMPLATE = 'employee-created';

const TEMPLATE_KEYS = [
  'employee-created',
  'leave-applied',
  'leave-approved',
  'timesheet-approved',
  'account-activated',
];

dotenv.config({ path: path.join(ROOT, '.env') });

function parseArgs(argv) {
  const positional = [];
  let to = process.env.SES_TEST_TO?.trim() || DEFAULT_TO;
  let template = DEFAULT_TEMPLATE;
  let listOnly = false;

  for (const arg of argv) {
    if (arg === '--list') {
      listOnly = true;
      continue;
    }
    if (arg.startsWith('--to=')) {
      to = arg.slice('--to='.length).trim();
      continue;
    }
    if (arg.startsWith('--template=')) {
      template = arg.slice('--template='.length).trim();
      continue;
    }
    if (arg.startsWith('--')) {
      console.warn(`Unknown flag: ${arg}`);
      continue;
    }
    positional.push(arg);
  }

  if (positional[0]) {
    to = positional[0];
  }
  if (positional[1]) {
    template = positional[1];
  }

  return { to: to.toLowerCase(), template, listOnly };
}

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing ${name} in .env`);
  }
  return value;
}

function buildLoginUrl(subdomain) {
  const appDomain = process.env.APP_DOMAIN || 'ghoulhr.com';
  const host = subdomain?.trim()
    ? `${subdomain.trim()}.${appDomain}`
    : appDomain;
  return `https://${host}/login`;
}

function loadTemplateRenderers() {
  const probe = path.join(DIST_TEMPLATES, 'employee-created.template.js');
  if (!fs.existsSync(probe)) {
    throw new Error(
      `Compiled templates not found at ${DIST_TEMPLATES}. Run "npm run build" first.`,
    );
  }

  return {
    'employee-created': require(path.join(
      DIST_TEMPLATES,
      'employee-created.template.js',
    )).renderEmployeeCreatedEmail,
    'leave-applied': require(path.join(
      DIST_TEMPLATES,
      'leave-applied.template.js',
    )).renderLeaveAppliedEmail,
    'leave-approved': require(path.join(
      DIST_TEMPLATES,
      'leave-approved.template.js',
    )).renderLeaveApprovedEmail,
    'timesheet-approved': require(path.join(
      DIST_TEMPLATES,
      'timesheet-approved.template.js',
    )).renderTimesheetApprovedEmail,
    'account-activated': require(path.join(
      DIST_TEMPLATES,
      'account-activated.template.js',
    )).renderAccountActivatedEmail,
  };
}

function buildSampleContext(templateKey) {
  const organizationName = 'Test Org';
  const subdomain = 'demo';
  const loginUrl = buildLoginUrl(subdomain);

  switch (templateKey) {
    case 'employee-created':
      return {
        employeeName: 'Jane Doe',
        organizationName,
        email: 'jane@example.com',
        temporaryPassword: 'TempPass123!',
        loginUrl,
        departmentName: 'Engineering',
        designationName: 'Software Developer',
      };
    case 'leave-applied':
      return {
        approverName: 'John Manager',
        applicantName: 'Jane Doe',
        leaveType: 'Annual Leave',
        startDate: '15 Jul 2026',
        endDate: '18 Jul 2026',
        reason: 'Family trip (test email)',
      };
    case 'leave-approved':
      return {
        recipientName: 'Jane Doe',
        leaveType: 'Annual Leave',
        startDate: '15 Jul 2026',
        endDate: '18 Jul 2026',
        notes: 'Enjoy your time off! (test email)',
      };
    case 'timesheet-approved':
      return {
        employeeName: 'Jane Doe',
        approverName: 'John Manager',
        entries: [
          { workDate: '28 Jun 2026', totalHours: 8 },
          { workDate: '29 Jun 2026', totalHours: 7.5 },
        ],
      };
    case 'account-activated':
      return {
        employeeName: 'Jane Doe',
        organizationName,
        loginUrl,
      };
    default:
      throw new Error(`Unknown template: ${templateKey}`);
  }
}

function createTransport() {
  const host = requireEnv('AWS_SES_SMTP_ENDPOINT');
  const port = Number(process.env.AWS_SES_SMTP_PORT || 587);
  const username = requireEnv('AWS_SES_SMTP_USERNAME');
  const password = requireEnv('AWS_SES_SMTP_PASSWORD');

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user: username, pass: password },
  });
}

function buildFromAddress() {
  const fromEmail = requireEnv('AWS_SES_FROM_EMAIL');
  const fromName = process.env.AWS_SES_FROM_NAME?.trim() || 'GhoulHR';
  return fromName ? `"${fromName}" <${fromEmail}>` : fromEmail;
}

function printSandboxHint(error) {
  const message = error instanceof Error ? error.message : String(error);
  if (
    message.includes('554') ||
    message.toLowerCase().includes('not verified')
  ) {
    console.error('');
    console.error(
      'Hint: SES sandbox only allows sending to verified recipient addresses.',
    );
    console.error(
      'Verify the recipient in AWS SES (ap-southeast-2) or request production access.',
    );
  }
}

async function sendOne(transport, from, to, templateKey, renderers) {
  const render = renderers[templateKey];
  if (!render) {
    throw new Error(`Unknown template "${templateKey}". Use --list for options.`);
  }

  const rendered = render(buildSampleContext(templateKey));

  await transport.sendMail({
    from,
    to,
    subject: `[TEST] ${rendered.subject}`,
    text: rendered.text,
    html: rendered.html,
  });

  console.log(`Sent template="${templateKey}" to=${to} subject="${rendered.subject}"`);
}

async function main() {
  const { to, template, listOnly } = parseArgs(process.argv.slice(2));

  if (listOnly) {
    console.log('Available templates:');
    for (const key of TEMPLATE_KEYS) {
      console.log(`  - ${key}`);
    }
    console.log('  - all  (send every template above)');
    return;
  }

  const renderers = loadTemplateRenderers();
  const transport = createTransport();
  const from = buildFromAddress();

  console.log(`From: ${from}`);
  console.log(`To:   ${to}`);
  console.log('');

  const templatesToSend =
    template === 'all' ? TEMPLATE_KEYS : [template];

  for (const key of templatesToSend) {
    try {
      await sendOne(transport, from, to, key, renderers);
    } catch (error) {
      printSandboxHint(error);
      throw error;
    }
  }

  console.log('');
  console.log('Done.');
}

main().catch((error) => {
  console.error(`Failed: ${error.message}`);
  process.exit(1);
});
