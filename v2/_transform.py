#!/usr/bin/env python3
"""
Transpose existing prototype screens to the Mosaic 2.0 visual shell.

For each source file:
  1. Swap Manrope font import for Barlow
  2. Add tokens.css + base.css links at end of <head>
  3. Replace <header class="topbar">...</header> with new mosaic-header
  4. Replace <nav class="mainnav">...</nav> with new mosaic-nav
  5. Remove <div class="hero">...</div> (single-line opening, multi-line)
  6. Replace <footer class="page-footer">...</footer> with new mosaic-footer

Preserves all inline component CSS (drawer, modal, multi-item card, datepicker)
and all JS so the page-specific functionality stays intact.
"""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).parent.parent  # repo root (DEV/)
V2 = Path(__file__).parent           # DEV/v2/

# Map: source filename at repo root → destination filename inside v2/
TARGETS = {
    "agendar-contrato-normal-v5.html":   "agendar-contrato-normal.html",
    "criar-protocolo.html":              "criar-protocolo.html",
    "agendar-protocolo.html":            "agendar-protocolo.html",
    "relatorio-status-agendamento.html": "relatorio-status-agendamento.html",
}

# ---------------------------------------------------------------------------
# New header (top bar + nav). Active item is computed per-page.
# ---------------------------------------------------------------------------

def new_header_html(active_nav: str) -> str:
    # Top-level nav active markers (Salesforce: parent fica laranja quando
    # você está numa subpage)
    agendamento_active = active_nav in ("agendar-contrato", "agendar-protocolo", "relatorio")
    contratos_active   = active_nav == "criar-protocolo"
    def active(name): return ' class="nav-item is-active"' if name == active_nav else ' class="nav-item"'
    def parent_cls(is_active):
        return 'nav-item is-active' if is_active else 'nav-item'
    return f'''<header class="mosaic-header">
  <div class="mosaic-header-top">
    <a href="index.html" class="mosaic-logo" aria-label="Mosaic Direct — Home">
      <span class="logo-text">Mosaic<sup>®</sup></span>
      <img class="logo-shapes" src="logo-shapes.png" alt="" />
    </a>
    <div class="mosaic-search">
      <input type="text" placeholder="Pesquisa" aria-label="Pesquisa global" />
      <span class="search-icon" aria-hidden="true">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      </span>
    </div>
    <div class="mosaic-user-cluster">
      <button class="lang-switch" type="button">
        PT
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      <div class="mosaic-user-info">
        <span class="user-name">Alyssa Harris</span>
        <span class="user-org">MAR JAC POULT...</span>
      </div>
      <button class="icon-btn" aria-label="Trocar empresa" type="button">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18M5 21V7l8-4v18M19 21V11l-6-4"/><path d="M9 9h.01M9 12h.01M9 15h.01M9 18h.01"/></svg>
      </button>
      <button class="icon-btn" aria-label="Carrinho" type="button">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
      </button>
    </div>
  </div>
  <nav class="mosaic-nav" aria-label="Principal">
    <div class="mosaic-nav-inner">
      <a href="index.html"{active("home")}>Home</a>
      <a href="#" class="nav-item">Produtos</a>
      <a href="#" class="nav-item">Cotações</a>
      <span class="{parent_cls(contratos_active)}" tabindex="0">
        Contratos<span class="chev" aria-hidden="true"></span>
        <div class="nav-submenu">
          <a href="criar-protocolo.html"{' class="is-active"' if active_nav=="criar-protocolo" else ""}>Criar Protocolo</a>
        </div>
      </span>
      <span class="{parent_cls(agendamento_active)}" tabindex="0">
        Agendamento<span class="chev" aria-hidden="true"></span>
        <div class="nav-submenu">
          <a href="agendar-contrato-normal.html"{' class="is-active"' if active_nav=="agendar-contrato" else ""}>Agendar Contratos Normais</a>
          <a href="relatorio-status-agendamento.html"{' class="is-active"' if active_nav=="relatorio" else ""}>Relatório de Status de Agendamento</a>
        </div>
      </span>
      <a href="#" class="nav-item">Faturamento</a>
      <a href="#" class="nav-item">Documentos</a>
      <a href="#" class="nav-item">Financeiro</a>
      <a href="#" class="nav-item">Suporte</a>
    </div>
  </nav>
</header>'''

FOOTER_HTML = '''<footer class="mosaic-footer">
  <div class="mosaic-footer-inner">
    <a href="index.html" class="mosaic-logo" aria-label="Mosaic">
      <span class="logo-text">Mosaic<sup>®</sup></span>
      <img class="logo-shapes" src="logo-shapes.png" alt="" />
    </a>
    <div class="footer-links">
      <a href="#">Política de Privacidade</a>
      <a href="#">Termos e Condições</a>
      <a href="#">Sobre nós</a>
      <a href="#">Entre em contato conosco</a>
    </div>
    <div class="footer-copyright">Copyright © 2026 Mosaic</div>
  </div>
</footer>'''


def transform(src_file: Path, dst_file: Path, active_nav: str) -> dict:
    txt = src_file.read_text(encoding="utf-8")
    report = {"src": src_file.name, "dst": dst_file.name}

    # 1. Swap Manrope → Barlow in <link> imports
    txt2, n = re.subn(r"family=Manrope:wght@[\d;]+", "family=Barlow:wght@400;500;600;700;800", txt)
    report["font_link_swaps"] = n
    txt = txt2

    # 2. Swap any Manrope reference → Barlow (handles quoted, unquoted,
    #    SVG font-family attributes, etc.)
    txt2, n = re.subn(r'\bManrope\b', 'Barlow', txt)
    report["font_family_swaps"] = n
    txt = txt2

    # 3. Insert tokens.css + base.css links right before </head>
    if "tokens.css" not in txt:
        inject = '<link rel="stylesheet" href="tokens.css" />\n<link rel="stylesheet" href="base.css" />\n</head>'
        txt, n = re.subn(r"</head>", inject, txt, count=1)
        report["head_links_injected"] = n

    # 4. Replace <header class="topbar">...</header> with new header+nav
    new_hdr = new_header_html(active_nav)
    txt2, n = re.subn(
        r'<header class="topbar">.*?</header>\s*(<!--[^>]*-->\s*)?<nav class="mainnav">.*?</nav>',
        lambda _: new_hdr,
        txt,
        count=1,
        flags=re.DOTALL,
    )
    report["header_nav_swap"] = n
    if n == 0:
        # Fallback: try just header
        txt2, n = re.subn(
            r'<header class="topbar">.*?</header>',
            lambda _: new_hdr,
            txt,
            count=1,
            flags=re.DOTALL,
        )
        report["header_only_swap"] = n
        if n == 1:
            # Then remove the nav separately
            txt2, n2 = re.subn(
                r'<nav class="mainnav">.*?</nav>',
                "",
                txt2,
                count=1,
                flags=re.DOTALL,
            )
            report["nav_only_removal"] = n2
    txt = txt2

    # 5. Remove hero block (soy field + Mosaic overlay)
    txt2, n = re.subn(
        r'<!--\s*Hero[^>]*-->\s*<div class="hero">.*?</div>\s*</div>',
        "",
        txt,
        count=1,
        flags=re.DOTALL,
    )
    if n == 0:
        # Fallback simpler pattern
        txt2, n = re.subn(
            r'<div class="hero">.*?<!-- (Page|/Hero)',
            r'<!-- \1',
            txt,
            count=1,
            flags=re.DOTALL,
        )
    report["hero_removal"] = n
    txt = txt2

    # 5b. Strip Hotjar + GA tracking scripts (placeholders that throw at runtime)
    txt2, n_ga = re.subn(
        r"<!--\s*Google Analytics[^>]*-->\s*<script[^>]*googletagmanager[^<]*</script>\s*<script>[\s\S]*?gtag\('config'[^)]*\);\s*</script>",
        "",
        txt,
    )
    txt2, n_hj = re.subn(
        r"<!--\s*Hotjar[^>]*-->\s*<script>\s*\(function\(h,o,t,j,a,r\)[\s\S]*?hotjar[\s\S]*?</script>",
        "",
        txt2,
    )
    report["ga_strip"] = n_ga
    report["hotjar_strip"] = n_hj
    txt = txt2

    # 6a. Replace old <footer class="page-footer">...</footer> with new footer (if exists)
    txt2, n = re.subn(
        r'<footer class="page-footer">.*?</footer>',
        FOOTER_HTML.replace("\\", "\\\\"),
        txt,
        count=1,
        flags=re.DOTALL,
    )
    report["footer_swap"] = n
    txt = txt2

    # 6b. If no footer existed, inject new footer right before </body>
    # SKIP injection if the page has a real summary-footer ELEMENT (not just
    # CSS leftover). Those screens already have a functional action bar.
    if n == 0:
        # Match any class attribute containing "summary-footer" as a whole token
        # (handles variants like "summary-footer summary-footer--centered")
        has_action_bar = bool(re.search(r'class="[^"]*\bsummary-footer\b[^"]*"', txt))
        report["has_action_bar"] = has_action_bar
        if not has_action_bar:
            txt, n = re.subn(r"</body>", FOOTER_HTML + "\n</body>", txt, count=1)
            report["footer_injected"] = n
        else:
            report["footer_injected"] = "skipped (has summary-footer action bar)"

    dst_file.write_text(txt, encoding="utf-8")
    report["bytes_in"] = src_file.stat().st_size
    report["bytes_out"] = dst_file.stat().st_size
    return report


def main():
    for src_name, dst_name in TARGETS.items():
        src = ROOT / src_name
        dst = V2 / dst_name
        active = {
            "agendar-contrato-normal-v5.html":   "agendar-contrato",
            "criar-protocolo.html":              "criar-protocolo",
            "agendar-protocolo.html":            "agendar-protocolo",
            "relatorio-status-agendamento.html": "relatorio",
        }[src_name]
        r = transform(src, dst, active)
        print(f"\n=== {src_name} → v2/{dst_name} ({active}) ===")
        for k, v in r.items():
            print(f"  {k}: {v}")


if __name__ == "__main__":
    main()
