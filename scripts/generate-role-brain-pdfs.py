import json
import os
import re
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate, Spacer


ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCE = os.path.join(ROOT, "content", "ai-brain", "role-packs.json")
OUTPUT = os.path.join(ROOT, "output", "pdf")

ROLE_LABELS = {
    "owner": "owner",
    "company_admin": "company admin",
    "admin": "admin",
    "region_admin": "region admin",
    "sales_admin": "sales admin",
    "kitchen_manager": "kitchen manager",
    "kitchen_staff": "kitchen staff",
    "shopping": "shopping",
    "shopping_staff": "shopping staff",
    "driver": "driver",
    "cleaning_manager": "cleaning manager",
    "cleaning_staff": "cleaning staff",
    "client": "client portal",
    "waiter": "waiter",
    "staff": "staff",
    "super_admin": "platform admin",
}

EXTRA_ROLE_CONTENT = {
    "waiter": "WAITER SERVICE GUIDE\n\nUse the waiter workflow for assigned service duties, event timing, guest-facing handoffs, table or service notes, and team notifications. Only rely on assignments for the signed-in waiter. Report service issues through the relevant operational screen. The assistant may summarize assigned work but must not expose payment, payroll, supplier, or unrelated client records.",
    "staff": "GENERAL STAFF OPERATING GUIDE\n\nUse the staff portal for the tasks and notifications assigned to the signed-in staff member. Confirm the relevant order, event, handoff, and timing before acting. Record exceptions in the relevant operational screen. The assistant may explain assigned work and navigate to the correct page but must not expose unrelated customer, payment, payroll, or supplier data.",
    "super_admin": "PLATFORM ADMIN GUIDE\n\nThe platform admin workspace manages companies, users, subscriptions, trials, tenant health, revenue, pricing, currency, technology costs, audit logs, and approved platform knowledge. A platform session has no company context; never claim tenant-specific records until a company is explicitly selected through an approved workflow. The assistant may explain platform pages and approved platform knowledge but remains read-focused.",
}


def expand_role_packs(grouped_packs):
    expanded = []
    for pack in grouped_packs:
        for role in pack["roles"]:
            label = ROLE_LABELS.get(role, role.replace("_", " "))
            content = f"{label.upper()} GUIDE\n\n{pack['content'].split(chr(10) + chr(10), 1)[1]}"
            expanded.append({"key": role, "name": f"CateringMS {label} operating guide", "roles": [role], "content": content})
    expanded.extend({"key": role, "name": f"CateringMS {ROLE_LABELS[role]} operating guide", "roles": [role], "content": content} for role, content in EXTRA_ROLE_CONTENT.items())
    return expanded


def safe_name(value):
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")


def draw_footer(canvas, doc):
    canvas.saveState()
    canvas.setStrokeColorRGB(0.82, 0.85, 0.9)
    canvas.line(18 * mm, 15 * mm, 192 * mm, 15 * mm)
    canvas.setFont("Helvetica", 8)
    canvas.setFillColorRGB(0.35, 0.4, 0.48)
    canvas.drawString(18 * mm, 10 * mm, "CateringMS - approved role knowledge pack")
    canvas.drawRightString(192 * mm, 10 * mm, f"Page {doc.page}")
    canvas.restoreState()


def create_pdf(pack):
    os.makedirs(OUTPUT, exist_ok=True)
    path = os.path.join(OUTPUT, f"cateringms-{safe_name(pack['key'])}-guide.pdf")
    doc = SimpleDocTemplate(
        path,
        pagesize=A4,
        rightMargin=18 * mm,
        leftMargin=18 * mm,
        topMargin=18 * mm,
        bottomMargin=22 * mm,
        title=pack["name"],
        author="CateringMS",
    )
    styles = getSampleStyleSheet()
    title = ParagraphStyle("PackTitle", parent=styles["Title"], fontName="Helvetica-Bold", fontSize=24, leading=29, textColor="#10243E", alignment=TA_LEFT, spaceAfter=8)
    subtitle = ParagraphStyle("PackSubtitle", parent=styles["Normal"], fontName="Helvetica", fontSize=10, leading=15, textColor="#526176", spaceAfter=20)
    heading = ParagraphStyle("SectionHeading", parent=styles["Heading2"], fontName="Helvetica-Bold", fontSize=13, leading=17, textColor="#146C94", spaceBefore=12, spaceAfter=6)
    body = ParagraphStyle("Body", parent=styles["BodyText"], fontName="Helvetica", fontSize=10.5, leading=16, textColor="#243247", spaceAfter=9)
    story = [
        Paragraph("CateringMS", title),
        Paragraph(pack["name"], subtitle),
        Paragraph("Approved knowledge pack for the role-aware assistant", heading),
        Paragraph("This guide is stable business guidance. Current orders, stock, assignments, payments, and notifications must always come from live authorized application data.", body),
    ]
    sections = pack["content"].split("\n\n")
    if sections:
        story.append(Paragraph(sections[0].strip().title(), heading))
    for section in sections[1:]:
        cleaned = section.strip()
        if cleaned:
            story.append(Paragraph(cleaned.replace("&", "&amp;"), body))
    story.append(Spacer(1, 14))
    story.append(Paragraph("Assistant boundary", heading))
    story.append(Paragraph("The assistant can answer and navigate. It does not change records, approve transactions, send messages, or expose data outside the signed-in role without a separately confirmed action flow.", body))
    doc.build(story, onFirstPage=draw_footer, onLaterPages=draw_footer)
    return path


with open(SOURCE, "r", encoding="utf-8") as stream:
    packs = expand_role_packs(json.load(stream))

os.makedirs(OUTPUT, exist_ok=True)
for old_name in (
    "cateringms-cleaning-guide.pdf", "cateringms-client-guide.pdf", "cateringms-driver-guide.pdf",
    "cateringms-kitchen-guide.pdf", "cateringms-owner-admin-guide.pdf", "cateringms-shopping-guide.pdf",
):
    old_path = os.path.join(OUTPUT, old_name)
    if os.path.exists(old_path):
        os.remove(old_path)

for role_pack in packs:
    print(create_pdf(role_pack))
