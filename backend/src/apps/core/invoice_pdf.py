"""System-generated invoice PDF (AXFLOW-branded, monochrome).

Renders a single-page invoice from an Invoice instance + its line items.
Returns raw PDF bytes so callers can attach it to an email and/or save it to
the model's FileField. Fonts fall back to the bundled DejaVu Sans (it carries
the ₹ glyph and is deployment-safe).
"""
from __future__ import annotations

import os
from io import BytesIO

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)
from reportlab.platypus.paragraph import ParagraphStyle

# Reuse the same bundled fonts the offer-letter PDF ships.
_ASSETS = os.path.join(os.path.dirname(__file__), "assets")

BLACK = colors.HexColor("#171717")
GREY = colors.HexColor("#6b7280")
LINE = colors.HexColor("#e5e7eb")

_FONTS_READY = False


def _ensure_fonts() -> tuple[str, str]:
    global _FONTS_READY
    reg, bold = "INV", "INV-Bold"
    if _FONTS_READY:
        return reg, bold
    try:
        pdfmetrics.registerFont(TTFont(reg, os.path.join(_ASSETS, "DejaVuSans.ttf")))
        pdfmetrics.registerFont(TTFont(bold, os.path.join(_ASSETS, "DejaVuSans-Bold.ttf")))
        _FONTS_READY = True
        return reg, bold
    except Exception:
        return "Helvetica", "Helvetica-Bold"


def _money(amount, currency: str) -> str:
    symbol = "₹" if (currency or "INR").upper() == "INR" else f"{currency} "
    try:
        return f"{symbol}{float(amount):,.2f}"
    except (TypeError, ValueError):
        return f"{symbol}0.00"


_STATUS_LABEL = {
    "requested": "PAYMENT REQUESTED",
    "paid": "MARKED PAID",
    "completed": "PAID — COMPLETED",
}


def render_invoice_pdf(invoice) -> bytes:
    """Build the invoice PDF for ``invoice`` and return the bytes."""
    reg, bold = _ensure_fonts()

    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=20 * mm, rightMargin=20 * mm,
        topMargin=20 * mm, bottomMargin=20 * mm,
        title=f"Invoice {invoice.invoice_number}",
    )

    h1 = ParagraphStyle("h1", fontName=bold, fontSize=22, textColor=BLACK, leading=26)
    label = ParagraphStyle("label", fontName=reg, fontSize=8, textColor=GREY, leading=11)
    val = ParagraphStyle("val", fontName=reg, fontSize=10, textColor=BLACK, leading=14)
    val_b = ParagraphStyle("valb", fontName=bold, fontSize=10, textColor=BLACK, leading=14)
    status_st = ParagraphStyle("status", fontName=bold, fontSize=10, textColor=colors.white, alignment=2)

    story: list = []

    # --- Header: brand + invoice meta -------------------------------------
    meta = [
        [Paragraph("AXFLOW", h1), Paragraph(f"Invoice<br/><b>{invoice.invoice_number}</b>", val)],
    ]
    head = Table(meta, colWidths=[None, 55 * mm])
    head.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ALIGN", (1, 0), (1, 0), "RIGHT"),
    ]))
    story += [head, Spacer(1, 6 * mm)]

    # Status pill (full-width black bar, right-aligned text).
    pill = Table(
        [[Paragraph(_STATUS_LABEL.get(invoice.status, invoice.status.upper()), status_st)]],
        colWidths=[None],
    )
    pill.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), BLACK),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
    ]))
    story += [pill, Spacer(1, 8 * mm)]

    # --- Bill-to + dates --------------------------------------------------
    client_name = getattr(invoice.client, "name", "—")
    client_email = getattr(invoice.client, "contact_email", "") or ""
    project_name = getattr(invoice.project, "name", None) if invoice.project_id else None

    left = [
        Paragraph("BILLED TO", label),
        Paragraph(client_name, val_b),
    ]
    if client_email:
        left.append(Paragraph(client_email, val))
    if project_name:
        left += [Spacer(1, 3 * mm), Paragraph("PROJECT", label), Paragraph(project_name, val)]

    right = [
        Paragraph("ISSUE DATE", label),
        Paragraph(str(invoice.issue_date or "—"), val),
        Spacer(1, 3 * mm),
        Paragraph("DUE DATE", label),
        Paragraph(str(invoice.due_date or "—"), val),
    ]
    info = Table([[left, right]], colWidths=[None, 55 * mm])
    info.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP")]))
    story += [info, Spacer(1, 10 * mm)]

    # --- Line items table -------------------------------------------------
    th = ParagraphStyle("th", fontName=bold, fontSize=9, textColor=colors.white)
    td = ParagraphStyle("td", fontName=reg, fontSize=9.5, textColor=BLACK, leading=13)
    td_r = ParagraphStyle("tdr", parent=td, alignment=2)

    rows = [[
        Paragraph("Description", th),
        Paragraph("Qty", ParagraphStyle("thr", parent=th, alignment=2)),
        Paragraph("Rate", ParagraphStyle("thr2", parent=th, alignment=2)),
        Paragraph("Amount", ParagraphStyle("thr3", parent=th, alignment=2)),
    ]]
    for it in invoice.items.all():
        rows.append([
            Paragraph(it.description, td),
            Paragraph(f"{it.quantity:g}", td_r),
            Paragraph(_money(it.rate, invoice.currency), td_r),
            Paragraph(_money(it.amount, invoice.currency), td_r),
        ])

    items_tbl = Table(rows, colWidths=[None, 20 * mm, 35 * mm, 35 * mm])
    items_tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), BLACK),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("LINEBELOW", (0, 1), (-1, -1), 0.5, LINE),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    story += [items_tbl, Spacer(1, 6 * mm)]

    # --- Total ------------------------------------------------------------
    total_tbl = Table(
        [[
            Paragraph("TOTAL", ParagraphStyle("tl", fontName=bold, fontSize=12, textColor=BLACK, alignment=2)),
            Paragraph(_money(invoice.total, invoice.currency),
                      ParagraphStyle("tv", fontName=bold, fontSize=12, textColor=BLACK, alignment=2)),
        ]],
        colWidths=[None, 50 * mm],
    )
    total_tbl.setStyle(TableStyle([
        ("LINEABOVE", (1, 0), (1, 0), 1, BLACK),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
    ]))
    story += [total_tbl]

    if invoice.notes:
        story += [
            Spacer(1, 12 * mm),
            Paragraph("NOTES", label),
            Paragraph(invoice.notes.replace("\n", "<br/>"), val),
        ]

    story += [
        Spacer(1, 16 * mm),
        Paragraph(
            "This is a system-generated invoice from AXFLOW. "
            "For questions, reply to the email this invoice was sent with.",
            ParagraphStyle("foot", fontName=reg, fontSize=8, textColor=GREY, leading=11),
        ),
    ]

    doc.build(story)
    return buf.getvalue()
