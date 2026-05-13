// Reads SpecialistContext from stdin, calls specialist.execute(), writes Result to stdout
const [, , entrypoint] = process.argv;

async function main(): Promise<void> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin as AsyncIterable<Buffer>) {
    chunks.push(chunk);
  }
  const ctx = JSON.parse(Buffer.concat(chunks).toString("utf-8"));

  const mod = await import(entrypoint);
  if (!mod.default || typeof mod.default.execute !== "function") {
    process.stdout.write(
      JSON.stringify({ ok: false, error: { code: "SANDBOX_ERROR", message: "Specialist has no default export with execute()" } })
    );
    process.exit(1);
  }

  const result = await mod.default.execute(ctx);
  process.stdout.write(JSON.stringify(result));
}

main().catch((err: unknown) => {
  process.stdout.write(
    JSON.stringify({ ok: false, error: { code: "SANDBOX_ERROR", message: String(err) } })
  );
  process.exit(1);
});
