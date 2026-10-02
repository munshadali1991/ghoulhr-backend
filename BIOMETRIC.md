# Biometric attendance (ZKTeco / eSSL ADMS)

Wall-mounted devices push attendance over HTTP to GhoulHR using the ADMS (Automatic Data Master Server) protocol. Fingerprint/face templates **never** leave the device — only integer PINs and event timestamps are stored.

## Prerequisites

1. Tenant has the **Attendance** module entitled.
2. Org timezone is set (`Settings → Organization`) and devices use **NTP** so clocks match the org.
3. Employees have shifts and branch/location assigned (needed for Smart Shift IN/OUT).

## Device cloud URL

Configure the device Cloud Server / ADMS URL to this **tenant** host (subdomain or org port), not the apex domain:

```text
http(s)://{tenant-subdomain}.{your-domain}/iclock/cdata
```

Examples:

- `https://acme.ghoulhr.com/iclock/cdata`
- `http://host:ORG_PORT/iclock/cdata` (local / locked port deployments)

Firmware may also poll:

- `GET /iclock/getrequest` → `OK` (command push not enabled in V1)
- `POST /iclock/devicecmd` → `OK`

## Register the device before go-live

1. Open **Settings → Biometric → Devices**.
2. Add the device **serial number** (SN) shown on the hardware / network page.
3. Set status to **ACTIVE**. Optional: set a Comm Key if the device sends one.
4. Assign a branch location for reporting.

Unregistered or inactive serials receive **HTTP 403** and punches are not stored. Register SN **before** enabling push on the device so offline buffers are not dropped unexpectedly.

## Employee enrollment

1. In **Settings → Biometric → ID mapping**, assign a positive integer **Biometric ID** (or accept the next auto ID).
2. On the wall device, create a user with that same numeric PIN and enroll finger/face/card **on the device only**.
3. Test a scan — it should appear under **Attendance → Live attendance** and in Employee Swipes (`source: BIOMETRIC`).

## Unmapped punches

If an unknown PIN scans, the server still returns `OK` (so the device clears its buffer) and queues the event under **Attendance → Unmapped punches**. Bind the PIN to an employee once; open historical rows for that PIN are converted retroactively.

## Punch direction & dedupe

Under **Settings → Attendance → Check-in**:

| Setting | Default | Meaning |
|--------|---------|---------|
| Punch direction | `smart_shift` | Infer IN/OUT from open session / shift; ignore device button |
| Punch direction | `strict` | Map device status codes (0/IN, 1/OUT) |
| Dedupe window | `120` seconds | Duplicate scans ACK’d but not stored twice |

Event time always comes from the **device payload**, never server arrival time (offline buffer safe).

## Security notes

- Prefer HTTPS in production.
- Keep devices on a managed network; optional Comm Key adds a shared secret check.
- Audit logs record device CRUD, biometric ID assignment, and unmapped resolution (`biometric_audit_logs`).

## Ops checklist

- [ ] NTP enabled on every device  
- [ ] Cloud URL uses tenant subdomain/port  
- [ ] Serial registered and ACTIVE  
- [ ] Biometric IDs mapped for all enrolled users  
- [ ] Smart Shift or Strict mode chosen  
- [ ] Live feed shows a test punch  
