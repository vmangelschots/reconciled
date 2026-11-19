export const TOKEN_PLACEHOLDER = "<your token>";

/** An MCP client configuration for this instance, in the `mcpServers` shape
 * Claude Code (.mcp.json), Claude Desktop and Cursor read. */
export function clientSnippet(url, token) {
  const config = {
    mcpServers: {
      reconciled: {
        type: "http",
        url,
        headers: { Authorization: `Bearer ${token || TOKEN_PLACEHOLDER}` },
      },
    },
  };
  return JSON.stringify(config, null, 2);
}

const relative = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
const shortDate = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" });

/** "Never used", "Used just now", "Used 5 minutes ago", "Used yesterday"… */
export function lastUsed(iso, now = new Date()) {
  if (!iso) return "Never used";
  const seconds = Math.round((new Date(iso) - now) / 1000);
  if (seconds > -60) return "Used just now";
  const steps = [
    [60, "minute"],
    [24, "hour"],
    [30, "day"],
    [12, "month"],
    [Infinity, "year"],
  ];
  let value = seconds / 60;
  for (const [size, unit] of steps) {
    if (Math.abs(value) < size) return `Used ${relative.format(Math.round(value), unit)}`;
    value /= size;
  }
  return "Used a while ago";
}

export function created(iso) {
  return `Created ${shortDate.format(new Date(iso))}`;
}
