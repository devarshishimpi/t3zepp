export function endpointUrl(value) {
  const match = /^https:\/\/([^/?#]+)(\/[^?#]*)?$/i.exec(String(value || "").trim());
  const authority = match?.[1];
  const authorityParts = authority && /^([^:]+)(?::(\d+))?$/.exec(authority);
  const hostname = authorityParts?.[1];
  const port = authorityParts?.[2];
  const pathname = match?.[2] || "/";
  const validHostname = hostname && hostname.length <= 253 && hostname.split(".").every((label) =>
    label.length > 0 && label.length <= 63 && /^[a-z\d](?:[a-z\d-]*[a-z\d])?$/i.test(label),
  );
  const validPort = !port || (Number(port) > 0 && Number(port) <= 65535);
  if (!validHostname || !validPort) {
    throw new Error("Set a valid HTTPS Worker URL in the Zepp app settings.");
  }
  if (pathname !== "/" && pathname.replace(/\/$/, "") !== "/v1/usage") {
    throw new Error("Use the Worker origin or its /v1/usage URL.");
  }
  return `https://${authority}/v1/usage`;
}
