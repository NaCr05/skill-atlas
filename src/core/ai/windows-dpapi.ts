import { spawn } from "node:child_process";

import { SkillAtlasError } from "@/core/errors/skill-atlas-error";

const MAX_OUTPUT_BYTES = 32 * 1024;
const TRANSFORM_TIMEOUT_MS = 20_000;

const PROTECT_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security
[Console]::InputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$value = [Console]::In.ReadToEnd()
$bytes = [System.Text.Encoding]::UTF8.GetBytes($value)
$protected = [System.Security.Cryptography.ProtectedData]::Protect(
  $bytes,
  $null,
  [System.Security.Cryptography.DataProtectionScope]::CurrentUser
)
[Console]::Out.Write([Convert]::ToBase64String($protected))
`;

const UNPROTECT_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security
[Console]::InputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$value = [Console]::In.ReadToEnd().Trim()
$protected = [Convert]::FromBase64String($value)
$bytes = [System.Security.Cryptography.ProtectedData]::Unprotect(
  $protected,
  $null,
  [System.Security.Cryptography.DataProtectionScope]::CurrentUser
)
[Console]::Out.Write([System.Text.Encoding]::UTF8.GetString($bytes))
`;

function transformSecret(script: string, input: string): Promise<string> {
  if (process.platform !== "win32") {
    throw new SkillAtlasError("AI_SETTINGS_ENCRYPTION_FAILED");
  }

  return new Promise((resolve, reject) => {
    const child = spawn(
      "powershell.exe",
      [
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-EncodedCommand",
        Buffer.from(script, "utf16le").toString("base64"),
      ],
      { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] },
    );
    const stdout: Buffer[] = [];
    let stdoutBytes = 0;
    let settled = false;

    function fail(): void {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(new SkillAtlasError("AI_SETTINGS_ENCRYPTION_FAILED"));
    }

    const timeout = setTimeout(() => {
      child.kill();
      fail();
    }, TRANSFORM_TIMEOUT_MS);

    child.stdout.on("data", (chunk: Buffer) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes > MAX_OUTPUT_BYTES) {
        child.kill();
        fail();
        return;
      }
      stdout.push(chunk);
    });
    child.stderr.resume();
    child.on("error", fail);
    child.on("close", (code) => {
      if (settled) return;
      if (code !== 0) {
        fail();
        return;
      }
      const output = Buffer.concat(stdout).toString("utf8").trim();
      if (!output) {
        fail();
        return;
      }
      settled = true;
      clearTimeout(timeout);
      resolve(output);
    });
    child.stdin.on("error", fail);
    child.stdin.end(input, "utf8");
  });
}

export function protectSecret(secret: string): Promise<string> {
  return transformSecret(PROTECT_SCRIPT, secret);
}

export function unprotectSecret(ciphertext: string): Promise<string> {
  return transformSecret(UNPROTECT_SCRIPT, ciphertext);
}
