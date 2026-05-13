"""Build Argus PRD — Hermes killer."""

from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib.colors import HexColor, white, black
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle,
    KeepTogether, HRFlowable
)
from reportlab.pdfgen import canvas

OUTPUT = "/sessions/blissful-friendly-mayer/mnt/outputs/Argus_PRD.pdf"

# --- Brand palette ---
INK = HexColor("#0B0F19")
GRAPHITE = HexColor("#1F2430")
SLATE = HexColor("#4B5563")
MUTED = HexColor("#6B7280")
RULE = HexColor("#E5E7EB")
BG_SOFT = HexColor("#F7F8FA")
ACCENT = HexColor("#D97706")    # amber — "eye"
ACCENT_DARK = HexColor("#92400E")
SUCCESS = HexColor("#065F46")
DANGER = HexColor("#991B1B")

# --- Page chrome ---
def on_page(canv: canvas.Canvas, doc):
    canv.saveState()
    # Footer rule
    canv.setStrokeColor(RULE)
    canv.setLineWidth(0.5)
    canv.line(0.75 * inch, 0.6 * inch, LETTER[0] - 0.75 * inch, 0.6 * inch)
    # Footer text
    canv.setFont("Helvetica", 8)
    canv.setFillColor(MUTED)
    canv.drawString(0.75 * inch, 0.42 * inch, "Argus — PRD v0.1  •  Confidential draft")
    canv.drawRightString(LETTER[0] - 0.75 * inch, 0.42 * inch, f"Page {doc.page}")
    canv.restoreState()


def on_cover(canv: canvas.Canvas, doc):
    """Cover page: dark, minimal."""
    canv.saveState()
    # Full bleed dark
    canv.setFillColor(INK)
    canv.rect(0, 0, LETTER[0], LETTER[1], stroke=0, fill=1)

    # Accent eye glyph (concentric circles)
    cx, cy = LETTER[0] / 2, LETTER[1] - 2.6 * inch
    canv.setStrokeColor(ACCENT)
    canv.setLineWidth(1.2)
    canv.circle(cx, cy, 0.55 * inch, stroke=1, fill=0)
    canv.setFillColor(ACCENT)
    canv.circle(cx, cy, 0.18 * inch, stroke=0, fill=1)
    canv.setFillColor(INK)
    canv.circle(cx, cy, 0.06 * inch, stroke=0, fill=1)

    # Wordmark
    canv.setFillColor(white)
    canv.setFont("Helvetica-Bold", 44)
    canv.drawCentredString(cx, cy - 1.3 * inch, "ARGUS")

    canv.setFillColor(ACCENT)
    canv.setFont("Helvetica", 11)
    canv.drawCentredString(cx, cy - 1.65 * inch, "THE AGENT THAT WATCHES, OWNS, AND DELIVERS")

    # Subtitle
    canv.setFillColor(HexColor("#9CA3AF"))
    canv.setFont("Helvetica", 12)
    canv.drawCentredString(cx, cy - 2.4 * inch, "Product Requirements Document")
    canv.setFont("Helvetica", 10)
    canv.drawCentredString(cx, cy - 2.65 * inch, "v0.1  •  May 2026")

    # Bottom meta block
    canv.setFillColor(HexColor("#9CA3AF"))
    canv.setFont("Helvetica", 9)
    canv.drawString(0.9 * inch, 1.4 * inch, "AUTHOR")
    canv.drawString(0.9 * inch, 1.0 * inch, "STATUS")
    canv.drawString(LETTER[0] / 2, 1.4 * inch, "TARGET LAUNCH")
    canv.drawString(LETTER[0] / 2, 1.0 * inch, "POSITIONING")

    canv.setFillColor(white)
    canv.setFont("Helvetica-Bold", 10)
    canv.drawString(0.9 * inch, 1.22 * inch, "Nikhil Kumar Gupta")
    canv.drawString(0.9 * inch, 0.82 * inch, "Draft for review")
    canv.drawString(LETTER[0] / 2, 1.22 * inch, "Private beta — Q4 2026")
    canv.drawString(LETTER[0] / 2, 0.82 * inch, "Hermes killer")

    canv.restoreState()


# --- Styles ---
styles = getSampleStyleSheet()

H1 = ParagraphStyle(
    "H1", parent=styles["Heading1"],
    fontName="Helvetica-Bold", fontSize=22, leading=27,
    textColor=INK, spaceBefore=4, spaceAfter=6,
)
H2 = ParagraphStyle(
    "H2", parent=styles["Heading2"],
    fontName="Helvetica-Bold", fontSize=14, leading=18,
    textColor=INK, spaceBefore=14, spaceAfter=6,
)
H3 = ParagraphStyle(
    "H3", parent=styles["Heading3"],
    fontName="Helvetica-Bold", fontSize=11, leading=15,
    textColor=ACCENT_DARK, spaceBefore=10, spaceAfter=2,
)
Body = ParagraphStyle(
    "Body", parent=styles["BodyText"],
    fontName="Helvetica", fontSize=10.5, leading=15.5,
    textColor=GRAPHITE, alignment=TA_JUSTIFY, spaceAfter=8,
)
BodyLeft = ParagraphStyle(
    "BodyLeft", parent=Body, alignment=TA_LEFT,
)
Eyebrow = ParagraphStyle(
    "Eyebrow", parent=styles["BodyText"],
    fontName="Helvetica-Bold", fontSize=8.5, leading=11,
    textColor=ACCENT_DARK, spaceAfter=4,
)
Small = ParagraphStyle(
    "Small", parent=styles["BodyText"],
    fontName="Helvetica", fontSize=9, leading=13,
    textColor=SLATE, spaceAfter=4,
)
Quote = ParagraphStyle(
    "Quote", parent=styles["BodyText"],
    fontName="Helvetica-Oblique", fontSize=11, leading=16,
    textColor=GRAPHITE, leftIndent=14, rightIndent=14,
    borderPadding=8, spaceBefore=4, spaceAfter=10,
)
Bullet = ParagraphStyle(
    "Bullet", parent=Body, alignment=TA_LEFT,
    leftIndent=14, bulletIndent=2, spaceAfter=4,
)


def section_header(label, title):
    """Eyebrow + big title block."""
    return [
        Paragraph(label, Eyebrow),
        Paragraph(title, H1),
        HRFlowable(width="100%", thickness=0.5, color=RULE, spaceAfter=10),
    ]


def kv_table(rows, col_widths=(1.6 * inch, 4.8 * inch)):
    t = Table(rows, colWidths=col_widths, hAlign="LEFT")
    t.setStyle(TableStyle([
        ("FONT", (0, 0), (0, -1), "Helvetica-Bold", 9),
        ("FONT", (1, 0), (1, -1), "Helvetica", 10),
        ("TEXTCOLOR", (0, 0), (0, -1), MUTED),
        ("TEXTCOLOR", (1, 0), (1, -1), INK),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("LINEBELOW", (0, 0), (-1, -2), 0.4, RULE),
    ]))
    return t


def comparison_table():
    data = [
        ["Dimension", "OpenClaw", "Hermes Agent", "Argus"],
        ["Core thesis", "Ecosystem breadth", "Self-improvement", "Outcome ownership"],
        ["Learning unit", "Per-skill (manual)", "Per-user (closed loop)", "Federated, cross-user"],
        ["Initiative", "Reactive", "Reactive", "Proactive (event-driven)"],
        ["Pricing model", "Open source / seats", "Tokens", "Outcome SLA"],
        ["Trust model", "Community signals", "Implicit (drift risk)", "Signed actions + content-addressed skills"],
        ["Failure mode", "Supply-chain malware", "Silent regression", "Reversion via signed lineage"],
        ["Best for", "Tinkerers, indie devs", "Power users, solo operators", "Teams + regulated work"],
    ]
    t = Table(data, colWidths=[1.3*inch, 1.5*inch, 1.5*inch, 2.1*inch], hAlign="LEFT")
    t.setStyle(TableStyle([
        # Header
        ("BACKGROUND", (0, 0), (-1, 0), INK),
        ("TEXTCOLOR", (0, 0), (-1, 0), white),
        ("FONT", (0, 0), (-1, 0), "Helvetica-Bold", 9),
        # Body
        ("FONT", (0, 1), (-1, -1), "Helvetica", 8.5),
        ("TEXTCOLOR", (0, 1), (0, -1), MUTED),
        ("TEXTCOLOR", (1, 1), (-1, -1), GRAPHITE),
        # Highlight Argus column
        ("BACKGROUND", (3, 1), (3, -1), HexColor("#FFF7ED")),
        ("FONT", (3, 1), (3, -1), "Helvetica-Bold", 8.5),
        ("TEXTCOLOR", (3, 1), (3, -1), ACCENT_DARK),
        # Lines
        ("LINEBELOW", (0, 0), (-1, 0), 0.6, INK),
        ("LINEBELOW", (0, 1), (-1, -2), 0.3, RULE),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
    ]))
    return t


def metric_card(label, value, sub):
    """A compact KPI card as a single-cell table."""
    inner = Table(
        [[Paragraph(label, Eyebrow)],
         [Paragraph(value, ParagraphStyle("V", fontName="Helvetica-Bold", fontSize=20, leading=24, textColor=INK))],
         [Paragraph(sub, Small)]],
        colWidths=[1.95 * inch],
    )
    inner.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), BG_SOFT),
        ("BOX", (0, 0), (-1, -1), 0.5, RULE),
        ("LEFTPADDING", (0, 0), (-1, -1), 12),
        ("RIGHTPADDING", (0, 0), (-1, -1), 12),
        ("TOPPADDING", (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
    ]))
    return inner


def metrics_row():
    t = Table(
        [[metric_card("NORTH STAR", "$ARR/agent", "Revenue produced per active agent / month"),
          metric_card("ACTIVATION", "T-72h", "Time to first owned outcome"),
          metric_card("TRUST", ">99.9%", "Signed actions w/ valid provenance")]],
        colWidths=[2.15*inch, 2.15*inch, 2.15*inch],
    )
    t.setStyle(TableStyle([
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    return t


def feature_block(title, desc):
    """Two-cell row: title + description."""
    t = Table(
        [[Paragraph(title, ParagraphStyle("FT", fontName="Helvetica-Bold", fontSize=10.5, leading=14, textColor=INK)),
          Paragraph(desc, BodyLeft)]],
        colWidths=[1.6 * inch, 4.8 * inch],
    )
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LINEABOVE", (0, 0), (-1, 0), 0.4, RULE),
        ("TOPPADDING", (0, 0), (-1, -1), 9),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 9),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
    ]))
    return t


def risks_table():
    data = [
        ["Risk", "Likelihood", "Impact", "Mitigation"],
        ["Federated learning leaks private data via skill graphs",
         "Medium", "Critical",
         "Differential privacy on skill embeddings; opt-in contribution; red-team budget at every release"],
        ["Outcome-SLA pricing under-prices long-tail workflows",
         "High", "Medium",
         "Hybrid: outcome floor + seat ceiling; offer downgrade to seat-only after 90 days"],
        ["Enterprise procurement cycle stalls Q4 launch",
         "High", "High",
         "Design-partner program (5 customers, no procurement) running in parallel; SOC 2 Type I by GA"],
        ["Hermes ships federated learning in response",
         "Medium", "High",
         "Lead on outcome ownership + verifiability; published lineage spec creates standards moat"],
        ["Skill-marketplace malware repeats OpenClaw failure",
         "Medium", "Critical",
         "Content-addressed only; no string-name resolution; signed publisher identities; sandbox by default"],
    ]
    t = Table(data, colWidths=[1.7*inch, 0.9*inch, 0.7*inch, 3.1*inch], hAlign="LEFT")
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), INK),
        ("TEXTCOLOR", (0, 0), (-1, 0), white),
        ("FONT", (0, 0), (-1, 0), "Helvetica-Bold", 9),
        ("FONT", (0, 1), (-1, -1), "Helvetica", 8.5),
        ("TEXTCOLOR", (0, 1), (-1, -1), GRAPHITE),
        ("BACKGROUND", (1, 1), (2, -1), BG_SOFT),
        ("LINEBELOW", (0, 0), (-1, -2), 0.3, RULE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ("LEFTPADDING", (0, 0), (-1, -1), 7),
        ("RIGHTPADDING", (0, 0), (-1, -1), 7),
    ]))
    return t


def roadmap_table():
    data = [
        ["Phase", "Window", "Goal", "Exit criteria"],
        ["P0 — Foundations", "Jun–Aug 2026",
         "Outcome contract spec + signed-action runtime",
         "10 contracts executed end-to-end with full lineage"],
        ["P1 — Design partners", "Sep–Nov 2026",
         "5 paying design partners, 3 verticals",
         "$50K MRR, NPS > 40, < 1 critical security incident"],
        ["P2 — Federated v1", "Dec 2026 – Feb 2027",
         "Skill graphs trained across opt-in users",
         "20% reduction in time-to-first-outcome vs. cold start"],
        ["P3 — General availability", "Mar 2027",
         "Self-serve onboarding + SOC 2 Type II",
         "100 paying customers, $250K MRR, churn < 3%"],
    ]
    t = Table(data, colWidths=[1.3*inch, 1.1*inch, 2.0*inch, 2.0*inch], hAlign="LEFT")
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), INK),
        ("TEXTCOLOR", (0, 0), (-1, 0), white),
        ("FONT", (0, 0), (-1, 0), "Helvetica-Bold", 9),
        ("FONT", (0, 1), (-1, -1), "Helvetica", 8.5),
        ("FONT", (0, 1), (0, -1), "Helvetica-Bold", 9),
        ("TEXTCOLOR", (0, 1), (0, -1), ACCENT_DARK),
        ("TEXTCOLOR", (1, 1), (-1, -1), GRAPHITE),
        ("LINEBELOW", (0, 0), (-1, -2), 0.3, RULE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
    ]))
    return t


# --- Story ---
story = []

# (Cover handled by onFirstPage; just push a page break.)
story.append(PageBreak())

# ============================================================
# Section 1 — Executive Summary
# ============================================================
story += section_header("01 / EXECUTIVE SUMMARY", "The next paradigm is outcomes, not tasks.")

story.append(Paragraph(
    "Argus is an autonomous agent network that owns business outcomes end-to-end. "
    "Unlike Hermes Agent, which learns inside a single user&#8217;s closed loop, Argus "
    "composes specialist agents that learn across users via federated skill graphs, "
    "act on their own initiative, and prove every action via cryptographic lineage. "
    "It is positioned for teams and regulated work — the segment Hermes structurally cannot serve.",
    Body
))

story.append(Paragraph(
    "The bet: the unit of value in AI agents shifts from <i>tokens generated</i> to "
    "<i>outcomes delivered</i>. Argus prices on that unit. The first agent to make "
    "outcome-SLA pricing default wins the category.",
    Body
))

story.append(Spacer(1, 6))
story.append(metrics_row())

# ============================================================
# Section 2 — Thesis re-analysis (backing the thesis)
# ============================================================
story.append(PageBreak())
story += section_header("02 / THESIS", "Why now, and why this shape.")

story.append(Paragraph("The disruption pattern", H2))
story.append(Paragraph(
    "Each market-leading agent has won on a new axis, not by beating the prior leader on its own terms. "
    "Cursor reframed AI from chat to in-the-IDE (proximity). OpenClaw reframed it from tool to ecosystem "
    "(breadth). Hermes reframed it from executor to learner (depth). The next leader will not learn faster — "
    "it will <b>act on its own</b>, <b>learn from everyone</b>, and <b>prove what it did</b>.",
    Body
))

story.append(Paragraph("What Hermes structurally cannot solve", H2))
story.append(Paragraph(
    "Hermes&#8217; closed per-user loop is its identity. It cannot become federated without abandoning the "
    "privacy story that sold the architecture. It cannot become proactive without breaking its session "
    "contract. It cannot become verifiable without giving up the silent self-rewriting that defines &ldquo;the "
    "agent that grows with you.&rdquo; Each of these is a one-way door for Hermes. That asymmetry is the "
    "opening.",
    Body
))

story.append(Paragraph("Market timing", H2))
story.append(Paragraph(
    "Three conditions just lined up. <b>(1) Inference economics:</b> Haiku-class and GPT-5-mini-class models "
    "make always-on agents viable at SaaS unit economics. <b>(2) Buyer fatigue:</b> the OpenClaw CVE wave "
    "(9 CVEs in 4 days, March 2026) and the ClawHub 12% malware audit have created enterprise demand for a "
    "verifiable alternative. <b>(3) Standards:</b> MCP has matured to where outcome contracts can be expressed "
    "portably across tools, removing the lock-in objection.",
    Body
))

story.append(Paragraph("Competitive landscape", H2))
story.append(comparison_table())

# ============================================================
# Section 3 — Problem & users
# ============================================================
story.append(PageBreak())
story += section_header("03 / PROBLEM & USERS", "Who hurts, and how much.")

story.append(Paragraph("Problem statement", H2))
story.append(Paragraph(
    "Operators (founders, agency owners, solo PMs, RevOps leads) buy AI agents to free up calendar time "
    "and ship outcomes, but every current agent — including Hermes — operates at the task layer. The user "
    "still owns the goal, the orchestration, the recovery from failure, and the audit trail. The agent "
    "saves minutes, not weeks. For regulated buyers the gap is worse: they cannot deploy a self-modifying "
    "agent into a SOX, HIPAA, or PCI environment because no current agent can prove what it did or why.",
    Body
))

story.append(Paragraph("Primary persona — &ldquo;Maya, the operator&rdquo;", H3))
story.append(Paragraph(
    "Solo or small-team operator running 3–5 workflows weekly (outreach, content, reporting, lead qualification). "
    "Tool-rich, time-poor. Currently stitching Hermes + 6 MCPs + a Notion doc. Will pay $500–$2,000/mo for an "
    "agent that <i>owns a number</i> instead of helping with steps.",
    BodyLeft
))

story.append(Paragraph("Secondary persona — &ldquo;Rahul, the head of RevOps&rdquo;", H3))
story.append(Paragraph(
    "Mid-market RevOps lead at a 50–500-person SaaS. Needs to deploy agents into a regulated stack with "
    "audit, RBAC, and rollback. Has rejected OpenClaw post-CVE and refuses to deploy Hermes because security "
    "cannot certify a self-modifying runtime. Buyer for the enterprise tier.",
    BodyLeft
))

# ============================================================
# Section 4 — Vision + product principles
# ============================================================
story.append(PageBreak())
story += section_header("04 / VISION", "An agent shaped like an employee, not a tool.")

story.append(Paragraph(
    "&ldquo;Argus is the hundred-eyed watcher of myth — the agent that never sleeps, learns from every eye, "
    "and signs every glance.&rdquo; Operationally: you hand Argus an outcome and a budget, and it reports "
    "back when the outcome lands or when it genuinely needs you. You stop opening the app. You start "
    "reviewing weekly summaries.",
    Quote
))

story.append(Paragraph("Product principles", H2))
for title, desc in [
    ("Outcomes &gt; tasks",
     "Every contract is expressed as a measurable outcome with success criteria, budget, and "
     "deadline. Tasks are an implementation detail Argus owns."),
    ("Proactive by default",
     "Argus initiates. Notifications go from agent to user, not the other way around. The default UI "
     "is the inbox digest, not a chat window."),
    ("Federated, never centralized",
     "Skill graphs train across opt-in users via differential privacy on embeddings. No raw data leaves "
     "the user&#8217;s tenant."),
    ("Signed or it didn&#8217;t happen",
     "Every action Argus takes is cryptographically signed and content-addressed. Replay, diff, and "
     "revert are first-class."),
    ("Composable specialists",
     "Argus is a fleet of small specialist agents — outreach, reporting, code-review, finance-recon — "
     "that compose at runtime. No monolithic &ldquo;Argus model.&rdquo;"),
]:
    story.append(feature_block(title, desc))

# ============================================================
# Section 5 — Key features
# ============================================================
story.append(PageBreak())
story += section_header("05 / KEY FEATURES", "What ships in v1.")

for title, desc in [
    ("Outcome Contracts",
     "Declarative spec for what Argus must deliver: success metric, deadline, budget, escalation policy. "
     "Renders as a one-page artifact the user signs. The contract is the source of truth — agents read it, "
     "not chat history."),
    ("Specialist Fleet",
     "Pre-trained micro-agents per outcome family: Outbound, Inbound Qualification, Weekly Reporting, "
     "Code Review, Reconciliation, Content Repurposing. Each agent has a public skill graph; new ones can "
     "be forked and published."),
    ("Federated Skill Graph",
     "Cross-user pattern learning over differentially-private skill embeddings. Result: a brand-new Argus "
     "deployment ships with the equivalent of a 6-month-experienced operator on day one."),
    ("Lineage Ledger",
     "Append-only signed log of every action Argus takes — every tool call, every model invocation, every "
     "decision branch. Inspectable, diff-able, revertable. The audit story for regulated buyers."),
    ("Initiative Engine",
     "Event-driven runtime that triggers agents on calendar, inbox, repo, and CRM changes. The user is "
     "interrupted only when the contract explicitly requires human input."),
    ("Outcome-SLA Pricing",
     "Default plan is $X per delivered outcome with a monthly floor. Customers see exactly what they paid "
     "for — and refunds are automatic when Argus fails to meet the SLA."),
]:
    story.append(feature_block(title, desc))

# ============================================================
# Section 6 — Architecture (high level)
# ============================================================
story.append(PageBreak())
story += section_header("06 / ARCHITECTURE", "Four layers, one contract.")

arch = [
    ("Contract Layer",
     "Outcome spec, success criteria, budget, escalation rules. Source of truth. Stored per-tenant; "
     "versioned with semantic diff."),
    ("Fleet Layer",
     "Pool of specialist agents. Each agent is a content-addressed bundle (model + tool list + skill graph + "
     "policy). Composed at runtime against the contract."),
    ("Lineage Layer",
     "Signed, append-only event log of every action. Ed25519 signing keys per tenant. Public verification "
     "endpoint. Lineage is the artifact auditors consume."),
    ("Federation Layer",
     "Off-tenant differential-privacy training over skill embeddings (not raw events). Privacy budget "
     "tracked per user. Opt-in only; opt-out is one toggle and removes the user&#8217;s past contributions."),
]
for title, desc in arch:
    story.append(feature_block(title, desc))

# ============================================================
# Section 7 — Metrics
# ============================================================
story.append(Spacer(1, 16))
story.append(Paragraph("Success metrics", H2))
story.append(kv_table([
    ["North Star", "$ARR generated per active agent per month"],
    ["Activation", "Time to first delivered outcome &lt; 72 hours from signup"],
    ["Retention", "&gt; 95% logo retention at 90 days, &gt; 85% at 12 months"],
    ["Trust", "&gt; 99.9% of actions land in the lineage ledger with valid signatures; zero post-mortem-grade trust incidents in first 12 months"],
    ["Federation lift", "&gt; 20% reduction in time-to-first-outcome for new users with federation opted in vs. cold start"],
    ["Outcome SLA", "&gt; 92% of contracts meet stated success criteria within deadline"],
]))

# ============================================================
# Section 8 — Risks
# ============================================================
story.append(PageBreak())
story += section_header("07 / RISKS & MITIGATIONS", "What can kill this.")
story.append(risks_table())

# ============================================================
# Section 9 — GTM
# ============================================================
story.append(Spacer(1, 18))
story.append(Paragraph("Go-to-market", H2))
story.append(Paragraph(
    "Three concentric circles. <b>Inner:</b> 5 design partners across RevOps, agency, and fintech-back-office — "
    "hand-onboarded, contract-priced, used as case studies. <b>Middle:</b> a public skill marketplace where "
    "operators can fork specialist agents (this is the OpenClaw playbook, executed with content-addressed "
    "trust from day one). <b>Outer:</b> developer mindshare via an open lineage spec — make it the "
    "&ldquo;OpenTelemetry of agent actions&rdquo; so anyone can verify any agent, not just Argus.",
    Body
))
story.append(Paragraph(
    "Distribution wedge: regulated verticals where Hermes is structurally unsellable. Finance ops, healthcare "
    "intake, legal review, SOX testing. Argus enters where Hermes is banned and expands sideways from there.",
    Body
))

# ============================================================
# Section 10 — Roadmap
# ============================================================
story.append(Spacer(1, 14))
story.append(Paragraph("Roadmap", H2))
story.append(roadmap_table())

# ============================================================
# Section 11 — Closing
# ============================================================
story.append(Spacer(1, 22))
story.append(HRFlowable(width="100%", thickness=0.5, color=RULE, spaceAfter=10))
story.append(Paragraph(
    "<i>In the myth, Hermes lulled Argus&#8217; hundred eyes to sleep and killed him. This time, "
    "Argus stays awake.</i>",
    ParagraphStyle("Closer", parent=Body, alignment=TA_CENTER, textColor=MUTED, fontSize=10)
))


# --- Build ---
doc = SimpleDocTemplate(
    OUTPUT,
    pagesize=LETTER,
    leftMargin=0.75 * inch, rightMargin=0.75 * inch,
    topMargin=0.75 * inch, bottomMargin=0.85 * inch,
    title="Argus — PRD v0.1",
    author="Nikhil Kumar Gupta",
    subject="Hermes killer — Product Requirements Document",
)

doc.build(story, onFirstPage=on_cover, onLaterPages=on_page)
print(f"Wrote {OUTPUT}")
