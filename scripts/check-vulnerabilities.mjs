import { readFileSync } from 'node:fs';

const files = process.argv.slice(2);
if (!files.length) {
  console.error('Usage: node scripts/check-vulnerabilities.mjs REPORT.json [...]');
  process.exit(1);
}

let blocked = 0;
let advisory = 0;
try {
  for (const file of files) {
    const report = JSON.parse(readFileSync(file, 'utf8'));
    if (report.SchemaVersion !== 2 || !Array.isArray(report.Results)) {
      throw new Error(`Invalid or incomplete Trivy report: ${file}`);
    }
    for (const result of report.Results) {
      if (!result || typeof result !== 'object' || Array.isArray(result)
        || (Object.hasOwn(result, 'Vulnerabilities') && !Array.isArray(result.Vulnerabilities))) {
        throw new Error(`Malformed Trivy result in ${file}`);
      }
      for (const finding of result.Vulnerabilities || []) {
        if (!finding || typeof finding !== 'object' || Array.isArray(finding)
          || !['UNKNOWN', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(finding.Severity)
          || typeof finding.VulnerabilityID !== 'string' || !finding.VulnerabilityID.trim()
          || typeof finding.PkgName !== 'string' || !finding.PkgName.trim()
          || (Object.hasOwn(finding, 'FixedVersion') && typeof finding.FixedVersion !== 'string')) {
          throw new Error(`Malformed Trivy vulnerability in ${file}`);
        }
        const blocks = finding.Severity === 'CRITICAL'
          || (finding.Severity === 'HIGH' && Boolean(finding.FixedVersion?.trim()));
        if (blocks) {
          blocked++;
          console.error(JSON.stringify({
            report: file, severity: finding.Severity, id: finding.VulnerabilityID,
            package: finding.PkgName, installed: finding.InstalledVersion,
            fix: finding.FixedVersion || 'No fix published yet',
          }));
        } else if (finding.Severity === 'HIGH') {
          advisory++;
        }
      }
    }
  }
  console.log(`Vulnerability policy: ${blocked} blocking findings; ${advisory} unfixed HIGH findings for review.`);
  if (blocked) process.exitCode = 1;
} catch (error) {
  console.error(`Vulnerability check failed: ${error.message}`);
  process.exitCode = 1;
}
