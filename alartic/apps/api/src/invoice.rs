//! Génération facture PDF — CDC §9.6, CGI art. 242 nonies A.
//!
//! Approche :
//! - Numéro de facture attribué côté DB au moment du paiement confirmé
//!   (séquence Postgres `invoice_seq`, migration 0017). Cf. [`attribute_number`].
//! - PDF généré **à la demande** depuis les données figées en `orders` /
//!   `order_items`. Pas de stockage de blob — le PDF est déterministe à partir
//!   du couple (order, seller_info).
//! - Polices PDF built-in (Helvetica + HelveticaBold) — aucun fichier `.ttf`
//!   à charger, viewer-agnostique, conforme principe "polices auto-hébergées"
//!   (rien d'externe).
//! - Mentions obligatoires (CGI art. 242 nonies A) : N° séquentiel, date, nom
//!   + adresse + SIRET vendeur, nom + adresse client, désignation, quantité,
//!     PU HT, total HT, total TTC, conditions de règlement (déjà payé).
//! - Mention TVA : "TVA non applicable, art. 293 B du CGI" (franchise en base
//!   micro-entrepreneur). Si la franchise est franchie un jour, basculer sur
//!   `taux_tva` réel via env.
//! - B2B : pénalités de retard + indemnité forfaitaire 40 € (L441-10 CCom)
//!   ajoutées sur les mentions footer si `is_pro`.

use chrono::{DateTime, Utc};
use printpdf::{
    BuiltinFont, IndirectFontRef, Line, Mm, PdfDocument, PdfDocumentReference, Point,
};

/// Identité légale du vendeur. Chargée depuis l'environnement au boot.
#[derive(Clone, Debug)]
pub struct SellerInfo {
    pub name: String,
    pub address_line1: String,
    pub address_line2: String,
    pub siret: String,
    /// Optionnel — micro-entrepreneur en franchise n'a pas de TVA intracom.
    pub tva_intra: Option<String>,
    pub email: String,
    pub phone: Option<String>,
    pub website: String,
}

impl SellerInfo {
    /// Charge depuis env, avec fallback placeholder en dev pour ne pas bloquer
    /// le boot tant que Thomas n'a pas son SIRET / adresse définitive.
    pub fn from_env() -> Self {
        Self {
            name: env_or("ALARTIC_SELLER_NAME", "ALARTIC — Thomas BEHAGUE EI"),
            address_line1: env_or("ALARTIC_SELLER_ADDRESS_LINE1", "[Adresse à compléter]"),
            address_line2: env_or("ALARTIC_SELLER_ADDRESS_LINE2", "France"),
            siret: env_or("ALARTIC_SELLER_SIRET", "[SIRET à compléter]"),
            tva_intra: std::env::var("ALARTIC_SELLER_TVA_INTRA")
                .ok()
                .filter(|s| !s.trim().is_empty()),
            email: env_or("ALARTIC_SELLER_EMAIL", "contact@alartic.fr"),
            phone: std::env::var("ALARTIC_SELLER_PHONE")
                .ok()
                .filter(|s| !s.trim().is_empty()),
            website: env_or("ALARTIC_SELLER_WEBSITE", "alartic.fr"),
        }
    }
}

fn env_or(key: &str, default: &str) -> String {
    std::env::var(key).unwrap_or_else(|_| default.to_string())
}

/// Données complètes nécessaires pour générer une facture. Construit par
/// `orders.rs` après attribution du numéro.
pub struct InvoiceData<'a> {
    pub number: i64,
    pub invoiced_at: DateTime<Utc>,
    pub paid_at: DateTime<Utc>,
    pub order_id: uuid::Uuid,
    pub customer: InvoiceCustomer<'a>,
    pub items: &'a [InvoiceItem<'a>],
    pub subtotal_cents: i64,
    pub shipping_cents: i64,
    pub total_cents: i64,
    pub payment_method: &'a str,
}

pub struct InvoiceCustomer<'a> {
    pub first_name: &'a str,
    pub last_name: &'a str,
    pub email: &'a str,
    pub address_line1: &'a str,
    pub address_line2: Option<&'a str>,
    pub postcode: &'a str,
    pub city: &'a str,
    pub country: &'a str,
    pub is_pro: bool,
    pub company_name: Option<&'a str>,
    pub siret: Option<&'a str>,
}

pub struct InvoiceItem<'a> {
    pub product_name: &'a str,
    pub variant_color_name: &'a str,
    pub variant_storage_label: &'a str,
    pub qty: i32,
    pub unit_price_cents: i64,
    pub line_total_cents: i64,
}

/// Formatte `number` en `ALARTIC-YYYY-NNNNNN` (année dérivée de la date).
pub fn format_number(number: i64, invoiced_at: DateTime<Utc>) -> String {
    use chrono::Datelike;
    format!("ALARTIC-{:04}-{:06}", invoiced_at.year(), number)
}

/// Génère la facture PDF. Renvoie le binaire prêt à servir / attacher.
pub fn generate_pdf(
    data: &InvoiceData<'_>,
    seller: &SellerInfo,
) -> Result<Vec<u8>, printpdf::Error> {
    let (doc, page1, layer1) = PdfDocument::new(
        format!("Facture {}", format_number(data.number, data.invoiced_at)),
        Mm(210.0),
        Mm(297.0),
        "Layer 1",
    );
    let font = doc.add_builtin_font(BuiltinFont::Helvetica)?;
    let bold = doc.add_builtin_font(BuiltinFont::HelveticaBold)?;

    let layer = doc.get_page(page1).get_layer(layer1);

    // ────────────── Header ──────────────
    // Logo/nom à gauche
    let mut y = 277.0_f32;
    write(&layer, &bold, 22.0, 20.0, y, "ALARTIC");
    y -= 7.0;
    write(&layer, &font, 8.5, 20.0, y, "Pixel sous GrapheneOS — privacy-first");

    // Bloc "FACTURE" à droite
    let mut yr = 277.0_f32;
    write_right(&layer, &bold, 18.0, 190.0, yr, "FACTURE", Face::Bold);
    yr -= 8.0;
    write_right(
        &layer,
        &font,
        10.0,
        190.0,
        yr,
        &format!("N° {}", format_number(data.number, data.invoiced_at)),
        Face::Regular,
    );
    yr -= 5.0;
    write_right(
        &layer,
        &font,
        9.0,
        190.0,
        yr,
        &format!("Émise le {}", format_date_fr(data.invoiced_at)),
        Face::Regular,
    );
    yr -= 4.5;
    write_right(
        &layer,
        &font,
        8.0,
        190.0,
        yr,
        &format!("Commande #{}", short_id(data.order_id)),
        Face::Regular,
    );

    // Ligne séparatrice — placée sous le bloc droit ("Commande #..." à
    // y=259.5, ascent ~+2mm) avec une marge pour ne pas traverser le texte.
    horizontal_line(&doc, page1, layer1, 20.0, 190.0, 254.0);

    // ────────────── Vendeur / Client ──────────────
    let mut y_block = 248.0_f32;
    write(&layer, &bold, 9.5, 20.0, y_block, "VENDEUR");
    write(&layer, &bold, 9.5, 115.0, y_block, "CLIENT");
    y_block -= 5.5;

    // Vendeur (colonne gauche)
    let seller_lines = build_seller_lines(seller);
    let mut ys = y_block;
    for line in &seller_lines {
        write(&layer, &font, 9.0, 20.0, ys, line);
        ys -= 4.5;
    }

    // Client (colonne droite)
    let customer_lines = build_customer_lines(&data.customer);
    let mut yc = y_block;
    for line in &customer_lines {
        write(&layer, &font, 9.0, 115.0, yc, line);
        yc -= 4.5;
    }

    // ────────────── Tableau lignes ──────────────
    let table_top = ys.min(yc) - 8.0;
    let table_top = table_top.min(218.0);

    // En-tête tableau
    let mut yt = table_top;
    let header_y = yt;
    write(&layer, &bold, 9.0, 20.0, header_y, "Désignation");
    write_right(&layer, &bold, 9.0, 130.0, header_y, "Qté", Face::Bold);
    write_right(&layer, &bold, 9.0, 160.0, header_y, "PU HT", Face::Bold);
    write_right(&layer, &bold, 9.0, 190.0, header_y, "Total", Face::Bold);

    yt -= 2.0;
    horizontal_line(&doc, page1, layer1, 20.0, 190.0, yt);
    yt -= 5.0;

    for it in data.items {
        let main = format!("{} — {} — {}", it.product_name, it.variant_storage_label, it.variant_color_name);
        write(&layer, &font, 9.0, 20.0, yt, &main);
        write_right(&layer, &font, 9.0, 130.0, yt, &it.qty.to_string(), Face::Regular);
        write_right(&layer, &font, 9.0, 160.0, yt, &euros(it.unit_price_cents), Face::Regular);
        write_right(&layer, &font, 9.0, 190.0, yt, &euros(it.line_total_cents), Face::Regular);
        yt -= 6.5;
    }

    yt -= 2.0;
    horizontal_line(&doc, page1, layer1, 20.0, 190.0, yt);
    yt -= 6.0;

    // ────────────── Totaux ──────────────
    let totals_y = yt;
    write_right(&layer, &font, 9.5, 160.0, totals_y, "Sous-total", Face::Regular);
    write_right(&layer, &font, 9.5, 190.0, totals_y, &euros(data.subtotal_cents), Face::Regular);

    let yt2 = totals_y - 5.5;
    let shipping_text = if data.shipping_cents == 0 {
        "Offerte".to_string()
    } else {
        euros(data.shipping_cents)
    };
    write_right(&layer, &font, 9.5, 160.0, yt2, "Livraison", Face::Regular);
    write_right(&layer, &font, 9.5, 190.0, yt2, &shipping_text, Face::Regular);

    let yt3 = yt2 - 7.0;
    write_right(&layer, &bold, 11.0, 160.0, yt3, "Total TTC", Face::Bold);
    write_right(&layer, &bold, 11.0, 190.0, yt3, &euros(data.total_cents), Face::Bold);

    // ────────────── Mention TVA + paiement ──────────────
    let mut yb = yt3 - 14.0;
    write(
        &layer,
        &font,
        9.0,
        20.0,
        yb,
        "TVA non applicable, art. 293 B du CGI",
    );
    yb -= 5.0;
    write(
        &layer,
        &font,
        9.0,
        20.0,
        yb,
        &format!(
            "Réglée le {} — {}",
            format_date_fr(data.paid_at),
            human_payment_method(data.payment_method),
        ),
    );

    // ────────────── Mentions B2B (le cas échéant) ──────────────
    if data.customer.is_pro {
        yb -= 8.0;
        write(&layer, &bold, 8.5, 20.0, yb, "Conditions de règlement (clientèle professionnelle)");
        yb -= 4.5;
        write(
            &layer,
            &font,
            8.0,
            20.0,
            yb,
            "Pénalité de retard : 3 fois le taux d'intérêt légal (art. L441-10 CCom).",
        );
        yb -= 4.0;
        write(
            &layer,
            &font,
            8.0,
            20.0,
            yb,
            "Indemnité forfaitaire pour frais de recouvrement : 40 € (art. D441-5 CCom).",
        );
        yb -= 4.0;
        write(
            &layer,
            &font,
            8.0,
            20.0,
            yb,
            "Pas d'escompte pour paiement anticipé.",
        );
    }

    // ────────────── Footer ──────────────
    horizontal_line(&doc, page1, layer1, 20.0, 190.0, 25.0);
    let footer = build_footer(seller);
    write_center(&layer, &font, 7.5, 105.0, 20.5, &footer, Face::Regular);
    write_center(
        &layer,
        &font,
        7.5,
        105.0,
        16.5,
        "Document généré électroniquement, valable sans signature manuscrite.",
        Face::Regular,
    );

    // ────────────── Sortie ──────────────
    let mut buf = Vec::<u8>::with_capacity(8 * 1024);
    let mut writer = std::io::BufWriter::new(&mut buf);
    doc.save(&mut writer)?;
    drop(writer);
    Ok(buf)
}

// ───────────────────────── Helpers texte ─────────────────────────

fn write(
    layer: &printpdf::PdfLayerReference,
    font: &IndirectFontRef,
    size: f32,
    x_mm: f32,
    y_mm: f32,
    text: &str,
) {
    layer.use_text(text, size, Mm(x_mm), Mm(y_mm), font);
}

/// Écrit le texte aligné à droite sur l'abscisse `x_mm`. Mesure la largeur
/// via les Adobe Font Metrics Helvetica/Helvetica-Bold.
fn write_right(
    layer: &printpdf::PdfLayerReference,
    font: &IndirectFontRef,
    size: f32,
    x_mm: f32,
    y_mm: f32,
    text: &str,
    face: Face,
) {
    let w = text_width_mm(text, size, face);
    layer.use_text(text, size, Mm(x_mm - w), Mm(y_mm), font);
}

fn write_center(
    layer: &printpdf::PdfLayerReference,
    font: &IndirectFontRef,
    size: f32,
    cx_mm: f32,
    y_mm: f32,
    text: &str,
    face: Face,
) {
    let w = text_width_mm(text, size, face);
    layer.use_text(text, size, Mm(cx_mm - w / 2.0), Mm(y_mm), font);
}

/// Style Helvetica utilisé pour le rendu — Regular ou Bold. Détermine la
/// table d'advance widths à consulter.
#[derive(Clone, Copy)]
enum Face {
    Regular,
    Bold,
}

/// Largeur réelle d'un texte Helvetica builtin, en mm. Utilise les Adobe Font
/// Metrics standard du PDF 14-font set (`Helvetica.afm` /
/// `Helvetica-Bold.afm`), unités 1/1000 em. Les accents français sont
/// "déaccentués" (à → a, É → E…) car leur advance est identique à la lettre
/// base en Helvetica.
fn text_width_mm(text: &str, size_pt: f32, face: Face) -> f32 {
    let em_mm = size_pt / 72.0 * 25.4;
    let units: u32 = text.chars().map(|c| advance_units(c, face) as u32).sum();
    (units as f32 / 1000.0) * em_mm
}

/// Advance width pour un char Helvetica, en 1/1000 em.
/// Tables Adobe AFM pour le 14-font PDF standard set.
fn advance_units(c: char, face: Face) -> u16 {
    // Pour les accents latins courants en français, on retombe sur la lettre
    // de base (Helvetica donne effectivement la même advance pour 'a' et 'à').
    let base = match c {
        'à' | 'â' | 'ä' | 'á' | 'ã' | 'å' => 'a',
        'è' | 'é' | 'ê' | 'ë' => 'e',
        'ì' | 'í' | 'î' | 'ï' => 'i',
        'ò' | 'ó' | 'ô' | 'ö' | 'õ' | 'ø' => 'o',
        'ù' | 'ú' | 'û' | 'ü' => 'u',
        'ç' => 'c',
        'ñ' => 'n',
        'ý' | 'ÿ' => 'y',
        'À' | 'Â' | 'Ä' | 'Á' | 'Ã' | 'Å' => 'A',
        'È' | 'É' | 'Ê' | 'Ë' => 'E',
        'Ì' | 'Í' | 'Î' | 'Ï' => 'I',
        'Ò' | 'Ó' | 'Ô' | 'Ö' | 'Õ' | 'Ø' => 'O',
        'Ù' | 'Ú' | 'Û' | 'Ü' => 'U',
        'Ç' => 'C',
        'Ñ' => 'N',
        'Ý' => 'Y',
        // Cas spéciaux fréquents
        '—' => return 1000,
        '–' => return 556,
        '€' => return 556,
        '°' => return 400,
        '·' => return 278,
        '•' => return 350,
        '«' | '»' => return 556,
        '“' | '”' => return 333,
        '‘' | '’' => return 222,
        '\u{202F}' | '\u{00A0}' => return 278, // espace fine / insécable
        other => other,
    };
    match face {
        Face::Regular => helvetica_regular_width(base),
        Face::Bold => helvetica_bold_width(base),
    }
}

fn helvetica_regular_width(c: char) -> u16 {
    match c {
        ' ' => 278,
        '!' => 278, '"' => 355, '#' => 556, '$' => 556, '%' => 889, '&' => 667,
        '\'' => 191, '(' => 333, ')' => 333, '*' => 389, '+' => 584, ',' => 278,
        '-' => 333, '.' => 278, '/' => 278,
        '0'..='9' => 556,
        ':' => 278, ';' => 278, '<' => 584, '=' => 584, '>' => 584, '?' => 556,
        '@' => 1015,
        'A' => 667, 'B' => 667, 'C' => 722, 'D' => 722, 'E' => 667, 'F' => 611,
        'G' => 778, 'H' => 722, 'I' => 278, 'J' => 500, 'K' => 667, 'L' => 556,
        'M' => 833, 'N' => 722, 'O' => 778, 'P' => 667, 'Q' => 778, 'R' => 722,
        'S' => 667, 'T' => 611, 'U' => 722, 'V' => 667, 'W' => 944, 'X' => 667,
        'Y' => 667, 'Z' => 611,
        '[' => 278, '\\' => 278, ']' => 278, '^' => 469, '_' => 556, '`' => 333,
        'a' => 556, 'b' => 556, 'c' => 500, 'd' => 556, 'e' => 556, 'f' => 278,
        'g' => 556, 'h' => 556, 'i' => 222, 'j' => 222, 'k' => 500, 'l' => 222,
        'm' => 833, 'n' => 556, 'o' => 556, 'p' => 556, 'q' => 556, 'r' => 333,
        's' => 500, 't' => 278, 'u' => 556, 'v' => 500, 'w' => 722, 'x' => 500,
        'y' => 500, 'z' => 500,
        '{' => 334, '|' => 260, '}' => 334, '~' => 584,
        _ => 500, // fallback raisonnable pour caractères non listés
    }
}

fn helvetica_bold_width(c: char) -> u16 {
    match c {
        ' ' => 278,
        '!' => 333, '"' => 474, '#' => 556, '$' => 556, '%' => 889, '&' => 722,
        '\'' => 238, '(' => 333, ')' => 333, '*' => 389, '+' => 584, ',' => 278,
        '-' => 333, '.' => 278, '/' => 278,
        '0'..='9' => 556,
        ':' => 333, ';' => 333, '<' => 584, '=' => 584, '>' => 584, '?' => 611,
        '@' => 975,
        'A' => 722, 'B' => 722, 'C' => 722, 'D' => 722, 'E' => 667, 'F' => 611,
        'G' => 778, 'H' => 722, 'I' => 278, 'J' => 556, 'K' => 722, 'L' => 611,
        'M' => 833, 'N' => 722, 'O' => 778, 'P' => 667, 'Q' => 778, 'R' => 722,
        'S' => 667, 'T' => 611, 'U' => 722, 'V' => 667, 'W' => 944, 'X' => 667,
        'Y' => 667, 'Z' => 611,
        '[' => 333, '\\' => 278, ']' => 333, '^' => 584, '_' => 556, '`' => 333,
        'a' => 556, 'b' => 611, 'c' => 556, 'd' => 611, 'e' => 556, 'f' => 333,
        'g' => 611, 'h' => 611, 'i' => 278, 'j' => 278, 'k' => 556, 'l' => 278,
        'm' => 889, 'n' => 611, 'o' => 611, 'p' => 611, 'q' => 611, 'r' => 389,
        's' => 556, 't' => 333, 'u' => 611, 'v' => 556, 'w' => 778, 'x' => 556,
        'y' => 556, 'z' => 500,
        '{' => 389, '|' => 280, '}' => 389, '~' => 584,
        _ => 556,
    }
}

fn horizontal_line(
    doc: &PdfDocumentReference,
    page: printpdf::PdfPageIndex,
    layer_idx: printpdf::PdfLayerIndex,
    x1_mm: f32,
    x2_mm: f32,
    y_mm: f32,
) {
    let layer = doc.get_page(page).get_layer(layer_idx);
    let line = Line {
        points: vec![
            (Point::new(Mm(x1_mm), Mm(y_mm)), false),
            (Point::new(Mm(x2_mm), Mm(y_mm)), false),
        ],
        is_closed: false,
    };
    layer.set_outline_thickness(0.3);
    layer.add_line(line);
}

// ───────────────────────── Helpers données ─────────────────────────

fn build_seller_lines(s: &SellerInfo) -> Vec<String> {
    let mut v = vec![
        s.name.clone(),
        s.address_line1.clone(),
        s.address_line2.clone(),
        format!("SIRET : {}", s.siret),
    ];
    if let Some(tva) = &s.tva_intra {
        v.push(format!("TVA intracom. : {tva}"));
    }
    v.push(s.email.clone());
    if let Some(p) = &s.phone {
        v.push(p.clone());
    }
    v
}

fn build_customer_lines(c: &InvoiceCustomer<'_>) -> Vec<String> {
    let mut v = Vec::with_capacity(7);
    if c.is_pro {
        if let Some(co) = c.company_name {
            v.push(co.to_string());
        }
        v.push(format!("À l'attention de {} {}", c.first_name, c.last_name));
    } else {
        v.push(format!("{} {}", c.first_name, c.last_name));
    }
    v.push(c.address_line1.to_string());
    if let Some(l2) = c.address_line2
        && !l2.trim().is_empty()
    {
        v.push(l2.to_string());
    }
    v.push(format!("{} {}", c.postcode, c.city));
    if c.country != "FR" {
        v.push(c.country.to_string());
    }
    if c.is_pro
        && let Some(s) = c.siret
    {
        v.push(format!("SIRET : {s}"));
    }
    v.push(c.email.to_string());
    v
}

fn build_footer(s: &SellerInfo) -> String {
    let mut parts = vec![
        s.name.clone(),
        format!("SIRET {}", s.siret),
        s.website.clone(),
    ];
    if let Some(t) = &s.tva_intra {
        parts.insert(2, format!("TVA {t}"));
    }
    parts.join(" · ")
}

fn human_payment_method(m: &str) -> &str {
    match m {
        "payplug" => "Carte bancaire (Payplug)",
        "paypal" => "PayPal",
        other => other,
    }
}

fn short_id(id: uuid::Uuid) -> String {
    id.to_string().chars().take(8).collect()
}

/// Format euros "1 234,56 €" — espace fine insécable U+202F entre les milliers.
/// Pour le PDF, on garde un espace ordinaire (Helvetica builtin ne supporte
/// pas les espaces typographiques unicode).
fn euros(cents: i64) -> String {
    let abs = cents.unsigned_abs();
    let euros = abs / 100;
    let c = abs % 100;
    let euros_str = group_thousands(euros);
    let sign = if cents < 0 { "-" } else { "" };
    format!("{sign}{euros_str},{c:02} EUR")
}

fn group_thousands(n: u64) -> String {
    let s = n.to_string();
    let b = s.as_bytes();
    let mut out = String::with_capacity(s.len() + s.len() / 3);
    for (i, &ch) in b.iter().enumerate() {
        if i > 0 && (b.len() - i).is_multiple_of(3) {
            out.push(' ');
        }
        out.push(ch as char);
    }
    out
}

fn format_date_fr(dt: DateTime<Utc>) -> String {
    use chrono::Datelike;
    const MONTHS: [&str; 12] = [
        "janvier", "février", "mars", "avril", "mai", "juin",
        "juillet", "août", "septembre", "octobre", "novembre", "décembre",
    ];
    let m = MONTHS[(dt.month() as usize).saturating_sub(1).min(11)];
    format!("{} {} {}", dt.day(), m, dt.year())
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    fn sample_seller() -> SellerInfo {
        SellerInfo {
            name: "ALARTIC (Thomas BEHAGUE EI)".into(),
            address_line1: "12 rue de la République".into(),
            address_line2: "75001 Paris, France".into(),
            siret: "12345678900012".into(),
            tva_intra: None,
            email: "contact@alartic.fr".into(),
            phone: None,
            website: "alartic.fr".into(),
        }
    }

    #[test]
    fn format_number_includes_year_and_zero_padded() {
        let dt = Utc.with_ymd_and_hms(2026, 5, 22, 10, 0, 0).unwrap();
        assert_eq!(format_number(1, dt), "ALARTIC-2026-000001");
        assert_eq!(format_number(42, dt), "ALARTIC-2026-000042");
        assert_eq!(format_number(123456, dt), "ALARTIC-2026-123456");
    }

    #[test]
    fn euros_uses_french_grouping() {
        assert_eq!(euros(89900), "899,00 EUR");
        assert_eq!(euros(12_345_678), "123 456,78 EUR");
        assert_eq!(euros(0), "0,00 EUR");
    }

    #[test]
    fn format_date_fr_renders_french_month() {
        let dt = Utc.with_ymd_and_hms(2026, 5, 22, 0, 0, 0).unwrap();
        assert_eq!(format_date_fr(dt), "22 mai 2026");
    }

    #[test]
    fn generate_pdf_produces_non_trivial_bytes() {
        let seller = sample_seller();
        let dt = Utc.with_ymd_and_hms(2026, 5, 22, 10, 0, 0).unwrap();
        let items = vec![InvoiceItem {
            product_name: "Pixel 9",
            variant_color_name: "Noir Volcanique",
            variant_storage_label: "128 Go",
            qty: 1,
            unit_price_cents: 89900,
            line_total_cents: 89900,
        }];
        let order_id = uuid::Uuid::new_v4();
        let data = InvoiceData {
            number: 42,
            invoiced_at: dt,
            paid_at: dt,
            order_id,
            customer: InvoiceCustomer {
                first_name: "Alice",
                last_name: "Martin",
                email: "alice@example.com",
                address_line1: "1 rue Test",
                address_line2: None,
                postcode: "75000",
                city: "Paris",
                country: "FR",
                is_pro: false,
                company_name: None,
                siret: None,
            },
            items: &items,
            subtotal_cents: 89900,
            shipping_cents: 0,
            total_cents: 89900,
            payment_method: "payplug",
        };
        let bytes = generate_pdf(&data, &seller).expect("generate ok");
        // PDF doit commencer par "%PDF-" et contenir trailer.
        assert!(bytes.starts_with(b"%PDF-"), "PDF magic header manquant");
        assert!(bytes.len() > 1000, "PDF étonnamment court ({} B)", bytes.len());
        // Sanity : retrouve %%EOF en fin de fichier.
        let tail = &bytes[bytes.len().saturating_sub(64)..];
        assert!(
            tail.windows(5).any(|w| w == b"%%EOF"),
            "marqueur %%EOF manquant en fin de PDF"
        );
    }

    /// Test ignored : génère un PDF d'exemple B2C dans `debug/sample-invoice.pdf`
    /// pour validation visuelle. Lancer avec :
    ///   cargo test --lib invoice::tests::demo_write -- --ignored --nocapture
    #[test]
    #[ignore]
    fn demo_write_sample_invoice_to_debug_dir() {
        let seller = sample_seller();
        let dt = Utc.with_ymd_and_hms(2026, 5, 22, 14, 30, 0).unwrap();
        let items = vec![
            InvoiceItem {
                product_name: "Pixel 9",
                variant_color_name: "Obsidian",
                variant_storage_label: "128 Go",
                qty: 1,
                unit_price_cents: 89900,
                line_total_cents: 89900,
            },
            InvoiceItem {
                product_name: "Pixel 9 Pro XL",
                variant_color_name: "Porcelain",
                variant_storage_label: "512 Go",
                qty: 2,
                unit_price_cents: 134900,
                line_total_cents: 269800,
            },
        ];
        let data = InvoiceData {
            number: 42,
            invoiced_at: dt,
            paid_at: dt,
            order_id: uuid::Uuid::new_v4(),
            customer: InvoiceCustomer {
                first_name: "Alice",
                last_name: "Dupont",
                email: "alice@example.com",
                address_line1: "12 rue des Lilas",
                address_line2: None,
                postcode: "75011",
                city: "Paris",
                country: "FR",
                is_pro: false,
                company_name: None,
                siret: None,
            },
            items: &items,
            subtotal_cents: 89900 + 269800,
            shipping_cents: 0,
            total_cents: 89900 + 269800,
            payment_method: "payplug",
        };
        let bytes = generate_pdf(&data, &seller).expect("generate ok");
        let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join("..")
            .join("debug")
            .join("sample-invoice.pdf");
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(&path, &bytes).unwrap();
        eprintln!("PDF écrit : {}", path.display());
    }

    #[test]
    fn generate_pdf_b2b_works() {
        let seller = sample_seller();
        let dt = Utc.with_ymd_and_hms(2026, 5, 22, 10, 0, 0).unwrap();
        let items = vec![InvoiceItem {
            product_name: "Pixel 9 Pro XL",
            variant_color_name: "Argent Lunaire",
            variant_storage_label: "256 Go",
            qty: 3,
            unit_price_cents: 119900,
            line_total_cents: 359700,
        }];
        let data = InvoiceData {
            number: 7,
            invoiced_at: dt,
            paid_at: dt,
            order_id: uuid::Uuid::new_v4(),
            customer: InvoiceCustomer {
                first_name: "Jean",
                last_name: "Durand",
                email: "j.durand@cabinet.fr",
                address_line1: "10 rue du Palais",
                address_line2: None,
                postcode: "69002",
                city: "Lyon",
                country: "FR",
                is_pro: true,
                company_name: Some("Cabinet Durand & Associés"),
                siret: Some("98765432100015"),
            },
            items: &items,
            subtotal_cents: 359700,
            shipping_cents: 0,
            total_cents: 359700,
            payment_method: "payplug",
        };
        let bytes = generate_pdf(&data, &seller).expect("generate ok");
        assert!(bytes.starts_with(b"%PDF-"));
        assert!(bytes.len() > 1500);
    }
}
