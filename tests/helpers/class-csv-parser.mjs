// Independent RFC 4180 field-state reader used only by tests, including multiline quoted fields.
export function parseClassCsv(text) {
  const rows = []; let row = [], field = "", quoted = false, closed = false;
  const input = text.replace(/^\uFEFF/u, "");
  for (let i = 0; i < input.length; i++) {
    const character = input[i];
    if (quoted) {
      if (character === '"' && input[i + 1] === '"') { field += '"'; i++; }
      else if (character === '"') { quoted = false; closed = true; }
      else field += character;
    } else if (character === '"' && field === "" && !closed) quoted = true;
    else if (character === ",") { row.push(field); field = ""; closed = false; }
    else if (character === "\r" && input[i + 1] === "\n") { row.push(field); rows.push(row); row = []; field = ""; closed = false; i++; }
    else if (closed || character === "\r" || character === "\n") throw new Error("Malformed CSV field");
    else field += character;
  }
  if (quoted) throw new Error("Unclosed CSV quote");
  if (row.length || field || closed) { row.push(field); rows.push(row); }
  const [header, ...data] = rows;
  if (!header || data.some((values) => values.length !== header.length)) throw new Error("Malformed CSV row");
  return { header, rows: data.map((values) => Object.fromEntries(header.map((key, index) => [key, values[index]]))) };
}
