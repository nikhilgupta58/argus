import Anthropic from "@anthropic-ai/sdk";
import type { Specialist, SpecialistContext, SpecialistOutput, SpecialistError } from "../../types.js";
import type { Result } from "@argus/core";

const anthropic = new Anthropic();

async function readStream(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  const total = chunks.reduce((acc, c) => acc + c.length, 0);
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.length;
  }
  return new TextDecoder().decode(merged);
}

async function ghSpawn(args: string[]): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  const proc = Bun.spawn(["gh", ...args], {
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });
  const exitCode = await proc.exited;
  const stdout = await readStream(proc.stdout as ReadableStream<Uint8Array>);
  const stderr = await readStream(proc.stderr as ReadableStream<Uint8Array>);
  return { ok: exitCode === 0, stdout, stderr };
}

export const prReviewSpecialist: Specialist = {
  name: "pr-review",
  version: "1.0.0",
  contractKinds: ["pr-review"],

  async execute(ctx: SpecialistContext): Promise<Result<SpecialistOutput, SpecialistError>> {
    const meta = ctx.contract.metadata ?? {};
    const repo = String(meta["repo"] ?? "").trim();
    const prNumberStr = String(meta["pr_number"] ?? "").trim();
    const rubric = String(
      meta["rubric"] ?? "Review for code quality, security, and test coverage"
    ).trim();

    if (!repo || !prNumberStr) {
      return {
        ok: false,
        error: {
          code: "EXECUTION_ERROR",
          message: "Missing repo or pr_number in contract metadata",
        },
      };
    }

    const prNumber = parseInt(prNumberStr, 10);
    if (isNaN(prNumber)) {
      return {
        ok: false,
        error: { code: "EXECUTION_ERROR", message: `Invalid pr_number: ${prNumberStr}` },
      };
    }

    const prResult = await ghSpawn([
      "pr",
      "view",
      String(prNumber),
      "--repo",
      repo,
      "--json",
      "title,body,additions,deletions,files",
    ]);

    if (!prResult.ok) {
      return {
        ok: false,
        error: { code: "EXECUTION_ERROR", message: `gh pr view failed: ${prResult.stderr}` },
      };
    }

    let prData: Record<string, unknown>;
    try {
      prData = JSON.parse(prResult.stdout);
    } catch {
      return {
        ok: false,
        error: { code: "EXECUTION_ERROR", message: "Failed to parse gh pr view output" },
      };
    }

    try {
      const response = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: `You are a code reviewer. Review this GitHub PR against the provided rubric.

Repo: ${repo}
PR #${prNumber}
Title: ${prData["title"]}
Description: ${prData["body"]}
Additions: ${prData["additions"]} lines, Deletions: ${prData["deletions"]} lines

Rubric:
${rubric}

Provide a structured review with: summary, issues found (if any), and a LGTM/NEEDS_CHANGES verdict.`,
          },
        ],
      });

      const review = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");

      const tokensUsed =
        (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0);

      // Post comment via gh CLI (best-effort)
      const commentBody = `<!-- argus-pr-review -->\n${review}`;
      await ghSpawn([
        "pr",
        "comment",
        String(prNumber),
        "--repo",
        repo,
        "--body",
        commentBody,
      ]);

      return {
        ok: true,
        value: {
          summary: `Reviewed PR #${prNumber} in ${repo}`,
          artifacts: { review, prNumber, repo, posted: true },
          tokensUsed,
        },
      };
    } catch (err: unknown) {
      return {
        ok: false,
        error: { code: "EXECUTION_ERROR", message: String(err) },
      };
    }
  },
};

export default prReviewSpecialist;
