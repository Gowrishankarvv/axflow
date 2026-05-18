"""Renders the 3-page AXINOR offer letter PDF from structured content.

The visual design (purple→magenta corner ribbons, blue underlined section
headings, the salary block, the General Rules definition list and the
signature block) mirrors the approved Axinor template. Fonts fall back to the
bundled DejaVu Sans (it carries the ₹ glyph and is deployment-safe).
"""
from __future__ import annotations

import os
from io import BytesIO
from typing import Any

from reportlab.lib.colors import HexColor
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate,
    Flowable,
    Frame,
    ListFlowable,
    ListItem,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)
from reportlab.platypus.paragraph import ParagraphStyle

_ASSETS = os.path.join(os.path.dirname(__file__), "assets")
_LOGO = os.path.join(_ASSETS, "offer_letter_logo.png")

# Palette pulled from the reference design.
PURPLE = HexColor("#5B2A93")
MAGENTA = HexColor("#E61E79")
HEADING_BLUE = HexColor("#1B39D4")
BODY = HexColor("#3A3A3A")
RULE_PINK = HexColor("#EAB6CF")

_FONTS_READY = False


def _ensure_fonts() -> tuple[str, str]:
    """Register the bundled DejaVu faces once; fall back to Helvetica."""
    global _FONTS_READY
    reg, bold = "OL", "OL-Bold"
    if _FONTS_READY:
        return reg, bold
    try:
        pdfmetrics.registerFont(TTFont(reg, os.path.join(_ASSETS, "DejaVuSans.ttf")))
        pdfmetrics.registerFont(TTFont(bold, os.path.join(_ASSETS, "DejaVuSans-Bold.ttf")))
        _FONTS_READY = True
        return reg, bold
    except Exception:
        return "Helvetica", "Helvetica-Bold"


PAGE_W, PAGE_H = A4
L_MARGIN = 18 * mm
R_MARGIN = 18 * mm
TOP_MARGIN = 34 * mm   # clears the top ribbon / page-1 logo
BOT_MARGIN = 20 * mm   # clears the bottom ribbon


def _grad_polygon(c, pts, c1, c2):
    """Fill an arbitrary polygon with a left→right linear gradient."""
    xs = [p[0] for p in pts]
    c.saveState()
    path = c.beginPath()
    path.moveTo(*pts[0])
    for p in pts[1:]:
        path.lineTo(*p)
    path.close()
    c.clipPath(path, stroke=0, fill=0)
    c.linearGradient(min(xs), 0, max(xs), 0, [c1, c2], extend=True)
    c.restoreState()


def _draw_decor(c, doc):
    """Corner ribbons drawn on every page; logo only on page 1."""
    # Top-right slanted ribbon.
    _grad_polygon(
        c,
        [
            (PAGE_W * 0.42, PAGE_H),
            (PAGE_W, PAGE_H),
            (PAGE_W, PAGE_H - 24 * mm),
            (PAGE_W * 0.52, PAGE_H - 24 * mm),
        ],
        PURPLE,
        MAGENTA,
    )
    # Bottom ribbon — right on page 1, left thereafter (matches the template).
    if c.getPageNumber() == 1:
        _grad_polygon(
            c,
            [
                (PAGE_W * 0.55, 0),
                (PAGE_W, 0),
                (PAGE_W, 11 * mm),
                (PAGE_W * 0.62, 11 * mm),
            ],
            PURPLE,
            MAGENTA,
        )
        # Logo, top-left.
        try:
            ratio = 159.0 / 522.0
            lw = 46 * mm
            lh = lw * ratio
            c.drawImage(
                _LOGO, L_MARGIN, PAGE_H - 16 * mm - lh,
                width=lw, height=lh, mask="auto", preserveAspectRatio=True,
            )
        except Exception:
            pass
    else:
        _grad_polygon(
            c,
            [
                (0, 0),
                (PAGE_W * 0.45, 0),
                (PAGE_W * 0.38, 11 * mm),
                (0, 11 * mm),
            ],
            PURPLE,
            MAGENTA,
        )


class SectionHeading(Flowable):
    """Blue bold heading followed by a thin pink rule to the right margin,
    with a small dot just after the text (the underlined-title look)."""

    def __init__(self, text, bold_font, width, bullet=False):
        super().__init__()
        self.text = text
        self.bold_font = bold_font
        self._w = width
        self.bullet = bullet
        self.size = 14
        self.height = 22

    def wrap(self, aw, ah):
        self._w = aw
        return aw, self.height

    def draw(self):
        c = self.canv
        label = ("•  " + self.text) if self.bullet else self.text
        c.setFont(self.bold_font, self.size)
        c.setFillColor(HEADING_BLUE)
        c.drawString(0, 6, label)
        if not self.bullet:
            tw = c.stringWidth(label, self.bold_font, self.size)
            x0 = tw + 12
            c.setFillColor(RULE_PINK)
            c.circle(x0, 10, 2.2, stroke=0, fill=1)
            c.setStrokeColor(RULE_PINK)
            c.setLineWidth(1)
            c.line(x0 + 7, 10, self._w, 10)


def _styles():
    reg, bold = _ensure_fonts()
    body = ParagraphStyle(
        "body", fontName=reg, fontSize=10.5, leading=16,
        textColor=BODY, alignment=TA_LEFT, spaceAfter=4,
    )
    return reg, bold, body


def _para_block(text, style):
    """Multi-line text → stacked paragraphs (preserves the author's breaks)."""
    out = []
    for line in str(text or "").split("\n"):
        line = line.strip()
        out.append(Paragraph(line if line else "&nbsp;", style))
    return out


def _esc(s: Any) -> str:
    return (
        str(s or "")
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )


def build_offer_letter_pdf(content: dict) -> bytes:
    reg, bold, body = _styles()

    name_style = ParagraphStyle(
        "name", fontName=bold, fontSize=15, leading=20, textColor=HexColor("#111111"))
    addr_style = ParagraphStyle(
        "addr", fontName=reg, fontSize=11, leading=17, textColor=BODY)
    label_style = ParagraphStyle(
        "lbl", fontName=bold, fontSize=10.5, leading=15, textColor=HexColor("#1A1A1A"))
    value_style = ParagraphStyle(
        "val", fontName=reg, fontSize=10.5, leading=15, textColor=BODY)
    small_gray = ParagraphStyle(
        "sg", fontName=reg, fontSize=10.5, leading=16, textColor=HexColor("#6B6B6B"))
    bold_line = ParagraphStyle(
        "bl", fontName=bold, fontSize=10.5, leading=16, textColor=HexColor("#1A1A1A"))

    g = content.get
    avail_w = PAGE_W - L_MARGIN - R_MARGIN

    story: list = []

    def heading(t, bullet=False):
        story.append(SectionHeading(t, bold, avail_w, bullet=bullet))
        story.append(Spacer(1, 6))

    # ---- Page 1: recipient + intro + salary + rules + duties --------------
    story.append(Paragraph("To", body))
    story.append(Spacer(1, 8))
    story.append(Paragraph(_esc(g("recipient_name")), name_style))
    story.append(Spacer(1, 3))
    for ln in str(g("address") or "").split("\n"):
        if ln.strip():
            story.append(Paragraph(_esc(ln.strip()), addr_style))
    story.append(Spacer(1, 22))

    intro = (
        f"We are delighted to extend to you an offer of employment with "
        f"AXINOR TECHNOLOGIES for the position of <b>{_esc(g('position'))}</b>.  "
        f"Your joining date will be {_esc(g('joining_date'))}."
    )
    story.append(Paragraph(intro, body))
    story.append(Spacer(1, 16))

    heading("Salary Details")
    salary = (
        f"You will be placed on a probation period of {_esc(g('probation_period'))}, "
        f"during which you will receive a monthly salary of ₹{_esc(g('probation_salary'))}. "
        f"Upon successful completion of the probation period, your confirmed monthly "
        f"salary will be ₹{_esc(g('confirmed_salary'))}.\n"
        f"Salary payments will be made on the {_esc(g('pay_date'))} of every month, with "
        f"any remaining balance, if applicable, paid at the end of your employment.\n"
        f"Based on your performance during the course of your employment, you will be "
        f"eligible for periodic performance reviews and potential salary increments."
    )
    story.extend(_para_block(salary, body))
    story.append(Spacer(1, 16))

    heading("Rules & Regulations")
    story.append(Paragraph(_esc(g("rules_regulations")), body))
    story.append(Spacer(1, 14))
    heading("Duties and Responsibilities", bullet=True)
    story.append(Paragraph(_esc(g("duties")), body))

    story.append(PageBreak())

    # ---- Page 2: general rules + daily work + confidentiality ------------
    heading("General Rules & Expectations", bullet=True)
    story.append(Spacer(1, 4))
    rows = []
    for item in g("general_rules") or []:
        val_cell = [Paragraph(_esc(v.strip()), value_style)
                    for v in str(item.get("value", "")).split("\n") if v.strip()]
        rows.append([
            Paragraph("•  " + _esc(item.get("label", "")), label_style),
            Paragraph(":", label_style),
            val_cell or [Paragraph("", value_style)],
        ])
    if rows:
        tbl = Table(rows, colWidths=[avail_w * 0.34, avail_w * 0.04, avail_w * 0.62])
        tbl.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 4),
            ("TOPPADDING", (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ]))
        story.append(tbl)
    story.append(Spacer(1, 16))

    heading("Daily Work Completion and Reporting", bullet=True)
    bullets = [
        ListItem(Paragraph(_esc(b), body), leftIndent=10, value="•")
        for b in (g("daily_work") or [])
    ]
    if bullets:
        story.append(ListFlowable(bullets, bulletType="bullet", start="•",
                                   leftIndent=14, bulletFontName=reg))
    story.append(Spacer(1, 16))

    heading("Confidentiality")
    story.append(Paragraph(_esc(g("confidentiality")), body))

    story.append(PageBreak())

    # ---- Page 3: IP + termination + sign-off + acknowledgment -----------
    heading("Intellectual Property")
    story.append(Paragraph(_esc(g("intellectual_property")), body))
    story.append(Spacer(1, 16))

    heading("Termination")
    story.extend(_para_block(g("termination"), body))
    story.append(Spacer(1, 26))

    story.append(Paragraph("Thank You Sincerely", small_gray))
    story.append(Spacer(1, 6))
    story.append(Paragraph("For AXINOR TECHNOLOGIES", bold_line))
    story.append(Spacer(1, 4))
    story.append(Paragraph(_esc(g("signatory")), value_style))
    story.append(Spacer(1, 22))

    heading("Acknowledgment And Declaration")
    story.append(Paragraph(_esc(g("acknowledgment")), body))
    story.append(Spacer(1, 18))
    story.append(Paragraph("Accepted &amp; Agreed :", bold_line))
    story.append(Spacer(1, 16))

    line = "_______________________________"
    sig_row = Table(
        [[Paragraph(f"Name :  {line}", value_style),
          Paragraph(f"Signature :  {line}", value_style)]],
        colWidths=[avail_w * 0.55, avail_w * 0.45],
    )
    sig_row.setStyle(TableStyle([
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 14),
    ]))
    story.append(sig_row)
    story.append(Paragraph(f"Date :  {line}", value_style))

    buf = BytesIO()
    doc = BaseDocTemplate(
        buf, pagesize=A4,
        leftMargin=L_MARGIN, rightMargin=R_MARGIN,
        topMargin=TOP_MARGIN, bottomMargin=BOT_MARGIN,
        title="Offer Letter — AXINOR TECHNOLOGIES",
    )
    frame = Frame(
        L_MARGIN, BOT_MARGIN,
        PAGE_W - L_MARGIN - R_MARGIN,
        PAGE_H - TOP_MARGIN - BOT_MARGIN,
        id="body", leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0,
    )
    doc.addPageTemplates([PageTemplate(id="main", frames=[frame], onPage=_draw_decor)])
    doc.build(story)
    return buf.getvalue()


def default_offer_content() -> dict:
    """Defaults the form starts from — exact wording from the approved
    template; variable fields blank or sensibly pre-filled."""
    return {
        "recipient_name": "",
        "address": "",
        "position": "",
        "joining_date": "",
        "probation_period": "two (2) months",
        "probation_salary": "",
        "confirmed_salary": "",
        "pay_date": "15th",
        "signatory": "",
        "rules_regulations": (
            "You are required to dedicate your full time and effort exclusively to "
            "the company. You may not engage in other employment or consultancy "
            "roles, nor partake in external business activities, without prior "
            "written consent from AXINOR 's management."
        ),
        "duties": (
            "You must adhere to organizational rules and regulations concerning "
            "conduct and discipline. You will actively participate in team meetings, "
            "problem-solving sessions, decision-making, and organizational "
            "assignments. Commitment to your responsibilities and effective "
            "performance to achieve results is expected."
        ),
        "general_rules": [
            {"label": "Work Hours", "value": "8 hours (9: 00 am to 5: 00 pm)"},
            {"label": "Total Leave Entitlement",
             "value": "Employees are entitled to 1 paid holidays per month, usable for any reason"},
            {"label": "Leave Request Process",
             "value": "All leave requests must be emailed to HR before 10:00 AM one day before  the leave day, except in emergencies"},
            {"label": "National/Company Holidays",
             "value": "National and company holidays will be communicated in advance via HR email\nFestival holidays will be determined by the company and communicated via HR email"},
            {"label": "Absence Without Notice",
             "value": "Absences without leave requests will be treated as unapproved and may lead to disciplinary action including salary cut."},
        ],
        "daily_work": [
            "All assigned tasks must be completed on the required day without fail , If any issues faced regarding the completion ,must be communicated.",
            "Employees must ensure they have work assigned throughout the day",
            "In cases where no work is assigned, or upon completing all assigned tasks, employees are required to report the situation to their supervisor or management immediately.",
            "Under no circumstances should employees remain idle unless explicitly instructed by the management",
        ],
        "confidentiality": (
            "You are prohibited from disclosing or using confidential information, "
            "trade secrets, or proprietary data of AXINOR during and after your "
            "employment without prior consent, except as required by law."
        ),
        "intellectual_property": (
            "If you conceive any new or advanced method of improving "
            "designs/processes/project/Operations of the company, such  developments "
            "will be fully communicated the company and will be, and remain, the sole "
            "right/property of the company. During the term of your employment period "
            "upon conception or creation, you shall disclose and assign to AXINOR as "
            "it's  exclusive property, all inventions, Ideas, concepts, discoveries, "
            "technologies and improvements(including without limitation legal "
            "documents, training materials, computer software and associated "
            "materials) developed or conceived by you solely or jointly with other "
            "and shall comply with the policies of AXINOR in relation to Intellectual "
            "Property."
        ),
        "termination": (
            "This appointment is based on the information provided by you during the "
            "hiring process. Misrepresentation or suppression of material information "
            "may lead to immediate termination without notice.\n"
            "Upon termination, you must return all company property, including "
            "documents, records, and other materials in your possession. Retaining "
            "copies or proprietary data is strictly prohibited"
        ),
        "acknowledgment": (
            "I have read and understood the terms and conditions of the above "
            "contract and I accept the same with  the intent to be legally bound."
        ),
    }
