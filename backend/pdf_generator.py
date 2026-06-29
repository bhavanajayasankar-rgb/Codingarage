from fpdf import FPDF
from datetime import datetime
import unicodedata


def format_inr(value: float) -> str:
    return f"\u20B9{value:,.2f}"

def clean_pdf_text(value) -> str:
    text = "" if value is None else str(value)
    replacements = {
        "\u2022": "-",
        "\u2013": "-",
        "\u2014": "-",
        "\u2018": "'",
        "\u2019": "'",
        "\u201c": '"',
        "\u201d": '"',
        "\u2026": "...",
    }
    for source, target in replacements.items():
        text = text.replace(source, target)
    return unicodedata.normalize("NFKD", text).encode("latin-1", "ignore").decode("latin-1")


class ReportPDF(FPDF):
    def __init__(self, persona: str):
        super().__init__()
        self.persona = persona
        self.set_auto_page_break(auto=True, margin=15)

    def header(self):
        self.set_font("Helvetica", "B", 10)
        self.set_text_color(30, 41, 59)
        self.cell(0, 8, "CodingGarage FinOps", new_x="LMARGIN", new_y="NEXT")
        self.set_font("Helvetica", "", 8)
        self.set_text_color(100, 116, 139)
        self.cell(0, 5, f"{self.persona.capitalize()} Report | Generated {datetime.now().strftime('%Y-%m-%d %H:%M')}",
                  new_x="LMARGIN", new_y="NEXT")
        self.set_draw_color(200, 200, 200)
        self.line(10, self.get_y() + 2, 200, self.get_y() + 2)
        self.ln(6)

    def footer(self):
        self.set_y(-15)
        self.set_font("Helvetica", "I", 8)
        self.set_text_color(150, 150, 150)
        self.cell(0, 10, f"Page {self.page_no()}/{{nb}}", align="C")

    def chapter_title(self, title: str):
        self.set_font("Helvetica", "B", 13)
        self.set_text_color(15, 23, 42)
        self.multi_cell(0, 8, clean_pdf_text(title))
        self.ln(2)

    def section_title(self, title: str):
        self.set_font("Helvetica", "B", 11)
        self.set_text_color(51, 65, 85)
        self.cell(0, 8, title, new_x="LMARGIN", new_y="NEXT")
        self.ln(2)

    def body_text(self, text: str):
        self.set_font("Helvetica", "", 10)
        self.set_text_color(71, 85, 105)
        self.multi_cell(0, 7, clean_pdf_text(text))
        self.ln(3)

    def metric_block(self, label: str, value: str, x: float = None):
        if x is not None:
            self.set_x(x)
        self.set_font("Helvetica", "", 9)
        self.set_text_color(100, 116, 139)
        self.cell(90, 5, label, new_x="LMARGIN", new_y="NEXT")
        self.set_font("Helvetica", "B", 14)
        self.set_text_color(15, 23, 42)
        self.cell(90, 8, value, new_x="LMARGIN", new_y="NEXT")
        self.ln(3)

    def bullet_list(self, items: list[str]):
        self.set_font("Helvetica", "", 10)
        self.set_text_color(71, 85, 105)
        for item in items:
            self.multi_cell(0, 6, clean_pdf_text(f"- {item}"))
            self.ln(1)
        self.ln(2)

    def table_header(self, cols: list[str], widths: list[float]):
        self.set_font("Helvetica", "B", 9)
        self.set_fill_color(241, 245, 249)
        self.set_text_color(51, 65, 85)
        for i, col in enumerate(cols):
            self.cell(widths[i], 7, clean_pdf_text(col), border=1, fill=True)
        self.ln()

    def table_row(self, cells: list[str], widths: list[float]):
        self.set_font("Helvetica", "", 9)
        self.set_text_color(71, 85, 105)
        x_start = self.get_x()
        y_start = self.get_y()
        line_height = 5
        rendered = [clean_pdf_text(cell) for cell in cells]
        row_height = max(
            line_height,
            *(line_height * max(1, len(self.multi_cell(widths[i], line_height, rendered[i], dry_run=True, output="LINES"))) for i in range(len(rendered)))
        )
        if self.get_y() + row_height > self.page_break_trigger:
            self.add_page()
            x_start = self.get_x()
            y_start = self.get_y()
        x = x_start
        for i, cell in enumerate(rendered):
            self.set_xy(x, y_start)
            self.multi_cell(widths[i], line_height, cell, border=1, max_line_height=line_height)
            x += widths[i]
        self.set_xy(x_start, y_start + row_height)


def generate_report_pdf(report_data: dict, persona: str) -> bytes:
    pdf = ReportPDF(persona)
    pdf.alias_nb_pages()
    pdf.add_page()

    title = report_data.get("title", f"{persona.capitalize()} Report")
    pdf.chapter_title(clean_pdf_text(title))

    cadence = report_data.get("cadence", "N/A")
    focus = report_data.get("focus", "")
    pdf.set_font("Helvetica", "I", 10)
    pdf.set_text_color(100, 116, 139)
    pdf.cell(0, 6, clean_pdf_text(f"Cadence: {cadence}"), new_x="LMARGIN", new_y="NEXT")
    pdf.ln(3)

    summary = report_data.get("summary", "")
    if summary:
        pdf.section_title("Executive Summary")
        pdf.body_text(summary)

    metrics = report_data.get("metrics", {})
    if metrics:
        pdf.section_title("Key Metrics")
        y_start = pdf.get_y()
        col_width = 90
        row_height = 16

        metric_items = list(metrics.items())
        for i in range(0, len(metric_items), 2):
            y_row = pdf.get_y()
            max_row_height = 0
            for j in range(2):
                if i + j < len(metric_items):
                    key, val = metric_items[i + j]
                    x_pos = 10 + (j * col_width)
                    label = key.replace("_", " ").title()
                    if isinstance(val, (int, float)):
                        if "cost" in key or "savings" in key or "impact" in key or "projected" in key:
                            value_str = format_inr(val)
                        else:
                            value_str = str(val)
                    else:
                        value_str = str(val)
                    pdf.set_xy(x_pos, y_row)
                    pdf.set_font("Helvetica", "", 9)
                    pdf.set_text_color(100, 116, 139)
                    pdf.multi_cell(col_width - 4, 5, clean_pdf_text(label))
                    label_bottom = pdf.get_y()
                    pdf.set_xy(x_pos, label_bottom)
                    pdf.set_font("Helvetica", "B", 13)
                    pdf.set_text_color(15, 23, 42)
                    pdf.multi_cell(col_width - 4, 7, clean_pdf_text(value_str))
                    max_row_height = max(max_row_height, pdf.get_y() - y_row)
            pdf.set_y(y_row + max(row_height, max_row_height) + 2)
        pdf.ln(5)

    insights = report_data.get("insights", [])
    if insights:
        pdf.section_title("Key Insights")
        pdf.bullet_list(insights)

    recommendations = report_data.get("recommendations", [])
    if recommendations:
        pdf.section_title("Recommendations")
        pdf.bullet_list(recommendations)

    action_items = report_data.get("action_items", [])
    if action_items:
        pdf.section_title("Action Items")
        pdf.bullet_list(action_items)

    ai_gen = report_data.get("ai_generated", False)
    pdf.ln(5)
    pdf.set_font("Helvetica", "I", 8)
    pdf.set_text_color(150, 150, 150)
    gen_method = "AI-Generated (Groq)" if ai_gen else "Template-Based (Fallback)"
    pdf.cell(0, 5, f"Report generated via: {gen_method}", new_x="LMARGIN", new_y="NEXT")

    return bytes(pdf.output())
