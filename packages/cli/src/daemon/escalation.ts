import type { EscalationRule } from "@argus/core";

export interface EscalationEvent {
  contractId: string;
  trigger: string;
  message: string;
}

export class EscalationDispatcher {
  async dispatch(rule: EscalationRule, event: EscalationEvent): Promise<void> {
    switch (rule.channel) {
      case "slack":
        await this.dispatchSlack(rule.contact, event);
        break;
      case "email":
        this.dispatchEmail(rule.contact, event);
        break;
      case "github":
        await this.dispatchGitHub(rule.contact, event);
        break;
    }
  }

  private async dispatchSlack(webhookUrl: string, event: EscalationEvent): Promise<void> {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: `*Argus escalation* — contract \`${event.contractId}\`\nTrigger: ${event.trigger}\n${event.message}`,
      }),
    });
  }

  private dispatchEmail(contact: string, event: EscalationEvent): void {
    // Stub: log the escalation. Wire up SMTP/SES in production.
    console.warn(
      `[argus escalation] email → ${contact} | contract: ${event.contractId} | trigger: ${event.trigger} | ${event.message}`,
    );
  }

  private async dispatchGitHub(repo: string, event: EscalationEvent): Promise<void> {
    const proc = Bun.spawn(
      [
        "gh",
        "issue",
        "create",
        "--repo",
        repo,
        "--title",
        `[Argus] Escalation: ${event.trigger} on ${event.contractId}`,
        "--body",
        `**Contract:** ${event.contractId}\n**Trigger:** ${event.trigger}\n\n${event.message}`,
        "--label",
        "escalation",
      ],
      { stdin: "pipe", stdout: "pipe", stderr: "pipe" },
    );
    await proc.exited;
  }
}
