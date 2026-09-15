"""Patient-specific, print-ready clinical PDF reports for CareTrace."""

from __future__ import annotations

import io
import re
from datetime import datetime, timezone
from html import escape
from typing import Any

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    HRFlowable,
    KeepTogether,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


INK = colors.HexColor("#173A31")
INK_SOFT = colors.HexColor("#31594E")
MUTED = colors.HexColor("#647A73")
GREEN = colors.HexColor("#0D8466")
MINT = colors.HexColor("#6FD6B6")
MINT_SOFT = colors.HexColor("#EAF7F2")
PAPER = colors.HexColor("#F8FBFA")
LINE = colors.HexColor("#D6E5DF")
AMBER = colors.HexColor("#C17918")
AMBER_DARK = colors.HexColor("#71460E")
AMBER_PALE = colors.HexColor("#FFF5E4")
WHITE = colors.white


def _font(kind: str, fallback: str) -> str:
    paths = {
        "regular": "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "bold": "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    }
    try:
        registered = f"CareTrace-{kind}"
        if registered not in pdfmetrics.getRegisteredFontNames():
            pdfmetrics.registerFont(TTFont(registered, paths[kind]))
        return registered
    except Exception:
        return fallback


FONT = _font("regular", "Helvetica")
FONT_BOLD = _font("bold", "Helvetica-Bold")


def _clean(value: Any) -> str:
    text = str(value if value is not None else "")
    text = re.sub(r"\*\*(.*?)\*\*", r"\1", text, flags=re.S)
    text = re.sub(r"__(.*?)__", r"\1", text, flags=re.S)
    text = re.sub(r"^\s{0,3}#{1,6}\s+", "", text, flags=re.M)
    return (
        text.replace("\u2011", "-")
        .replace("\u2013", "-")
        .replace("\u2014", "-")
        .replace("\u2018", "'")
        .replace("\u2019", "'")
        .replace("\u201c", '"')
        .replace("\u201d", '"')
        .replace("\u2022", "-")
        .strip()
    )


def _paragraph(value: Any, style: ParagraphStyle) -> Paragraph:
    return Paragraph(escape(_clean(value)).replace("\n", "<br/>"), style)


def _record(records: list[dict[str, Any]], source_type: str) -> dict[str, Any]:
    match = next((row for row in records if row.get("source_type") == source_type), None)
    return (match or {}).get("payload") or {}


def _join(value: Any, fallback: str = "None recorded") -> str:
    if isinstance(value, list):
        return ", ".join(_clean(item) for item in value if item) or fallback
    return _clean(value) or fallback


def build_clinical_report_pdf(
    case_data: dict[str, Any],
    run_state: dict[str, Any] | None = None,
    *,
    generated_at: str | None = None,
) -> bytes:
    """Build a high-contrast A4 clinical dossier for exactly one selected patient."""
    run_state = run_state or {}
    patient = case_data.get("patient") or {}
    profile = patient.get("profile") or {}
    insights = case_data.get("insights") or patient.get("insights") or {}
    assessment_data = case_data.get("assessment") or run_state.get("assessment") or {}
    records = case_data.get("records") or []

    case_id = _clean(case_data.get("caseId") or patient.get("id") or "Unassigned")
    patient_id = _clean(patient.get("patient_id") or "Unassigned")
    name = _clean(patient.get("display_name") or "Patient")
    status = _clean(patient.get("status") or insights.get("status") or "Active")
    risk_level = _clean(insights.get("risk_level") or ("High" if assessment_data.get("high_risk") else "Routine"))
    is_high_risk = bool(assessment_data.get("high_risk") or risk_level.lower() in {"high", "critical"})

    prior = _record(records, "prior_note")
    lab = _record(records, "external_update") or _record(records, "laboratory")
    vitals = _record(records, "vitals")
    medication = _record(records, "medication_list")
    allergy = _record(records, "allergy")
    transcript = _record(records, "transcript")

    medications = medication.get("medications") or []
    medication_lines: list[str] = []
    for item in medications:
        if isinstance(item, dict):
            medication_lines.append(" ".join(_clean(item.get(k)) for k in ("drug", "dose", "frequency") if item.get(k)))
        elif item:
            medication_lines.append(_clean(item))
    medication_text = ", ".join(filter(None, medication_lines)) or _clean(insights.get("medication") or profile.get("current_medications")) or "None recorded"
    allergy_text = _join(allergy.get("allergies") or insights.get("allergies") or profile.get("allergies"))
    risks = insights.get("risk_flags") or []
    risk_text = _join(risks, "No elevated risk flags derived from supplied records")
    potassium = lab.get("potassium_mEq_L")

    timestamp = generated_at or datetime.now(timezone.utc).isoformat()
    try:
        generated_label = datetime.fromisoformat(timestamp.replace("Z", "+00:00")).strftime("%d %b %Y | %H:%M UTC")
    except ValueError:
        generated_label = timestamp

    base = getSampleStyleSheet()
    styles = {
        "eyebrow": ParagraphStyle("ct-eyebrow", parent=base["Normal"], fontName=FONT_BOLD, fontSize=6.5, leading=8.5, textColor=GREEN, tracking=1.25),
        "title": ParagraphStyle("ct-title", parent=base["Title"], fontName=FONT_BOLD, fontSize=22, leading=27, textColor=INK, alignment=TA_LEFT),
        "subtitle": ParagraphStyle("ct-subtitle", parent=base["Normal"], fontName=FONT, fontSize=8, leading=11, textColor=MUTED),
        "section": ParagraphStyle("ct-section", parent=base["Heading2"], fontName=FONT_BOLD, fontSize=10.5, leading=13, textColor=INK, spaceAfter=5),
        "section_no": ParagraphStyle("ct-section-no", parent=base["Normal"], fontName=FONT_BOLD, fontSize=6.2, leading=8, textColor=GREEN, tracking=1.1, spaceAfter=2),
        "body": ParagraphStyle("ct-body", parent=base["BodyText"], fontName=FONT, fontSize=8.4, leading=12.4, textColor=INK_SOFT),
        "small": ParagraphStyle("ct-small", parent=base["Normal"], fontName=FONT, fontSize=6.8, leading=9.5, textColor=MUTED),
        "label": ParagraphStyle("ct-label", parent=base["Normal"], fontName=FONT_BOLD, fontSize=5.8, leading=7.5, textColor=MUTED, tracking=.8),
        "value": ParagraphStyle("ct-value", parent=base["Normal"], fontName=FONT_BOLD, fontSize=8.5, leading=11, textColor=INK),
        "hero_name": ParagraphStyle("ct-hero-name", parent=base["Heading1"], fontName=FONT_BOLD, fontSize=17, leading=20, textColor=INK),
        "hero_meta": ParagraphStyle("ct-hero-meta", parent=base["Normal"], fontName=FONT, fontSize=7.6, leading=11, textColor=INK_SOFT),
        "risk": ParagraphStyle("ct-risk", parent=base["Normal"], fontName=FONT_BOLD, fontSize=9, leading=11, textColor=AMBER_DARK if is_high_risk else GREEN, alignment=TA_CENTER),
        "govern_label": ParagraphStyle("ct-govern-label", parent=base["Normal"], fontName=FONT_BOLD, fontSize=5.8, leading=7.5, textColor=colors.HexColor("#A9C5BC"), tracking=.8),
        "govern_value": ParagraphStyle("ct-govern-value", parent=base["Normal"], fontName=FONT_BOLD, fontSize=8.2, leading=11, textColor=WHITE),
        "note_heading": ParagraphStyle("ct-note-heading", parent=base["Heading3"], fontName=FONT_BOLD, fontSize=8.6, leading=11, textColor=INK, spaceBefore=5, spaceAfter=2),
        "note": ParagraphStyle("ct-note", parent=base["BodyText"], fontName=FONT, fontSize=7.9, leading=11.8, textColor=INK_SOFT),
        "footer": ParagraphStyle("ct-footer", parent=base["Normal"], fontName=FONT, fontSize=6.2, leading=8.5, textColor=MUTED, alignment=TA_CENTER),
    }

    buffer = io.BytesIO()
    document = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=17 * mm,
        rightMargin=17 * mm,
        topMargin=24 * mm,
        bottomMargin=18 * mm,
        title=f"CareTrace clinical report - {name}",
        author="CareTrace Clinical Intelligence",
        subject=f"Patient-specific synthetic clinical documentation for {case_id}",
    )

    def page_chrome(canvas: Any, doc: Any) -> None:
        width, height = A4
        canvas.saveState()
        canvas.setFillColor(INK)
        canvas.roundRect(17 * mm, height - 17 * mm, 7.5 * mm, 7.5 * mm, 2 * mm, stroke=0, fill=1)
        canvas.setStrokeColor(MINT)
        canvas.setLineWidth(1.15)
        canvas.line(19 * mm, height - 13.1 * mm, 20.3 * mm, height - 15.1 * mm)
        canvas.line(20.3 * mm, height - 15.1 * mm, 21.5 * mm, height - 11.2 * mm)
        canvas.line(21.5 * mm, height - 11.2 * mm, 23 * mm, height - 14.1 * mm)
        canvas.setFillColor(INK)
        canvas.setFont(FONT_BOLD, 8.5)
        canvas.drawString(27 * mm, height - 12.9 * mm, "CARETRACE")
        canvas.setFillColor(MUTED)
        canvas.setFont(FONT, 5.7)
        canvas.drawString(27 * mm, height - 16.1 * mm, "CLINICAL INTELLIGENCE")
        canvas.setFont(FONT_BOLD, 5.8)
        canvas.drawRightString(width - 17 * mm, height - 12.8 * mm, "CONFIDENTIAL | CLINICIAN REVIEW COPY")
        canvas.setStrokeColor(LINE)
        canvas.setLineWidth(.55)
        canvas.line(17 * mm, height - 19 * mm, width - 17 * mm, height - 19 * mm)
        canvas.line(17 * mm, 13.5 * mm, width - 17 * mm, 13.5 * mm)
        canvas.setFillColor(MUTED)
        canvas.setFont(FONT, 5.8)
        canvas.drawString(17 * mm, 9 * mm, f"SYNTHETIC DEMO  |  {case_id}  |  EHR {patient_id}  |  Human verification required")
        canvas.drawRightString(width - 17 * mm, 9 * mm, f"Page {doc.page}")
        canvas.restoreState()

    def section_band(number: str, heading: str) -> list[Any]:
        return [
            Spacer(1, 3.5 * mm),
            Table(
                [[_paragraph(number, styles["section_no"]), _paragraph(heading, styles["section"]) ]],
                colWidths=[13 * mm, 161 * mm],
                style=TableStyle([
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("LEFTPADDING", (0, 0), (-1, -1), 0),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 1),
                    ("LINEBELOW", (0, 0), (-1, -1), .55, LINE),
                ]),
            ),
            Spacer(1, 1.8 * mm),
        ]

    def info_cell(label: str, value: Any) -> list[Any]:
        return [_paragraph(label.upper(), styles["label"]), Spacer(1, 1.2 * mm), _paragraph(value or "Not recorded", styles["value"])]

    story: list[Any] = []
    story.extend([
        _paragraph("FINAL CLINICAL DOCUMENTATION", styles["eyebrow"]),
        Spacer(1, 1.5 * mm),
        _paragraph("Patient care dossier", styles["title"]),
        _paragraph(f"Generated {generated_label} from the selected longitudinal workspace", styles["subtitle"]),
        Spacer(1, 5 * mm),
    ])

    initials = "".join(part[0] for part in name.split()[:2]).upper() or "PT"
    identity = Table(
        [[
            _paragraph(initials, ParagraphStyle("ct-initials", parent=styles["risk"], textColor=GREEN, fontSize=13, leading=16)),
            [_paragraph(name, styles["hero_name"]), _paragraph(f"{case_id}  |  EHR {patient_id}  |  {status}", styles["hero_meta"])],
            [_paragraph("RISK POSTURE", styles["label"]), Spacer(1, 1.5 * mm), _paragraph(risk_level.upper(), styles["risk"])],
        ]],
        colWidths=[19 * mm, 119 * mm, 36 * mm],
    )
    identity.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), MINT_SOFT),
        ("BOX", (0, 0), (-1, -1), .75, LINE),
        ("LINEBEFORE", (2, 0), (2, 0), .55, LINE),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN", (0, 0), (0, 0), "CENTER"),
        ("LEFTPADDING", (0, 0), (-1, -1), 9),
        ("RIGHTPADDING", (0, 0), (-1, -1), 9),
        ("TOPPADDING", (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
    ]))
    story.append(identity)

    overview = Table(
        [[
            info_cell("Age / sex", f"{profile.get('age') or '-'} / {profile.get('sex') or '-'}"),
            info_cell("Care setting", patient.get("care_setting") or profile.get("care_setting") or "Clinical encounter"),
            info_cell("Primary condition", insights.get("diagnosis") or prior.get("diagnosis") or profile.get("primary_diagnosis") or "Not recorded"),
            info_cell("Linked evidence", f"{len(records)} records"),
        ]],
        colWidths=[34 * mm, 50 * mm, 58 * mm, 32 * mm],
    )
    overview.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), PAPER),
        ("BOX", (0, 0), (-1, -1), .55, LINE),
        ("INNERGRID", (0, 0), (-1, -1), .35, LINE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    story.extend([Spacer(1, 3 * mm), overview])

    if is_high_risk:
        trigger = assessment_data.get("reason") or (f"Potassium {potassium} mEq/L conflicts with the proposed medication candidate." if potassium is not None else risk_text)
        safety = Table(
            [[_paragraph("CLINICAL SAFETY HOLD", ParagraphStyle("ct-alert", parent=styles["label"], textColor=AMBER_DARK)), _paragraph(trigger, styles["body"]) ]],
            colWidths=[41 * mm, 133 * mm],
        )
        safety.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), AMBER_PALE),
            ("BOX", (0, 0), (-1, -1), .8, colors.HexColor("#E7BD76")),
            ("LINEBEFORE", (0, 0), (0, 0), 2.2, AMBER),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("LEFTPADDING", (0, 0), (-1, -1), 9),
            ("RIGHTPADDING", (0, 0), (-1, -1), 9),
            ("TOPPADDING", (0, 0), (-1, -1), 9),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 9),
        ]))
        story.extend([Spacer(1, 3 * mm), safety])

    story.extend(section_band("01", "Clinical context"))
    clinical_context = Table(
        [[
            [_paragraph("PRE-CONSULTATION SUMMARY", styles["label"]), Spacer(1, 1.5 * mm), _paragraph(case_data.get("preconsultSummary") or "Prior longitudinal records were reconciled before this consultation.", styles["body"])],
            [_paragraph("CURRENT CONSULTATION", styles["label"]), Spacer(1, 1.5 * mm), _paragraph(transcript.get("excerpt") or insights.get("objective") or case_data.get("objective") or "Longitudinal clinical follow-up.", styles["body"])],
        ]],
        colWidths=[87 * mm, 87 * mm],
    )
    clinical_context.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), PAPER),
        ("BOX", (0, 0), (-1, -1), .55, LINE),
        ("LINEBEFORE", (1, 0), (1, 0), .55, LINE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 9),
        ("RIGHTPADDING", (0, 0), (-1, -1), 9),
        ("TOPPADDING", (0, 0), (-1, -1), 9),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 9),
    ]))
    story.append(clinical_context)

    story.extend(section_band("02", "Diagnostics and observations"))
    diagnostic_rows = [
        ["Laboratory", f"Potassium {potassium} mEq/L" if potassium is not None else lab.get("result_summary") or "Not recorded", lab.get("potassium_flag") or ("Review" if potassium is not None else "-")],
        ["Blood pressure", vitals.get("blood_pressure") or insights.get("blood_pressure") or "Not recorded", "Latest observation"],
        ["BMI", vitals.get("bmi") or insights.get("bmi") or profile.get("bmi") or "Not recorded", "Longitudinal signal"],
        ["Care frequency", insights.get("annual_followups") or profile.get("annual_followup_frequency") or "Not recorded", "Follow-ups / year"],
    ]
    diagnostics = Table(
        [[_paragraph("MEASURE", styles["label"]), _paragraph("LATEST VALUE", styles["label"]), _paragraph("INTERPRETATION", styles["label"])]]
        + [[_paragraph(a, styles["body"]), _paragraph(b, styles["value"]), _paragraph(c, styles["small"])] for a, b, c in diagnostic_rows],
        colWidths=[45 * mm, 66 * mm, 63 * mm],
        repeatRows=1,
    )
    diagnostics.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), INK),
        ("TEXTCOLOR", (0, 0), (-1, 0), WHITE),
        ("BACKGROUND", (0, 1), (-1, -1), WHITE),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [WHITE, PAPER]),
        ("BOX", (0, 0), (-1, -1), .55, LINE),
        ("LINEBELOW", (0, 1), (-1, -2), .35, LINE),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 6.5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6.5),
    ]))
    story.append(diagnostics)

    story.extend(section_band("03", "Medication, allergy and risk reconciliation"))
    reconciliation = Table(
        [[
            info_cell("Active medications", medication_text),
            info_cell("Allergies", allergy_text),
            info_cell("Patient-specific risks", risk_text),
        ]],
        colWidths=[58 * mm, 47 * mm, 69 * mm],
    )
    reconciliation.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), MINT_SOFT if not is_high_risk else AMBER_PALE),
        ("BOX", (0, 0), (-1, -1), .7, LINE if not is_high_risk else colors.HexColor("#E7BD76")),
        ("INNERGRID", (0, 0), (-1, -1), .35, LINE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 9),
        ("RIGHTPADDING", (0, 0), (-1, -1), 9),
        ("TOPPADDING", (0, 0), (-1, -1), 9),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 9),
    ]))
    story.append(reconciliation)

    story.append(PageBreak())
    story.extend([_paragraph("CLINICAL REVIEW", styles["eyebrow"]), Spacer(1, 1.5 * mm), _paragraph("Assessment and accountable plan", styles["title"]), _paragraph(f"Patient: {name}  |  Case: {case_id}", styles["subtitle"])])

    story.extend(section_band("04", "Clinical assessment"))
    assessment_text = run_state.get("assessment_text") or case_data.get("assessmentText") or (
        f"{insights.get('diagnosis') or prior.get('diagnosis') or profile.get('primary_diagnosis') or 'Clinical condition'} - "
        f"{insights.get('condition_status') or profile.get('condition_status') or 'status under review'}. "
        f"Risk signals: {risk_text}."
    )
    assessment_box = Table([[_paragraph(assessment_text, styles["body"]) ]], colWidths=[174 * mm])
    assessment_box.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), PAPER),
        ("BOX", (0, 0), (-1, -1), .6, LINE),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
    ]))
    story.append(assessment_box)

    story.extend(section_band("05", "Clinician-owned follow-up"))
    follow_up = [
        "Verify the reconciled longitudinal record and the patient-specific risk signals.",
        f"Continue {_clean(insights.get('diagnosis') or profile.get('primary_diagnosis') or 'clinical')} follow-up at the documented cadence.",
        "Repeat potassium and reassess the blocked candidate before any medication decision." if is_high_risk else "Review pending or abnormal investigations and update the longitudinal plan.",
    ]
    follow_table = Table(
        [[_paragraph(str(index).zfill(2), styles["eyebrow"]), _paragraph(item, styles["body"]) ] for index, item in enumerate(follow_up, 1)],
        colWidths=[13 * mm, 161 * mm],
    )
    follow_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BACKGROUND", (0, 0), (0, -1), MINT_SOFT),
        ("BOX", (0, 0), (-1, -1), .55, LINE),
        ("LINEBELOW", (0, 0), (-1, -2), .35, LINE),
        ("ALIGN", (0, 0), (0, -1), "CENTER"),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
    ]))
    story.append(follow_table)

    story.extend(section_band("06", "Verified agent documentation"))
    note_text = _clean(run_state.get("note") or "No completed agent note is available for this case.")
    note_blocks: list[Any] = []
    for raw in re.split(r"\n{2,}", note_text):
        block = raw.strip()
        if not block:
            continue
        first, _, remainder = block.partition(":")
        if remainder and len(first) <= 42 and "\n" not in first:
            note_blocks.append(_paragraph(first.upper(), styles["note_heading"]))
            note_blocks.append(_paragraph(remainder.strip(), styles["note"]))
        else:
            note_blocks.append(_paragraph(block, styles["note"]))
        note_blocks.append(Spacer(1, 1.3 * mm))
    if not note_blocks:
        note_blocks.append(_paragraph("No completed agent note is available for this case.", styles["note"]))
    note_card = Table([[note_blocks]], colWidths=[174 * mm])
    note_card.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), WHITE),
        ("BOX", (0, 0), (-1, -1), .75, LINE),
        ("LINEBEFORE", (0, 0), (0, 0), 2.2, GREEN),
        ("LEFTPADDING", (0, 0), (-1, -1), 11),
        ("RIGHTPADDING", (0, 0), (-1, -1), 11),
        ("TOPPADDING", (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
    ]))
    story.append(note_card)

    story.extend(section_band("07", "Governance and sign-off"))
    checks_total = len(run_state.get("checks") or []) or 14
    checks_passed = run_state.get("passed") if run_state.get("passed") is not None else "-"
    def governance_cell(label: str, value: str) -> list[Any]:
        return [_paragraph(label.upper(), styles["govern_label"]), Spacer(1, 1.2 * mm), _paragraph(value, styles["govern_value"])]

    governance = Table(
        [[
            governance_cell("Evidence lineage", f"{len(records)} linked records"),
            governance_cell("Verification", f"{checks_passed}/{checks_total} checks passed"),
            governance_cell("Authority", "Clinician decision required"),
        ]],
        colWidths=[58 * mm, 58 * mm, 58 * mm],
    )
    governance.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), INK),
        ("TEXTCOLOR", (0, 0), (-1, -1), WHITE),
        ("INNERGRID", (0, 0), (-1, -1), .35, colors.HexColor("#3C6258")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 9),
        ("RIGHTPADDING", (0, 0), (-1, -1), 9),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    story.append(governance)

    signature = Table(
        [[_paragraph("Clinician name / identifier", styles["small"]), _paragraph("Signature", styles["small"]), _paragraph("Date / time", styles["small"])], ["", "", ""]],
        colWidths=[68 * mm, 58 * mm, 48 * mm],
        rowHeights=[7 * mm, 14 * mm],
    )
    signature.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), .55, LINE),
        ("INNERGRID", (0, 0), (-1, -1), .35, LINE),
        ("BACKGROUND", (0, 0), (-1, 0), PAPER),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
    ]))
    story.extend([
        Spacer(1, 3 * mm),
        signature,
    ])

    document.build(story, onFirstPage=page_chrome, onLaterPages=page_chrome)
    return buffer.getvalue()
