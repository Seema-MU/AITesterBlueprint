/**
 * Launcher for the Jira MCP server.
 *
 * Loads JIRA_* variables from .commandcode/skills/testPlan_gen/.env (which is
 * gitignored, so the API token never lands in a committed config file) and maps
 * them to the ATLASSIAN_* variables expected by
 * @aashari/mcp-server-atlassian-jira.
 */
const fs = require("fs");
const path = require("path");

const ENV_FILE = path.join(
  __dirname,
  "..",
  ".commandcode",
  "skills",
  "testPlan_gen",
  ".env"
);

try {
  const content = fs.readFileSync(ENV_FILE, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (key in process.env) continue;
    process.env[key] = value;
  }
} catch (err) {
  console.error(`[jira-mcp] Could not read ${ENV_FILE}: ${err.message}`);
}

const site = (process.env.JIRA_BASE_URL || "")
  .replace(/^https?:\/\//, "")
  .replace(/\/.*$/, "")
  .replace(/\.atlassian\.net$/, "");
process.env.ATLASSIAN_SITE_NAME = process.env.ATLASSIAN_SITE_NAME || site;
process.env.ATLASSIAN_USER_EMAIL =
  process.env.ATLASSIAN_USER_EMAIL || process.env.JIRA_EMAIL;
process.env.ATLASSIAN_API_TOKEN =
  process.env.ATLASSIAN_API_TOKEN || process.env.JIRA_TOKEN;

if (!process.env.ATLASSIAN_API_TOKEN) {
  console.error(
    "[jira-mcp] WARNING: JIRA_TOKEN not found in " + ENV_FILE
  );
}

require("@aashari/mcp-server-atlassian-jira");
